"""Инструменты AI для BankFake: описание функций + их реализация.

Только ЧТЕНИЕ данных. Денежные операции ассистент выполнять не может.
Данные приходят с frontend в санитизированном виде и привязаны к текущему
пользователю запросом — сервер не хранит и не запрашивает данные других
пользователей.
"""
from __future__ import annotations

import json
import time
from typing import Any, Callable

# Максимум символов, которые одна функция может вернуть модели
MAX_RESULT_CHARS = 6000

# Повторяет categorizeHistoryItem() из bank.js
PAYMENT_KEYWORDS = (
    "bf-pay", "жкх", "мобильн", "интернет", "домофон", "образование",
    "кино", "путешеств", "госуслуг", "штраф", "благотвор", "кредит",
    "подписка", "вклад", "копилка", "покупка", "продажа",
)


# ============================================================ санитизация
def _num(value: Any, default: float = 0.0) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _limit_value(value: Any) -> Any:
    """Лимиты BankFake: -1/-2/null = безлимит."""
    if value in (None, -1, -2):
        return "безлимит"
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "безлимит"
    return "безлимит" if v < 0 else v


def _list_of(raw: Any, limit: int = 50) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    return [x for x in raw[:limit] if isinstance(x, dict)]


def sanitize_profile(raw: Any) -> dict[str, Any]:
    """Очищает снимок данных от CVV, base64-картинок и прочего лишнего."""
    if not isinstance(raw, dict):
        raw = {}
    profile = raw.get("profile") if isinstance(raw.get("profile"), dict) else {}
    wallet = raw.get("wallet") if isinstance(raw.get("wallet"), dict) else {}
    salary = raw.get("salary") if isinstance(raw.get("salary"), dict) else {}

    cards = []
    for c in _list_of(raw.get("cards")):
        number = str(c.get("number", ""))
        cards.append({
            "id": c.get("id"),
            "type": c.get("type") or "Карта",
            "number": number[-4:] if len(number) >= 4 else number,
            "balance": _num(c.get("balance")),
            "holder": c.get("holder"),
            "expiry": c.get("expiry"),
            "blocked": bool(c.get("blocked")),
            "theme": c.get("theme"),
            "is_gold": bool(c.get("is_gold")),
        })

    history = []
    for h in _list_of(raw.get("history"), 500):
        item = {
            "type": h.get("type"),
            "title": str(h.get("title", ""))[:120],
            "amount": _num(h.get("amount")),
            "time": str(h.get("time", ""))[:20],
        }
        ts = h.get("ts")
        if isinstance(ts, (int, float)) and ts > 0:
            item["ts"] = int(ts)
        history.append(item)

    return {
        "captured_at": int(time.time()),
        "profile": {
            "name": str(profile.get("name", ""))[:60],
            "user_id": str(profile.get("user_id", ""))[:32],
            "has_pro": bool(profile.get("has_pro")),
            "has_subscription": bool(profile.get("has_subscription")),
            "dark_theme": bool(profile.get("dark_theme")),
        },
        "wallet": {
            "balance": _num(wallet.get("balance")),
            "points": _num(wallet.get("points")),
            "topup_limit": _limit_value(wallet.get("topup_limit")),
            "salary_limit": _limit_value(wallet.get("salary_limit")),
        },
        "salary": {
            "amount": _num(salary.get("amount")),
            "interval_sec": _num(salary.get("interval_sec"), 60) or 60,
            "next_sec": _num(salary.get("next_sec")),
            "card_id": salary.get("card_id") or "balance",
        },
        "cards": cards,
        "history": history,
        "contacts": [{"name": c.get("name"), "phone": c.get("phone")}
                     for c in _list_of(raw.get("contacts"))],
        "notifications": [{"text": str(n.get("text", ""))[:160], "time": n.get("time")}
                          for n in _list_of(raw.get("notifications"), 10)],
        "deposits": _list_of(raw.get("deposits")),
        "piggy_banks": _list_of(raw.get("piggy_banks")),
        "credits": _list_of(raw.get("credits")),
        "stocks": _list_of(raw.get("stocks")),
        "portfolio": raw.get("portfolio") if isinstance(raw.get("portfolio"), dict) else {},
    }


