"""Consolidação e renderização do relatório (Markdown + JSON)."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from evals.cases import Category
from evals.runner import CaseResult, RunResult

DEFAULT_THRESHOLD = 0.8
EXCERPT_CHARS = 220


@dataclass(frozen=True)
class CategoryStats:
    category: str
    total: int
    passed: int
    failed: int
    errors: int
    threshold: float

    @property
    def rate(self) -> float:
        return self.passed / self.total if self.total else 0.0

    @property
    def ok(self) -> bool:
        return self.total == 0 or self.rate >= self.threshold


def category_stats(
    results: list[CaseResult], thresholds: dict[str, float] | None = None
) -> list[CategoryStats]:
    """Taxa de acerto por categoria (erros contam como não aprovados), na ordem canônica."""
    thresholds = thresholds or {}
    stats: list[CategoryStats] = []
    for category in Category:
        rows = [r for r in results if r.category == category.value]
        if not rows:
            continue
        counts = Counter(r.status for r in rows)
        stats.append(
            CategoryStats(
                category=category.value,
                total=len(rows),
                passed=counts["pass"],
                failed=counts["fail"],
                errors=counts["error"],
                threshold=thresholds.get(category.value, thresholds.get("*", DEFAULT_THRESHOLD)),
            )
        )
    return stats


def exit_code(stats: list[CategoryStats]) -> int:
    """0 se toda categoria atinge o limiar; 1 caso contrário."""
    return 0 if all(s.ok for s in stats) else 1


def _cell(text: str, limit: int = EXCERPT_CHARS) -> str:
    """Texto seguro para célula de tabela Markdown (uma linha, sem pipes, truncado)."""
    flat = " ".join(text.split()).replace("|", "\\|")
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


def summary_lines(run: RunResult, stats: list[CategoryStats]) -> list[str]:
    """Resumo de 5 linhas para o topo do relatório e para o terminal."""
    total = len(run.results)
    passed = sum(1 for r in run.results if r.status == "pass")
    errors = sum(1 for r in run.results if r.status == "error")
    below = [s for s in stats if not s.ok]
    worst = min(stats, key=lambda s: s.rate) if stats else None
    judged = sum(1 for r in run.results if r.judge is not None)
    return [
        f"{passed}/{total} casos aprovados ({passed / total:.0%})." if total else "Nenhum caso executado.",
        f"Pior categoria: {worst.category} ({worst.rate:.0%})." if worst else "Sem categorias.",
        (
            "Categorias abaixo do limiar: "
            + ", ".join(f"{s.category} ({s.rate:.0%} < {s.threshold:.0%})" for s in below)
            if below
            else "Todas as categorias atingiram o limiar."
        ),
        f"{errors} caso(s) com erro de execução (rede, agenda ou tutora indisponível).",
        (
            f"Juiz LLM: {run.meta.judge_model} ({judged} avaliações)."
            if run.meta.judge_model
            else "Juiz LLM desligado (apenas graders determinísticos)."
        ),
    ]


def render_markdown(run: RunResult, stats: list[CategoryStats]) -> str:
    """Relatório legível: resumo, tabela por categoria e casos reprovados."""
    meta = run.meta
    lines = [
        f"# Evals da Tutora Lucy — {meta.started_at:%Y-%m-%d %H:%M} UTC",
        "",
        f"- Alvo: `{meta.base_url}`" + (f" · {meta.label}" if meta.label else ""),
        "- Agendas: " + (", ".join(f"{m} → {t}" for m, t in meta.agendas.items()) or "—"),
        f"- Juiz: {meta.judge_model or 'desligado'}",
        "",
        "## Resumo",
        "",
        *[f"{i}. {line}" for i, line in enumerate(summary_lines(run, stats), start=1)],
        "",
        "## Por categoria",
        "",
        "| Categoria | Aprovados | Falhas | Erros | Taxa | Limiar | Status |",
        "|---|---:|---:|---:|---:|---:|---|",
    ]
    for s in stats:
        status = "ok" if s.ok else "abaixo"
        rate, limit = f"{s.rate:.0%}", f"{s.threshold:.0%}"
        cells = [s.category, f"{s.passed}/{s.total}", s.failed, s.errors, rate, limit, status]
        lines.append("| " + " | ".join(str(c) for c in cells) + " |")

    failures = [r for r in run.results if r.status != "pass"]
    lines += ["", f"## Casos reprovados ({len(failures)})", ""]
    if failures:
        lines += ["| id | pergunta | o que veio | por que falhou |", "|---|---|---|---|"]
        for r in failures:
            got = r.reply or "—"
            if r.citations:
                got += f" [citações: {'; '.join(r.citations)}]"
            why = _cell("; ".join(r.failure_reasons()), 300)
            lines.append(f"| `{r.id}` | {_cell(r.question, 120)} | {_cell(got)} | {why} |")
    else:
        lines.append("Nenhum.")
    lines.append("")
    return "\n".join(lines)


def write_reports(run: RunResult, stats: list[CategoryStats], out_dir: Path, stem: str) -> tuple[Path, Path]:
    """Grava `<stem>.md` e `<stem>.json` e devolve os caminhos."""
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path, json_path = out_dir / f"{stem}.md", out_dir / f"{stem}.json"
    md_path.write_text(render_markdown(run, stats), encoding="utf-8")
    payload = run.model_dump(mode="json")
    payload["stats"] = [{**s.__dict__, "rate": round(s.rate, 4), "ok": s.ok} for s in stats]
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return md_path, json_path
