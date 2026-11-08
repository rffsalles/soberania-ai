"""Categoria `proativo`: o professor avança os passos da aula demo e o harness observa a tutora."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from evals.cases import Case
from evals.client import ClientError, TutorClient
from evals.graders.proactive import PROACTIVE_GRADERS
from evals.runner import CaseResult, GradeOut

TUTOR_TYPES = frozenset({"TUTOR_CARD", "TUTOR_QUESTION", "TUTOR_SKIPPED"})
ALREADY_STARTED = (
    "A aula de demonstração já foi iniciada; suba o app com banco limpo "
    "(`docker compose down -v && docker compose up -d`) antes de rodar o proativo."
)


@dataclass
class ProactiveObservation:
    """O que a tutora publicou num passo, nas visões do professor e do aluno."""

    step: int
    activity: str | None
    teacher_events: list[dict[str, Any]]
    student_events: list[dict[str, Any]]
    timed_out: bool


def _tutor_events(events: list[dict[str, Any]], step: int) -> list[dict[str, Any]]:
    return [e for e in events if e.get("type") in TUTOR_TYPES and e.get("stepIndex") == step]


def _settled(events: list[dict[str, Any]]) -> bool:
    return any(e.get("type") in ("TUTOR_CARD", "TUTOR_SKIPPED") for e in events)


def _card_labels(events: list[dict[str, Any]]) -> list[str]:
    labels: list[str] = []
    for event in events:
        if event.get("type") == "TUTOR_CARD":
            for concept in (event.get("payload") or {}).get("concepts") or []:
                label = (concept.get("citation") or {}).get("label")
                if label and str(label) not in labels:
                    labels.append(str(label))
    return labels


def _activity(posted: list[dict[str, Any]], step: int) -> str | None:
    for event in posted:
        if event.get("type") == "STEP_CHANGED" and event.get("stepIndex") == step:
            return (event.get("payload") or {}).get("activity")
    return None


def run_proactive_cases(
    cases: list[Case],
    teacher: TutorClient,
    student: TutorClient,
    agenda_id: str,
    timeout_s: float = 60.0,
    poll_s: float = 2.0,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    on_result: Callable[[CaseResult], None] | None = None,
) -> list[CaseResult]:
    """Avança a aula passo a passo e avalia os casos de cada passo. Nunca encerra a aula."""
    if any(e.get("type") == "SESSION_STARTED" for e in teacher.list_events(agenda_id)):
        raise ClientError(ALREADY_STARTED)

    steps = sorted({c.step for c in cases if c.step is not None})
    observations: dict[int, ProactiveObservation] = {}
    for position, step in enumerate(steps):
        posted: list[dict[str, Any]] = []
        if position == 0:
            posted = teacher.post_event(agenda_id, "SESSION_STARTED")
            if step != 0:
                posted = teacher.post_event(agenda_id, "STEP_CHANGED", step)
            elif _activity(posted, 0) is None:
                # O SESSION_STARTED grava o passo 0; a atividade vem do STEP_CHANGED dele.
                posted = teacher.list_events(agenda_id)
        else:
            posted = teacher.post_event(agenda_id, "STEP_CHANGED", step)

        deadline = clock() + timeout_s
        timed_out = False
        while True:
            teacher_events = _tutor_events(teacher.list_events(agenda_id), step)
            if _settled(teacher_events):
                break
            if clock() >= deadline:
                timed_out = True
                break
            sleep(poll_s)
        student_events = _tutor_events(student.list_events(agenda_id), step)
        observations[step] = ProactiveObservation(
            step=step,
            activity=_activity(posted, step),
            teacher_events=teacher_events,
            student_events=student_events,
            timed_out=timed_out,
        )

    results: list[CaseResult] = []
    for case in cases:
        result = _evaluate(case, observations[case.step], timeout_s)  # type: ignore[index]
        results.append(result)
        if on_result:
            on_result(result)
    return results


def _evaluate(case: Case, obs: ProactiveObservation, timeout_s: float) -> CaseResult:
    base: dict[str, Any] = {
        "id": case.id,
        "category": case.category.value,
        "mode": case.mode.value,
        "question": case.question,
        "reply": json.dumps(obs.teacher_events, ensure_ascii=False, separators=(",", ":")),
        "citations": _card_labels(obs.teacher_events),
        "agenda_type": "CLASSROOM",
        "attempts": 1,
    }
    if obs.activity != case.question:
        error = f"roteiro do seed diverge: esperado '{case.question}', encontrado '{obs.activity}'"
        return CaseResult(**base, status="error", error=error)
    if obs.timed_out:
        return CaseResult(**base, status="error", error=f"sem evento da tutora em {timeout_s:g} s")
    grades = [
        GradeOut(name=g.name, passed=g.passed, reason=g.reason)
        for g in (PROACTIVE_GRADERS[name](obs, case.expect) for name in case.active_graders())
    ]
    return CaseResult(**base, status="pass" if all(g.passed for g in grades) else "fail", grades=grades)