# ============================================================ хелперы
def _j(obj: Any) -> dict:
    """Результат функции для модели: JSON-совместимый объект."""
    def default(o: Any) -> Any:
        if o is float("inf"):
            return "безлимит"
        return str(o)
    text = json.dumps(obj, ensure_ascii=False, default=default)
    if len(text) > MAX_RESULT_CHARS:
        return {"обрезано": True, "данные": text[:MAX_RESULT_CHARS]}
    return obj if isinstance(obj, dict) else {"данные": obj}


def _f(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _history(snap: dict[str, Any]) -> list[dict[str, Any]]:
    items = snap.get("history")
    return [h for h in items if isinstance(h, dict)] if isinstance(items, list) else []


def _cards(snap: dict[str, Any]) -> list[dict[str, Any]]:
    items = snap.get("cards")
    return [c for c in items if isinstance(c, dict)] if isinstance(items, list) else []


def _category(item: dict[str, Any]) -> str:
    title = str(item.get("title", "")).lower()
    if item.get("type") == "income":
        return "income"
    if "перевод" in title:
        return "transfer"
    if any(k in title for k in PAYMENT_KEYWORDS):
        return "payment"
    return "other"


def _mask_card(card: dict[str, Any]) -> dict[str, Any]:
    return {
        "тип": card.get("type", "Карта"),
        "последние_4_цифры": card.get("number"),
        "баланс_₽": _f(card.get("balance")),
        "владелец": card.get("holder"),
        "срок": card.get("expiry"),
        "заблокирована": bool(card.get("blocked")),
        "золотая": bool(card.get("is_gold")),
    }


def _date(ts: Any) -> str:
    try:
        return time.strftime("%d.%m.%Y", time.localtime(int(ts)))
    except (TypeError, ValueError, OSError):
        return "дата неизвестна"


def _bounds(period: str) -> tuple[int, str]:
    now = int(time.time())
    lt = time.localtime(now)
    if period == "today":
        return int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1))), "сегодня"
    if period == "week":
        return now - 7 * 86400, "за последние 7 дней"
    if period == "month":
        return int(time.mktime((lt.tm_year, lt.tm_mon, 1, 0, 0, 0, 0, 0, -1))), "за текущий календарный месяц"
    if period == "year":
        return int(time.mktime((lt.tm_year, 1, 1, 0, 0, 0, 0, 0, -1))), "за текущий год"
    return 0, "за всё время"


# ============================================================ функции AI
def get_profile(args: dict, snap: dict) -> dict:
    p, w, s = snap.get("profile") or {}, snap.get("wallet") or {}, snap.get("salary") or {}
    return _j({
        "имя": p.get("name"),
        "id_пользователя": p.get("user_id"),
        "bankfake_pro": bool(p.get("has_pro")),
        "подписка_bankfake_plus": bool(p.get("has_subscription")),
        "баланс_кошелька_₽": _f(w.get("balance")),
        "баллы": _f(w.get("points")),
        "зарплата_₽": _f(s.get("amount")),
        "карток": len(_cards(snap)),
        "операций": len(_history(snap)),
    })


