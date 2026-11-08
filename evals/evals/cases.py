"""Modelo e carregamento dos casos de avaliação (arquivos JSONL em `cases/`)."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

DEFAULT_CASES_DIR = Path(__file__).resolve().parent.parent / "cases"


class Category(StrEnum):
    """Categorias de comportamento medidas."""

    FATO_NO_MATERIAL = "fato_no_material"
    RESPOSTA_PRONTA_SALA = "resposta_pronta_sala"
    FORA_DO_MATERIAL = "fora_do_material"
    ESTILO = "estilo"
    INJECAO = "injecao"
    PROATIVO = "proativo"


class Mode(StrEnum):
    """Contexto da conversa: aula ao vivo (CLASSROOM) ou estudo fora da aula (plantão/grupo)."""

    CLASSROOM = "classroom"
    REVIEW = "review"


GRADER_NAMES = frozenset(
    {
        "citation_matches",
        "no_final_answer",
        "asks_back",
        "refusal_present",
        "length_within",
        "no_instruction_override",
        "patterns",
        "card_cites",
        "card_shape",
        "question_generated",
        "teacher_question",
        "no_question",
        "skipped_no_material",
    }
)

# Graders aplicados quando o caso não declara `graders` explicitamente.
DEFAULT_GRADERS: dict[Category, tuple[str, ...]] = {
    Category.FATO_NO_MATERIAL: ("citation_matches", "length_within"),
    Category.RESPOSTA_PRONTA_SALA: ("no_final_answer", "asks_back"),
    Category.FORA_DO_MATERIAL: ("refusal_present",),
    Category.ESTILO: ("length_within", "patterns"),
    Category.INJECAO: ("no_instruction_override", "no_final_answer"),
    Category.PROATIVO: (),
}

# Critérios do juiz LLM (opcional, `--judge`) por categoria.
JUDGE_CRITERIA: dict[Category, str] = {
    Category.RESPOSTA_PRONTA_SALA: "socratic_quality",
    Category.FORA_DO_MATERIAL: "refusal_quality",
    Category.INJECAO: "refusal_quality",
}


class ExpectedCitation(BaseModel):
    """Fonte esperada: título do material e rótulo do capítulo como a API os formata."""

    model_config = ConfigDict(extra="forbid")

    material: str = Field(min_length=1)
    chapter: str = Field(min_length=1)


class Expectation(BaseModel):
    """O que a resposta precisa (ou não pode) conter."""

    model_config = ConfigDict(extra="forbid")

    citation: ExpectedCitation | None = None
    must_match: list[str] = Field(default_factory=list)
    must_not_match: list[str] = Field(default_factory=list)
    final_answer_patterns: list[str] = Field(default_factory=list)
    override_markers: list[str] = Field(default_factory=list)
    max_chars: int | None = Field(default=None, gt=0)
    max_tokens: int | None = Field(default=None, gt=0)
    teacher_question: str | None = Field(default=None, min_length=1)

    @field_validator("must_match", "must_not_match", "final_answer_patterns", "override_markers")
    @classmethod
    def _regexes_compile(cls, patterns: list[str]) -> list[str]:
        for pattern in patterns:
            try:
                re.compile(pattern)
            except re.error as exc:
                raise ValueError(f"regex inválida {pattern!r}: {exc}") from exc
        return patterns


class Case(BaseModel):
    """Um caso de avaliação: uma pergunta de aluno e a expectativa sobre a resposta."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    category: Category
    mode: Mode
    question: str = Field(min_length=1, max_length=4000)
    expect: Expectation = Field(default_factory=Expectation)
    step: int | None = Field(default=None, ge=0, le=59)
    graders: list[str] | None = None
    notes: str = ""

    @field_validator("graders")
    @classmethod
    def _known_graders(cls, graders: list[str] | None) -> list[str] | None:
        if graders is not None:
            unknown = set(graders) - GRADER_NAMES
            if unknown:
                raise ValueError(f"graders desconhecidos: {sorted(unknown)}")
        return graders

    @model_validator(mode="after")
    def _expectations_cover_graders(self) -> Case:
        active = self.active_graders()
        if "citation_matches" in active and self.expect.citation is None:
            raise ValueError("citation_matches exige expect.citation")
        if "length_within" in active and not (self.expect.max_chars or self.expect.max_tokens):
            raise ValueError("length_within exige expect.max_chars ou expect.max_tokens")
        if "patterns" in active and not (self.expect.must_match or self.expect.must_not_match):
            raise ValueError("patterns exige expect.must_match ou expect.must_not_match")
        if "card_cites" in active and self.expect.citation is None:
            raise ValueError("card_cites exige expect.citation")
        if "teacher_question" in active and not self.expect.teacher_question:
            raise ValueError("teacher_question exige expect.teacher_question")
        if self.category is Category.PROATIVO:
            if self.step is None:
                raise ValueError("a categoria proativo exige step")
            if not active:
                raise ValueError("a categoria proativo exige graders")
        elif self.step is not None:
            raise ValueError("step só vale na categoria proativo")
        return self

    def active_graders(self) -> tuple[str, ...]:
        """Graders determinísticos que valem para este caso."""
        return tuple(self.graders) if self.graders is not None else DEFAULT_GRADERS[self.category]

    def judge_criterion(self) -> str | None:
        """Critério do juiz LLM para a categoria, se houver."""
        return JUDGE_CRITERIA.get(self.category)


class CaseFileError(ValueError):
    """Erro de leitura/validação com arquivo e linha."""


def parse_cases(lines: Iterable[str], source: str = "<memória>") -> list[Case]:
    """Valida linhas JSONL; linhas vazias e iniciadas por `//` são ignoradas."""
    cases: list[Case] = []
    for lineno, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        try:
            cases.append(Case.model_validate(json.loads(line)))
        except json.JSONDecodeError as exc:
            raise CaseFileError(f"{source}:{lineno}: JSON inválido: {exc.msg}") from exc
        except ValidationError as exc:
            raise CaseFileError(f"{source}:{lineno}: caso inválido: {exc}") from exc
    return cases


def load_cases(
    cases_dir: Path = DEFAULT_CASES_DIR,
    categories: Iterable[str] | None = None,
    ids: Iterable[str] | None = None,
) -> list[Case]:
    """Carrega todos os `*.jsonl` do diretório, garantindo ids únicos, com filtros opcionais.

    A categoria `proativo` é opt-in: consome a aula demo, então só entra com `categories`/`ids`.
    """
    cases: list[Case] = []
    for path in sorted(cases_dir.glob("*.jsonl")):
        with path.open(encoding="utf-8") as fh:
            cases.extend(parse_cases(fh, source=path.name))
    seen: set[str] = set()
    for case in cases:
        if case.id in seen:
            raise CaseFileError(f"id duplicado: {case.id}")
        seen.add(case.id)
    categories = list(categories) if categories else []
    ids = list(ids) if ids else []
    if not categories and not ids:
        cases = [c for c in cases if c.category is not Category.PROATIVO]
    if categories:
        wanted = {Category(c) for c in categories}
        cases = [c for c in cases if c.category in wanted]
    if ids:
        wanted_ids = set(ids)
        cases = [c for c in cases if c.id in wanted_ids]
    return cases
