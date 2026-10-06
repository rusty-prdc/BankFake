"""Конфигурация BF Assistant backend (GigaChat / Сбер).

Все секреты берутся ТОЛЬКО из .env (файл исключён из git через .gitignore).
Секреты никогда не логируются и не возвращаются в ответах API.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent          # .../backend
load_dotenv(BASE_DIR / ".env")


def _s(key: str, default: str = "") -> str:
    val = os.getenv(key)
    return default if val is None else val.strip()


# --- GigaChat (Сбер) -------------------------------------------------------
# Актуальный адрес API с 17.07.2026 — https://api.giga.chat/v1
# Старый (ещё работает): https://gigachat.devices.sberbank.ru/api/v1
GIGACHAT_AUTH_KEY: str = _s("GIGACHAT_AUTH_KEY")                       # ключ авторизации, ТОЛЬКО сервер


def compose_auth_key(raw: str) -> str:
    """Приводит ключ авторизации к виду, который ждёт POST /api/v2/oauth.

    Поддерживаются три формата, встречающиеся в личном кабинете:
      1) clientId:clientSecret          -> кодируется в base64;
      2) base64(clientId:clientSecret)  -> используется как есть;
      3) base64(clientId).hex(clientSecret) -> собирается в формат 1.
    Неизвестные форматы возвращаются без изменений.
    """
    import base64 as _b64

    key = (raw or "").strip()
    if not key:
        return ""

    # 1) готовая пара clientId:clientSecret
    if key.count(":") == 1 and all(c not in key for c in " \t\r\n"):
        left, right = key.split(":", 1)
        if len(left) >= 8 and len(right) >= 8:
            return _b64.b64encode(key.encode()).decode()

    # 2) уже закодированный ключ
    try:
        decoded = _b64.b64decode(key + "=" * (-len(key) % 4), validate=True).decode("utf-8")
        if decoded.count(":") == 1:
            return key
    except Exception:  # noqa: BLE001
        pass

    # 3) base64(clientId).hex-секрет
    if "." in key:
        p1, p2 = key.split(".", 1)
        if len(p2) in (32, 36):
            try:
                cid = _b64.b64decode(p1 + "=" * (-len(p1) % 4)).decode("utf-8").strip()
            except Exception:  # noqa: BLE001
                cid = ""
            if cid and "-" in cid:
                secret = p2 if len(p2) == 36 else (
                    f"{p2[0:8]}-{p2[8:12]}-{p2[12:16]}-{p2[16:20]}-{p2[20:32]}")
                return _b64.b64encode(f"{cid}:{secret}".encode()).decode()
    return key
GIGACHAT_MODEL: str = _s("GIGACHAT_MODEL", "GigaChat") or "GigaChat"
GIGACHAT_API_URL: str = (_s("GIGACHAT_API_URL", "https://api.giga.chat/v1")
                         or "https://api.giga.chat/v1").rstrip("/")
GIGACHAT_OAUTH_URL: str = (_s("GIGACHAT_OAUTH_URL", "https://ngw.devices.sberbank.ru:9443/api/v2/oauth")
                           or "https://ngw.devices.sberbank.ru:9443/api/v2/oauth")
GIGACHAT_SCOPE: str = _s("GIGACHAT_SCOPE", "GIGACHAT_API_PERS") or "GIGACHAT_API_PERS"
# Значок для заголовка Authorization при запросе токена (Basic = актуальная документация)
GIGACHAT_AUTH_SCHEME: str = _s("GIGACHAT_AUTH_SCHEME", "Basic") or "Basic"
# Ключ, приведённый к формату base64(clientId:clientSecret)
GIGACHAT_AUTH_HEADER: str = compose_auth_key(GIGACHAT_AUTH_KEY)

# --- TLS: корневые сертификаты НУЦ Минцифры -------------------------------
# GigaChat API использует цепочку сертификатов Минцифры, которой нет в
# стандартном certifi. Без этих корней запрос возвращает
# «CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain»
# (официальное требование документации developers.sber.ru/docs/ru/gigachat/certificates).
CERTS_DIR = BASE_DIR / "certs"
CA_BUNDLE_PATH = CERTS_DIR / "ca-bundle.pem"
_RU_CERTS = (
    CERTS_DIR / "russian_trusted_root_ca_pem.crt",
    CERTS_DIR / "russian_trusted_sub_ca_pem.crt",
)


def _build_ca_bundle() -> "str | bool":
    """Собирает один PEM: certifi + корневые сертификаты Минцифры."""
    try:
        import certifi
        base_path = Path(certifi.where())
        base = base_path.read_bytes()
    except Exception:  # noqa: BLE001
        base_path, base = None, b""

    ru = [p for p in _RU_CERTS if p.exists()]
    if not ru:
        return str(base_path) if base_path else True

    merged = base + b"\n" + b"\n".join(p.read_bytes() for p in ru)
    try:
        if not CA_BUNDLE_PATH.exists() or CA_BUNDLE_PATH.read_bytes() != merged:
            CERTS_DIR.mkdir(parents=True, exist_ok=True)
            CA_BUNDLE_PATH.write_bytes(merged)
        return str(CA_BUNDLE_PATH)
    except Exception:  # noqa: BLE001 — каталог может быть только на чтение
        return str(base_path) if base_path else True


VERIFY_SSL: "str | bool" = _build_ca_bundle()

# --- Сервер ---------------------------------------------------------------
HOST: str = _s("HOST", "0.0.0.0") or "0.0.0.0"
PORT: int = int(_s("PORT", "8000") or "8000")
LOG_LEVEL: str = _s("LOG_LEVEL", "INFO").upper() or "INFO"

# --- Лимиты ---------------------------------------------------------------
RATE_LIMIT_PER_MINUTE = int(_s("RATE_LIMIT_PER_MINUTE", "20") or "20")
MAX_MESSAGE_LENGTH = 4000
MAX_PROFILE_BYTES = 2_000_000        # ~2 МБ на снимок данных BankFake
MAX_HISTORY_MESSAGES = 16            # реплик диалога, уходящих в модель
MAX_FUNCTION_ROUNDS = 6              # защита от бесконечного цикла функций
REQUEST_TIMEOUT = 60                 # сек, таймаут запроса к GigaChat
# Дневной кап токенов на ВЕСЬ проект (все устройства). 0 — кап выключен.
DAILY_TOKEN_CAP = int(_s("DAILY_TOKEN_CAP", "60000") or "60000")

# --- Сообщения об ошибках (их видит пользователь) --------------------------
MSG_NO_KEY = "AI временно недоступен. Не настроен API GigaChat."
MSG_BAD_KEY = "AI временно недоступен. Ключ GigaChat не принят сервером — проверьте GIGACHAT_AUTH_KEY."
MSG_UNAVAILABLE = "Не удалось связаться с AI. Попробуйте ещё раз."
MSG_RATE_LIMIT = "Слишком много запросов. Подождите минуту и попробуйте снова."
MSG_TOKEN_CAP = f"Дневной лимит AI исчерпан ({DAILY_TOKEN_CAP} токенов в сутки). Попробуйте завтра."
MSG_BAD_REQUEST = "Некорректный запрос. Обновите страницу ассистента."
MSG_UNAUTHORIZED = "Сессия ассистента не найдена. Откройте вкладку «Ассистент» заново."