def get_account_info(args: dict, snap: dict) -> dict:
    p, w, s = snap.get("profile") or {}, snap.get("wallet") or {}, snap.get("salary") or {}

    def lst(key: str, fields: tuple[str, ...]) -> list[dict]:
        out = []
        for item in _list_of(snap.get(key))[:10]:
            out.append({f: item.get(f) for f in fields if f in item})
        return out

    stocks = [{"symbol": x.get("symbol"), "название": x.get("name"), "цена": x.get("price"),
               "изменение_%": x.get("change")} for x in _list_of(snap.get("stocks"))[:10]]
    notes = [{"текст": n.get("text"), "время": n.get("time")} for n in _list_of(snap.get("notifications"), 5)]

    return _j({
        "профиль": {"имя": p.get("name"), "id": p.get("user_id"), "pro": bool(p.get("has_pro")),
                    "подписка": bool(p.get("has_subscription")), "тёмная_тема": bool(p.get("dark_theme"))},
        "кошелёк": {"баланс_₽": _f(w.get("balance")), "баллы": _f(w.get("points")),
                    "лимит_пополнения": w.get("topup_limit"), "лимит_зарплаты": w.get("salary_limit")},
        "зарплата": {"сумма_₽": _f(s.get("amount")), "интервал_сек": s.get("interval_sec")},
        "карты": [_mask_card(c) for c in _cards(snap)],
        "контакты": lst("contacts", ("name", "phone")),
        "вклады": lst("deposits", ("name", "amount", "rate", "current")),
        "копилки": lst("piggy_banks", ("name", "current", "goal")),
        "кредиты": lst("credits", ("amount", "term", "rate", "monthly")),
        "акции": stocks,
        "последние_уведомления": notes,
        "операций_всего": len(_history(snap)),
    })


def get_balance(args: dict, snap: dict) -> dict:
    w = snap.get("wallet") or {}
    cards = _cards(snap)
    total = _f(w.get("balance")) + sum(_f(c.get("balance")) for c in cards)
    return _j({
        "баланс_кошелька_₽": _f(w.get("balance")),
        "карты": [{"тип": c.get("type"), "баланс_₽": _f(c.get("balance"))} for c in cards],
        "общая_сумма_₽": total,
        "лимит_пополнения": w.get("topup_limit"),
        "баллы": _f(w.get("points")),
    })


def get_cards(args: dict, snap: dict) -> dict:
    cards = _cards(snap)
    if not cards:
        return {"карт_нет": True, "подсказка": "Пользователь ещё не добавил карты."}
    return _j({"количество": len(cards), "карты": [_mask_card(c) for c in cards]})


def get_transactions(args: dict, snap: dict) -> dict:
    limit = max(1, min(int(_f(args.get("limit")) or 10), 50))
    kind = str(args.get("type") or "all").lower()
    query = str(args.get("query") or "").strip().lower()

    items = _history(snap)
    if kind in ("income", "expense"):
        items = [h for h in items if str(h.get("type")) == kind]
    if query:
        items = [h for h in items if query in str(h.get("title", "")).lower()]

    recent = [{
        "название": h.get("title"),
        "тип": h.get("type"),
        "сумма_₽": _f(h.get("amount")),
        "время": h.get("time"),
        "дата": _date(h.get("ts")) if h.get("ts") else "дата неизвестна",
    } for h in items[:limit]]

    return _j({"всего_найдено": len(items), "показано": len(recent),
               "операции_новые_сверху": recent})


def _title_category(h: dict[str, Any]) -> str:
    title = str(h.get("title", "")).split(":")[0].split("(")[0].strip()
    return (title or "другое")[:40]


def get_transaction_statistics(args: dict, snap: dict) -> dict:
    period = str(args.get("period") or "all").lower()
    aliases = {"неделя": "week", "месяц": "month", "сегодня": "today", "год": "year",
               "день": "today", "вчера": "today"}
    period = aliases.get(period, period)
    if period not in ("today", "week", "month", "year", "all"):
        period = "all"

    bound, label = _bounds(period)
    items = _history(snap)
    undated = [h for h in items if not h.get("ts")]
    dated = [h for h in items if h.get("ts")]
    selected = items if period == "all" else [h for h in dated if int(h["ts"]) >= bound]

    income = sum(_f(h.get("amount")) for h in selected if h.get("type") == "income")
    expense = sum(_f(h.get("amount")) for h in selected if h.get("type") == "expense")
    transfers = sum(_f(h.get("amount")) for h in selected
                    if h.get("type") == "expense" and _category(h) == "transfer")
    payments = sum(_f(h.get("amount")) for h in selected
                   if h.get("type") == "expense" and _category(h) == "payment")

    cats: dict[str, dict[str, float]] = {}
    for h in selected:
        if h.get("type") == "income":
            continue
        cat = _category(h)
        name = ("переводы" if cat == "transfer" else "платежи") if cat in ("transfer", "payment") \
            else _title_category(h)
        b = cats.setdefault(name, {"сумма_₽": 0.0, "операций": 0})
        b["сумма_₽"] += _f(h.get("amount"))
        b["операций"] += 1
    top = sorted(cats.items(), key=lambda kv: kv[1]["сумма_₽"], reverse=True)[:8]

    result = {
        "период": label,
        "доходы_₽": income,
        "расходы_₽": expense,
        "из_них_переводы_₽": transfers,
        "из_них_платежи_₽": payments,
        "операций_в_периоде": len(selected),
        "по_категориям": {k: {"сумма_₽": round(v["сумма_₽"], 2), "операций": v["операций"]}
                          for k, v in top},
    }
    if period != "all" and undated:
        result["важно"] = (f"{len(undated)} старых операций без даты не попали в выборку периода "
                           "(даты появляются только у новых операций). Посмотрите статистику за всё время.")
    return _j(result)


