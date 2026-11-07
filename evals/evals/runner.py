"""Executa os casos contra a API e consolida os vereditos (determinísticos + juiz opcional)."""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from evals.cases import Case, Mode
from evals.client import Agenda, ClientError, TutorClient, TutorReply
from evals.graders import grade
from evals.judge import JudgeError, LLMJudge

Status = Literal["pass", "fail", "error"]


class GradeOut(BaseModel):
    name: str
    passed: bool
    reason: str


class JudgeOut(BaseModel):
    criterion: str
    score: int | None
    reason: str


class CaseResult(BaseModel):
    """Resultado de um caso, serializável no relatório JSON."""

    id: str
    category: str
    mode: str
    question: str
    status: Status
    reply: str = ""
    citations: list[str] = Field(default_factory=list)
    grades: list[GradeOut] = Field(default_factory=list)
    judge: JudgeOut | None = None
    error: str | None = None
    agenda_type: str | None = None
    wall_ms: int | None = None
    attempts: int = 0

    def failure_reasons(self) -> list[str]:
        """Razões legíveis da falha (erro, graders reprovados, juiz)."""
        if self.error:
            return [self.error]
        reasons = [f"{g.name}: {g.reason}" for g in self.grades if not g.passed]
        if self.judge and self.judge.score == 0:
            reasons.append(f"juiz/{self.judge.criterion}: {self.judge.reason}")
        return reasons


class RunMeta(BaseModel):
    started_at: datetime
    finished_at: datetime | None = None
    base_url: str
    label: str = ""
    judge_model: str | None = None
    agendas: dict[str, str] = Field(default_factory=dict)


class RunResult(BaseModel):
    meta: RunMeta
    results: list[CaseResult]


def evaluate_reply(case: Case, reply: TutorReply, judge: LLMJudge | None) -> CaseResult:
    """Aplica graders (e juiz, se houver) a uma resposta já obtida."""
    base = {
        "id": case.id,
        "category": case.category.value,
        "mode": case.mode.value,
        "question": case.question,
        "reply": reply.reply,
        "citations": reply.citations,
        "wall_ms": reply.wall_ms,
        "attempts": reply.attempts,
    }
    if reply.fallback:
        # O provedor não respondeu: não há comportamento a avaliar.
        return CaseResult(**base, status="error", error="tutora indisponível (fallback do provedor)")

    grades = [
        GradeOut(name=g.name, passed=g.passed, reason=g.reason)
        for g in grade(case, reply.reply, reply.citations)
    ]
    verdict: JudgeOut | None = None
    criterion = case.judge_criterion()
    if judge and criterion:
        try:
            v = judge.evaluate(criterion, case.question, reply.reply)
            verdict = JudgeOut(criterion=criterion, score=v.score, reason=v.reason)
        except JudgeError as exc:
            verdict = JudgeOut(criterion=criterion, score=None, reason=f"juiz indisponível: {exc}")

    passed = all(g.passed for g in grades) and (verdict is None or verdict.score != 0)
    return CaseResult(**base, status="pass" if passed else "fail", grades=grades, judge=verdict)


def run_cases(
    cases: list[Case],
    client: TutorClient,
    agendas: dict[Mode, Agenda],
    judge: LLMJudge | None = None,
    delay: float = 0.0,
    fallback_retries: int = 2,
    on_result: Callable[[CaseResult], None] | None = None,
) -> list[CaseResult]:
    """Roda cada caso numa conversa nova (sem histórico) e devolve os resultados na ordem."""
    results: list[CaseResult] = []
    for index, case in enumerate(cases):
        if index and delay:
            time.sleep(delay)
        agenda = agendas.get(case.mode)
        if agenda is None:
            result = CaseResult(
                id=case.id,
                category=case.category.value,
                mode=case.mode.value,
                question=case.question,
                status="error",
                error=f"nenhuma agenda com janela aberta para o modo {case.mode.value}",
            )
        else:
            try:
                reply = client.chat(agenda.id, case.question, fallback_retries=fallback_retries)
                result = evaluate_reply(case, reply, judge)
            except ClientError as exc:
                result = CaseResult(
                    id=case.id,
                    category=case.category.value,
                    mode=case.mode.value,
                    question=case.question,
                    status="error",
                    error=str(exc),
                )
            result.agenda_type = agenda.type
        results.append(result)
        if on_result:
            on_result(result)
    return results


def now_utc() -> datetime:
    return datetime.now(UTC)
