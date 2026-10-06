/* =========================================================
   BF Assistant («Ассистент») — клиентская часть BankFake.
   Общается ТОЛЬКО с собственным FastAPI backend.
   Ключ GigaChat живёт в .env на сервере и НИКОГДА не попадает
   в HTML / JS / localStorage / URL.
   ========================================================= */
(function () {
    'use strict';

    var CHAT_KEY = 'bf_ai_chat';            // история: {role, content, timestamp}
    var BASE_KEY = 'bf_ai_api_base';        // запомненный адрес backend
    var MAX_LOCAL_MESSAGES = 100;
    var MAX_HISTORY_SENT = 16;              // реплик, которые уходят в модель
    var MSG_ERROR = 'Не удалось связаться с AI. Попробуйте ещё раз.';
    var MSG_NO_KEY = 'Ассистент временно недоступен. Проверьте подключение к интернету.';
    var MSG_RATE = 'Слишком много запросов. Подождите минуту и попробуйте снова.';

    /* ---------- дневной лимит ИИ (15 запросов) ---------- */
    var LIMIT_KEY = 'bf_ai_daily';          // {date:'YYYY-M-D', count:N}
    var DAILY_LIMIT = 15;

    function todayKey() {
        var d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function readDaily() {
        var raw = safeStorageGet(LIMIT_KEY), obj = null;
        try { obj = raw ? JSON.parse(raw) : null; } catch (e) { obj = null; }
        if (!obj || obj.date !== todayKey()) obj = { date: todayKey(), count: 0 };
        return obj;
    }
    function remainingToday() {
        var o = readDaily();
        return Math.max(0, DAILY_LIMIT - (o.count || 0));
    }
    function consume() {
        var o = readDaily();
        if ((o.count || 0) >= DAILY_LIMIT) return false;
        o.count = (o.count || 0) + 1;
        try { safeStorageSet(LIMIT_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
        return true;
    }
    function limitMsg() {
        return 'Дневной лимит ИИ исчерпан: ' + DAILY_LIMIT + ' из ' + DAILY_LIMIT +
               ' запросов. Лимит обновится завтра.';
    }

    var stateUI = { busy: false, messages: [], base: null, probing: false };

    /* ---------- утилиты ---------- */
    function $(id) { return document.getElementById(id); }

    function safeStorageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeStorageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* приватный режим */ }
    }
    function safeStorageDel(key) {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatText(str) {
        var out = escapeHtml(str);
        out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
        out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
        return out;
    }

    function scrollBottom() {
        var box = $('bf-as-messages');
        if (box) box.scrollTop = box.scrollHeight;
    }

    function now() { return Date.now ? Date.now() : new Date().getTime(); }

    /* ---------- определение адреса backend ---------- */
    function baseCandidates() {
        var list = [];
        function push(v) {
            v = String(v || '').replace(/\/+$/, '');
            if (v && list.indexOf(v) === -1) list.push(v);
        }
        try {
            if (window.BF_AI_APIS && window.BF_AI_APIS.length) {
                for (var ai = 0; ai < window.BF_AI_APIS.length; ai++) push(window.BF_AI_APIS[ai]);
            }
        } catch (e) { /* ignore */ }
        try { if (window.BF_AI_API) push(window.BF_AI_API); } catch (e) { /* ignore */ }
        try { push(safeStorageGet(BASE_KEY)); } catch (e) { /* ignore */ }
        push('');                                  // тот же домен (nginx proxy /api/*)
        try {
            if (location.hostname) {
                push(location.protocol + '//' + location.hostname + ':8000');
                if (location.hostname === 'localhost') push('http://127.0.0.1:8000');
            }
        } catch (e) { /* ignore */ }
        return list;
    }

    function probe(base) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () { if (controller) controller.abort(); }, 4000);
        var opts = { method: 'GET' };
        if (controller) opts.signal = controller.signal;
        return fetch(base + '/api/assistant/health', opts).then(function (r) {
            clearTimeout(timer);
            return r.json().then(function (b) { return !!(b && b.ok); }).catch(function () { return false; });
        }).catch(function () { clearTimeout(timer); return false; });
    }

    function resolveBase() {
        if (stateUI.base !== null) return Promise.resolve(stateUI.base);
        if (stateUI.probing) return Promise.resolve('');
        var candidates = baseCandidates();
        stateUI.probing = true;

        function next(i) {
            if (i >= candidates.length) {
                stateUI.probing = false;
                stateUI.base = '';   // fallback: адрес относительно текущей страницы
                return Promise.resolve(stateUI.base);
            }
            return probe(candidates[i]).then(function (ok) {
                stateUI.probing = false;
                if (ok) {
                    stateUI.base = candidates[i];
                    if (candidates[i]) safeStorageSet(BASE_KEY, candidates[i]);
                    return stateUI.base;
                }
                return next(i + 1);
            });
        }
        return next(0);
    }

    /* ---------- данные BankFake -> снимок для backend ---------- */
    function readBankState() {
        try {
            if (typeof state !== 'undefined' && state) return state;
        } catch (e) { /* state ещё не определён */ }
        return null;
    }

    function num(v, def) {
        var n = Number(v);
        return isFinite(n) ? n : (def === undefined ? 0 : def);
    }

    // Infinity в JSON не сериализуется -> null (backend трактует как «безлимит»)
    function limitVal(v) {
        if (v === Infinity || v === null || v === undefined) return null;
        var n = Number(v);
        if (!isFinite(n) || n < 0) return null;
        return n;
    }

    function buildProfile() {
        var s = readBankState();
        if (!s) return null;
        var userId = '';
        try { if (typeof D !== 'undefined' && D && D.userId) userId = String(D.userId); } catch (e) { /* ignore */ }

        return {
            profile: {
                name: s.name || '',
                user_id: userId,
                has_pro: !!s.hasPro,
                has_subscription: !!s.hasSubscription,
                dark_theme: !!s.darkTheme
            },
            wallet: {
                balance: num(s.balance),
                points: num(s.points),
                topup_limit: limitVal(s.topupLimit),
                salary_limit: limitVal(s.salaryLimit)
            },
            salary: {
                amount: num(s.salary),
                interval_sec: num(s.interval, 60),
                next_sec: num(s.nextSalary),
                card_id: s.salaryCardId || 'balance'
            },
            cards: (Array.isArray(s.cards) ? s.cards : []).map(function (c) {
                return {
                    id: c.id, type: c.type || 'Карта',
                    number: String(c.number === undefined || c.number === null ? '' : c.number),
                    balance: num(c.balance), holder: c.holder || '',
                    expiry: c.expiry || '', blocked: !!c.blocked,
                    theme: c.theme || 'blue', is_gold: !!c.isGold
                };
            }),
            history: (Array.isArray(s.history) ? s.history : []).slice(0, 80).map(function (h) {
                var item = {
                    type: h.type, title: String(h.title || ''),
                    amount: num(h.amount), time: String(h.time || '')
                };
                if (typeof h.ts === 'number' && h.ts > 0) item.ts = h.ts;
                return item;
            }),
            contacts: (Array.isArray(s.contacts) ? s.contacts : []).slice(0, 50).map(function (c) {
                return { name: c.name || '', phone: c.phone || '' };
            }),
            notifications: (Array.isArray(s.notifications) ? s.notifications : []).slice(0, 10).map(function (n) {
                return { text: n.text || '', time: n.time || '' };
            }),
            deposits: Array.isArray(s.deposits) ? s.deposits : [],
            piggy_banks: Array.isArray(s.piggyBanks) ? s.piggyBanks : [],
            credits: Array.isArray(s.credits) ? s.credits : [],
            stocks: Array.isArray(s.stocks) ? s.stocks : [],
            portfolio: (s.portfolio && typeof s.portfolio === 'object') ? s.portfolio : {}
        };
    }

    /* ---------- отрисовка ---------- */
    function messageNode(role, html) {
        var row = document.createElement('div');
        row.className = 'bf-as-row ' + role;
        var bubble = document.createElement('div');
        bubble.className = 'bf-as-msg';
        bubble.innerHTML = html;
        row.appendChild(bubble);
        return row;
    }

    function renderMessage(role, text) {
        var box = $('bf-as-messages');
        if (!box) return;
        box.appendChild(messageNode(role, formatText(text)));
        scrollBottom();
    }

    function renderSystem(text) {
        var box = $('bf-as-messages');
        if (!box) return;
        box.appendChild(messageNode('system', formatText(text)));
        scrollBottom();
    }

    function renderError(text) {
        var box = $('bf-as-messages');
        if (!box) return;
        box.appendChild(messageNode('error', formatText(text)));
        scrollBottom();
    }

    function showTyping(show) {
        var box = $('bf-as-messages');
        if (!box) return;
        var existing = document.getElementById('bf-as-typing-row');
        if (show) {
            if (existing) return;
            var row = document.createElement('div');
            row.className = 'bf-as-row bot';
            row.id = 'bf-as-typing-row';
            row.innerHTML = '<div class="bf-as-msg"><span class="bf-as-typing">' +
                '<span class="bf-as-dots"><span></span><span></span><span></span></span>' +
                'Ассистент печатает...</span></div>';
            box.appendChild(row);
            scrollBottom();
        } else if (existing) {
            existing.parentNode.removeChild(existing);
        }
    }

    function setBusy(busy) {
        stateUI.busy = busy;
        var send = $('bf-as-send');
        var input = $('bf-as-input');
        if (send) send.disabled = busy;
        if (input) input.readOnly = busy;
        var chips = document.querySelectorAll('.bf-as-chip');
        for (var i = 0; i < chips.length; i++) chips[i].disabled = busy;
    }

    function saveLocal(role, content) {
        stateUI.messages.push({ role: role, content: content, timestamp: now() });
        if (stateUI.messages.length > MAX_LOCAL_MESSAGES) {
            stateUI.messages = stateUI.messages.slice(-MAX_LOCAL_MESSAGES);
        }
        try { safeStorageSet(CHAT_KEY, JSON.stringify(stateUI.messages)); } catch (e) { /* ignore */ }
    }

    function historyPayload() {
        return stateUI.messages.slice(-MAX_HISTORY_SENT).map(function (m) {
            return { role: m.role === 'assistant' || m.role === 'bot' ? 'assistant' : 'user',
                     content: m.content, timestamp: m.timestamp };
        });
    }

    function renderWelcome() {
        renderSystem('BF Assistant — ваш помощник в BankFake. Задайте вопрос или выберите быструю кнопку выше.');
    }

    /* ---------- HTTP ---------- */
    function postJSON(base, path, body) {
        return fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        }).then(function (resp) {
            return resp.json().catch(function () { return {}; }).then(function (data) {
                return { status: resp.status, body: data };
            });
        });
    }

    function errorMessage(res) {
        var b = res && res.body;
        if (b && b.ok === false && b.error && b.error.message) return b.error.message;
        if (res && res.status === 429) return MSG_RATE;
        if (b && b.ok === false && b.error && b.error.code === 'no_key') return MSG_NO_KEY;
        return MSG_ERROR;
    }

    /* ---------- отправка ---------- */
    function send(text) {
        text = String(text || '').trim();
        if (!text || stateUI.busy) return;
        if (!consume()) { renderError(limitMsg()); return; }

        var input = $('bf-as-input');
        if (input) input.value = '';

        renderMessage('user', text);
        saveLocal('user', text);
        setBusy(true);
        showTyping(true);

        var payload = {
            message: text,
            user_id: (function () {
                try { return (typeof D !== 'undefined' && D && D.userId) ? String(D.userId) : null; }
                catch (e) { return null; }
            })(),
            profile: buildProfile(),
            history: historyPayload()
        };

        resolveBase().then(function (base) {
            return postJSON(base, '/api/assistant/chat', payload);
        }).then(function (res) {
            showTyping(false);
            setBusy(false);

            if (res.body && res.body.ok && res.body.message) {
                renderMessage('assistant', res.body.message);
                saveLocal('assistant', res.body.message);
                return;
            }
            renderError(errorMessage(res));
        }).catch(function () {
            showTyping(false);
            setBusy(false);
            stateUI.base = null;   // сбрасываем адрес — вдруг backend переехал
            renderError(MSG_ERROR);
        });
    }

    /* ---------- программный запрос (словарь, вердикт по тратам) ---------- */
    function askText(text) {
        text = String(text || '').trim();
        if (!text) return Promise.resolve({ ok: false, error: 'Пустой запрос' });
        if (!consume()) return Promise.resolve({ ok: false, error: limitMsg() });

        var payload = {
            message: text,
            user_id: (function () {
                try { return (typeof D !== 'undefined' && D && D.userId) ? String(D.userId) : null; }
                catch (e) { return null; }
            })(),
            profile: buildProfile(),
            history: []
        };
        return resolveBase().then(function (base) {
            return postJSON(base, '/api/assistant/chat', payload);
        }).then(function (res) {
            if (res.body && res.body.ok && res.body.message) return { ok: true, text: res.body.message };
            return { ok: false, error: errorMessage(res) };
        }).catch(function () {
            return { ok: false, error: MSG_ERROR };
        });
    }

    function sendFromInput() {
        var input = $('bf-as-input');
        send(input ? input.value : '');
    }

    /* ---------- быстрые действия ---------- */
    var QUICK = {
        balance: 'Сколько у меня денег?',
        last: 'Покажи последние операции',
        cards: 'Какие у меня карты?',
        points: 'Сколько у меня бонусных баллов?',
        salary: 'Когда следующая зарплата?',
        forecast: 'Какой будет баланс через месяц?'
    };

    function quick(key) {
        var q = QUICK[key];
        if (q) send(q);
    }

    /* ---------- очистка чата ---------- */
    function clearChat() {
        stateUI.messages = [];
        safeStorageDel(CHAT_KEY);
        var box = $('bf-as-messages');
        if (box) box.innerHTML = '';
        renderWelcome();
        resolveBase().then(function (base) {
            return postJSON(base, '/api/assistant/reset', {});
        }).catch(function () { /* не критично: история живёт в localStorage */ });
    }

    // обратная совместимость со старым именем
    var newChat = clearChat;

    /* ---------- восстановление истории ---------- */
    function restore() {
        var box = $('bf-as-messages');
        if (!box || box.dataset.bfReady === '1') return;
        box.dataset.bfReady = '1';
        box.innerHTML = '';

        var raw = safeStorageGet(CHAT_KEY);
        var items = [];
        if (raw) {
            try { items = JSON.parse(raw) || []; } catch (e) { items = []; }
        }

        if (Array.isArray(items) && items.length) {
            items.forEach(function (m) {
                if (!m) return;
                var role = (m.role === 'assistant' || m.role === 'bot') ? 'assistant'
                    : (m.role === 'user' ? 'user' : null);
                var content = (typeof m.content === 'string') ? m.content
                    : (typeof m.text === 'string' ? m.text : '');
                if (role && content) {
                    box.appendChild(messageNode(role, formatText(content)));
                }
            });
            scrollBottom();
        } else {
            renderWelcome();
        }
        // прогреваем определение адреса backend, чтобы первый ответ был быстрее
        resolveBase().catch(function () { /* сообщим при отправке */ });
    }

    /* ---------- инициализация ---------- */
    function init() {
        var input = $('bf-as-input');
        if (input && !input.dataset.bfBound) {
            input.dataset.bfBound = '1';
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.isComposing && !e.repeat) {
                    e.preventDefault();
                    sendFromInput();
                }
            });
        }
        restore();
    }

    // API для inline-обработчиков в bank.html
    window.BFA = {
        send: sendFromInput,
        sendText: send,
        quick: quick,
        clearChat: clearChat,
        newChat: newChat,
        open: init,
        askText: askText,
        remaining: remainingToday,
        dailyLimit: DAILY_LIMIT
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