def get_payments(args: dict, snap: dict) -> dict:
    limit = max(1, min(int(_f(args.get("limit")) or 10), 30))
    items = [h for h in _history(snap) if _category(h) == "payment"]
    recent = [{
        "название": h.get("title"),
        "сумма_₽": _f(h.get("amount")),
        "тип": h.get("type"),
        "время": h.get("time"),
        "дата": _date(h.get("ts")) if h.get("ts") else "дата неизвестна",
    } for h in items[:limit]]
    return _j({
        "всего_платежей": len(items),
        "расходы_на_платежи_₽": sum(_f(h.get("amount")) for h in items if h.get("type") == "expense"),
        "последние_платежи": recent,
        "разделы_оплаты": ["BF-Pay", "Мобильная связь", "ЖКХ", "Интернет и ТВ", "Домофон",
                           "Образование", "Кино и игры", "Путешествия", "Госуслуги", "Штрафы",
                           "Благотворительность", "Перевод за границу", "Мои реквизиты",
                           "Перевод между картами"],
    })


def get_points(args: dict, snap: dict) -> dict:
    w = snap.get("wallet") or {}
    return _j({
        "баллы": _f(w.get("points")),
        "начисление": {"переводы": "5%", "bf-pay": "5%", "за_границу": "5%",
                       "жкх_и_услуги": "3%", "мобильная_связь": "3%", "пополнение_карты": "1%"},
        "во_что_меняются": ["BankFake Pro — 1000", "Лимит пополнения — 300/900/2500",
                            "Лимит зарплаты — 400/1200/3000", "Золотой дизайн — 500",
                            "+1000 ₽ — 100, +5000 ₽ — 450", "×2 зарплата — 300, Зарплата сейчас — 150"],
    })


def get_salary(args: dict, snap: dict) -> dict:
    s, w = snap.get("salary") or {}, snap.get("wallet") or {}
    interval = max(1, int(_f(s.get("interval_sec")) or 60))
    amount = _f(s.get("amount"))
    cap = w.get("salary_limit")
    cap_val = _f(cap) if isinstance(cap, (int, float)) else None

    month_start, month_label = _bounds("month")
    salaries = [h for h in _history(snap)
                if h.get("type") == "income" and str(h.get("title", "")).lower() == "зарплата"]
    month_items = [h for h in salaries if h.get("ts") and int(h["ts"]) >= month_start]

    return _j({
        "сумма_зарплаты_₽": amount,
        "интервал_сек": interval,
        "до_следующего_начисления_сек": int(_f(s.get("next_sec"))),
        "карта_зачисления": s.get("card_id") or "основной_баланс",
        "лимит_зарплаты": cap if cap is not None else "безлимит",
        "начислений_за_месяц": len(month_items),
        "получено_за_текущий_месяц_₽": sum(_f(h.get("amount")) for h in month_items),
        "всего_получено_зарплат_₽": sum(_f(h.get("amount")) for h in salaries),
        "оценка_за_30_дней_₽": round(amount * (86400 / interval) * 30, 2),
        "примечание": (f"Интервал игровой ({interval} сек), а не календарный месяц. "
                       + (f"Лимит {cap_val:,.0f} ₽.".replace(",", " ") if cap_val else "")
                       + f" Период: {month_label}."),
    })


