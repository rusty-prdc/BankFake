# BF Assistant — деплой на сервер (de-bots3.h1cloud.net)

Пакет содержит:
- **6 файлов фронтенда** (`bank.html`, `bank.css`, `bank.js`, `assistant.css`, `assistant.js`, `inf.js`) —
  в них уже встроена вкладка «Ассистент» и клиент чата;
- **`backend/`** — FastAPI-приложение с AI-агентом на GigaChat (Сбер):
  `main.py`, `gigachat.py`, `tools.py`, `prompts.py`, `config.py`,
  `requirements.txt`, `.env` (с вашим ключом), `certs/` (русские корневые
  сертификаты НУЦ Минцифры — без них Sber API не проходит TLS),
  `tests/` (мок GigaChat и проверка реального API), `smoke_test.py`.

Ключ GigaChat лежит ТОЛЬКО в `backend/.env`. Файл `.env` исключён из git,
во frontend и в ответы API он не попадает.

---

## ЧТО МНЕ НУЖНО СДЕЛАТЬ

Вы выполняете всё это **в веб-консоли H1Cloud** и заливаете файлы **по SFTP**
(SSH у меня нет, Agent Bridge недоступен).

### Шаг 1. Залить файлы по SFTP

1. В панели H1Cloud откройте SFTP-доступ к серверу `de-bots3.h1cloud.net`.
2. Залейте 6 файлов фронтенда в ту же папку, где сейчас лежит сайт
   (где отдаётся `bank.html`), **заменив старые**.
3. Залейте папку `backend/` целиком в `/opt/bf-assistant/`
   (или в `$HOME/bf-assistant`, если нет прав на `/opt`).

### Шаг 2. Установка зависимостей (веб-консоль)

```bash
cd /opt/bf-assistant
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

> Если python3/venv нет — сначала `sudo apt update && sudo apt install -y python3-venv python3-pip`.
> На Ubuntu 24.04 может помочь `sudo apt install -y python3.12-venv`.

### Шаг 3. Проверка, что backend стартует

```bash
cd /opt/bf-assistant/backend
../.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Должно появиться `Uvicorn running on http://0.0.0.0:8000`.
Откройте в браузере `http://de-bots3.h1cloud.net:8000/api/assistant/health` —
должен вернуться JSON `{"ok": true, "status": "ok", ...}`.

Ctrl+C — остановить.

### Шаг 4. Запуск как сервиса (чтобы не умирал после выхода)

Создайте файл `/etc/systemd/system/bf-assistant.service` (нужен sudo):

```ini
[Unit]
Description=BF Assistant (BankFake AI backend)
After=network.target

[Service]
WorkingDirectory=/opt/bf-assistant/backend
ExecStart=/opt/bf-assistant/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bf-assistant
sudo systemctl status bf-assistant     # должен быть active (running)
```

### Шаг 5. Проксировать /api/ через nginx

Если сайт уже работает через nginx, добавьте в его конфиг (блок `server`):

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

После этого фронтенд сам найдёт backend по тому же домену
(автоопределение адреса в `assistant.js` сначала пробует относительный `/api/*`).

**Важно:** для js/css отключите кэш, иначе браузер будет отдавать старые файлы:

```nginx
location ~* \.(js|css)$ {
    add_header Cache-Control "no-cache, max-age=0";
}
```

### Шаг 6. Проверка

1. Откройте сайт, вкладка **«Ассистент»** (3-я в навигации).
2. `GET /api/assistant/health` → `"ok": true` и `"gigachat_configured": true`.
3. Отправьте сообщение «Сколько у меня денег?» — должен прийти ответ с суммой.
4. Прогон автотестов (необязательно, мок поднимается сам на 9001):
   ```bash
   cd /opt/bf-assistant/backend && ../.venv/bin/python smoke_test.py
   # ожидаемо: Итого: 24 OK, 0 ошибок
   ```

---

## Если ключ GigaChat не принят

Симптом: ответ `AI временно недоступен. Ключ GigaChat не принят сервером…`
в логах `sudo journalctl -u bf-assistant -f` будет
`oauth … {"code":3,"message":"clientId is absent in db"}`.

Решение: получить **свежий Authorization Key** на https://developers.sber.ru
(студия → проект → GigaChat → Keys) и вписать его в `/opt/bf-assistant/backend/.env`:

```
GIGACHAT_AUTH_KEY=новый_ключ
```

```bash
sudo systemctl restart bf-assistant
```

Поддерживаются форматы: `clientId:clientSecret`, готовый `base64(clientId:clientSecret)`
и `base64(clientId).hex(секрет)` — `config.py` приводит их к нужному сам.

## Отладка

```bash
sudo journalctl -u bf-assistant -f          # логи сервиса
curl -s http://127.0.0.1:8000/api/assistant/health | python3 -m json.tool
cd /opt/bf-assistant/backend && ../.venv/bin/python tests/real_test.py   # проверка реального API GigaChat
```

Ошибки, которые видит пользователь (traceback — только в логах):
- «Не настроен API GigaChat» — пустой `GIGACHAT_AUTH_KEY`;
- «Ключ GigaChat не принят сервером» — ключ отклонён Сбером;
- «Не удалось связаться с AI. Попробуйте ещё раз.» — сеть/TLS/таймаут;
- «Слишком много запросов…» — сработал rate limit (`RATE_LIMIT_PER_MINUTE`).

## Безопасность

- `backend/.env` — единственный файл с секретом; не заливайте его в публичные каталоги.
- API отвечает только на 4 эндпоинта `/api/assistant/*`, ключ в ответы не попадает
  (проверяется автотестами «health без секретов», «config без секретов»).
- Инструменты AI только читают данные: переводы/платежи выполняются в самом приложении.
