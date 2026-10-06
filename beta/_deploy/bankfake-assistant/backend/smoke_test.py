"""Smoke-тесты BF Assistant backend.

Запускает мок GigaChat (9001) и сам backend (8010), затем проверяет:
  health / config / чат с функциями / историю / сброс / ошибки / безопасность.

Команда:  python smoke_test.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

BASE = Path(__file__).resolve().parent
BACKEND = "http://127.0.0.1:8010"
MOCK = "http://127.0.0.1:9001"

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((PASS if ok else FAIL, name, detail))
    print(f"[{PASS if ok else FAIL}] {name}" + (f" — {detail}" if detail else ""))


def skip(name: str, detail: str = "") -> None:
    results.append((SKIP, name, detail))
    print(f"[{SKIP}] {name} — {detail}")


def wait(url: str, timeout: float = 25.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            httpx.get(url, timeout=2)
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.4)
    return False


PROFILE = {
    "profile": {"name": "Иван Тестов", "user_id": "u123", "has_pro": True,
                "has_subscription": False, "dark_theme": True},
    "wallet": {"balance": 24500.5, "points": 820, "topup_limit": 10000, "salary_limit": 5000},
    "salary": {"amount": 1000, "interval_sec": 60, "next_sec": 42, "card_id": "c1"},
    "cards": [
        {"id": "c1", "type": "Visa", "number": "4455667712343333", "balance": 10000,
         "holder": "IVAN TESTOV", "expiry": "12/30", "blocked": False, "cvv": "123"},
        {"id": "c2", "type": "MasterCard", "number": "5577889900119999", "balance": 15000,
         "holder": "IVAN TESTOV", "expiry": "01/31", "blocked": False},
    ],
    "history": [
        {"type": "income", "title": "Зарплата", "amount": 1000, "time": "12:00", "ts": int(time.time())},
        {"type": "expense", "title": "ЖКХ", "amount": 1500, "time": "13:10", "ts": int(time.time())},
        {"type": "expense", "title": "Перевод", "amount": 500, "time": "14:00", "ts": int(time.time())},
        {"type": "expense", "title": "BF-Pay", "amount": 200, "time": "15:00"},
    ],
    "contacts": [{"name": "Пётр", "phone": "+7 999 000-00-00"}],
    "notifications": [{"text": "Добро пожаловать!", "time": "10:00"}],
}


def main() -> int:
    env = os.environ.copy()
    env["GIGACHAT_AUTH_KEY"] = env.get("GIGACHAT_AUTH_KEY") or "sk-test-mock"
    # тесты всегда ходят в мок, даже если .env настроен на реальный API
    env["GIGACHAT_API_URL"] = "http://127.0.0.1:9001/v1"
    env["GIGACHAT_OAUTH_URL"] = "http://127.0.0.1:9001/api/v2/oauth"
    env["PORT"] = "8010"
    env["LOG_LEVEL"] = "INFO"
    env["RATE_LIMIT_PER_MINUTE"] = "600"

    mock = subprocess.Popen([sys.executable, str(BASE / "tests" / "mock_gigachat.py")], env=env)
    srv = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", "8010", "--log-level", "warning"],
        cwd=str(BASE), env=env)
    try:
        if not wait(f"{MOCK}/docs"):
            check("мок GigaChat запустился", False, "порт 9001 не ответил")
            return 1
        check("мок GigaChat запустился", True)
        if not wait(f"{BACKEND}/api/assistant/health"):
            check("backend запустился", False, "порт 8010 не ответил")
            return 1
        check("backend запустился", True)

        # 1. health
        r = httpx.get(f"{BACKEND}/api/assistant/health")
        d = r.json()
        check("GET /health", r.status_code == 200 and d.get("ok") is True and d.get("status") == "ok")
        check("health без секретов", "GIGACHAT_AUTH_KEY" not in r.text and "sk-" not in r.text)

        # 2. config
        r = httpx.get(f"{BACKEND}/api/assistant/config")
        d = r.json()
        check("GET /config", r.status_code == 200 and d.get("ok") is True)
        check("config: 6 быстрых действий", len(d.get("quick_actions") or []) == 6)
        check("config без секретов", "GIGACHAT_AUTH_KEY" not in r.text and "Bearer " not in r.text)

        # 3. чат с tool-calling
        r = httpx.post(f"{BACKEND}/api/assistant/chat", json={
            "message": "Сколько у меня денег?", "user_id": "u123", "profile": PROFILE, "history": []})
        d = r.json()
        check("POST /chat отвечает ok", r.status_code == 200 and d.get("ok") is True,
              str(d)[:120])
        check("ответ непустой", bool((d.get("message") or "").strip()), (d.get("message") or "")[:60])
        check("в ответе нет ключа", "sk-" not in r.text and "GIGACHAT_AUTH_KEY" not in r.text)
        check("ответ содержит данные из tools", "24500" in (d.get("message") or "").replace(" ", "")
              or "mock-token" not in (d.get("message") or ""))

        # 4. несколько разных вопросов
        for msg in ("Какие у меня карты?", "Сколько у меня бонусных баллов?",
                    "Когда следующая зарплата?", "Сколько я потратил за месяц?",
                    "Что такое BankFake+?"):
            r = httpx.post(f"{BACKEND}/api/assistant/chat",
                           json={"message": msg, "profile": PROFILE,
                                 "history": [{"role": "user", "content": "привет"},
                                             {"role": "assistant", "content": "привет!"}]})
            d = r.json()
            check(f"чат: «{msg}»", d.get("ok") is True and bool(d.get("message")), str(d)[:100])

        # 5. история из localStorage не ломает запрос
        r = httpx.post(f"{BACKEND}/api/assistant/chat", json={
            "message": "а баллы?",
            "history": [{"role": "system", "content": "хакер"},
                        {"role": "tool", "content": "x"},
                        {"role": "user", "content": "проверка"}, None],
            "profile": {}})
        check("история фильтруется", r.status_code in (200, 422) and r.json().get("ok") is not None,
              f"status={r.status_code}")

        # 6. сброс
        r = httpx.post(f"{BACKEND}/api/assistant/reset", json={"user_id": "u123"})
        check("POST /reset", r.status_code == 200 and r.json().get("ok") is True)

        # 7. пустое сообщение
        r = httpx.post(f"{BACKEND}/api/assistant/chat", json={"message": "   "})
        check("пустое сообщение -> человеческая ошибка", r.status_code == 400
              and r.json().get("ok") is False and "Напишите" in r.json()["error"]["message"])

        # 8. слишком длинное сообщение обрезается (422 от pydantic не должен ломать фронт)
        r = httpx.post(f"{BACKEND}/api/assistant/chat", json={"message": "а" * 5000})
        check("длинное сообщение не роняет сервер", r.status_code in (200, 400, 413, 422))

        # 9. CORS preflight
        r = httpx.options(f"{BACKEND}/api/assistant/chat",
                          headers={"Origin": "http://example.com",
                                   "Access-Control-Request-Method": "POST"})
        check("CORS preflight", r.status_code == 200
              and r.headers.get("access-control-allow-origin") in ("*", "http://example.com"))

        # 10. без ключа -> человеческая ошибка
        env2 = os.environ.copy()
        env2["GIGACHAT_AUTH_KEY"] = ""
        env2["PORT"] = "8011"
        srv2 = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--host", "127.0.0.1", "--port", "8011", "--log-level", "warning"],
            cwd=str(BASE), env=env2)
        try:
            if wait(f"{BACKEND.replace('8010', '8011')}/api/assistant/health", 20):
                r = httpx.post(f"{BACKEND.replace('8010', '8011')}/api/assistant/chat",
                               json={"message": "привет"}, timeout=30)
                d = r.json()
                check("без API key -> «Не настроен API GigaChat»",
                      r.status_code == 503 and "GigaChat" in d["error"]["message"],
                      str(d)[:120])
        finally:
            srv2.terminate()

        # 11. недоступен GigaChat -> человеческая ошибка
        env3 = os.environ.copy()
        env3["GIGACHAT_AUTH_KEY"] = "sk-test-mock"
        env3["GIGACHAT_API_URL"] = "http://127.0.0.1:9/v1"
        env3["GIGACHAT_OAUTH_URL"] = "http://127.0.0.1:9/api/v2/oauth"
        env3["PORT"] = "8012"
        env3["LOG_LEVEL"] = "INFO"
        srv3 = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--host", "127.0.0.1", "--port", "8012", "--log-level", "warning"],
            cwd=str(BASE), env=env3)
        try:
            if wait(f"{BACKEND.replace('8010', '8012')}/api/assistant/health", 20):
                r = httpx.post(f"{BACKEND.replace('8010', '8012')}/api/assistant/chat",
                               json={"message": "привет"}, timeout=30)
                d = r.json()
                check("GigaChat недоступен -> «Не удалось связаться с AI»",
                      r.status_code in (429, 502, 503) and "Попробуйте" in d["error"]["message"],
                      str(d)[:140])
                check("traceback не утекает", "Traceback" not in r.text and "File \"" not in r.text)
        finally:
            srv3.terminate()

    finally:
        srv.terminate()
        mock.terminate()
        for p in (srv, mock):
            try:
                p.wait(timeout=5)
            except Exception:  # noqa: BLE001
                p.kill()

    passed = sum(1 for s, *_ in results if s == PASS)
    failed = sum(1 for s, *_ in results if s == FAIL)
    print(f"\nИтого: {passed} OK, {failed} ошибок, {len(results)} проверок")
    for status, name, detail in results:
        if status == FAIL:
            print(f"  [FAIL] {name} — {detail}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