def get_subscriptions(args: dict, snap: dict) -> dict:
    p, w = snap.get("profile") or {}, snap.get("wallet") or {}
    return _j({
        "bankfake_pro_активен": bool(p.get("has_pro")),
        "bankfake_plus_подписка_активна": bool(p.get("has_subscription")),
        "bankfake_pro": {"цена_баллов": 1000, "что_даёт": "0% комиссия, безлимитная зарплата и пополнения, значок PRO"},
        "bankfake_plus": {"цена": "299 ₽/мес", "что_это": "платная подписка в настройках приложения"},
        "баллы_для_покупки": _f(w.get("points")),
    })


# --- справка по BankFake ---------------------------------------------------
HELP_KB: list[dict[str, str]] = [
    {"topic": "Общее о приложении",
     "text": "BankFake (BankFake Pro v2.1) — фейковый игровой симулятор банковского приложения, НЕ настоящий банк. "
             "Все карты, счета, деньги и операции виртуальные, реальных счетов нет. Данные хранятся в localStorage "
             "браузера. Вкладки: Главная, Карты, Ассистент, История, Платежи, Профиль, Магазин."},
    {"topic": "Владелец и разработчик",
     "text": "Владелец и разработчик приложения BankFake — XPRODC. Все вопросы про авторство, владельца, "
             "разработчика или кем сделано приложение — ответ: XPRODC."},
    {"topic": "Баланс и кошелёк",
     "text": "Общий баланс — на вкладке «Главная» (блок «Баланс»). У каждой карты свой баланс. "
             "Лимит пополнения по умолчанию 10 000 ₽, поднимается в Магазине за баллы."},
    {"topic": "Карты",
     "text": "Карты создаются на вкладке «Карты» (Visa, MasterCard, PayPal): номер, CVV, владелец, срок, "
             "баланс, 6 тем + золотая + своя картинка, блокировка, удаление, вращение в 3D."},
    {"topic": "История операций",
     "text": "Вкладка «История»: поиск, фильтры (Всё/Пополнения/Расходы/Переводы/Платежи), "
             "диаграмма расходов по категориям, чек по клику. На главной — 3 последние операции."},
    {"topic": "Зарплата",
     "text": "Зарплата начисляется по таймеру: по умолчанию 1 000 ₽ каждые 60 секунд (сумма и интервал "
             "меняются в Настройках, минимум 60 сек). Лимит зарплаты 5 000 ₽, поднимает Магазин. "
             "Куда идёт зарплата — настройка «Карта для зарплаты»."},
    {"topic": "Баллы",
     "text": "Баллы начисляются процентом с операций (переводы 5%, BF-Pay 5%, платежи 3%, пополнение 1%) "
             "и тратятся в Магазине: Pro, лимиты, золотой дизайн, обмен на деньги, ×2 зарплата."},
    {"topic": "BankFake Pro и подписка",
     "text": "BankFake Pro — 1000 баллов: 0% комиссия, безлимитная зарплата и пополнения, значок PRO. "
             "BankFake+ — подписка 299 ₽/мес (Настройки)."},
    {"topic": "Переводы",
     "text": "Переводы: контактам (вкладка «Платежи»), между своими картами, за границу (+5% баллов), "
             "получение по «Моим реквизитам». Комиссия 1% без Pro, с суммы начисляются баллы."},
    {"topic": "Платежи и сервисы",
     "text": "Платежи: BF-Pay, Мобильная связь, ЖКХ, Интернет и ТВ, Домофон, Образование, Кино и игры, "
             "Путешествия, Госуслуги, Штрафы, Благотворительность, перевод между картами."},
    {"topic": "Вклады, копилки, акции",
     "text": "«Вклады и копилки»: вклады (Быстрый 2% / Стандарт 5% / Максимум 9%), копилки (цель, пополнение/снятие), "
             "акции (TRCH, GAZF, NEFT, MEDC, CRYP) с псевдо-котировками и портфелем."},
    {"topic": "Кредит и ипотека",
     "text": "Кредит: до 1 000 000 ₽, ставки 4.9%-16.9% (6-60 мес). Ипотека: до 10 000 000 ₽, от 6%, до 30 лет. "
             "Показываются платёж и переплата."},
    {"topic": "Настройки и темы",
     "text": "Профиль → Настройки: имя, аватар, тёмная тема, уведомления, push, вибро, зарплата, карты, "
             "обучение, соглашение. Тёмная тема — галочка «Тёмная тема»."},
    {"topic": "Соглашение и правила",
     "text": "Соглашение и правила находится в настройках: вкладка «Профиль» → раздел «Настройки» → строка "
             "«Соглашение и правила». Там же документы и правила открываются повторно."},
    {"topic": "BF-Pay",
     "text": "BF-Pay — быстрая оплата: сумма, категория, карта, кэшбэк баллами, экран «Приложите карту», чек. "
             "Быстрые суммы 100/500/1000/5000."},
    {"topic": "Ассистент",
     "text": "BF Assistant («Ассистент») — встроенный AI на GigaChat. Понимает реальные данные: баланс, карты, "
             "историю, статистику, баллы, зарплату, платежи, аккаунт. Считает сам: арифметику и прогнозы "
             "(«сколько будет баланс через месяц»). Быстрые кнопки: Мой баланс, Последние операции, "
             "Мои карты, Мои баллы, Зарплата, Прогноз. Ассистент только читает данные — переводы и "
             "платежи он не выполняет. Кнопка «Очистить чат» начинает диалог заново."},
    {"topic": "Приватность",
     "text": "Данные BankFake хранятся только в localStorage браузера. Для ответов ассистента браузер отправляет "
             "на backend обезличенный снимок (без CVV и картинок). Паролей и реальных денег в приложении нет."},
]


