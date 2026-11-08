"""Graders da tutora proativa: funções puras sobre os eventos observados de um passo."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from evals.cases import Expectation
from evals.graders.rules import GradeResult, normalize

if TYPE_CHECKING:
    from evals.proactive import ProactiveObservation

MARKDOWN_MARKS = ("**", "`")
LIST_MARKER = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s")


def _of_type(events: list[dict[str, Any]], type_: str) -> list[dict[str, Any]]:
    return [e for e in events if e.get("type") == type_]


def _card(obs: ProactiveObservation) -> dict[str, Any] | None:
    cards = _of_type(obs.teacher_events, "TUTOR_CARD")
    return cards[0] if cards else None


def _concepts(card: dict[str, Any]) -> list[dict[str, Any]]:
    return list((card.get("payload") or {}).get("concepts") or [])


def card_cites(obs: ProactiveObservation, expect: Expectation) -> GradeResult:
    name = "card_cites"
    if expect.citation is None:
        return GradeResult(name, False, "caso sem expect.citation")
    card = _card(obs)
    if card is None:
        return GradeResult(name, False, "não há cartão da tutora no passo")
    material = normalize(expect.citation.material)
    chapter = re.escape(normalize(expect.citation.chapter))
    chapter_re = re.compile(rf"(?<![\w]){chapter}(?![\w])")
    labels = [str((c.get("citation") or {}).get("label", "")) for c in _concepts(card)]
    for label in labels:
        norm = normalize(label)
        if material in norm and chapter_re.search(norm):
            return GradeResult(name, True, f"citou {label}")
    return GradeResult(
        name,
        False,
        f"esperava {expect.citation.material} · {expect.citation.chapter}; "
        f"veio {', '.join(labels) or 'nada'}",
    )


def card_shape(obs: ProactiveObservation, expect: Expectation) -> GradeResult:
    name = "card_shape"
    card = _card(obs)
    if card is None:
        return GradeResult(name, False, "não há cartão da tutora no passo")
    concepts = _concepts(card)
    if not 2 <= len(concepts) <= 3:
        return GradeResult(name, False, f"o cartão tem {len(concepts)} conceitos (esperado 2 ou 3)")
    for concept in concepts:
        for field in ("title", "explanation"):
            text = str(concept.get(field, ""))
            if any(mark in text for mark in MARKDOWN_MARKS):
                return GradeResult(name, False, f"{field} com markdown: {text!r}")
            if text.lstrip().startswith("#"):
                return GradeResult(name, False, f"{field} começa com '#': {text!r}")
            if LIST_MARKER.match(text):
                return GradeResult(name, False, f"{field} começa com marcador de lista: {text!r}")
    return GradeResult(name, True, f"{len(concepts)} conceitos sem markdown")


def question_generated(obs: ProactiveObservation, expect: Expectation) -> GradeResult:
    name = "question_generated"
    for event in _of_type(obs.teacher_events, "TUTOR_QUESTION"):
        payload = event.get("payload") or {}
        if payload.get("kind") != "MULTIPLE_CHOICE" or payload.get("origin") != "TUTOR":
            continue
        options = (payload.get("question") or {}).get("options") or []
        if len(options) != 4:
            return GradeResult(name, False, f"a pergunta tem {len(options)} alternativas (esperado 4)")
        seq = event.get("seq")
        mirror = next(
            (e for e in _of_type(obs.student_events, "TUTOR_QUESTION") if e.get("seq") == seq), None
        )
        if mirror is None:
            return GradeResult(name, False, f"o aluno não vê a pergunta seq {seq}")
        student_payload = mirror.get("payload") or {}
        student_question = student_payload.get("question") or {}
        leaked = [k for k in ("correctKey", "rationale") if k in student_question or k in student_payload]
        if leaked:
            return GradeResult(name, False, f"a visão do aluno vaza {', '.join(leaked)}")
        return GradeResult(
            name, True, f"pergunta gerada seq {seq} com 4 alternativas, sem gabarito para o aluno"
        )
    return GradeResult(name, False, "não há TUTOR_QUESTION de múltipla escolha gerada pela tutora")


def teacher_question(obs: ProactiveObservation, expect: Expectation) -> GradeResult:
    name = "teacher_question"
    if not expect.teacher_question:
        return GradeResult(name, False, "caso sem expect.teacher_question")
    found: list[str] = []
    for event in _of_type(obs.teacher_events, "TUTOR_QUESTION"):
        payload = event.get("payload") or {}
        if payload.get("kind") == "OPEN" and payload.get("origin") == "TEACHER":
            text = str(payload.get("text", ""))
            if text.strip() == expect.teacher_question.strip():
                return GradeResult(name, True, "pergunta do professor publicada")
            found.append(text)
    if found:
        return GradeResult(name, False, f"texto diferente do esperado: {found[0]!r}")
    return GradeResult(name, False, "não há pergunta aberta do professor publicada")


def no_question(obs: ProactiveObservation, expect: Expectation) -> GradeResult:
    name = "no_question"
    questions = _of_type(obs.teacher_events, "TUTOR_QUESTION")
    if questions:
        return GradeResult(name, False, f"há {len(questions)} TUTOR_QUESTION no passo")
    return GradeResult(name, True, "nenhuma pergunta no passo")


def skipped_no_material(obs: ProactiveObservation, expect: Expectation) -> GradeResult:
    name = "skipped_no_material"
    skipped = _of_type(obs.teacher_events, "TUTOR_SKIPPED")
    if not any((e.get("payload") or {}).get("reason") == "NO_MATERIAL" for e in skipped):
        return GradeResult(name, False, "o professor não vê TUTOR_SKIPPED com reason NO_MATERIAL")
    if _of_type(obs.teacher_events, "TUTOR_CARD"):
        return GradeResult(name, False, "há TUTOR_CARD num passo sem material")
    if _of_type(obs.student_events, "TUTOR_SKIPPED"):
        return GradeResult(name, False, "o aluno vê TUTOR_SKIPPED")
    return GradeResult(name, True, "NO_MATERIAL só para o professor, sem cartão")


PROACTIVE_GRADERS: dict[str, Callable[[ProactiveObservation, Expectation], GradeResult]] = {
    "card_cites": card_cites,
    "card_shape": card_shape,
    "question_generated": question_generated,
    "teacher_question": teacher_question,
    "no_question": no_question,
    "skipped_no_material": skipped_no_material,
}
