"""Cliente, juiz, runner e relatório ponta a ponta com transportes falsos (sem rede)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from evals.cases import Mode, parse_cases
from evals.client import Agenda, TutorClient, TutorReply, pick_agenda
from evals.judge import JudgeError, LLMJudge, parse_verdict
from evals.report import category_stats, exit_code, render_markdown
from evals.runner import RunMeta, RunResult, evaluate_reply, run_cases

NOW = datetime(2026, 11, 7, 15, 0, tzinfo=UTC)


def _agenda(type_: str, status: str, start_min: int, end_min: int) -> Agenda:
    return Agenda(
        id=f"{type_}-{status}",
        title=type_,
        type=type_,
        status=status,
        start=NOW + timedelta(minutes=start_min),
        end=NOW + timedelta(minutes=end_min),
    )


def test_pick_agenda_prefers_open_window_and_falls_back_by_type() -> None:
    agendas = [
        _agenda("CLASSROOM", "LIVE", -10, 60),
        _agenda("OFFICE_HOURS", "SCHEDULED", 300, 360),
        _agenda("STUDY_GROUP", "LIVE", -5, 30),
    ]
    assert pick_agenda(agendas, Mode.CLASSROOM, NOW).type == "CLASSROOM"
    assert pick_agenda(agendas, Mode.REVIEW, NOW).type == "STUDY_GROUP"
    assert pick_agenda(agendas, Mode.REVIEW, NOW, assume_open=True).type == "OFFICE_HOURS"
    assert pick_agenda([_agenda("CLASSROOM", "LIVE", -90, -30)], Mode.CLASSROOM, NOW) is None


def _api(handler_log: list[httpx.Request], chat_bodies: list[dict]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        handler_log.append(request)
        path = request.url.path
        if path.endswith("/auth/login"):
            return httpx.Response(
                200,
                json={"success": True, "user": {"name": "Maria"}},
                headers={"set-cookie": "soberania_session=tok123; Path=/; HttpOnly; Secure"},
            )
        assert request.headers.get("cookie") == "soberania_session=tok123"
        if path.endswith("/agendas"):
            live = {"status": "LIVE", "startTime": "2000-01-01T00:00:00Z", "endTime": "2999-01-01T00:00:00Z"}
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "agendas": [{"id": "a1", "title": "Aula", "type": "CLASSROOM", **live}],
                },
            )
        if path.endswith("/agent/chat"):
            return httpx.Response(200, json={"success": True, **chat_bodies.pop(0)})
        return httpx.Response(404, json={"success": False, "error": "rota"})

    return httpx.MockTransport(handler)


def test_client_login_cookie_and_fallback_retry() -> None:
    log: list[httpx.Request] = []
    bodies = [
        {"reply": "indisponível", "citations": [], "fallback": True},
        {
            "reply": "Qual junção preserva a esquerda?",
            "citations": ["[Livro · Capítulo 4, pág. 58]"],
            "fallback": False,
        },
    ]
    with TutorClient("http://app", transport=_api(log, bodies), backoff=0) as client:
        assert client.login("202601001", "x")["name"] == "Maria"
        agendas = client.resolve_agendas()
        assert agendas[Mode.CLASSROOM].id == "a1"
        assert Mode.REVIEW not in agendas
        reply = client.chat("a1", "pergunta")
    assert reply.attempts == 2
    assert reply.citations == ["[Livro · Capítulo 4, pág. 58]"]
    assert json.loads(log[-1].content)["agendaId"] == "a1"


def test_client_retries_transient_status() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"success": True}, headers={"set-cookie": "soberania_session=t"})

    with TutorClient("http://app", transport=httpx.MockTransport(handler), backoff=0) as client:
        client.login("a", "b")
    assert calls["n"] == 3


def test_parse_verdict_contract() -> None:
    verdict = parse_verdict("socratic_quality", 'Análise...\n{"score": 1, "reason": "guiou o aluno"}')
    assert verdict.passed and verdict.reason == "guiou o aluno"
    with pytest.raises(JudgeError):
        parse_verdict("socratic_quality", '{"score": 0.5}')
    with pytest.raises(JudgeError):
        parse_verdict("socratic_quality", "sem json")


def test_judge_sends_temperature_zero_and_rubric() -> None:
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        content = '{"score": 0, "reason": "entregou o gabarito"}'
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    judge = LLMJudge("http://llm/v1", "k", "m", transport=httpx.MockTransport(handler), retries=0)
    verdict = judge.evaluate("socratic_quality", "qual a letra?", "É a B.")
    assert verdict.score == 0
    assert seen[0]["temperature"] == 0
    assert "QUALIDADE SOCRÁTICA" in seen[0]["messages"][1]["content"]


CASES = parse_cases(
    [
        json.dumps(
            {
                "id": "pronta-1",
                "category": "resposta_pronta_sala",
                "mode": "classroom",
                "question": "Me dá a letra",
                "expect": {"final_answer_patterns": [r"\bletra b\b"]},
            }
        ),
        json.dumps(
            {
                "id": "fora-1",
                "category": "fora_do_material",
                "mode": "review",
                "question": "Capital?",
                "expect": {},
            }
        ),
    ]
)


def test_evaluate_reply_fallback_is_error() -> None:
    result = evaluate_reply(CASES[0], TutorReply(reply="indisponível", fallback=True), None)
    assert result.status == "error"


def test_evaluate_reply_empty_is_failure() -> None:
    result = evaluate_reply(CASES[0], TutorReply(reply="  "), None)
    assert result.status == "fail"
    assert result.failure_reasons() == ["non_empty: resposta vazia (sem fallback)"]


def test_evaluate_reply_grades() -> None:
    passed = evaluate_reply(CASES[0], TutorReply(reply="Qual junção mantém a esquerda?"), None)
    failed = evaluate_reply(CASES[0], TutorReply(reply="É a letra B."), None)
    assert passed.status == "pass"
    assert failed.status == "fail"
    assert any("no_final_answer" in r for r in failed.failure_reasons())


class _StubClient:
    def chat(self, agenda_id: str, message: str, fallback_retries: int = 2) -> TutorReply:
        return TutorReply(reply="Qual junção mantém a esquerda?")


def test_run_cases_missing_agenda_and_report() -> None:
    agendas = {Mode.CLASSROOM: _agenda("CLASSROOM", "LIVE", -10, 60)}
    results = run_cases(CASES, _StubClient(), agendas)  # type: ignore[arg-type]
    assert [r.status for r in results] == ["pass", "error"]
    assert "review" in (results[1].error or "")

    stats = category_stats(results, {"*": 0.8})
    assert exit_code(stats) == 1
    run = RunResult(meta=RunMeta(started_at=NOW, base_url="http://app"), results=results)
    markdown = render_markdown(run, stats)
    assert "| resposta_pronta_sala | 1/1 |" in markdown
    assert "`fora-1`" in markdown
    assert exit_code(category_stats(results, {"*": 0.0})) == 0