def search_bankfake_help(args: dict, snap: dict) -> dict:
    query = str(args.get("query") or "")
    q = query.strip().lower()
    words = [w for w in q.replace("?", " ").replace(",", " ").split() if len(w) > 1]
    scored = []
    for entry in HELP_KB:
        hay = (entry["topic"] + " " + entry["text"]).lower()
        score = sum(hay.count(w) for w in words)
        if score:
            scored.append((score, entry))
    scored.sort(key=lambda x: x[0], reverse=True)
    found = [e for _, e in scored[:4]]
    if not found:
        found = HELP_KB[:3]
    return _j({"запрос": query, "результаты": found})


# ============================================================ схемы функций
def _fn(name: str, description: str, properties: dict | None = None,
        required: list[str] | None = None) -> dict:
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties or {},
            "required": required or [],
        },
    }


FUNCTIONS: list[dict] = [
    _fn("get_profile", "Профиль пользователя BankFake: имя, id, Pro/подписка, баланс, баллы, зарплата, счётчики."),
    _fn("get_account_info",
        "Полная сводка по аккаунту: профиль, кошелёк, карты, контакты, вклады, копилки, кредиты, акции, уведомления."),
    _fn("get_balance", "Текущий баланс кошелька и балансы всех карт, общий итог, лимит пополнения, баллы."),
    _fn("get_cards", "Список карт: тип, последние 4 цифры, баланс, владелец, срок, блокировка."),
    _fn("get_transactions", "Последние операции из истории (новые первыми) с фильтрами.",
        properties={
            "limit": {"type": "integer", "description": "Сколько операций вернуть, 1-50, по умолчанию 10"},
            "type": {"type": "string", "enum": ["all", "income", "expense"],
                     "description": "all — все, income — поступления, expense — расходы"},
            "query": {"type": "string", "description": "Поиск по названию, например 'ЖКХ' или 'Зарплата'"},
        }),
    _fn("get_transaction_statistics", "Статистика операций за период: доходы, расходы, категории. "
        "Вызывать на вопросы про траты/доходы за день, неделю, месяц, год.",
        properties={
            "period": {"type": "string", "enum": ["today", "week", "month", "year", "all"],
                       "description": "today — сегодня, week — 7 дней, month — текущий месяц, "
                                      "year — текущий год, all — всё время"},
        }),
    _fn("get_payments", "Платежи: разделы оплаты и список платёжных операций пользователя.",
        properties={"limit": {"type": "integer", "description": "Сколько последних платежей, 1-30"}}),
    _fn("get_points", "Баланс баллов и правила их начисления/траты в BankFake."),
    _fn("get_salary", "Зарплата: сумма, интервал, остаток до начисления, сколько получено за месяц, лимит."),
    _fn("get_subscriptions", "Статус подписок BankFake Pro и BankFake+, их цена и преимущества."),
    _fn("search_bankfake_help", "Поиск по документации BankFake: функции, лимиты, настройки, магазин, темы.",
        properties={"query": {"type": "string", "description": "Что ищем, например 'как поднять лимит'"}},
        required=["query"]),
]

