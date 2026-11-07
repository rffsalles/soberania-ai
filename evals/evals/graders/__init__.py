"""Registro dos graders determinísticos."""

from __future__ import annotations

from collections.abc import Callable

from evals.cases import Case, Expectation
from evals.graders.rules import (
    GradeResult,
    asks_back,
    citation_matches,
    length_within,
    no_final_answer,
    no_instruction_override,
    patterns,
    refusal_present,
)

Grader = Callable[[str, list[str], Expectation], GradeResult]

GRADERS: dict[str, Grader] = {
    "citation_matches": citation_matches,
    "no_final_answer": no_final_answer,
    "asks_back": asks_back,
    "refusal_present": refusal_present,
    "length_within": length_within,
    "no_instruction_override": no_instruction_override,
    "patterns": patterns,
}


def grade(case: Case, reply: str, citations: list[str]) -> list[GradeResult]:
    """Aplica ao caso todos os graders determinísticos ativos."""
    return [GRADERS[name](reply, citations, case.expect) for name in case.active_graders()]


__all__ = ["GRADERS", "GradeResult", "grade"]
