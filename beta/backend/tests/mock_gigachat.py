"""Мок GigaChat API для локальных тестов (без настоящего ключа).

Повторяет актуальную схему документации:
  POST /api/v2/oauth            -> {access_token, expires_at, token_type}
  POST /v1/chat/completions     -> choices[0].message.{content|function_call}

Запуск:  python tests/mock_gigachat.py   (порт 9001)
Эмулирует реальный цикл: сначала вызов функции, затем финальный ответ.
"""
from __future__ import annotations

import json
import re
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

app = FastAPI()


def _kv(text: str) -> dict[str, str]:
    """Разбирает текстовый результат функции («ключ: значение») в словарь."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        if key and not key[0].isdigit():
            out[key] = value.strip()
    return out


def _rows(text: str) -> list[str]:
    """Строки-элементы списков: «1) …, …»."""
    return [ln.strip() for ln in text.splitlines() if ln.strip()[:1].isdigit() and ")" in ln.strip()[:4]]


def _money(value) -> str:
    """2500 -> «2 500», 24500.5 -> «24 500.5»."""
    try:
        f = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return str(value)
    whole = f"{int(abs(f)):,}".replace(",", " ")
    sign = "-" if f < 0 else ""
    if f == int(f):
        return f"{sign}{whole}"
    frac = f"{abs(f) - int(abs(f)):.2f}".rstrip("0").rstrip(".")[1:]
    return f"{sign}{whole}{frac}"


def _pairs(row: str) -> dict[str, str]:
    body = row.split(")", 1)[-1]
    out: dict[str, str] = {}
    for part in body.split(","):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def _fnum(value, default: float = 0.0) -> float:
    """«24 500.5», «24500,5», 24500 -> 24500.0"""
    try:
        return float(str(value).replace("\u00a0", "").replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        return default


# ============================================================ арифметика
_SAFE_EXPR = re.compile(r"^[\d\s.,+\-*/()]+$")


def _try_math(text: str) -> str | None:
    """«сколько будет 24500 + 100000» -> считает сам, как GigaChat."""
    t = (text or "").lower()
    if not any(w in t for w in ("сколько будет", "посчитай", "сколько равно", "вычисли", "=")):
        return None
    m = re.search(r"(\d[\d\s.,]*(?:[.,]\d+)?)\s*([+\-*/])\s*(\d[\d\s.,]*(?:[.,]\d+)?)", t)
    if not m:
        return None
    expr = f"{m.group(1)} {m.group(2)} {m.group(3)}".replace(",", ".")
    expr = re.sub(r"(?<=\d)\s(?=\d{3}\b)", "", expr)
    if not _SAFE_EXPR.match(expr):
        return None
    try:
        val = eval(expr, {"__builtins__": {}}, {})  # noqa: S307 — выражение уже проверено регуляркой
    except Exception:  # noqa: BLE001
        return None
    if isinstance(val, float) and val == int(val):
        val = int(val)
    return f"Не вопрос 👍 Получается {_money(str(val))}."


def _extract_amount(text: str) -> float | None:
    """«100к», «100 к», «100 тыс», «100 000», «100000 рублей» -> 100000."""
    t = (text or "").lower().replace("\u00a0", " ")
    m = re.search(r"(\d[\d\s]*\d|\d)\s*(к\b|k\b|тыс|тысяч)", t)
    if m:
        raw = re.sub(r"[^\d]", "", m.group(1))
        if raw:
            return float(raw) * 1000
    m = re.search(r"(\d[\d\s]*\d|\d)\s*(?:руб|₽|rub)", t)
    if m:
        raw = re.sub(r"[^\d]", "", m.group(1))
        if raw:
            return float(raw)
    return None


def _extract_months(text: str) -> int | None:
    t = (text or "").lower()
    m = re.search(r"через\s+(\d+)\s*(месяц|месяца|месяцев|недел|день|дн|год)", t)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit.startswith("недел"):
            return max(1, round(n * 7 / 30)) or 1
        if unit.startswith("д"):
            return 1 if n <= 31 else max(1, round(n / 30))
        if unit.startswith("год"):
            return n * 12
        return n
    if re.search(r"через\s+(один\s+)?месяц", t) or "через месяц" in t:
        return 1
    return None


def _is_hypothetical(text: str) -> bool:
    """Вопрос-гипотетика: «если будет зарплата 100к», «баланс через месяц»."""
    t = (text or "").lower()
    if re.search(r"через\s+\d*\s*(месяц|недел|день|год)", t):
        return True
    if "если" in t and any(w in t for w in ("зарплат", "баланс", "станет", "будет", "прибав", "добав")):
        return True
    return any(w in t for w in ("сколько станет", "сколько будет баланс", "прогноз", "предскажи"))


def _human(name: str, text: str) -> str:
    """Собирает ответ по-человечески из данных функции (без JSON)."""
    kv = _kv(text)
    rows = _rows(text)
    g = lambda k, d="—": kv.get(k, d)  # noqa: E731

    if name == "get_balance":
        return (f"На вашем аккаунте {_money(g('общая_сумма_₽', 0))} ₽: "
                f"{_money(g('баланс_кошелька_₽', 0))} ₽ в кошельке, остальное — на ваших картах. "
                f"Бонусных баллов: {_money(g('баллы', 0))}.")

    if name == "get_cards":
        if not rows:
            return "У вас пока нет карт. Добавьте первую во вкладке «Карты»."
        lines = [f"У вас карт: {g('количество', str(len(rows)))}."]
        for row in rows:
            p = _pairs(row)
            num = p.get("последние_4_цифры", "")
            state = "заблокирована" if p.get("заблокирована") == "да" else "активна"
            gold = ", золотая" if p.get("золотая") == "да" else ""
            lines.append(f"• {p.get('тип', 'Карта')} ••{num} — {_money(p.get('баланс_₽', 0))} ₽, "
                         f"срок {p.get('срок', '—')}, владелец {p.get('владелец', '—')} "
                         f"({state}{gold}).")
        return "\n".join(lines)

    if name == "get_profile":
        return (f"Ваш профиль: {g('имя', 'игрок')}, id {g('id_пользователя')}. "
                f"На аккаунте {_money(g('баланс_кошелька_₽', 0))} ₽ и {_money(g('баллы', 0))} баллов, "
                f"карт: {g('карток', '0')}, операций: {g('операций', '0')}. "
                f"BankFake Pro: {g('bankfake_pro')}, BankFake+: {g('подписка_bankfake_plus')}.")

    if name == "get_transaction_statistics":
        period = g("период", "всё время")
        if period.startswith("за "):
            period = period[3:]
        return (f"За {period}: доходы {_money(g('доходы_₽', 0))} ₽, "
                f"расходы {_money(g('расходы_₽', 0))} ₽, "
                f"из них переводы {_money(g('из_них_переводы_₽', 0))} ₽ и платежи "
                f"{_money(g('из_них_платежи_₽', 0))} ₽. Операций: {g('операций_в_периоде', '0')}.")

    if name == "get_transactions":
        if not rows:
            return "Операций не нашлось."
        lines = [f"Всего операций найдено: {g('всего_найдено', '0')}."]
        for row in rows:
            p = _pairs(row)
            mark = "+" if p.get("тип") == "income" else "−"
            lines.append(f"• {p.get('название', 'Операция')} — {mark}{_money(p.get('сумма_₽', 0))} ₽, "
                         f"{p.get('дата', p.get('время', '—'))}.")
        return "\n".join(lines)

    if name == "get_points":
        return (f"Бонусных баллов: {_money(g('баллы', 0))}. "
                "Баллы капают за переводы и BF-Pay (5%), платежи (3%) и пополнения (1%), "
                "тратятся в Магазине: Pro, лимиты и дизайн.")

    if name == "get_salary":
        return (f"Зарплата: {_money(g('сумма_зарплаты_₽', 0))} ₽ каждые {g('интервал_сек', '60')} с, "
                f"до следующего начисления {g('до_следующего_начисления_сек', '0')} с. "
                f"За текущий месяц получено {_money(g('получено_за_текущий_месяц_₽', 0))} ₽, "
                f"всего {_money(g('всего_получено_зарплат_₽', 0))} ₽.")

    if name == "get_payments":
        lines = [f"Платежей: {g('всего_платежей', '0')}, потрачено на платежи "
                 f"{_money(g('расходы_на_платежи_₽', 0))} ₽."]
        for row in rows:
            p = _pairs(row)
            lines.append(f"• {p.get('название', 'Платёж')} — {_money(p.get('сумма_₽', 0))} ₽ "
                         f"({p.get('дата', p.get('время', '—'))}).")
        return "\n".join(lines)

    if name == "get_subscriptions":
        return (f"BankFake Pro: {'активен' if g('bankfake_pro_активен') == 'да' else 'не активен'} "
                f"(1000 баллов, даёт 0% комиссии и безлимит). "
                f"Подписка BankFake+: {'активна' if g('bankfake_plus_подписка_активна') == 'да' else 'выключена'} "
                f"(299 ₽/мес, покупается в Настройках). Ваши баллы: {g('баллы_для_покупки', '0')}.")

    if name == "search_bankfake_help":
        if not rows:
            return "Ничего не нашлось в справке BankFake."
        lines = []
        for row in rows:
            p = _pairs(row)
            topic = p.get("topic", "")
            body = row.split("text:", 1)[-1].strip() if "text:" in row else ""
            lines.append(f"• {topic}: {body}")
        return "\n".join(lines[:4])

    # общий случай — перечисляем поля текстом
    lines = [f"• {k}: {v}" for k, v in list(kv.items())[:8]]
    return "\n".join(lines) if lines else "Данных нет."


def _small_talk(text: str) -> str | None:
    """Разговорные и общие вопросы, на которые инструменты не нужны."""
    t = (text or "").strip().lower()
    if not t:
        return None
    if any(t.startswith(w) for w in ("привет", "здравств", "добрый день", "добрый вечер",
                                     "доброе утро", "хай", "ку ")):
        return ("Привет! 😊 Я BF Assistant — ассистент внутри BankFake. "
                "Расскажу про ваш баланс, карты, операции, баллы и зарплату, "
                "посчитаю прогнозы — спрашивайте!")
    if any(w in t for w in ("как дела", "как ты", "как жизнь", "что нового")):
        return ("У меня всё отлично, спасибо! 😊 Я ассистент BankFake и готов помочь "
                "с вашим аккаунтом: баланс, карты, операции, баллы, зарплата. "
                "Что интересует?")
    if any(w in t for w in ("кто ты", "что ты умеешь", "что умеешь", "представься",
                            "кто вы", "ты кто")):
        return ("Я BF Assistant — встроенный ассистент BankFake, работаю на GigaChat. "
                "Знаю данные вашего аккаунта: баланс, карты, операции, баллы, зарплату — "
                "и умею считать прогнозы. Спрашивайте что угодно!")
    if any(w in t for w in ("владелец", "разработчик", "кто сделал", "кто создал",
                            "кто сделал приложение", "автор приложения", "xprodc")):
        return ("Владелец и разработчик приложения BankFake — XPRODC. "
                "Именно ему принадлежит проект 🙌")
    if "соглашен" in t or ("правила" in t and "где" in t):
        return ("Соглашение и правила — в настройках: вкладка «Профиль» → раздел "
                "«Настройки» → строка «Соглашение и правила».")
    if any(w in t for w in ("анекдот", "шутк", "пошути")):
        return ("Банкир другому: — У меня всё под контролем! — А как насчёт курса? "
                "— Какого курса? Я ж в игровом банке 😄 В BankFake рисков нет — "
                "деньги же виртуальные!")
    if "погод" in t:
        return ("Я не метеоролог 🌤 зато в BankFake всегда хорошая погода для "
                "накоплений! Спросите про баланс, карты или зарплату — отвечу сразу.")
    if any(w in t for w in ("который час", "какое сегодня число", "какая дата",
                            "сколько времени")):
        now = time.localtime()
        return f"Сейчас {time.strftime('%H:%M, %d.%m.%Y', now)} по времени сервера ⏰"
    if (("что такое bankfake" in t or "что за bankfake" in t or "банк фейк" in t)
            and "bankfake+" not in t and " pro" not in t and "про" not in t):
        return ("BankFake — это фейковый симулятор банка: виртуальные деньги, карты и "
                "операции только для игры, реальных счетов там нет. "
                "Прогресс хранится на вашем устройстве 💾")
    return None


def _general_fallback(text: str) -> str | None:
    """Общий вопрос без ключевых слов приложения — отвечаем по-человечески."""
    t = (text or "").strip()
    if len(t) < 4:
        return None
    return ("Хороший вопрос! 😊 Правда, я заточен под BankFake: лучше спросите "
            "про ваш баланс, карты, операции, баллы или зарплату — и я сразу "
            "всё посчитаю. Могу ещё спрогнозировать баланс на месяц вперёд 📈")


def _pick_function(text: str) -> tuple[str, dict]:
    t = text.lower()
    # вопросы-гипотетики: сначала нужен текущий баланс, потом (если нужно) зарплата
    if _is_hypothetical(t):
        return "get_balance", {}
    if "карт" in t or "card" in t:
        return "get_cards", {}
    if any(w in t for w in ("бонус", "балл")):
        return "get_points", {}
    if any(w in t for w in ("зарплат", "зарплатa")):
        return "get_salary", {}
    if any(w in t for w in ("платеж", "платёж", "оплат")):
        return "get_payments", {"limit": 5}
    if any(w in t for w in ("потратил", "траты", "расход", "доход", "за месяц", "за неделю", "статист")):
        return "get_transaction_statistics", {"period": "month"}
    if any(w in t for w in ("операци", "истори", "последн")):
        return "get_transactions", {"limit": 5}
    if any(w in t for w in ("подпис", "pro", "bankfake+")):
        return "get_subscriptions", {}
    if any(w in t for w in ("деньг", "баланс", "сколько у меня")):
        return "get_balance", {}
    if any(w in t for w in ("помощ", "что такое", "как работает", "лимит")):
        return "search_bankfake_help", {"query": text[:60]}
    return "get_profile", {}


def _looks_like_app_question(text: str) -> bool:
    """Есть ли в вопросе ключевые слова BankFake (чтобы не звать инструменты на общие темы)."""
    t = (text or "").lower()
    return any(w in t for w in (
        "баланс", "деньг", "карт", "балл", "зарплат", "операци", "истори", "платеж",
        "платёж", "подпис", "pro", "bankfake", "аккаунт", "профил", "кошел", "лимит",
        "вклад", "копил", "кредит", "ипотек", "акци", "бонус", "кэшбэк", "перевод",
        "настройк", "соглашен", "правил", "помощ", "что такое", "сколько у меня",
        "потратил", "потратила", "траты", "тратил", "расход", "доход", "заработал",
        "сколько я", "последн", "статист", "у меня"))


def _hypothetical_answer(question: str, fn_msgs: list[dict]) -> str:
    """Считает прогноз сам: текущий баланс (+ гипотетическая зарплата) + темп за месяц."""
    kv: dict[str, str] = {}
    for m in fn_msgs:
        kv.update(_kv(str(m.get("content") or "")))

    current = _fnum(kv.get("общая_сумма_₽")) or _fnum(kv.get("баланс_кошелька_₽"))
    sal_amount = _fnum(kv.get("сумма_зарплаты_₽"))
    sal_interval = _fnum(kv.get("интервал_сек")) or 60.0

    hypo = _extract_amount(question)          # «100к» -> 100000
    months = _extract_months(question)        # «через 1 месяц» -> 1

    lines = [f"Сейчас у вас {_money(str(current))} ₽."]
    start = current
    if hypo:
        start = current + hypo
        lines.append(f"Сразу прибавим зарплату {_money(str(hypo))} ₽ — выходит "
                     f"{_money(str(start))} ₽ 💰")

    if months:
        # темп начисления текущей зарплаты за месяц (в BankFake — игровой таймер)
        per_month = sal_amount * (86400.0 / sal_interval) * 30 * months
        total = start + per_month
        unit = "месяц" if months == 1 else (f"{months} месяца" if months < 5 else f"{months} месяцев")
        lines.append(f"А через {unit} при вашем темпе зарплаты "
                     f"({_money(str(sal_amount))} ₽ каждые {_money(str(sal_interval))} с) "
                     f"начислится ещё около {_money(str(per_month))} ₽ — "
                     f"ориентировочно {_money(str(total))} ₽ (прогноз 📈).")
    elif hypo and sal_amount:
        lines.append(f"Это разовое прибавление. Ваша текущая зарплата — "
                     f"{_money(str(sal_amount))} ₽ каждые {_money(str(sal_interval))} с.")
    return "\n".join(lines)


@app.post("/api/v2/oauth")
async def oauth(request: Request):
    body = (await request.body()).decode("utf-8", "ignore")
    auth = request.headers.get("Authorization", "")
    if "scope=" not in body or not auth:
        return JSONResponse(status_code=400, content={"error": "bad_request"})
    return {
        "access_token": f"mock-token-{uuid.uuid4()}",
        "expires_at": str(time.time() + 1800),
        "token_type": "Bearer",
    }


@app.post("/v1/chat/completions")
async def completions(request: Request):
    data = await request.json()
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer mock-token"):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    messages = data.get("messages") or []
    model = data.get("model") or "GigaChat"
    state_id = f"state-{uuid.uuid4().hex[:8]}"

    def final(text: str) -> dict:
        return {
            "model": model,
            "choices": [{
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": text,
                            "functions_state_id": state_id},
            }],
        }

    def call_fn(name: str, args: dict) -> dict:
        return {
            "model": model,
            "choices": [{
                "finish_reason": "function_call",
                "message": {"role": "assistant", "content": "",
                            "functions_state_id": state_id,
                            "function_call": {"name": name, "arguments": args}},
            }],
        }

    user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    text = (user or {}).get("content", "") or ""
    fn_msgs = [m for m in messages if m.get("role") == "function"]

    # ── арифметика: «сколько будет 24500 + 100000» → считаешь сам ─────────
    if not fn_msgs:
        math_ans = _try_math(text)
        if math_ans:
            return final(math_ans)

    # ── финальный ответ после вызовов функций ─────────────────────────────
    if fn_msgs:
        # гипотетика: баланс уже есть -> для прогноза за месяц нужна зарплата
        if _is_hypothetical(text):
            kv_all = {}
            for m in fn_msgs:
                kv_all.update(_kv(str(m.get("content") or "")))
            need_salary = (_extract_months(text) or _extract_amount(text)) and "сумма_зарплаты_₽" not in kv_all
            if need_salary:
                return call_fn("get_salary", {})
            return final(_hypothetical_answer(text, fn_msgs))
        content = fn_msgs[-1].get("content", "")
        try:
            answer = _human(fn_msgs[-1].get("name", ""), content)
        except Exception:  # noqa: BLE001
            answer = content[:400]
        return final(answer)

    # ── разговорные и общие вопросы: инструменты не нужны ────────────────
    small = " ".join((text or "").lower().replace("!", ".").replace("?", ".").split(" . ")).strip(" .!?")
    small_talk = _small_talk(small)
    if small_talk:
        return final(small_talk)

    # общий вопрос без слов про BankFake — отвечаем сами, без инструментов
    if not _looks_like_app_question(text):
        general = _general_fallback(text)
        if general:
            return final(general)

    name, args = _pick_function(text)
    available = {f["name"] for f in (data.get("functions") or [])}
    if available and name not in available:
        name = sorted(available)[0]
        args = {}
    return call_fn(name, args)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=9001, log_level="warning")
