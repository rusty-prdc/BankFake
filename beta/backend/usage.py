"""Дневной счётчик токенов GigaChat + серверный кап на весь проект.

Счётчик живёт рядом с main.py в usage_daily.json:
    {"2026-10-06": {"tokens": 48219, "requests": 28}, ...}

- add() вызывается после каждого успешного ответа GigaChat (из gigachat.py);
- exceeded() проверяется ДО запроса к AI (из main.py);
- DAILY_TOKEN_CAP (config) = 0 -> кап выключен.
"""
from __future__ import annotations

import json
import os
import threading
import time

_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage_daily.json")
_lock = threading.Lock()
_KEEP_DAYS = 7


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def _load() -> dict:
    try:
        with open(_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            return data
    except Exception:  # noqa: BLE001 — нет файла или битый JSON -> нули
        pass
    return {}


def _save(data: dict) -> None:
    tmp = _FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    os.replace(tmp, _FILE)


def today_usage() -> dict:
    """{"tokens": N, "requests": M} за сегодня."""
    with _lock:
        cur = _load().get(_today()) or {}
    return {"tokens": int(cur.get("tokens", 0) or 0),
            "requests": int(cur.get("requests", 0) or 0)}


def add(tokens: int) -> None:
    """Прибавить токены завершённого запроса."""
    if not tokens:
        return
    with _lock:
        data = _load()
        day = _today()
        cur = data.get(day) or {}
        cur["tokens"] = int(cur.get("tokens", 0) or 0) + int(tokens)
        cur["requests"] = int(cur.get("requests", 0) or 0) + 1
        data[day] = cur
        for old in sorted(data.keys())[:-_KEEP_DAYS]:
            data.pop(old, None)
        try:
            _save(data)
        except Exception:  # noqa: BLE001 — диск/права: не роняем запрос из-за счётчика
            pass


def exceeded() -> bool:
    """True, если дневной кап исчерпан (или кап не задан — False)."""
    try:
        import config
        cap = int(getattr(config, "DAILY_TOKEN_CAP", 0) or 0)
    except Exception:  # noqa: BLE001
        return False
    if cap <= 0:
        return False
    return today_usage()["tokens"] >= cap
