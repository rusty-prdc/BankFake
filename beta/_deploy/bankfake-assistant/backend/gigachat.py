"""Клиент GigaChat API (Сбер).

Реализует актуальную схему из документации:
  1) POST /api/v2/oauth  -> access_token (живёт 30 минут, кэшируется)
  2) POST {api_url}/chat/completions с массивом `functions` (function calling)
  3) результат функции возвращается сообщением role="function"

Никаких секретов здесь нет — только чтение config.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid

import httpx

import config

log = logging.getLogger("gigachat")


class GigaChatError(Exception):
    """Ошибка GigaChat с человекочитаемым сообщением для пользователя."""

    def __init__(self, code: str, user_message: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code
        self.user_message = user_message
        self.detail = detail


_token_lock = threading.Lock()
_token: str | None = None
_token_expires_at: float = 0.0
_scheme_tried: set[str] = set()


def is_configured() -> bool:
    return bool(config.GIGACHAT_AUTH_KEY)


def _oauth_request(scheme: str) -> dict:
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "RqUID": str(uuid.uuid4()),
        "Authorization": f"{scheme} {config.GIGACHAT_AUTH_HEADER}",
    }
    try:
        with httpx.Client(timeout=config.REQUEST_TIMEOUT, verify=config.VERIFY_SSL, follow_redirects=True) as client:
            resp = client.post(config.GIGACHAT_OAUTH_URL, headers=headers,
                               data={"scope": config.GIGACHAT_SCOPE})
    except httpx.TimeoutException as exc:
        raise GigaChatError("timeout", config.MSG_UNAVAILABLE, f"oauth timeout: {exc}") from exc
    except httpx.HTTPError as exc:
        raise GigaChatError("unavailable", config.MSG_UNAVAILABLE, f"oauth http error: {exc}") from exc
    if resp.status_code in (401, 403):
        text = resp.text[:300]
        # ключ дошёл до сервера, но отклонён ({"code":3,"message":"clientId is absent in db"})
        # -> менять схему авторизации бессмысленно
        if '"code"' in text or "clientId" in text:
            raise GigaChatError("auth_failed", config.MSG_BAD_KEY,
                                f"oauth ({scheme}) {resp.status_code}: {text}")
        # схема/форма заголовка не подошла -> имеет смысл попробовать запасную
        raise GigaChatError("auth_scheme", config.MSG_UNAVAILABLE,
                            f"oauth ({scheme}) {resp.status_code}: {text}")
    if resp.status_code >= 400:
        text = resp.text[:300]
        # {"code":3,"message":"clientId is absent in db"}, code 4 и т.п.
        if '"code"' in text or "Authorization" in text:
            raise GigaChatError("auth_failed", config.MSG_BAD_KEY,
                                f"oauth HTTP {resp.status_code}: {text}")
        raise GigaChatError("auth", config.MSG_UNAVAILABLE,
                            f"oauth HTTP {resp.status_code}: {text}")
    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise GigaChatError("auth", config.MSG_UNAVAILABLE, "oauth: нет access_token")
    expires = data.get("expires_at")
    try:
        expires = float(expires)
        # expires_at приходит в секундах (unix) — оставляем запас в 60 секунд
        if expires > 1e12:            # могли прийти миллисекунды
            expires = expires / 1000.0
        ttl = max(30.0, expires - time.time() - 60.0)
    except (TypeError, ValueError):
        ttl = 1500.0                  # 25 минут по умолчанию
    return {"token": token, "ttl": ttl}


def _get_token() -> str:
    """Возвращает действующий access_token (с кэшем и автосменой схемы)."""
    global _token, _token_expires_at, _scheme_tried

    with _token_lock:
        if _token and time.time() < _token_expires_at:
            return _token

        schemes = [config.GIGACHAT_AUTH_SCHEME]
        # если ключ выдан по старой схеме — пробуем запасной вариант один раз
        other = "Bearer" if config.GIGACHAT_AUTH_SCHEME.lower() == "basic" else "Basic"
        if other.lower() not in _scheme_tried:
            schemes.append(other)

        last_detail = ""
        last_error: GigaChatError | None = None
        for scheme in schemes:
            try:
                data = _oauth_request(scheme)
            except GigaChatError as exc:
                last_error = exc
                last_detail = exc.detail
                _scheme_tried.add(scheme.lower())
                if exc.code != "auth_scheme":
                    # сеть недоступна, ключ отклонён или другая ошибка —
                    # пробовать другую схему авторизации бессмысленно
                    raise
                continue
            _token = data["token"]
            _token_expires_at = time.time() + data["ttl"]
            if scheme != config.GIGACHAT_AUTH_SCHEME:
                log.warning("ключ авторизации принят по схеме %s (в .env ожидается %s)",
                            scheme, config.GIGACHAT_AUTH_SCHEME)
            log.info("GigaChat token обновлён, ttl=%.0f мин", data["ttl"] / 60)
            return _token

        if last_error is not None:
            raise last_error
        raise GigaChatError("auth_failed", config.MSG_BAD_KEY, f"oauth failed: {last_detail}")


def _reset_token() -> None:
    global _token, _token_expires_at
    with _token_lock:
        _token, _token_expires_at = None, 0.0


def _chat_once(messages: list[dict], functions: list[dict] | None,
               function_call: str | None) -> dict:
    payload: dict = {
        "model": config.GIGACHAT_MODEL,
        "messages": messages,
        "stream": False,
    }
    if functions:
        payload["functions"] = functions
        if function_call:
            payload["function_call"] = function_call

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {_get_token()}",
    }
    url = f"{config.GIGACHAT_API_URL}/chat/completions"

    try:
        with httpx.Client(timeout=config.REQUEST_TIMEOUT, verify=config.VERIFY_SSL, follow_redirects=True) as client:
            resp = client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise GigaChatError("timeout", config.MSG_UNAVAILABLE, f"timeout: {exc}") from exc
    except httpx.HTTPError as exc:
        raise GigaChatError("unavailable", config.MSG_UNAVAILABLE, f"http error: {exc}") from exc

    if resp.status_code in (401, 403):
        # токен мог истечь — сбрасываем и пробуем один раз заново
        _reset_token()
        try:
            headers["Authorization"] = f"Bearer {_get_token()}"
            with httpx.Client(timeout=config.REQUEST_TIMEOUT, verify=config.VERIFY_SSL, follow_redirects=True) as client:
                resp = client.post(url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            raise GigaChatError("unavailable", config.MSG_UNAVAILABLE, str(exc)) from exc

    if resp.status_code == 429:
        raise GigaChatError("rate_limit_ai", "AI перегружен. Попробуйте чуть позже.",
                            f"HTTP 429: {resp.text[:200]}")
    if resp.status_code >= 400:
        text = resp.text[:300]
        if "model" in text.lower() and resp.status_code == 404:
            raise GigaChatError("model", f"Модель «{config.GIGACHAT_MODEL}» недоступна. Проверьте GIGACHAT_MODEL в .env.",
                                f"HTTP {resp.status_code}: {text}")
        raise GigaChatError("unavailable", config.MSG_UNAVAILABLE, f"HTTP {resp.status_code}: {text}")

    try:
        return resp.json()
    except ValueError as exc:
        raise GigaChatError("unavailable", config.MSG_UNAVAILABLE, "не JSON в ответе") from exc


def chat(messages: list[dict], functions: list[dict] | None = None,
         function_call: str | None = "auto") -> dict:
    """Один запрос к GigaChat. Возвращает JSON-ответ API."""
    if not is_configured():
        raise GigaChatError("no_key", config.MSG_NO_KEY, "GIGACHAT_AUTH_KEY пуст")
    return _chat_once(messages, functions, function_call)


def run_with_functions(messages: list[dict], functions: list[dict],
                       executor,  # callable(name: str, arguments: dict) -> dict|str
                       max_rounds: int | None = None) -> str:
    """Цикл function calling.

    Возвращает финальный текст ответа модели.
    executor(name, arguments) -> результат работы функции BankFake
    (dict или уже готовая текстовая строка).
    """
    from prompts import RAW_DUMP_CORRECTION  # локальный импорт — без циклов

    rounds = max_rounds or config.MAX_FUNCTION_ROUNDS
    convo = list(messages)
    corrected = False

    for round_i in range(rounds):
        data = chat(convo, functions=functions, function_call="auto")
        choices = data.get("choices") or []
        if not choices:
            raise GigaChatError("unavailable", config.MSG_UNAVAILABLE, "пустой choices")
        message = (choices[0] or {}).get("message") or {}
        finish = (choices[0] or {}).get("finish_reason")

        function_call = message.get("function_call")
        if finish == "function_call" and function_call:
            name = function_call.get("name") or ""
            raw_args = function_call.get("arguments") or {}
            if isinstance(raw_args, str):
                try:
                    raw_args = json.loads(raw_args or "{}")
                except ValueError:
                    raw_args = {}
            if not isinstance(raw_args, dict):
                raw_args = {}

            log.info("function=%s round=%d", name, round_i + 1)
            try:
                result = executor(name, raw_args)
            except Exception as exc:  # noqa: BLE001 — не роняем запрос из-за ошибки данных
                result = {"ошибка": "Не удалось получить данные", "детали": type(exc).__name__}

            if isinstance(result, str):
                content = result
            else:
                content = json.dumps(result, ensure_ascii=False, default=str)

            # сообщение модели сохраняем как есть (включая functions_state_id)
            assistant_msg = {"role": "assistant", "content": message.get("content") or ""}
            if message.get("functions_state_id"):
                assistant_msg["functions_state_id"] = message["functions_state_id"]
            assistant_msg["function_call"] = {"name": name, "arguments": raw_args}
            convo.append(assistant_msg)
            convo.append({"role": "function", "name": name, "content": content})
            continue

        if finish == "error":
            raise GigaChatError("bad_args", config.MSG_UNAVAILABLE, "модель вернула невалидные аргументы")

        text = (message.get("content") or "").strip()
        if not text:
            raise GigaChatError("empty", config.MSG_UNAVAILABLE, "пустой ответ модели")

        # Модель иногда выдаёт вместо ответа сырые данные (JSON, «Вот данные из …»).
        # Один раз просим переписать по-человечески.
        if not corrected and _looks_like_raw_dump(text):
            log.info("ответ похож на сырые данные -> корректирующий раунд")
            corrected = True
            convo.append({"role": "assistant", "content": text})
            convo.append({"role": "user", "content": RAW_DUMP_CORRECTION})
            continue

        return text

    raise GigaChatError("loop", config.MSG_UNAVAILABLE, "превышен лимит раундов функций")


_RAW_DUMP_RE = re.compile(
    r"(\{\s*\"|\"\s*:\s|^\s*Вот данные|данные из\s+get_|"
    r"\bget_(balance|cards|profile|points|salary|transactions|payments|"
    r"subscriptions|account_info|transaction_statistics)\b)",
    re.IGNORECASE | re.MULTILINE,
)


def _looks_like_raw_dump(text: str) -> bool:
    """Похоже ли, что модель выплюнула сырые данные вместо ответа."""
    if len(text) > 1200:
        return False
    return bool(_RAW_DUMP_RE.search(text))
