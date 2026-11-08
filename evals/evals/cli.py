"""CLI: `python -m evals run | report | cases`."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table

from evals.cases import DEFAULT_CASES_DIR, CaseFileError, Category, Mode, load_cases
from evals.client import ClientError, TutorClient
from evals.judge import JudgeError, LLMJudge
from evals.proactive import run_proactive_cases
from evals.report import DEFAULT_THRESHOLD, category_stats, exit_code, summary_lines, write_reports
from evals.runner import CaseResult, RunMeta, RunResult, now_utc, regrade, run_cases

DEFAULT_REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"
# Aluno de demonstração criado pelo seed (src/lib/constants/demo-credentials.ts).
DEMO_STUDENT = ("202601001", "aluno123")
# Professor de demonstração do seed; só o `proativo` precisa dele (grava os eventos da aula).
DEMO_TEACHER = ("PROF001", "prof123")

console = Console()


def _thresholds(default: float, overrides: list[str]) -> dict[str, float]:
    """`--threshold-for categoria=0.5` (repetível) sobre o limiar global."""
    result = {"*": default}
    for item in overrides:
        name, _, value = item.partition("=")
        Category(name)  # valida o nome
        result[name] = float(value)
    return result


def _print_stats(results: list[CaseResult], thresholds: dict[str, float]) -> int:
    stats = category_stats(results, thresholds)
    table = Table(title="Taxa de acerto por categoria")
    for column in ("categoria", "aprovados", "taxa", "limiar", "status"):
        table.add_column(column)
    for s in stats:
        style = "green" if s.ok else "red"
        table.add_row(
            s.category,
            f"{s.passed}/{s.total}",
            f"{s.rate:.0%}",
            f"{s.threshold:.0%}",
            f"[{style}]{'ok' if s.ok else 'abaixo'}[/]",
        )
    console.print(table)
    return exit_code(stats)


def cmd_cases(args: argparse.Namespace) -> int:
    """Valida e lista os casos."""
    cases = load_cases(args.cases_dir, args.category, args.id)
    table = Table(title=f"{len(cases)} casos válidos")
    for column in ("id", "categoria", "modo", "graders", "pergunta"):
        table.add_column(column, overflow="fold")
    for case in cases:
        judge = f" +juiz:{case.judge_criterion()}" if case.judge_criterion() else ""
        table.add_row(
            case.id, case.category, case.mode, ", ".join(case.active_graders()) + judge, case.question
        )
    console.print(table)
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    """Executa os casos contra a API e grava o relatório."""
    cases = load_cases(args.cases_dir, args.category, args.id)
    if args.limit:
        cases = cases[: args.limit]
    if not cases:
        console.print("[red]Nenhum caso selecionado.[/]")
        return 2

    judge: LLMJudge | None = None
    if args.judge:
        try:
            judge = LLMJudge.from_env()
        except JudgeError as exc:
            console.print(f"[red]--judge pedido, mas {exc}[/]")
            return 2

    thresholds = _thresholds(args.threshold, args.threshold_for)
    meta = RunMeta(
        started_at=now_utc(),
        base_url=args.base_url,
        label=args.label,
        judge_model=judge.model if judge else None,
    )
    with TutorClient(args.base_url, timeout=args.timeout, retries=args.retries) as client:
        try:
            user = client.login(args.enrollment, os.environ.get("EVALS_PASSWORD", args.password))
            agendas = client.resolve_agendas(assume_open=args.assume_window_open)
        except ClientError as exc:
            console.print(f"[red]Falha ao preparar a sessão: {exc}[/]")
            return 2
        meta.agendas = {mode.value: f"{a.type} ({a.title})" for mode, a in agendas.items()}
        console.print(f"Logado como [bold]{user.get('name', '?')}[/]; agendas: {meta.agendas or 'nenhuma'}")

        def progress(result: CaseResult) -> None:
            color = {"pass": "green", "fail": "red", "error": "yellow"}[result.status]
            console.print(f"[{color}]{result.status:5}[/] {result.id}")

        regular = [c for c in cases if c.category is not Category.PROATIVO]
        proactive = [c for c in cases if c.category is Category.PROATIVO]
        results = run_cases(
            regular,
            client,
            agendas,
            judge=judge,
            delay=args.delay,
            fallback_retries=args.fallback_retries,
            on_result=progress,
        )
        if proactive:
            classroom = agendas.get(Mode.CLASSROOM)
            if classroom is None:
                console.print("[red]O proativo precisa de uma agenda CLASSROOM com janela aberta.[/]")
                return 2
            try:
                with TutorClient(args.base_url, timeout=args.timeout, retries=args.retries) as teacher:
                    teacher.login(
                        args.teacher_identifier,
                        os.environ.get("EVALS_TEACHER_PASSWORD", args.teacher_password),
                    )
                    results += run_proactive_cases(
                        proactive, teacher, client, classroom.id, on_result=progress
                    )
            except ClientError as exc:
                console.print(f"[red]Falha no proativo: {exc}[/]")
                return 2
    if judge:
        judge.close()

    meta.finished_at = now_utc()
    run = RunResult(meta=meta, results=results)
    stats = category_stats(results, thresholds)
    stem = args.name or meta.started_at.strftime("%Y-%m-%d-%H%M%S")
    md_path, json_path = write_reports(run, stats, args.out_dir, stem)
    code = _print_stats(results, thresholds)
    for line in summary_lines(run, stats):
        console.print(f"- {line}")
    console.print(f"Relatório: {md_path}\nJSON: {json_path}")
    return code


def cmd_report(args: argparse.Namespace) -> int:
    """Regera o Markdown a partir de um JSON de execução (ex.: com outro limiar)."""
    run = RunResult.model_validate(json.loads(args.json_path.read_text(encoding="utf-8")))
    if args.regrade:
        cases = {c.id: c for c in load_cases(args.cases_dir)}
        run.results = [regrade(r, cases[r.id]) if r.id in cases else r for r in run.results]
    thresholds = _thresholds(args.threshold, args.threshold_for)
    stats = category_stats(run.results, thresholds)
    md_path, _ = write_reports(run, stats, args.json_path.parent, args.json_path.stem)
    code = _print_stats(run.results, thresholds)
    console.print(f"Relatório: {md_path}")
    return code


def _add_filters(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--cases-dir", type=Path, default=DEFAULT_CASES_DIR)
    parser.add_argument("--category", action="append", choices=[c.value for c in Category], help="repetível")
    parser.add_argument("--id", action="append", help="roda só estes ids (repetível)")


def _add_thresholds(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--threshold", type=float, default=DEFAULT_THRESHOLD, help="limiar por categoria (0-1)"
    )
    parser.add_argument(
        "--threshold-for", action="append", default=[], metavar="CATEGORIA=VALOR", help="limiar específico"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m evals", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="executa os casos contra a API")
    _add_filters(run)
    _add_thresholds(run)
    run.add_argument("--base-url", default=os.environ.get("EVALS_BASE_URL", "http://localhost:3000"))
    run.add_argument("--enrollment", default=DEMO_STUDENT[0], help="matrícula do aluno")
    run.add_argument("--password", default=DEMO_STUDENT[1], help="senha (ou EVALS_PASSWORD)")
    run.add_argument("--teacher-identifier", default=DEMO_TEACHER[0], help="professor (só no proativo)")
    run.add_argument(
        "--teacher-password", default=DEMO_TEACHER[1], help="senha do professor (ou EVALS_TEACHER_PASSWORD)"
    )
    run.add_argument("--judge", action=argparse.BooleanOptionalAction, default=False, help="liga o juiz LLM")
    run.add_argument("--timeout", type=float, default=90.0, help="timeout por requisição (s)")
    run.add_argument("--retries", type=int, default=3, help="retries para rede/5xx/429")
    run.add_argument(
        "--fallback-retries", type=int, default=2, help="retries quando a tutora cai no fallback"
    )
    run.add_argument("--delay", type=float, default=0.0, help="pausa entre casos (s), útil com rate limit")
    run.add_argument("--limit", type=int, default=0, help="roda só os N primeiros casos")
    run.add_argument(
        "--assume-window-open", action="store_true", help="usa agendas fora da janela (flag de testes)"
    )
    run.add_argument("--label", default="", help="rótulo livre no relatório (ex.: provedor/modelo)")
    run.add_argument("--out-dir", type=Path, default=DEFAULT_REPORTS_DIR)
    run.add_argument("--name", default="", help="nome-base dos arquivos (padrão: data-hora)")
    run.set_defaults(func=cmd_run)

    report = sub.add_parser("report", help="regera o Markdown a partir de um JSON")
    report.add_argument("json_path", type=Path)
    report.add_argument(
        "--regrade", action="store_true", help="reaplica os graders atuais às respostas gravadas (sem rede)"
    )
    report.add_argument("--cases-dir", type=Path, default=DEFAULT_CASES_DIR)
    _add_thresholds(report)
    report.set_defaults(func=cmd_report)

    cases = sub.add_parser("cases", help="valida e lista os casos")
    _add_filters(cases)
    cases.set_defaults(func=cmd_cases)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except CaseFileError as exc:
        console.print(f"[red]{exc}[/]")
        return 2


if __name__ == "__main__":
    sys.exit(main())