HANDLERS: dict[str, Callable[[dict, dict], dict]] = {
    "get_profile": get_profile,
    "get_account_info": get_account_info,
    "get_balance": get_balance,
    "get_cards": get_cards,
    "get_transactions": get_transactions,
    "get_transaction_statistics": get_transaction_statistics,
    "get_payments": get_payments,
    "get_points": get_points,
    "get_salary": get_salary,
    "get_subscriptions": get_subscriptions,
    "search_bankfake_help": search_bankfake_help,
}


def execute_function(name: str, arguments: dict, snapshot: dict) -> dict:
    """Выполняет функцию по имени. Никогда не бросает исключение наружу."""
    handler = HANDLERS.get(name)
    if not handler:
        return {"ошибка": f"Неизвестная функция: {name}"}
    try:
        return handler(arguments or {}, snapshot or {})
    except Exception as exc:  # noqa: BLE001
        return {"ошибка": "Не удалось получить данные", "детали": type(exc).__name__}


# ============================================================ текстовый вывод
def _scalar(v: Any) -> str:
    if isinstance(v, bool):
        return "да" if v else "нет"
    if v is None:
        return "нет данных"
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def _inline(v: Any) -> str:
    if isinstance(v, dict):
        return ", ".join(f"{k}: {_inline(x)}" for k, x in v.items())
    if isinstance(v, list):
        return "; ".join(_inline(x) for x in v)
    return _scalar(v)


def render_result(obj: Any, indent: int = 0) -> str:
    """Результат функции -> читаемый текст для модели (без JSON и скобок).

    Модель не должна выдавать сырые данные пользователю, поэтому данные ей
    приходят уже в виде обычных строк «ключ: значение».
    """
    pad = "  " * indent
    lines: list[str] = []

    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, dict):
                if value:
                    lines.append(f"{pad}{key}:")
                    lines.append(render_result(value, indent + 1))
                else:
                    lines.append(f"{pad}{key}: пусто")
            elif isinstance(value, list):
                if not value:
                    lines.append(f"{pad}{key}: нет")
                else:
                    lines.append(f"{pad}{key} — {len(value)} шт:")
                    for i, item in enumerate(value, 1):
                        prefix = f"{pad}  {i}) "
                        if isinstance(item, dict):
                            lines.append(prefix + _inline(item))
                        else:
                            lines.append(prefix + _scalar(item))
            else:
                lines.append(f"{pad}{key}: {_scalar(value)}")
        return "\n".join(line for line in lines if line.strip())

    if isinstance(obj, list):
        for i, item in enumerate(obj, 1):
            lines.append(f"{pad}{i}) " + _inline(item))
        return "\n".join(lines)

    return f"{pad}{_scalar(obj)}"


def execute_function_text(name: str, arguments: dict, snapshot: dict) -> str:
    """Как execute_function, но результат — человекочитаемый текст."""
    return render_result(execute_function(name, arguments, snapshot))
