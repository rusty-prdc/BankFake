"""Проверка на РЕАЛЬНОМ GigaChat API (ключ берётся из backend/.env).

Запускает backend на 8020 и задаёт несколько вопросов с тестовым снимком BankFake.
Секреты в вывод не попадают.

Команда:  python tests/real_test.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

BASE = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8020"

PROFILE = {
    "profile": {"name": "Иван", "user_id": "u1", "has_pro": True,
                "has_subscription": False, "dark_theme": False},
    "wallet": {"balance": 24500.5, "points": 820, "topup_limit": 10000, "salary_limit": 5000},
    "salary": {"amount": 1000, "interval_sec": 60, "next_sec": 42, "card_id": "c1"},
    "cards": [
        {"id": "c1", "type": "Visa", "number": "4455667712343333", "balance": 10000,
         "holder": "IVAN IVANOV", "expiry": "12/30", "blocked": False},
        {"id": "c2", "type": "MasterCard", "number": "5577889900119999", "balance": 15000,
         "holder": "IVAN IVANOV", "expiry": "01/31", "blocked": False},
    ],
    "history": [
        {"type": "income", "title": "Зарплата", "amount": 1000, "time": "12:00", "ts": int(time.time())},
        {"type": "expense", "title": "ЖКХ", "amount": 1500, "time": "13:10", "ts": int(time.time())},
        {"type": "expense", "title": "Перевод Петру", "amount": 500, "time": "14:00", "ts": int(time.time())},
    ],
    "contacts": [{"name": "Пётр", "phone": "+7 999 000-00-00"}],
}

QUESTIONS = [
    "Сколько у меня денег?",
    "Какие у меня карты?",
    "Сколько я потратил за месяц?",
    "Сколько у меня бонусных баллов?",
    "Когда следующая зарплата?",
    "Что такое BankFake+?",
]


def wait(url: str, timeout: float = 30.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            httpx.get(url, timeout=2)
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.4)
    return False


def main() -> int:
    if not (BASE / ".env").exists():
        print("Нет backend/.env")
        return 1

    env = os.environ.copy()
    env["PORT"] = "8020"
    srv = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", "8020", "--log-level", "warning"],
        cwd=str(BASE), env=env)
    ok = 0
    bad = 0
    try:
        if not wait(f"{URL}/api/assistant/health"):
            print("[FAIL] backend не запустился")
            return 1

        h = httpx.get(f"{URL}/api/assistant/health").json()
        print(f"[INFO] health: configured={h.get('gigachat_configured')} "
              f"model={h.get('model')} api={h.get('api_url')}")
        if not h.get("gigachat_configured"):
            print("[FAIL] GIGACHAT_AUTH_KEY не задан")
            return 1

        for q in QUESTIONS:
            started = time.time()
            try:
                r = httpx.post(f"{URL}/api/assistant/chat",
                               json={"message": q, "profile": PROFILE, "history": []},
                               timeout=90)
                d = r.json()
            except Exception as exc:  # noqa: BLE001
                print(f"[FAIL] «{q}» -> {type(exc).__name__}: {exc}")
                bad += 1
                continue
            if d.get("ok") and d.get("message"):
                ok += 1
                print(f"[OK] ({time.time()-started:.1f}с) «{q}»\n     -> {d['message'][:400]}\n")
            else:
                bad += 1
                print(f"[FAIL] «{q}» -> {r.status_code} {str(d)[:300]}\n")

        # проверка секретов в ответах
        resp_text = httpx.get(f"{URL}/api/assistant/health").text
        secret = "MjY4MzRlMGYt"
        print(f"[{'OK' if secret not in resp_text else 'FAIL'}] ключ не утекает в /health")
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:  # noqa: BLE001
            srv.kill()

    print(f"\nИтого: {ok} ответов получено, {bad} ошибок")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
