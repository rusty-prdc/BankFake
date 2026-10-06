"""BF Assistant — backend BankFake на FastAPI + GigaChat (Сбер).

Запуск:
    uvicorn main:app --host 0.0.0.0 --port 8000
    или
    python main.py

API:
    POST /api/assistant/chat    — диалог с ассистентом (с учётом данных BankFake)
    POST /api/assistant/reset   — сброс серверного состояния (история живёт в localStorage)
    GET  /api/assistant/health  — проверка живости (без секретов)
    GET  /api/assistant/config  — публичная конфигурация (без секретов)
"""
from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque

from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
import gigachat
import tools
from prompts import EMPTY_INPUT_MESSAGE, SYSTEM_PROMPT

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("assistant")

app = FastAPI(title="BF Assistant API", version="1.0.0", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # frontend BankFake может открываться с любого хоста
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ============================================================ модели запросов
class ChatRequest(BaseModel):
    # типы нарочно «широкие»: мусор из localStorage отфильтрует sanitize/_clean_history,
    # а не 422 от pydantic
    message: Any = ""
    # user_id приходит только для эха в ответ; ДАННЫЕ по нему НЕ ищутся —
    # они приходят в поле profile в том же запросе.
    user_id: Any = None
    profile: Any = None
    history: Any = None


class ResetRequest(BaseModel):
    user_id: Any = None


# ============================================================ защита от перебора
_rate: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _rate_limited(request: Request) -> bool:
    limit = max(1, config.RATE_LIMIT_PER_MINUTE)
    now = time.time()
    bucket = _rate[_client_ip(request)]
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= limit:
        return True
    bucket.append(now)
    return False


# ============================================================ вспомогательное
def _ok(**payload) -> dict:
    return {"ok": True, **payload}


def _err(status: int, code: str, message: str):  # noqa: ANN202
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=status, content={"ok": False, "error": {"code": code, "message": message}})


def _clean_history(raw: list[dict] | None) -> list[dict]:
    """Оставляем только короткие реплики user/assistant (не больше 16 пар)."""
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw[-config.MAX_HISTORY_MESSAGES:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content") or item.get("text") or ""
        if role not in ("user", "assistant") or not isinstance(content, str):
            continue
        content = content.strip()[:2000]
        if content:
            out.append({"role": role, "content": content})
    # модель требует, чтобы диалог начинался с user
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def _cap_message(message: str) -> str:
    message = (message or "").strip()
    if len(message) > config.MAX_MESSAGE_LENGTH:
        message = message[:config.MAX_MESSAGE_LENGTH]
    return message


# ============================================================ эндпоинты
@app.get("/api/assistant/health")
def health() -> dict:
    """Живость сервиса. Секреты не возвращаются."""
    return _ok(
        status="ok",
        service="bf-assistant",
        gigachat_configured=gigachat.is_configured(),
        model=config.GIGACHAT_MODEL,
        api_url=config.GIGACHAT_API_URL,
        time=int(time.time()),
    )


@app.get("/api/assistant/config")
def public_config(request: Request) -> dict:
    """Публичная конфигурация для frontend. Без ключей и токенов."""
    return _ok(
        model=config.GIGACHAT_MODEL,
        api_url=config.GIGACHAT_API_URL,
        gigachat_configured=gigachat.is_configured(),
        rate_limit_per_minute=config.RATE_LIMIT_PER_MINUTE,
        max_message_length=config.MAX_MESSAGE_LENGTH,
        quick_actions=[
            {"key": "balance", "label": "Мой баланс", "text": "Сколько у меня денег?"},
            {"key": "last", "label": "Последние операции", "text": "Покажи последние операции"},
            {"key": "cards", "label": "Мои карты", "text": "Какие у меня карты?"},
            {"key": "points", "label": "Мои баллы", "text": "Сколько у меня бонусных баллов?"},
            {"key": "salary", "label": "Зарплата", "text": "Когда следующая зарплата?"},
            {"key": "forecast", "label": "Прогноз", "text": "Какой будет баланс через месяц?"},
        ],
        base=get_base_url(request),
    )


@app.post("/api/assistant/reset")
def reset(payload: ResetRequest | None = None) -> dict:
    """История чата хранится в localStorage на клиенте, сервер ничего не хранит."""
    log.info("assistant reset (user_id=%s)", (payload.user_id if payload else None))
    return _ok()


@app.post("/api/assistant/chat")
def chat(payload: ChatRequest, request: Request):  # noqa: ANN201
    message = _cap_message(payload.message if isinstance(payload.message, str) else "")

    if _rate_limited(request):
        return _err(429, "rate_limit", config.MSG_RATE_LIMIT)

    if not gigachat.is_configured():
        log.error("GIGACHAT_AUTH_KEY не задан в .env")
        return _err(503, "no_key", config.MSG_NO_KEY)

    if not message:
        return _err(400, "empty_message", EMPTY_INPUT_MESSAGE)

    snapshot = tools.sanitize_profile(payload.profile)
    history = _clean_history(payload.history)
    user_id = payload.user_id if isinstance(payload.user_id, str) else None
    log.info("chat user_id=%s msg_len=%d history=%d cards=%d txn=%d",
             user_id, len(message), len(history),
             len(snapshot.get("cards") or []), len(snapshot.get("history") or []))

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += history
    messages.append({"role": "user", "content": message})

    started = time.time()

    def executor(name: str, arguments: dict) -> str:
        # результат сразу превращаем в читаемый текст: модель не должна
        # выдавать пользователю сырые JSON-данные
        return tools.execute_function_text(name, arguments, snapshot)

    try:
        answer = gigachat.run_with_functions(messages, tools.FUNCTIONS, executor)
    except gigachat.GigaChatError as exc:
        log.error("GigaChat error [%s]: %s", exc.code, exc.detail)
        status = 503
        if exc.code == "rate_limit_ai":
            status = 429
        elif exc.code in ("bad_args", "empty"):
            status = 502
        return _err(status, exc.code, exc.user_message)
    except Exception as exc:  # noqa: BLE001 — никаких traceback клиенту
        log.exception("unexpected error: %s", type(exc).__name__)
        return _err(500, "internal", config.MSG_UNAVAILABLE)

    elapsed = round(time.time() - started, 2)
    log.info("answer ok in %ss (chars=%d)", elapsed, len(answer))
    return _ok(message=answer, model=config.GIGACHAT_MODEL, elapsed=elapsed)


def get_base_url(request: Request) -> str:
    """Адрес backend с точки зрения клиента (для автонастройки frontend)."""
    return str(request.base_url).rstrip("/")


# ============================================================ запуск
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=config.HOST,
        port=config.PORT,
        log_level=config.LOG_LEVEL.lower(),
        access_log=True,
    )
