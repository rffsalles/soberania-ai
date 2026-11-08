"""Categoria `proativo`: modelo dos casos, graders, runner com transporte falso e CLI (sem rede)."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from evals.cases import Case, Category, Expectation, ExpectedCitation, load_cases, parse_cases
from evals.cli import main
from evals.client import ClientError, TutorClient
from evals.graders.proactive import PROACTIVE_GRADERS
from evals.proactive import ProactiveObservation, run_proactive_cases
from evals.runner import CaseResult, regrade

LABEL = "Sistemas de Banco de Dados · Capítulo 6, pág. 3"


def _case(**kw: Any) -> Case:
    data = {
        "id": "p-1",
        "category": "proativo",
        "mode": "classroom",
        "question": "Passo",
        "step": 0,
        "graders": ["no_question"],
    }
    data.update(kw)
    return Case.model_validate(data)


def _card(step: int = 0, label: str = LABEL, concepts: int = 2, title: str = "Chave primária") -> dict:
    return {
        "seq": 2,
        "type": "TUTOR_CARD",
        "stepIndex": step,
        "payload": {
            "concepts": [
                {
                    "title": title,
                    "explanation": "Identifica a linha.",
                    "citation": {"chunkId": "c", "label": label, "page": 3},
                }
            ]
            * concepts
        },
    }


def _mc(seq: int = 3, options: int = 4, leak: bool = False) -> dict:
    question: dict = {"options": [{"key": k, "text": k} for k in "ABCD"[:options]]}
    if leak:
        question["correctKey"] = "A"
    return {
        "seq": seq,
        "type": "TUTOR_QUESTION",
        "stepIndex": 0,
        "payload": {"kind": "MULTIPLE_CHOICE", "origin": "TUTOR", "question": question},
    }


def _obs(teacher: list[dict], student: list[dict] | None = None) -> ProactiveObservation:
    return ProactiveObservation(0, "Passo", teacher, student or [], False)


# -- modelo dos casos -------------------------------------------------------------------------


def test_proativo_exige_step_e_graders() -> None:
    with pytest.raises(ValueError, match="exige step"):
        _case(step=None)
    with pytest.raises(ValueError, match="exige graders"):
        _case(graders=None)


def test_outras_categorias_proibem_step() -> None:
    with pytest.raises(ValueError, match="step só vale"):
        Case.model_validate(
            {
                "id": "x",
                "category": "fato_no_material",
                "mode": "classroom",
                "question": "q",
                "step": 1,
                "expect": {"citation": {"material": "m", "chapter": "c"}, "max_chars": 10},
            }
        )


def test_graders_validam_entradas() -> None:
    with pytest.raises(ValueError, match=r"expect\.citation"):
        _case(graders=["card_cites"])
    with pytest.raises(ValueError, match=r"expect\.teacher_question"):
        _case(graders=["teacher_question"])


def test_load_cases_exclui_proativo_sem_filtro() -> None:
    assert not [c for c in load_cases() if c.category is Category.PROATIVO]
    assert len(load_cases(categories=["proativo"])) == 10
    assert [c.id for c in load_cases(ids=["proativo-intervalo-sem-material"])] == [
        "proativo-intervalo-sem-material"
    ]


def test_arquivo_proativo_vale_com_5_passos() -> None:
    cases = load_cases(categories=["proativo"])
    assert sorted({c.step for c in cases}) == [0, 1, 2, 3, 4]
    assert parse_cases(["// c", ""]) == []


# -- graders ----------------------------------------------------------------------------------


def _expect(**kw: Any) -> Expectation:
    return Expectation.model_validate(kw)


CITE = _expect(citation={"material": "Sistemas de Banco de Dados", "chapter": "Capítulo 6"})


def test_card_cites() -> None:
    g = PROACTIVE_GRADERS["card_cites"]
    assert g(_obs([_card()]), CITE).passed
    assert not g(_obs([_card(label="Sistemas de Banco de Dados · Capítulo 60")]), CITE).passed
    assert not g(_obs([]), CITE).passed
    assert not g(_obs([_card()]), Expectation()).passed
    assert isinstance(CITE.citation, ExpectedCitation)


def test_card_shape() -> None:
    g = PROACTIVE_GRADERS["card_shape"]
    assert g(_obs([_card(concepts=3)]), Expectation()).passed
    assert not g(_obs([_card(concepts=1)]), Expectation()).passed
    assert not g(_obs([_card(title="**Chave**")]), Expectation()).passed
    assert not g(_obs([_card(title="# Chave")]), Expectation()).passed
    assert not g(_obs([_card(title="- Chave")]), Expectation()).passed
    assert not g(_obs([_card(title="1. Chave")]), Expectation()).passed
    assert not g(_obs([]), Expectation()).passed


def test_question_generated() -> None:
    g = PROACTIVE_GRADERS["question_generated"]
    student_ok = [_mc()]
    assert g(_obs([_mc(leak=True)], student_ok), Expectation()).passed
    assert not g(_obs([_mc(leak=True)], [_mc(leak=True)]), Expectation()).passed  # aluno vê correctKey
    assert not g(_obs([_mc(options=3)], [_mc(options=3)]), Expectation()).passed
    assert not g(_obs([_mc()], []), Expectation()).passed  # aluno não vê
    assert not g(_obs([]), Expectation()).passed


def test_teacher_question() -> None:
    g = PROACTIVE_GRADERS["teacher_question"]
    open_q = {
        "seq": 4,
        "type": "TUTOR_QUESTION",
        "stepIndex": 1,
        "payload": {"kind": "OPEN", "origin": "TEACHER", "text": " Pergunta? "},
    }
    assert g(_obs([open_q]), _expect(teacher_question="Pergunta?")).passed
    assert not g(_obs([open_q]), _expect(teacher_question="Outra?")).passed
    assert not g(_obs([]), _expect(teacher_question="Pergunta?")).passed


def test_no_question() -> None:
    g = PROACTIVE_GRADERS["no_question"]
    assert g(_obs([_card()]), Expectation()).passed
    assert not g(_obs([_mc()]), Expectation()).passed


def test_skipped_no_material() -> None:
    g = PROACTIVE_GRADERS["skipped_no_material"]
    skipped = {
        "seq": 5,
        "type": "TUTOR_SKIPPED",
        "stepIndex": 4,
        "payload": {"reason": "NO_MATERIAL", "kind": "BOTH"},
    }
    assert g(_obs([skipped]), Expectation()).passed
    assert not g(_obs([skipped], [skipped]), Expectation()).passed  # aluno vê
    assert not g(_obs([skipped, _card()]), Expectation()).passed
    assert not g(_obs([]), Expectation()).passed
    other = {**skipped, "payload": {"reason": "BUDGET", "kind": "BOTH"}}
    assert not g(_obs([other]), Expectation()).passed


# -- runner -----------------------------------------------------------------------------------


class Api:
    """Servidor falso: professor e aluno têm sessões distintas pelo cookie."""

    def __init__(self, started: bool = False, activity: str = "Passo", tutor_after: int = 1) -> None:
        self.log: list[tuple[str, str]] = []
        self.events: list[dict] = (
            [{"seq": 1, "type": "SESSION_STARTED", "stepIndex": None, "payload": {}}] if started else []
        )
        self.activity = activity
        self.tutor_after = tutor_after  # nº de consultas do professor antes de o cartão aparecer
        self.teacher_polls = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        role = "teacher" if "teacher" in request.headers.get("cookie", "") else "student"
        path = request.url.path
        if path.endswith("/auth/login"):
            who = json.loads(request.content)["identifier"]
            cookie = "teacher" if who == "PROF" else "student"
            return httpx.Response(
                200,
                json={"success": True, "user": {}},
                headers={"set-cookie": f"soberania_session={cookie}; Path=/"},
            )
        self.log.append((request.method, f"{role}:{path.rsplit('/agendas/', 1)[-1]}"))
        if request.method == "POST":
            body = json.loads(request.content)
            if body["type"] == "SESSION_STARTED":
                new = [
                    {"seq": 1, "type": "SESSION_STARTED", "stepIndex": None, "payload": {}},
                    {
                        "seq": 2,
                        "type": "STEP_CHANGED",
                        "stepIndex": 0,
                        "payload": {"activity": self.activity},
                    },
                ]
            else:
                new = [
                    {
                        "seq": 9,
                        "type": "STEP_CHANGED",
                        "stepIndex": body["stepIndex"],
                        "payload": {"activity": self.activity},
                    }
                ]
            self.events += new
            return httpx.Response(201, json={"success": True, "events": new})
        if role == "teacher":
            self.teacher_polls += 1
            visible = list(self.events)
            if self.teacher_polls > self.tutor_after:
                visible.append(_card(self._current_step()))
            last = max([e["seq"] for e in visible] or [0])
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "events": visible if request.url.params["after"] == "0" else [],
                    "lastSeq": last,
                    "closed": False,
                },
            )
        return httpx.Response(
            200,
            json={"success": True, "events": [_card(self._current_step())], "lastSeq": 2, "closed": False},
        )

    def _current_step(self) -> int:
        steps = [e["stepIndex"] for e in self.events if e["type"] == "STEP_CHANGED"]
        return steps[-1] if steps else 0


def _clients(api: Api) -> tuple[TutorClient, TutorClient]:
    t = TutorClient("http://x", retries=0, transport=httpx.MockTransport(api.handler))
    s = TutorClient("http://x", retries=0, transport=httpx.MockTransport(api.handler))
    t.login("PROF", "p")
    s.login("ALUNO", "a")
    return t, s


class FakeTime:
    def __init__(self) -> None:
        self.now = 0.0

    def sleep(self, seconds: float) -> None:
        self.now += seconds

    def clock(self) -> float:
        return self.now


def test_run_proativo_publica_na_segunda_consulta() -> None:
    api = Api(tutor_after=2)
    t, s = _clients(api)
    ft = FakeTime()
    results = run_proactive_cases(
        [
            _case(
                graders=["card_cites"],
                expect={"citation": {"material": "Sistemas de Banco de Dados", "chapter": "Capítulo 6"}},
            )
        ],
        t,
        s,
        "a1",
        sleep=ft.sleep,
        clock=ft.clock,
    )
    assert [r.status for r in results] == ["pass"]
    assert results[0].citations == [LABEL]
    assert ft.now == 2.0  # uma espera de poll_s
    posts = [e for e in api.log if e[0] == "POST"]
    assert posts == [("POST", "teacher:a1/events")]


def test_aula_ja_iniciada_nao_faz_post() -> None:
    api = Api(started=True)
    t, s = _clients(api)
    with pytest.raises(ClientError, match=r"já foi iniciada.*docker compose down -v && docker compose up -d"):
        run_proactive_cases([_case()], t, s, "a1")
    assert not [e for e in api.log if e[0] == "POST"]


def test_timeout_vira_erro() -> None:
    api = Api(tutor_after=10**6)
    t, s = _clients(api)
    ft = FakeTime()
    [r] = run_proactive_cases([_case()], t, s, "a1", sleep=ft.sleep, clock=ft.clock)
    assert r.status == "error" and r.error == "sem evento da tutora em 60 s"


def test_roteiro_divergente_vira_erro() -> None:
    api = Api(activity="Outro título")
    t, s = _clients(api)
    [r] = run_proactive_cases([_case(question="Passo")], t, s, "a1", sleep=lambda _: None)
    assert r.status == "error"
    assert r.error == "roteiro do seed diverge: esperado 'Passo', encontrado 'Outro título'"


def test_primeiro_passo_nao_zero_e_passos_seguintes() -> None:
    api = Api(tutor_after=0)
    t, s = _clients(api)
    run_proactive_cases([_case(step=2), _case(id="p-2", step=3)], t, s, "a1", sleep=lambda _: None)
    bodies = [e for e in api.log if e[0] == "POST"]
    assert len(bodies) == 3  # SESSION_STARTED, STEP_CHANGED 2, STEP_CHANGED 3


# -- regrade e CLI ----------------------------------------------------------------------------


def test_regrade_devolve_proativo_intacto() -> None:
    result = CaseResult(
        id="p-1", category="proativo", mode="classroom", question="Passo", status="fail", reply="[]"
    )
    assert regrade(result, _case()) is result


def test_cli_run_sem_category_nao_carrega_proativo(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["cases"]) == 0
    assert "proativo" not in capsys.readouterr().out
    assert main(["cases", "--category", "proativo"]) == 0
    assert "10 casos" in capsys.readouterr().out.replace("\n", " ")
