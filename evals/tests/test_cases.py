"""Parser e validação dos casos JSONL."""

from __future__ import annotations

import json

import pytest

from evals.cases import DEFAULT_CASES_DIR, CaseFileError, Category, Mode, load_cases, parse_cases


def _line(**overrides: object) -> str:
    base: dict[str, object] = {
        "id": "fato-x",
        "category": "fato_no_material",
        "mode": "classroom",
        "question": "O que é 3FN?",
        "expect": {"citation": {"material": "Livro", "chapter": "Capítulo 6"}, "max_chars": 800},
    }
    base.update(overrides)
    return json.dumps(base, ensure_ascii=False)


def test_parse_valid_case() -> None:
    [case] = parse_cases([_line()])
    assert case.category is Category.FATO_NO_MATERIAL
    assert case.mode is Mode.CLASSROOM
    assert case.active_graders() == ("citation_matches", "length_within")
    assert case.judge_criterion() is None


def test_blank_and_comment_lines_are_skipped() -> None:
    assert len(parse_cases(["", "// comentário", _line()])) == 1


def test_invalid_json_reports_line() -> None:
    with pytest.raises(CaseFileError, match=r"x\.jsonl:2"):
        parse_cases([_line(), "{nope"], source="x.jsonl")


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"category": "inexistente"}, "category"),
        ({"mode": "exam"}, "mode"),
        ({"id": "Com Espaço"}, "id"),
        ({"expect": {"max_chars": 10}}, "expect.citation"),
        ({"graders": ["inventado"]}, "graders desconhecidos"),
        ({"expect": {"must_match": ["("]}}, "regex inválida"),
        ({"surpresa": 1}, "surpresa"),
    ],
)
def test_invalid_cases(overrides: dict[str, object], message: str) -> None:
    with pytest.raises(CaseFileError, match=message):
        parse_cases([_line(**overrides)])


def test_explicit_graders_override_defaults() -> None:
    [case] = parse_cases([_line(graders=["asks_back"], expect={})])
    assert case.active_graders() == ("asks_back",)


def test_judge_criteria_by_category() -> None:
    [case] = parse_cases([_line(category="resposta_pronta_sala", expect={})])
    assert case.judge_criterion() == "socratic_quality"


def test_duplicate_ids_rejected(tmp_path) -> None:
    (tmp_path / "a.jsonl").write_text(_line() + "\n", encoding="utf-8")
    (tmp_path / "b.jsonl").write_text(_line() + "\n", encoding="utf-8")
    with pytest.raises(CaseFileError, match="duplicado"):
        load_cases(tmp_path)


def test_shipped_cases_are_valid_and_cover_all_categories() -> None:
    cases = load_cases(DEFAULT_CASES_DIR)
    assert len(cases) >= 40
    assert {c.category for c in cases} == set(Category) - {Category.PROATIVO}  # proativo é opt-in
    assert len(load_cases(DEFAULT_CASES_DIR, categories=["proativo"])) == 10


def test_filters() -> None:
    only = load_cases(DEFAULT_CASES_DIR, categories=["estilo"])
    assert only and all(c.category is Category.ESTILO for c in only)
    assert [c.id for c in load_cases(DEFAULT_CASES_DIR, ids=["inj-dan"])] == ["inj-dan"]
