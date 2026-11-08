"""Cliente HTTP da Soberania AI: faz login como aluno e conversa com a tutora como a UI faria.

Rotas usadas (todas em `/api/v1`):
- `POST auth/login` `{identifier, password}` -> cookie `soberania_session` (JWT da sessão).
- `GET agendas` -> agendas visíveis ao aluno; o *tipo* da agenda define o modo da tutora
  (CLASSROOM = sala de aula socrática; OFFICE_HOURS/STUDY_GROUP = estudo fora da aula).
- `POST agent/chat` `{agendaId, message, history}` -> JSON `{reply, citations, fallback, ...}`.
  (A UI usa a variante SSE `agent/chat/stream`; a resposta final é a mesma.)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

from evals.cases import Mode

SESSION_COOKIE = "soberania_session"

# Tipos de agenda aceitos por modo, em ordem de preferência.
AGENDA_TYPES_BY_MODE: dict[Mode, tuple[str, ...]] = {
    Mode.CLASSROOM: ("CLASSROOM",),
    Mode.REVIEW: ("OFFICE_HOURS", "STUDY_GROUP"),
}

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class ClientError(RuntimeError):
    """Falha de comunicação ou de contrato com a API."""


@dataclass
class TutorReply:
    """Resposta da tutora a uma mensagem do aluno."""

    reply: str
    citations: list[str] = field(default_factory=list)
    fallback: bool = False
    is_socratic_challenge: bool = False
    blocked_by_exam_guardrail: bool = False
    server_latency_ms: int | None = None
    wall_ms: int = 0
    attempts: int = 1


@dataclass(frozen=True)
class Agenda:
    """Recorte da agenda que o harness precisa."""

    id: str
    title: str
    type: str
    status: str
    start: datetime
    end: datetime

    def window_open(self, now: datetime) -> bool:
        """Espelha a regra do servidor: LIVE vale até o fim; SCHEDULED só entre início e fim."""
        if self.status == "CANCELLED":
            return False
        if self.status == "LIVE":
            return now <= self.end
        return self.start <= now <= self.end


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def pick_agenda(agendas: list[Agenda], mode: Mode, now: datetime, assume_open: bool = False) -> Agenda | None:
    """Escolhe a agenda do modo pedido, preferindo janelas abertas e agendas LIVE."""
    for agenda_type in AGENDA_TYPES_BY_MODE[mode]:
        candidates = [a for a in agendas if a.type == agenda_type and a.status != "CANCELLED"]
        open_ones = [a for a in candidates if a.window_open(now)]
        if open_ones:
            return sorted(open_ones, key=lambda a: (a.status != "LIVE", a.start))[0]
        if assume_open and candidates:
            return candidates[0]
    return None


class TutorClient:
    """Sessão autenticada de um aluno contra a API da Soberania AI."""

    def __init__(
        self,
        base_url: str,
        timeout: float = 90.0,
        retries: int = 3,
        backoff: float = 4.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url.rstrip("/") + "/api/v1/",
            timeout=httpx.Timeout(timeout, connect=10.0),
            transport=transport,
            headers={"User-Agent": "soberania-evals/0.1"},
        )
        self._retries = retries
        self._backoff = backoff
        self._token: str | None = None

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> TutorClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- transporte ----------------------------------------------------------------------------

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """Requisição com retry exponencial para erros de rede e status transitórios."""
        headers = kwargs.pop("headers", {})
        if self._token:
            # O cookie pode vir com `Secure`; mandamos o header à mão para funcionar em http://localhost.
            headers["Cookie"] = f"{SESSION_COOKIE}={self._token}"
        last_error: Exception | None = None
        for attempt in range(1, self._retries + 2):
            try:
                response = self._http.request(method, path, headers=headers, **kwargs)
            except httpx.TransportError as exc:
                last_error = exc
            else:
                if response.status_code not in RETRYABLE_STATUS:
                    return response
                last_error = ClientError(f"{method} {path}: HTTP {response.status_code}")
            if attempt <= self._retries:
                time.sleep(self._backoff * 2 ** (attempt - 1))
        raise ClientError(f"{method} {path} falhou após {self._retries + 1} tentativas: {last_error}")

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError as exc:
            raise ClientError(f"resposta não-JSON (HTTP {response.status_code})") from exc
        if response.status_code >= 400 or body.get("success") is False:
            raise ClientError(f"HTTP {response.status_code}: {body.get('error', body)}")
        return body

    # -- API -----------------------------------------------------------------------------------

    def login(self, identifier: str, password: str) -> dict[str, Any]:
        """Autentica e guarda o JWT do cookie de sessão."""
        response = self._request("POST", "auth/login", json={"identifier": identifier, "password": password})
        body = self._json(response)
        for header in response.headers.get_list("set-cookie"):
            name, _, rest = header.partition("=")
            if name.strip() == SESSION_COOKIE:
                self._token = rest.split(";", 1)[0]
        if not self._token:
            raise ClientError("login sem cookie de sessão")
        return body.get("user", {})

    def list_agendas(self) -> list[Agenda]:
        body = self._json(self._request("GET", "agendas"))
        return [
            Agenda(
                id=a["id"],
                title=a["title"],
                type=a["type"],
                status=a["status"],
                start=_parse_time(a["startTime"]),
                end=_parse_time(a["endTime"]),
            )
            for a in body.get("agendas", [])
        ]

    def resolve_agendas(self, assume_open: bool = False) -> dict[Mode, Agenda]:
        """Mapeia cada modo para uma agenda utilizável agora."""
        agendas = self.list_agendas()
        now = datetime.now(UTC)
        resolved: dict[Mode, Agenda] = {}
        for mode in Mode:
            agenda = pick_agenda(agendas, mode, now, assume_open)
            if agenda:
                resolved[mode] = agenda
        return resolved

    def post_event(
        self, agenda_id: str, type: str, step_index: int | None = None
    ) -> list[dict[str, Any]]:
        """Grava um evento da aula (professor): `SESSION_STARTED` ou `STEP_CHANGED`."""
        payload: dict[str, Any] = {"type": type}
        if step_index is not None:
            payload["stepIndex"] = step_index
        body = self._json(self._request("POST", f"agendas/{agenda_id}/events", json=payload))
        return list(body.get("events") or [])

    def list_events(self, agenda_id: str, after: int = 0) -> list[dict[str, Any]]:
        """Lê os eventos da aula depois de `after`, paginando até `lastSeq` parar de avançar."""
        events: list[dict[str, Any]] = []
        cursor = after
        while True:
            body = self._json(self._request("GET", f"agendas/{agenda_id}/events", params={"after": cursor}))
            page = list(body.get("events") or [])
            events.extend(page)
            last = body.get("lastSeq")
            if not page or not isinstance(last, int) or last <= cursor:
                return events
            cursor = last

    def chat(
        self,
        agenda_id: str,
        message: str,
        history: list[dict[str, str]] | None = None,
        fallback_retries: int = 2,
    ) -> TutorReply:
        """Envia uma mensagem; repete quando o servidor responde com o aviso de indisponibilidade."""
        payload = {"agendaId": agenda_id, "message": message, "history": history or []}
        attempts = 0
        started = time.monotonic()
        while True:
            attempts += 1
            body = self._json(self._request("POST", "agent/chat", json=payload))
            reply = TutorReply(
                reply=str(body.get("reply", "")),
                citations=[str(c) for c in body.get("citations") or []],
                fallback=bool(body.get("fallback")),
                is_socratic_challenge=bool(body.get("isSocraticChallenge")),
                blocked_by_exam_guardrail=bool(body.get("blockedByExamGuardrail")),
                server_latency_ms=body.get("latencyMs"),
            )
            # fallback=true: o provedor falhou (ex.: 429 do Groq) e a API devolveu o aviso padrão.
            if not reply.fallback or attempts > fallback_retries:
                reply.attempts = attempts
                reply.wall_ms = int((time.monotonic() - started) * 1000)
                return reply
            time.sleep(self._backoff * 2 ** (attempts - 1))
