/* ===================== ДАННЫЕ ===================== */
const APP_DATA = window.APP_DATA || {};
const D = APP_DATA.defaults || {};
const MSG = APP_DATA.messages || {};
const SERVICES = APP_DATA.services || {};
const SHOP_ITEMS = APP_DATA.shopItems || [];
const PAY_TILES = APP_DATA.payTiles || [];
const BF_CATEGORIES = APP_DATA.bfCategories || [];
const RECENT_MERCHANTS = APP_DATA.recentMerchants || [];
const FOREIGN_COUNTRIES = APP_DATA.foreignCountries || [];
const CREDIT = APP_DATA.credit || { maxAmount: 1000000, rates: {} };
const CHART_COLORS = APP_DATA.chartColors || ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec489a','#06b6d4','#84cc16'];
const CARD_THEMES = APP_DATA.cardThemes || ['blue','dark','purple','grey','teal','red'];
const PRODUCTS = APP_DATA.products || {};
const TUTORIAL = APP_DATA.tutorial || { steps: [] };
const STORAGE_KEY = (APP_DATA.app && APP_DATA.app.storageKey) || 'bankfake_pro_v3';

/* ===================== СОСТОЯНИЕ ===================== */
let state = {
    name: D.userName || "Михаил", avatar: null,
    balance: D.startBalance || 2500, points: D.startPoints || 158,
    hasSubscription: false, hasPro: false, cards: [],
    contacts: JSON.parse(JSON.stringify(D.contacts || [])),
    history: [], notifications: JSON.parse(JSON.stringify(D.notifications || [])),
    salary: D.salary || 1000, interval: D.salaryInterval || 60, nextSalary: D.salaryInterval || 60,
    paymentCardId: 'balance', salaryCardId: 'balance',
    selectedJKH: null, selectedBFCat: (BF_CATEGORIES[0] && BF_CATEGORIES[0].name) || 'Ресторан',
    selectedCountry: null, cvvVisible: false, darkTheme: false,
    ownedDesigns: [...CARD_THEMES], shopItems: {},
    topupLimit: D.topupLimit || 10000, salaryLimit: D.salaryLimit || 5000,
    topupTier: 0, salaryTier: 0, credits: [],
    deposits: [], piggyBanks: [], stocks: [], portfolio: {},
    wallet: { USD: 320, EUR: 210, CNY: 900 }, rates: null,
    hasSeenTutorial: false, hasAcceptedConsent: false, prodTab: 'deposits',
    pushEnabled: true, vibrateEnabled: true, updaterSeen: ''
};
let currentCardIndex = 0, chartVisible = false, pendingDeleteCardId = null,
    selectedDesign = 'blue', inputCallback = null, confirmCallback = null,
    bfpaySelectedCard = 'balance', currentService = null, currentServiceProvider = null,
    depositsTimer = null, stocksTimer = null, tutStep = 0, tutActive = false,
    piggyCurrentId = null, historyFilter = 'all',
    pushTimer = null;

let TUTORIAL_FINAL_STEPS = null;
let isResetting = false;   /* ← блокировка сохранения во время сброса */

/* ===================== ХЕЛПЕРЫ ===================== */
function formatLimit(v) {
    if (v === Infinity || v === -Infinity || v === null || v === undefined) return '∞';
    return Number(v).toLocaleString('ru-RU');
}
function formatMoney(v) {
    const n = Number(v);
    if (!isFinite(n)) return '0 ₽';
    return n.toLocaleString('ru-RU') + ' ₽';
}

/* ===================== СОГЛАШЕНИЕ ===================== */
function showConsent() {
    const overlay = document.getElementById('consent-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function hideConsent() {
    const overlay = document.getElementById('consent-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
}
function toggleConsentCheck() {
    const block = document.getElementById('consent-checkbox-block');
    const checkbox = document.getElementById('consent-checkbox');
    const btn = document.getElementById('consent-btn');
    checkbox.checked = !checkbox.checked;
    block.classList.toggle('checked', checkbox.checked);
    btn.disabled = !checkbox.checked;
}
function acceptConsent() {
    const checkbox = document.getElementById('consent-checkbox');
    if (!checkbox.checked) return;
    state.hasAcceptedConsent = true;
    saveToLocalStorage();
    hideConsent();
    setTimeout(() => { if (!state.hasSeenTutorial) startTutorial(); }, 500);
}
function declineConsent() { alert("Для использования приложения необходимо принять правила."); }
function showConsentAgain() {
    const checkbox = document.getElementById('consent-checkbox');
    const btn = document.getElementById('consent-btn');
    checkbox.checked = false;
    document.getElementById('consent-checkbox-block').classList.remove('checked');
    btn.disabled = true;
    showConsent();
}

/* ===================== PUSH ===================== */
function pushNotify(text) {
    if (!state.pushEnabled) return;
    const banner = document.getElementById('push-banner');
    if (!banner) return;
    document.getElementById('push-banner-text').innerText = text;
    const now = new Date();
    document.getElementById('push-banner-time').innerText = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    banner.classList.add('show');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => banner.classList.remove('show'), 3500);
    try { if (window.BFJson && typeof window.BFJson.push === 'function') window.BFJson.push('BankFake', text); } catch (e) { /* в браузере мостика нет */ }
    vibrate([30, 50, 30]);
}
function togglePush(v) { state.pushEnabled = !!v; saveToLocalStorage(); showAlert(v ? "Push включены" : "Push отключены"); }

/* ===================== ВИБРО ===================== */
function vibrate(pattern) {
    if (!state.vibrateEnabled) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
}
function toggleVibrate(v) { state.vibrateEnabled = !!v; saveToLocalStorage(); showAlert(v ? "Виброотклик включён" : "Виброотклик отключён"); }

/* ===================== РЕКВИЗИТЫ ===================== */
function openRequisites() {
    const card = state.cards[currentCardIndex] || state.cards[0];
    if (!card) return showAlert("Нет карты");
    document.getElementById('req-holder').innerText = card.holder;
    document.getElementById('req-card').innerText = card.fullNumber;
    closeModal('modal-settings');
    document.getElementById('modal-requisites').classList.remove('hidden');
}
function copyReq(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.innerText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showAlert("Скопировано")).catch(() => showAlert(text));
    } else showAlert(text);
    vibrate(30);
}
function shareRequisites() {
    const card = state.cards[currentCardIndex] || state.cards[0];
    if (!card) return;
    const text = `Реквизиты для перевода:\nПолучатель: ${card.holder}\nКарта: ${card.fullNumber}\nБИК: 044525225\nСчёт: 40817810099910004312\nБанк: BankFake JSC`;
    if (navigator.share) navigator.share({ title: 'Мои реквизиты BankFake', text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showAlert("Реквизиты скопированы"));
}

/* ===================== АВАТАРЫ (настоящие в сети, свои без интернета) ===================== */
const AVATAR_SEEDS = ['Felix','Aneka','Mia','Leo','Nora','Kai','Zoe','Max','Luna'];
const AVATAR_BG = ['#b6e3f4','#c0aede','#d1d4f9','#ffd5dc','#ffdfbf'];
const AVATAR_SKIN = ['#ffd8b6','#f1c27d','#e0ac69','#c68642','#a56b46'];
const AVATAR_HAIR = ['#3b302a','#6b4423','#f5c542','#e25822','#3b3b98','#1f2937'];
function avatarHash(s) { let h = 5381; for (let i = 0; i < String(s).length; i++) h = ((h << 5) + h + String(s).charCodeAt(i)) >>> 0; return h; }
function localAvatarUrl(seed) {
    seed = String(seed || 'BankFake');
    const h = avatarHash(seed);
    const bg = AVATAR_BG[h % AVATAR_BG.length];
    const skin = AVATAR_SKIN[(h >> 3) % AVATAR_SKIN.length];
    const hair = AVATAR_HAIR[(h >> 7) % AVATAR_HAIR.length];
    const shirt = AVATAR_BG[(h >> 11) % AVATAR_BG.length];
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="32" fill="' + bg + '"/>' +
        '<path d="M12 64c0-11 9-18 20-18s20 7 20 18z" fill="' + shirt + '"/>' +
        '<circle cx="32" cy="30" r="14" fill="' + skin + '"/>' +
        '<path d="M18 27c1-9 7-14 14-14s13 5 14 14c-2-5-7-8-14-8s-12 3-14 8z" fill="' + hair + '"/>' +
        '<circle cx="26.5" cy="30" r="2" fill="#1f2937"/>' +
        '<circle cx="37.5" cy="30" r="2" fill="#1f2937"/>' +
        '<path d="M27 37q5 5 10 0" stroke="#1f2937" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
/* настоящая картинка (dicebear) — когда есть интернет */
function remoteAvatarUrl(seed) {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(String(seed || 'BankFake'))}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}
function getAvatarUrl(seed) { return remoteAvatarUrl(seed); }
/* сохранённую ссылку переводим в свою локальную картинку */
function localAvatarFor(url) {
    if (!url || url.indexOf('data:') === 0) return url;
    const m = /[?&]seed=([^&]+)/.exec(String(url));
    return localAvatarUrl(m ? decodeURIComponent(m[1]) : 'BankFake');
}
/* нет интернета — картинка заменяется на свою */
function attachAvatarFallback(img) {
    if (!img) return img;
    img.onerror = function () { this.onerror = null; this.src = localAvatarFor(this.src); };
    return img;
}
function openAvatarPicker() {
    const grid = document.getElementById('avatar-picker-grid');
    grid.innerHTML = '';
    AVATAR_SEEDS.forEach(seed => {
        const url = getAvatarUrl(seed);
        const div = document.createElement('div');
        div.className = 'avatar-pick-item';
        div.innerHTML = `<img src="${url}" alt="${seed}">`;
        attachAvatarFallback(div.querySelector('img'));
        div.onclick = () => {
            applyAvatar(url);
            closeModal('modal-avatar-picker');
            showAlert("Аватар выбран!");
            vibrate(40);
        };
        grid.appendChild(div);
    });
    document.getElementById('modal-avatar-picker').classList.remove('hidden');
}
function applyAvatar(url) {
    state.avatar = url;
    document.querySelectorAll('#user-avatar-main, #user-avatar-profile, #user-avatar-preview').forEach(img => {
        if (img) { img.src = url; attachAvatarFallback(img); img.classList.remove('hidden'); }
    });
    document.querySelectorAll('#user-icon-placeholder, #user-icon-placeholder-2, #profile-avatar-initials').forEach(el => el && el.classList.add('hidden'));
    saveToLocalStorage();
}

/* ===================== ИПОТЕКА ===================== */
const MORTGAGE_RATES = { 5: 0.09, 10: 0.08, 15: 0.07, 20: 0.065, 30: 0.06 };
const MORTGAGE_MAX = 10000000;

function openMortgage() {
    const sel = document.getElementById('mortgage-term');
    sel.innerHTML = '';
    Object.entries(MORTGAGE_RATES).forEach(([years, rate]) => {
        const opt = document.createElement('option');
        opt.value = years;
        opt.innerText = `${years} лет · ${(rate*100).toFixed(1)}%`;
        if (years === '15') opt.selected = true;
        sel.appendChild(opt);
    });
    document.getElementById('mortgage-am').value = '';
    updateMortgageCalc();
    document.getElementById('modal-mortgage').classList.remove('hidden');
}
function updateMortgageCalc() {
    const am = parseFloat(document.getElementById('mortgage-am').value) || 0;
    const years = parseInt(document.getElementById('mortgage-term').value) || 15;
    const rate = MORTGAGE_RATES[years] || 0.07;
    const months = years * 12;
    const totalPay = am * (1 + rate * years);
    const monthly = am > 0 ? totalPay / months : 0;
    document.getElementById('mortgage-monthly').innerText = formatMoney(Math.round(monthly));
    document.getElementById('mortgage-overpay').innerText = formatMoney(Math.round(totalPay - am));
}
function confirmMortgage() {
    const am = parseFloat(document.getElementById('mortgage-am').value);
    if (!am || am <= 0) return showAlert("Введите сумму");
    if (am > MORTGAGE_MAX) return showAlert(`Максимум ${MORTGAGE_MAX.toLocaleString()} ₽`);
    const years = parseInt(document.getElementById('mortgage-term').value);
    const rate = MORTGAGE_RATES[years] || 0.07;
    const months = years * 12;
    const totalPay = am * (1 + rate * years);
    const monthly = totalPay / months;
    askConfirm('Оформить ипотеку?', `${formatMoney(am)} на ${years} лет`, () => {
        state.balance += am;
        state.credits.push({ amount: am, term: months, monthly: Math.round(monthly), total: Math.round(totalPay), date: new Date().toLocaleDateString(), type: 'mortgage' });
        addHistory('income', `Ипотека на ${years} лет`, am);
        pushNotify(`Ипотека оформлена: ${formatMoney(am)}`);
        vibrate([50, 40, 80]);
        closeModal('modal-mortgage');
        saveToLocalStorage(); updateUI();
        showAlert(`Ипотека ${formatMoney(am)} зачислена!`);
    }, 'primary');
}
document.getElementById('mortgage-am')?.addEventListener('input', updateMortgageCalc);
document.getElementById('mortgage-term')?.addEventListener('change', updateMortgageCalc);

/* ===================== ФИЛЬТРЫ ИСТОРИИ ===================== */
function categorizeHistoryItem(h) {
    const title = (h.title || '').toLowerCase();
    if (h.type === 'income') return 'income';
    if (title.includes('перевод') && !title.includes('между')) return 'transfer';
    if (title.includes('перевод между')) return 'transfer';
    if (title.includes('bf-pay') || title.includes('жкх') || title.includes('мобильн') 
        || title.includes('интернет') || title.includes('домофон') || title.includes('образование') 
        || title.includes('кино') || title.includes('путешеств') || title.includes('госуслуг') 
        || title.includes('штраф') || title.includes('благотвор') || title.includes('кредит') 
        || title.includes('подписка') || title.includes('вклад') || title.includes('копилка')
        || title.includes('покупка') || title.includes('продажа')) return 'payment';
    return 'other';
}

/* ===================== ПРОДУКТЫ ===================== */
function initStocks() {
    if (!state.stocks || !state.stocks.length) {
        state.stocks = (PRODUCTS.stocks || []).map(s => ({ ...s, price: s.base, prev: s.base, change: 0 }));
    }
}
function updateStockPrices() {
    if (!state.stocks) return;
    state.stocks.forEach(s => {
        const drift = (Math.random() - 0.5) * 0.08;
        s.prev = s.price;
        s.price = Math.max(50, Math.round(s.price * (1 + drift)));
        s.change = ((s.price - s.prev) / s.prev) * 100;
    });
    if (document.getElementById('modal-products') && !document.getElementById('modal-products').classList.contains('hidden') && state.prodTab === 'stocks') renderProdContent();
    saveToLocalStorage();
}
function startStocksTimer() { if (stocksTimer) clearInterval(stocksTimer); stocksTimer = setInterval(updateStockPrices, 15000); }
function openProducts(tab) {
    initStocks(); switchProdTab(tab || state.prodTab || 'deposits');
    document.getElementById('modal-products').classList.remove('hidden');
    startDepositsTick(); startStocksTimer();
}
function switchProdTab(t) {
    state.prodTab = t;
    document.querySelectorAll('.prod-tab').forEach(el => el.classList.toggle('active', el.dataset.prod === t));
    renderProdContent();
    if (t === 'currency' && (!state.rates || Date.now() - state.rates.updated > 30 * 60 * 1000)) fetchRates();
}
function renderProdContent() {
    const c = document.getElementById('prod-content'); if (!c) return;
    if (state.prodTab === 'deposits') c.innerHTML = renderDepositsHTML();
    else if (state.prodTab === 'piggies') c.innerHTML = renderPiggiesHTML();
    else if (state.prodTab === 'stocks') c.innerHTML = renderStocksHTML();
    else if (state.prodTab === 'currency') c.innerHTML = renderCurrencyHTML();
    else if (state.prodTab === 'dict') c.innerHTML = renderDictHTML();
}
function renderDepositsHTML() {
    const list = PRODUCTS.deposits || [];
    let html = '<h3 class="text-xs font-bold text-slate-400 uppercase mb-3 px-1">Открыть вклад</h3>';
    list.forEach((d, i) => {
        const cls = ['blue','green','orange'][i % 3];
        html += `<div class="deposit-card ${cls}" onclick="openDepositForm('${d.id}')"><div class="flex justify-between items-start relative z-10"><div><h4>${d.name}</h4><div class="rate">+${(d.rate*100).toFixed(0)}%</div><div class="dur">${d.desc} · от ${d.minAmount.toLocaleString()} ₽</div></div><i class="fa-solid ${d.icon} text-3xl opacity-80"></i></div></div>`;
    });
    if (state.deposits && state.deposits.length) {
        html += '<h3 class="text-xs font-bold text-slate-400 uppercase mb-3 mt-6 px-1">Активные вклады</h3>';
        state.deposits.forEach(dep => {
            const left = Math.max(0, Math.floor((dep.endTime - Date.now()) / 1000));
            const mm = String(Math.floor(left / 60)).padStart(2, '0');
            const ss = String(left % 60).padStart(2, '0');
            html += `<div class="active-deposit"><div class="flex justify-between items-center mb-2"><div><p class="font-bold text-sm">${dep.name}</p><p class="text-[10px] text-slate-400">${dep.amount.toLocaleString()} ₽ · +${(dep.rate*100).toFixed(0)}%</p></div><div class="dep-timer">${mm}:${ss}</div></div><div class="pig-progress"><div class="pig-progress-fill" style="width:${Math.min(100, 100 - (left/dep.duration)*100)}%"></div></div></div>`;
        });
    }
    return html;
}
function openDepositForm(id) {
    const d = (PRODUCTS.deposits || []).find(x => x.id === id); if (!d) return;
    askInput(`Сумма вклада «${d.name}» (от ${d.minAmount.toLocaleString()} ₽)`, "", (val) => {
        const n = parseFloat(val);
        if (isNaN(n) || n < d.minAmount) return showAlert(`Минимум ${d.minAmount.toLocaleString()} ₽`);
        if (state.balance < n) return showAlert(MSG.insufficientFunds || "Недостаточно средств");
        state.balance -= n;
        state.deposits.push({ id: Date.now(), name: d.name, amount: n, rate: d.rate, duration: d.duration, endTime: Date.now() + d.duration * 1000 });
        addHistory('expense', `Вклад: ${d.name}`, n);
        updateUI(); saveToLocalStorage();
        pushNotify(`Вклад открыт: -${n.toLocaleString('ru-RU')} ₽`);
        showAlert(`Вклад открыт! Через ${d.desc} получите ${Math.round(n*(1+d.rate)).toLocaleString()} ₽`);
        renderProdContent();
    }, 'number');
}
function startDepositsTick() {
    if (depositsTimer) clearInterval(depositsTimer);
    depositsTimer = setInterval(() => {
        if (!state.deposits || !state.deposits.length) return;
        const now = Date.now(); let changed = false;
        state.deposits = state.deposits.filter(dep => {
            if (now >= dep.endTime) {
                const payout = Math.round(dep.amount * (1 + dep.rate));
                state.balance += payout;
                addHistory('income', `Вклад «${dep.name}» закрыт`, payout);
                addNotification(`Вклад закрыт: +${payout} ₽`);
                pushNotify(`Вклад закрыт: +${payout.toLocaleString('ru-RU')} ₽`);
                changed = true; return false;
            }
            return true;
        });
        if (changed) { updateUI(); saveToLocalStorage(); }
        if (document.getElementById('modal-products') && !document.getElementById('modal-products').classList.contains('hidden') && state.prodTab === 'deposits') renderProdContent();
    }, 1000);
}
function renderPiggiesHTML() {
    let html = '<button onclick="openPiggyForm()" class="w-full mb-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white py-4 rounded-3xl font-bold text-base shadow-lg animate-press"><i class="fa-solid fa-plus mr-2"></i>Создать копилку</button>';
    if (!state.piggyBanks || !state.piggyBanks.length) {
        html += '<p class="text-center py-16 text-slate-300 text-sm">Нет копилок. Создайте первую!</p>';
        return html;
    }
    state.piggyBanks.forEach(p => {
        const pct = Math.min(100, (p.current / p.target) * 100);
        const done = p.current >= p.target;
        html += `<div class="piggy-card" onclick="openPiggyActions(${p.id})" style="cursor:pointer;">
            <div class="piggy-icon" style="background:${p.color}"><i class="fa-solid ${p.icon}"></i></div>
            <div class="flex-1">
                <div class="flex justify-between items-center mb-1">
                    <p class="font-bold text-sm">${p.name} ${done ? '🎉' : ''}</p>
                    <p class="text-[10px] font-bold text-slate-500">${pct.toFixed(0)}%</p>
                </div>
                <div class="pig-progress"><div class="pig-progress-fill" style="width:${pct}%"></div></div>
                <p class="piggy-meta">${p.current.toLocaleString('ru-RU')} ₽ / ${p.target.toLocaleString('ru-RU')} ₽</p>
            </div>
            <i class="fa-solid fa-chevron-right text-slate-300 text-xs"></i>
        </div>`;
    });
    return html;
}
function openPiggyForm() {
    askInput("Название копилки", "", (name) => {
        if (!name || !name.trim()) return showAlert("Введите название");
        askInput("Цель (сумма, ₽)", "", (val) => {
            const n = parseFloat(val);
            if (isNaN(n) || n <= 0) return showAlert("Неверная сумма");
            const icons = PRODUCTS.piggyIcons || ['fa-gift'], colors = PRODUCTS.piggyColors || ['#f59e0b'];
            state.piggyBanks.push({ id: Date.now(), name: name.trim(), target: n, current: 0, icon: icons[Math.floor(Math.random()*icons.length)], color: colors[Math.floor(Math.random()*colors.length)], done: false });
            saveToLocalStorage(); renderProdContent(); showAlert("Копилка создана!");
            vibrate(40);
        }, 'number');
    });
}
function openPiggyActions(id) {
    const p = state.piggyBanks.find(x => x.id === id);
    if (!p) return;
    piggyCurrentId = id;
    const pct = Math.min(100, (p.current / p.target) * 100);
    const done = p.current >= p.target;
    document.getElementById('piggy-modal-title').innerText = p.name;
    document.getElementById('piggy-modal-info').innerHTML = `
        <div class="flex items-center gap-3 mb-4">
            <div class="piggy-modal-icon" style="background:${p.color}"><i class="fa-solid ${p.icon}"></i></div>
            <div class="flex-1 min-w-0">
                <p class="font-black text-lg">${p.current.toLocaleString('ru-RU')} ₽</p>
                <p class="text-[11px] text-slate-400">цель: ${p.target.toLocaleString('ru-RU')} ₽</p>
            </div>
            <span class="text-xs font-bold ${done ? 'text-emerald-600' : 'text-slate-500'}">${pct.toFixed(0)}%</span>
        </div>
        <div class="piggy-modal-progress"><div class="piggy-modal-progress-fill" style="width:${pct}%"></div></div>
        ${done ? '<p class="text-[11px] text-emerald-600 font-bold mt-3 text-center">🎉 Цель достигнута! Можно снять деньги.</p>' : `<p class="text-[11px] text-slate-400 mt-3 text-center">Осталось ${(p.target - p.current).toLocaleString('ru-RU')} ₽ до цели</p>`}
    `;
    document.getElementById('modal-piggy').classList.remove('hidden');
}
function piggyTopup() {
    const p = state.piggyBanks.find(x => x.id === piggyCurrentId);
    if (!p) return;
    closeModal('modal-piggy');
    askInput(`Пополнить «${p.name}»`, "", (val) => {
        const n = parseFloat(val);
        if (isNaN(n) || n <= 0) return showAlert("Неверная сумма");
        if (state.balance < n) return showAlert(MSG.insufficientFunds || "Недостаточно средств");
        state.balance -= n;
        p.current += n;
        addHistory('expense', `Копилка: ${p.name}`, n);
        if (p.current >= p.target && !p.done) {
            p.done = true;
            setTimeout(() => showAlert(`🎉 Цель «${p.name}» достигнута!`), 250);
        }
        updateUI(); saveToLocalStorage(); renderProdContent();
    }, 'number');
}
function piggyWithdraw() {
    const p = state.piggyBanks.find(x => x.id === piggyCurrentId);
    if (!p) return;
    if (p.current <= 0) return showAlert("Копилка пуста");
    closeModal('modal-piggy');
    askInput(`Снять из «${p.name}» (макс. ${p.current.toLocaleString('ru-RU')} ₽)`, "", (val) => {
        const n = parseFloat(val);
        if (isNaN(n) || n <= 0) return showAlert("Неверная сумма");
        if (n > p.current) return showAlert("Слишком много");
        p.current -= n;
        state.balance += n;
        if (p.current < p.target) p.done = false;
        addHistory('income', `Снятие из копилки: ${p.name}`, n);
        updateUI(); saveToLocalStorage(); renderProdContent();
        showAlert(`Снято ${n.toLocaleString('ru-RU')} ₽`);
    }, 'number');
}
function piggyDelete() {
    const p = state.piggyBanks.find(x => x.id === piggyCurrentId);
    if (!p) return;
    closeModal('modal-piggy');
    askConfirm('Удалить копилку?', p.current > 0 ? `Все ${p.current.toLocaleString('ru-RU')} ₽ вернутся на баланс.` : 'Копилка пуста — просто удалим.', () => {
        state.balance += p.current;
        if (p.current > 0) addHistory('income', `Копилка удалена: ${p.name}`, p.current);
        state.piggyBanks = state.piggyBanks.filter(x => x.id !== piggyCurrentId);
        updateUI(); saveToLocalStorage(); renderProdContent();
        showAlert("Копилка удалена");
    });
}
/* ===================== КУРСЫ ЦБ РФ + ВАЛЮТНЫЙ КОШЕЛЁК ===================== */
const CB_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const CURRENCY_META = {
    RUB: { name: 'Рубль', sym: '₽', emoji: '🇷🇺' },
    USD: { name: 'Доллар США', sym: '$', emoji: '🇺🇸' },
    EUR: { name: 'Евро', sym: '€', emoji: '🇪🇺' },
    CNY: { name: 'Юань', sym: '¥', emoji: '🇨🇳' },
    GBP: { name: 'Фунт', sym: '£', emoji: '🇬🇧' },
    KZT: { name: 'Тенге', sym: '₸', emoji: '🇰🇿' }
};
const EX_SPREAD = 0.005; /* спред 0,5% — как в настоящих банках */

function walletAmount(cur) {
    if (cur === 'RUB') return state.balance || 0;
    return (state.wallet && state.wallet[cur]) || 0;
}
function walletKeys() { return ['RUB', ...Object.keys(state.wallet || {})]; }
function rateValue(code) {
    if (code === 'RUB') return 1;
    const r = state.rates && state.rates.items && state.rates.items[code];
    return r ? r.value : null;
}
function fmtNum(v, dec) {
    return Number(v).toLocaleString('ru-RU', { maximumFractionDigits: dec === undefined ? 2 : dec });
}
function fetchRates(then) {
    fetch(CB_URL, { cache: 'no-store' })
        .then(r => (r && r.ok) ? r.json() : Promise.reject('http'))
        .then(data => {
            const items = {}, v = (data && data.Valute) || {};
            Object.keys(CURRENCY_META).forEach(code => {
                if (code === 'RUB') return;
                const rec = v[code];
                if (rec && rec.Value) {
                    const nom = rec.Nominal || 1;
                    items[code] = { value: rec.Value / nom, prev: (rec.Previous || rec.Value) / nom };
                }
            });
            if (!Object.keys(items).length) throw new Error('empty');
            state.rates = { updated: Date.now(), items };
            saveToLocalStorage();
            if (state.prodTab === 'currency') renderProdContent();
            syncWidget();
            if (then) then();
        })
        .catch(e => { console.warn('[rates]', e); if (then) then(); });
}
function renderCurrencyHTML() {
    let html = '';
    html += `<div class="cur-head"><div class="flex-1"><p class="text-xs font-bold text-slate-400 uppercase">Курсы ЦБ РФ</p><p class="text-[11px] text-slate-400">${state.rates ? 'обновлено ' + new Date(state.rates.updated).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'курсы не загружены'}</p></div><button onclick="fetchRates()" class="cur-refresh"><i class="fa-solid fa-rotate"></i></button></div>`;
    const items = (state.rates && state.rates.items) || {};
    const codes = Object.keys(CURRENCY_META).filter(c => c !== 'RUB');
    if (state.rates) {
        codes.forEach(code => {
            const r = items[code]; if (!r) return;
            const m = CURRENCY_META[code];
            const ch = r.prev ? ((r.value - r.prev) / r.prev) * 100 : 0;
            const up = ch >= 0;
            html += `<div class="rate-row"><span class="rate-emoji">${m.emoji}</span><div class="flex-1"><p class="font-bold text-sm">${m.name}</p><p class="text-[10px] text-slate-400">1 ${code} = ${fmtNum(r.value)} ₽</p></div><span class="rate-chip ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(ch).toFixed(2).replace('.', ',')}%</span></div>`;
        });
    } else {
        html += '<div class="rate-row"><p class="text-center py-6 text-slate-300 text-sm flex-1">Загрузка курсов…</p></div>';
    }
    html += '<h3 class="text-xs font-bold text-slate-400 uppercase mt-6 mb-3 px-1">Мой кошелёк</h3>';
    walletKeys().forEach(code => {
        const m = CURRENCY_META[code] || { name: code, sym: '', emoji: '💱' };
        const amt = walletAmount(code);
        let sub = 'основной счёт';
        if (code !== 'RUB') {
            const r = rateValue(code);
            sub = '≈ ' + (r ? fmtNum(amt * r, 0) : '—') + ' ₽';
        }
        html += `<div class="wallet-cur"><span class="wc-sym">${m.emoji}</span><div class="flex-1"><p class="font-bold text-sm">${m.name}</p><p class="text-[10px] text-slate-400">${sub}</p></div><p class="font-black text-sm">${fmtNum(amt)} ${m.sym}</p></div>`;
    });
    html += '<button onclick="openExchange()" class="w-full mt-4 py-4 rounded-3xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg animate-press"><i class="fa-solid fa-right-left mr-2"></i>Обменять валюту</button>';
    html += '<p class="text-[10px] text-slate-400 text-center mt-3 px-2">Симулятор: обмен и курсы не являются реальной финансовой услугой.</p>';
    return html;
}
function openExchange() {
    const from = document.getElementById('ex-from'), to = document.getElementById('ex-to');
    const keys = walletKeys();
    from.innerHTML = keys.map(k => `<option value="${k}">${CURRENCY_META[k].emoji} ${k} — ${fmtNum(walletAmount(k))} ${CURRENCY_META[k].sym}</option>`).join('');
    to.innerHTML = keys.map(k => `<option value="${k}">${CURRENCY_META[k].emoji} ${k}</option>`).join('');
    from.value = keys.find(k => k !== 'RUB') || 'RUB';
    to.value = 'RUB';
    if (from.value === 'RUB') to.value = 'USD';
    document.getElementById('ex-amount').value = '';
    document.getElementById('ex-result').innerText = '—';
    document.getElementById('ex-rate-note').innerText = '';
    document.getElementById('modal-exchange').classList.remove('hidden');
    updateExchangePreview();
}
function exchangeRate(from, to) {
    const rf = rateValue(from), rt = rateValue(to);
    if (!rf || !rt) return null;
    return (rf / rt) * (1 - EX_SPREAD);
}
function updateExchangePreview() {
    const from = document.getElementById('ex-from').value, to = document.getElementById('ex-to').value;
    const amt = parseFloat(document.getElementById('ex-amount').value) || 0;
    const note = document.getElementById('ex-rate-note'), res = document.getElementById('ex-result');
    if (from === to) { res.innerText = '—'; note.innerText = 'Выберите разные валюты'; return; }
    const r = exchangeRate(from, to);
    if (r == null) { res.innerText = '—'; note.innerText = 'Курсы недоступны — нажмите «обновить»'; return; }
    res.innerText = fmtNum(amt * r) + ' ' + CURRENCY_META[to].sym;
    note.innerText = `Курс: 1 ${from} = ${r.toFixed(4).replace('.', ',')} ${to} (комиссия 0,5%)`;
}
function doExchange() {
    const from = document.getElementById('ex-from').value, to = document.getElementById('ex-to').value;
    const amt = parseFloat(document.getElementById('ex-amount').value) || 0;
    if (from === to) return showAlert('Выберите разные валюты');
    if (!(amt > 0)) return showAlert('Введите сумму');
    if (amt > walletAmount(from)) return showAlert('Недостаточно средств');
    const r = exchangeRate(from, to);
    if (r == null) return showAlert('Курсы недоступны');
    const out = amt * r;
    if (from === 'RUB') state.balance -= amt; else state.wallet[from] = +(walletAmount(from) - amt).toFixed(2);
    if (to === 'RUB') state.balance = +(state.balance + out).toFixed(2); else state.wallet[to] = +(walletAmount(to) + out).toFixed(2);
    closeModal('modal-exchange');
    const pair = `${fmtNum(amt)} ${CURRENCY_META[from].sym} → ${fmtNum(out)} ${CURRENCY_META[to].sym}`;
    if (from === 'RUB') addHistory('expense', `Обмен: ${pair}`, Math.round(amt));
    else if (to === 'RUB') addHistory('income', `Обмен: ${pair}`, Math.round(out));
    else addNotification(`Обмен: ${pair}`);
    pushNotify(`Обмен: ${pair}`);
    updateUI(); saveToLocalStorage(); renderProdContent();
    showAlert(`Получено: ${pair.split('→ ')[1]}`);
    vibrate(40);
}

/* ===================== ЦЕЛИ (кольца) НА ГЛАВНОЙ ===================== */
function renderMainGoals() {
    const el = document.getElementById('main-goals');
    if (!el) return;
    const list = (state.piggyBanks || []).slice(0, 4);
    if (!list.length) { el.innerHTML = ''; el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    let html = '<div class="goals-scroll">';
    list.forEach(p => {
        const pct = Math.min(100, Math.round((p.current / p.target) * 100));
        const C = 2 * Math.PI * 26;
        html += `<div class="goal-ring-card" onclick="openPiggyActions(${p.id})">
            <div class="ring-wrap">
                <svg width="68" height="68" viewBox="0 0 68 68">
                    <circle cx="34" cy="34" r="26" fill="none" stroke="#e2e8f0" stroke-width="8"/>
                    <circle cx="34" cy="34" r="26" fill="none" stroke="${p.color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 34 34)"/>
                </svg>
                <span class="ring-pct">${pct}%</span>
            </div>
            <div class="goal-info"><p class="goal-name">${p.name}</p><p class="goal-nums">${fmtNum(p.current, 0)} / ${fmtNum(p.target, 0)} ₽</p></div>
        </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
}

/* ===================== ВИДЖЕТ НА РАБОЧИЙ СТОЛ ===================== */
function syncWidget() {
    try {
        if (!(window.BFJson && typeof window.BFJson.widget === 'function')) return;
        const parts = [];
        const piggies = (state.piggyBanks || []).filter(p => !p.done && p.target > 0);
        if (piggies.length) parts.push('Цель ' + Math.min(100, Math.round((piggies[0].current / piggies[0].target) * 100)) + '%');
        const r = state.rates && state.rates.items;
        if (r && r.USD) parts.push('$ ' + fmtNum(r.USD.value));
        if (r && r.EUR) parts.push('€ ' + fmtNum(r.EUR.value));
        window.BFJson.widget(formatMoney(state.balance), parts.join(' · '));
    } catch (e) { /* мостика нет — веб-режим */ }
}

function renderStocksHTML() {
    initStocks();
    let html = '';
    const portfolio = state.portfolio || {};
    const totalPortfolio = Object.entries(portfolio).reduce((sum, [sym, shares]) => { const s = state.stocks.find(x => x.symbol === sym); return sum + (s ? s.price * shares : 0); }, 0);
    if (totalPortfolio > 0) html += `<div class="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-3xl p-5 mb-4"><p class="text-[10px] uppercase opacity-80 font-bold">Портфель</p><p class="text-3xl font-black mt-1">${totalPortfolio.toLocaleString()} ₽</p></div>`;
    state.stocks.forEach(s => {
        const shares = portfolio[s.symbol] || 0; const up = s.change >= 0;
        html += `<div class="stock-row" onclick="openStockTrade('${s.symbol}')"><div class="stock-icon" style="background:${s.color}"><i class="fa-solid ${s.icon}"></i></div><div class="flex-1"><p class="font-bold text-sm">${s.name}</p><p class="text-[10px] text-slate-400">${s.symbol} ${shares > 0 ? '· '+shares+' шт.' : ''}</p></div><div class="text-right"><p class="stock-price">${s.price.toLocaleString()} ₽</p><p class="stock-change ${up?'stock-up':'stock-down'}"><i class="fa-solid fa-${up?'arrow-up':'arrow-down'}"></i> ${Math.abs(s.change).toFixed(2)}%</p></div></div>`;
    });
    return html;
}
function openStockTrade(symbol) {
    const s = state.stocks.find(x => x.symbol === symbol); if (!s) return;
    const shares = (state.portfolio[symbol] || 0);
    askInput(`${s.name} — ${s.price.toLocaleString()} ₽\nУ вас: ${shares} шт.\nВведите количество (минус — продать)`, "", (val) => {
        const n = parseInt(val); if (isNaN(n) || n === 0) return showAlert("Неверно");
        if (n > 0) {
            const cost = n * s.price;
            if (state.balance < cost) return showAlert(MSG.insufficientFunds || "Недостаточно средств");
            state.balance -= cost; state.portfolio[symbol] = (state.portfolio[symbol] || 0) + n;
            addHistory('expense', `Покупка ${s.symbol} ×${n}`, cost);
            showAlert(`Куплено ${n} × ${s.price.toLocaleString()} ₽`);
        } else {
            const sell = Math.abs(n);
            if ((state.portfolio[symbol] || 0) < sell) return showAlert("Недостаточно акций");
            const income = sell * s.price; state.balance += income;
            state.portfolio[symbol] -= sell; if (state.portfolio[symbol] === 0) delete state.portfolio[symbol];
            addHistory('income', `Продажа ${s.symbol} ×${sell}`, income);
            showAlert(`Продано ${sell} × ${s.price.toLocaleString()} ₽`);
        }
        updateUI(); saveToLocalStorage(); renderProdContent();
    }, 'number');
}

/* ===================== TUTORIAL ===================== */
function buildTutorialSteps() {
    if (TUTORIAL_FINAL_STEPS) return TUTORIAL_FINAL_STEPS;
    const base = (TUTORIAL.steps || []).map(s => ({ ...s }));
    base.forEach(s => {
        if (s.target === '#header-avatar-container') s.custom = 'avatar';
    });
    const cardCreateStep = {
        tab: 'cards',
        target: '#cards-add-btn',
        icon: 'fa-plus',
        iconBg: 'linear-gradient(135deg, #10b981, #059669)',
        title: 'Создать новую карту',
        text: 'Нажмите «+», чтобы добавить карту. Введите имя владельца и выберите платёжную систему — карта появится мгновенно.',
        custom: 'card'
    };
    const idx = base.findIndex(s => s.target === '#active-card-3d');
    if (idx >= 0) base.splice(idx + 1, 0, cardCreateStep);
    else base.push(cardCreateStep);
    TUTORIAL_FINAL_STEPS = base;
    return base;
}
function startTutorial() {
    const steps = buildTutorialSteps();
    if (!steps.length) return;
    tutStep = 0; tutActive = true;
    document.querySelectorAll('.tut-spot, .tut-card').forEach(el => el.remove());
    renderTutStep();
}
function renderTutStep() {
    const steps = buildTutorialSteps();
    if (!tutActive || tutStep >= steps.length) return endTutorial();
    const step = steps[tutStep];
    if (step.tab) {
        const currentActive = document.querySelector('.tab-content.active');
        const targetTab = document.getElementById('tab-' + step.tab);
        if (targetTab && currentActive !== targetTab) {
            switchTabSilent(step.tab);
            setTimeout(() => positionTutStep(step), 350);
            return;
        }
    }
    positionTutStep(step);
}
function switchTabSilent(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + t).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active-nav'));
    document.querySelector(`[data-tab="${t}"]`)?.classList.add('active-nav');
    if (t === 'cards') renderCarousel();
    if (t === 'shop') renderShop();
    if (t === 'history' && chartVisible) drawExpensesChart();
    if (t === 'main') { renderWalletCards(); renderMainHistory(); }
    if (t === 'assistant' && window.BFA && typeof window.BFA.open === 'function') window.BFA.open();
    document.getElementById('main-scroll').scrollTop = 0;
}
function positionTutStep(step) {
    const steps = buildTutorialSteps();
    const target = document.querySelector(step.target);
    document.querySelectorAll('.tut-spot, .tut-card').forEach(el => el.remove());
    if (!target) { tutStep++; return renderTutStep(); }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        const r = target.getBoundingClientRect();
        const pad = 8;
        const spot = document.createElement('div');
        spot.className = 'tut-spot';
        spot.style.left = (r.left - pad) + 'px';
        spot.style.top = (r.top - pad) + 'px';
        spot.style.width = (r.width + pad*2) + 'px';
        spot.style.height = (r.height + pad*2) + 'px';
        document.body.appendChild(spot);

        const card = document.createElement('div');
        card.className = 'tut-card';
        const dots = steps.map((_, i) => `<div class="tut-dot ${i===tutStep?'on':''}"></div>`).join('');
        const isLast = tutStep === steps.length - 1;

        let bodyHTML = '';
        if (step.custom === 'avatar') bodyHTML = renderTutAvatarBody();
        else if (step.custom === 'card') bodyHTML = renderTutCardBody();
        else bodyHTML = `<div class="tut-text">${step.text}</div>`;

        card.innerHTML = `
            <div class="tut-icon" style="background:${step.iconBg}"><i class="fa-solid ${step.icon}"></i></div>
            <div class="tut-title">${step.title}</div>
            ${bodyHTML}
            <div class="tut-dots">${dots}</div>
            <div class="tut-actions">
              ${!isLast ? '<button class="tut-btn ghost" id="tutSkip">Пропустить</button>' : ''}
              <button class="tut-btn primary" id="tutNext">${isLast ? 'Завершить' : 'Далее'}</button>
            </div>
            <div class="tut-count">${tutStep + 1} / ${steps.length}</div>
        `;
        document.body.appendChild(card);
        const cw = card.offsetWidth, ch = card.offsetHeight;
        let top = r.bottom + 16;
        let left = r.left + r.width/2 - cw/2;
        if (top + ch > window.innerHeight - 16) top = r.top - ch - 16;
        if (top < 16) top = 16;
        left = Math.max(16, Math.min(window.innerWidth - cw - 16, left));
        card.style.top = top + 'px';
        card.style.left = left + 'px';

        if (step.custom === 'avatar') bindTutAvatarLogic();
        if (step.custom === 'card') bindTutCardLogic();

        document.getElementById('tutNext').onclick = () => { tutStep++; renderTutStep(); };
        const skip = document.getElementById('tutSkip');
        if (skip) skip.onclick = endTutorial;
    }, 400);
}
function renderTutAvatarBody() {
    const currentName = state.name || '';
    const avatarHTML = state.avatar
        ? `<img id="tut-avatar-img" src="${state.avatar}" alt="">`
        : `<i class="fa-solid fa-user"></i>`;
    let gridHTML = '';
    AVATAR_SEEDS.slice(0, 5).forEach(seed => {
        gridHTML += `<div class="tut-avatar-item" data-url="${getAvatarUrl(seed)}"><img src="${getAvatarUrl(seed)}" alt=""></div>`;
    });
    const steps = buildTutorialSteps();
    const step = steps[tutStep] || {};
    return `
        <div class="tut-avatar-preview" id="tut-avatar-preview">${avatarHTML}</div>
        <input type="text" class="tut-input" id="tut-name-input" placeholder="Ваше имя" value="${currentName}">
        <div class="tut-avatar-grid" id="tut-avatar-grid">${gridHTML}</div>
        <button class="tut-upload-btn" id="tut-upload-btn"><i class="fa-solid fa-camera"></i> Загрузить своё фото</button>
        <div class="tut-text" style="margin-bottom:14px;">${step.text || ''}</div>
    `;
}
function bindTutAvatarLogic() {
    const preview = document.getElementById('tut-avatar-preview');
    document.querySelectorAll('#tut-avatar-img, .tut-avatar-item img').forEach(attachAvatarFallback);
    const grid = document.getElementById('tut-avatar-grid');
    const nameInput = document.getElementById('tut-name-input');
    const uploadBtn = document.getElementById('tut-upload-btn');

    grid.querySelectorAll('.tut-avatar-item').forEach(el => {
        el.onclick = () => {
            const url = el.dataset.url;
            grid.querySelectorAll('.tut-avatar-item').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
            preview.innerHTML = `<img src="${url}" alt="">`;
            applyAvatar(url);
            vibrate(30);
        };
    });
    uploadBtn.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = e => {
            const f = e.target.files[0]; if (!f) return;
            if (f.size > 3 * 1024 * 1024) { showAlert("Максимум 3 МБ"); return; }
            const fr = new FileReader();
            fr.onload = ev => {
                preview.innerHTML = `<img src="${ev.target.result}" alt="">`;
                applyAvatar(ev.target.result);
                grid.querySelectorAll('.tut-avatar-item').forEach(x => x.classList.remove('selected'));
                showAlert("Аватар загружен!");
            };
            fr.readAsDataURL(f);
        };
        inp.click();
    };
    nameInput.oninput = () => {
        const val = nameInput.value.trim();
        if (val) { state.name = val; updateUI(); saveToLocalStorage(); }
    };
}
function renderTutCardBody() {
    const steps = buildTutorialSteps();
    const step = steps[tutStep] || {};
    return `
        <div class="tut-text">${step.text || ''}</div>
        <input type="text" class="tut-input" id="tut-card-holder" placeholder="Имя владельца карты" value="${state.name || ''}">
        <div class="tut-card-grid" id="tut-card-grid">
            <button type="button" class="tut-card-option" data-type="Visa">
                <i class="fa-brands fa-cc-visa" style="color:#1a1f71"></i>
                <span>Visa</span>
            </button>
            <button type="button" class="tut-card-option" data-type="MasterCard">
                <i class="fa-brands fa-cc-mastercard" style="color:#eb001b"></i>
                <span>MasterCard</span>
            </button>
            <button type="button" class="tut-card-option" data-type="PayPal">
                <i class="fa-brands fa-cc-paypal" style="color:#0070ba"></i>
                <span>PayPal</span>
            </button>
        </div>
    `;
}
function bindTutCardLogic() {
    const grid = document.getElementById('tut-card-grid');
    grid.querySelectorAll('.tut-card-option').forEach(btn => {
        btn.onclick = () => {
            grid.querySelectorAll('.tut-card-option').forEach(x => x.classList.remove('selected'));
            btn.classList.add('selected');
            vibrate(20);
        };
    });
    const originalNext = document.getElementById('tutNext');
    const newNext = originalNext.cloneNode(true);
    originalNext.parentNode.replaceChild(newNext, originalNext);
    newNext.onclick = () => {
        const selected = grid.querySelector('.tut-card-option.selected');
        const holderInput = document.getElementById('tut-card-holder');
        const holder = (holderInput.value || '').trim().toUpperCase();
        if (selected) {
            const type = selected.dataset.type;
            createCardInternal(type, false, holder || 'CARD HOLDER');
        }
        tutStep++;
        renderTutStep();
    };
}
function endTutorial() {
    tutActive = false;
    document.querySelectorAll('.tut-spot, .tut-card').forEach(el => el.remove());
    state.hasSeenTutorial = true;
    saveToLocalStorage();
}

/* ===================== PRO ===================== */
const PRO_BADGE_HTML = '<span class="pro-badge"><i class="fa-solid fa-crown"></i>PRO</span>';
function updateProUI() {
    const pb1 = document.getElementById('pro-badge-main');
    const pb2 = document.getElementById('pro-badge-profile');
    if (pb1) { pb1.innerHTML = state.hasPro ? PRO_BADGE_HTML : ''; pb1.className = state.hasPro ? '' : 'hidden'; }
    if (pb2) { pb2.innerHTML = state.hasPro ? PRO_BADGE_HTML : ''; pb2.className = state.hasPro ? '' : 'hidden'; }
    ['header-avatar-container', 'profile-avatar-wrapper'].forEach(id => { const el = document.getElementById(id); if (!el) return; state.hasPro ? el.classList.add('avatar-pro') : el.classList.remove('avatar-pro'); });
    renderProBlock();
}
function renderProBlock() {
    const container = document.getElementById('pro-block-container'); if (!container) return;
    const proPrice = D.proPrice || 1000;
    if (state.hasPro) {
        container.innerHTML = `<div class="pro-block active"><div class="pro-block-header"><div class="pro-block-title"><i class="fa-solid fa-crown"></i>BankFake Pro</div><i class="fa-solid fa-circle-check text-2xl"></i></div><div class="pro-block-desc">Подписка активна.</div><div class="pro-block-features"><span class="pro-feature-chip"><i class="fa-solid fa-check"></i>0% комиссия</span><span class="pro-feature-chip"><i class="fa-solid fa-check"></i>Лимиты</span></div><button class="pro-block-btn">✓ Активна</button></div>`;
    } else {
        container.innerHTML = `<div class="pro-block"><div class="pro-block-header"><div class="pro-block-title"><i class="fa-solid fa-crown"></i>BankFake Pro</div><span class="text-xs opacity-80 font-bold">${proPrice} баллов</span></div><div class="pro-block-desc">0% комиссия, безлимитная зарплата и переводы!</div><div class="pro-block-features"><span class="pro-feature-chip"><i class="fa-solid fa-bolt"></i>0% комиссия</span><span class="pro-feature-chip"><i class="fa-solid fa-infinity"></i>Безлимиты</span></div><button class="pro-block-btn" onclick="buyPro()">Активировать за ${proPrice} баллов</button></div>`;
    }
}
function buyPro() {
    const proPrice = D.proPrice || 1000;
    if (state.hasPro) return showAlert(MSG.proAlready || "Pro уже активирован");
    if (state.points < proPrice) return showAlert(MSG.notEnoughPoints || "Недостаточно баллов");
    askConfirm('Активировать BankFake Pro?', `Списать ${proPrice} баллов.`, () => {
        state.points -= proPrice; state.hasPro = true;
        state.salaryLimit = Infinity; state.topupLimit = Infinity;
        state.salaryTier = 3; state.topupTier = 3;
        updateUI(); saveToLocalStorage();
        pushNotify("BankFake Pro активирован! 🎉");
        vibrate([80, 50, 80]);
        showAlert(MSG.proActivated || "🎉 Pro активирован!");
    }, 'primary');
}
function getCommission(amount) { return state.hasPro ? 0 : Math.max(Math.round(amount * (D.commissionRate || 0.01)), 0); }

/* ===================== ХРАНИЛИЩЕ: JSON-файл (Android) / localStorage (веб) ===== */
function nativeStore() { return (typeof window !== 'undefined' && window.BFJson) ? window.BFJson : null; }
let _nativeLoaded = false, _nativeData = {};
function nativeData() {
    const ns = nativeStore();
    if (!ns) return null;
    if (!_nativeLoaded) {
        try { _nativeData = JSON.parse(ns.load() || '{}') || {}; } catch (e) { console.error('[native load]', e); _nativeData = {}; }
        _nativeLoaded = true;
    }
    return _nativeData;
}
function storeGet(key) {
    const nd = nativeData();
    if (nd && nd[key] != null) return nd[key];
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { console.error('[storeSet ls]', e); }
    const nd = nativeData();
    if (nd) { try { nd[key] = value; nativeStore().save(JSON.stringify(nd)); } catch (e) { console.error('[storeSet json]', e); } }
}
function storeClearAll() {
    try { localStorage.clear(); } catch (e) {}
    const ns = nativeStore();
    if (ns) { try { ns.save('{}'); } catch (e) {} }
    _nativeData = {}; _nativeLoaded = true;
}

/* ===================== СОХРАНЕНИЕ ===================== */
function saveToLocalStorage() {
    if (isResetting) return;
    try {
        const snapshot = JSON.parse(JSON.stringify(state, (k, v) => {
            if (v === Infinity) return -1;
            if (v === -Infinity) return -2;
            return v;
        }));
        storeSet(STORAGE_KEY, JSON.stringify(snapshot));
    } catch(e) {
        console.error('[saveToLocalStorage]', e);
    }
}
function loadFromLocalStorage() {
    const saved = storeGet(STORAGE_KEY);
    if (saved) {
        try {
            Object.assign(state, JSON.parse(saved));
            if (!Array.isArray(state.ownedDesigns)) state.ownedDesigns = [...CARD_THEMES];
            if (!state.shopItems) state.shopItems = {};
            if (state.hasPro === undefined) state.hasPro = false;
            if (!state.deposits) state.deposits = [];
            if (!state.piggyBanks) state.piggyBanks = [];
            if (!state.portfolio) state.portfolio = {};
            if (!state.stocks) state.stocks = [];
            if (state.hasAcceptedConsent === undefined) state.hasAcceptedConsent = false;
            if (state.pushEnabled === undefined) state.pushEnabled = true;
            if (state.vibrateEnabled === undefined) state.vibrateEnabled = true;
            if (state.topupLimit === -1) state.topupLimit = Infinity;
            if (state.salaryLimit === -1) state.salaryLimit = Infinity;
            if (state.topupLimit === null) state.topupLimit = Infinity;
            if (state.salaryLimit === null) state.salaryLimit = Infinity;
            if (state.topupLimit === undefined) state.topupLimit = D.topupLimit || 10000;
            if (state.salaryLimit === undefined) state.salaryLimit = D.salaryLimit || 5000;
        } catch(e){ console.error('[loadFromLocalStorage]', e); }
        if (state.avatar) {
            document.querySelectorAll('#user-avatar-main, #user-avatar-profile, #user-avatar-preview').forEach(img => { if (img) { img.src = state.avatar; attachAvatarFallback(img); img.classList.remove('hidden'); } });
            document.querySelectorAll('#user-icon-placeholder, #user-icon-placeholder-2, #profile-avatar-initials').forEach(el => el && el.classList.add('hidden'));
        }
    }
    if (!state.cards || state.cards.length === 0) createCardInternal("Visa", true, "MIKHAIL USER");
    if (state.darkTheme) document.body.classList.add('dark');
    initStocks();
}
function addNotification(text) {
    state.notifications.unshift({id:Date.now(),text,time:"Сейчас"});
    document.getElementById('notif-dot')?.classList.remove('hidden');
    updateUI(); saveToLocalStorage();
}
function addHistory(type, title, amount) {
    state.history.unshift({type,title,amount,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),ts:Date.now()});
    updateUI(); saveToLocalStorage();
    if (chartVisible) drawExpensesChart();
}
function calculatePoints(amount, rate) {
    const r = (typeof rate === 'number') ? rate : 0.05;
    const base = Math.floor(amount * r);
    return state.hasSubscription ? base * 2 : base;
}
function showAlert(msg) {
    const t = document.getElementById('alert-toast'); if (!t) return;
    t.innerText = msg; t.classList.remove('hidden');
    clearTimeout(window._alertTimer);
    window._alertTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}
function askInput(title, defaultValue, cb, type = 'text') {
    document.getElementById('input-title').innerText = title;
    const inp = document.getElementById('input-value');
    inp.value = defaultValue || ''; inp.type = type;
    inputCallback = cb;
    document.getElementById('modal-input').classList.remove('hidden');
    setTimeout(() => inp.focus(), 100);
}
function submitInputModal() {
    const val = document.getElementById('input-value').value;
    if (inputCallback) inputCallback(val);
    inputCallback = null; closeModal('modal-input');
}
function askConfirm(title, text, cb, danger = 'danger') {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-text').innerText = text;
    const btn = document.getElementById('confirm-action-btn');
    const icon = document.getElementById('confirm-icon');
    btn.className = danger === 'danger' ? 'btn-danger' : 'btn-primary';
    icon.style.background = danger === 'danger' ? '#fee2e2' : '#dbeafe';
    icon.style.color = danger === 'danger' ? '#ef4444' : '#3b82f6';
    icon.innerHTML = danger === 'danger' ? '<i class="fa-solid fa-trash-can"></i>' : '<i class="fa-solid fa-circle-question"></i>';
    confirmCallback = cb;
    document.getElementById('modal-confirm').classList.remove('hidden');
}
document.getElementById('confirm-action-btn')?.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    confirmCallback = null; closeModal('modal-confirm');
});

/* ===================== КАРТЫ ===================== */
function createCardInternal(type, silent = false, customHolder = null) {
    let holder = customHolder;
    if (!holder) {
        const inp = document.getElementById('new-card-holder');
        holder = inp ? inp.value.trim().toUpperCase() : "";
        if (!holder) holder = "CARD HOLDER";
    }
    const m = String(Math.floor(Math.random()*12)+1).padStart(2,'0');
    const y = String(25 + Math.floor(Math.random()*5)).slice(-2);
    const cvv = String(Math.floor(Math.random()*900)+100);
    const shortNum = Math.floor(1000 + Math.random()*9000);
    const fullNumber = `4532 ${shortNum} 1122 ${Math.floor(1000 + Math.random()*9000)}`;
    const newCard = { id: Date.now(), type, number: shortNum, balance: 0, holder, expiry: `${m}/${y}`, cvv, fullNumber, isGold: false, theme: 'blue', blocked: false, customImage: null };
    state.cards.push(newCard);
    if (!silent) {
        if (document.getElementById('new-card-holder')) document.getElementById('new-card-holder').value = '';
        updateUI(); saveToLocalStorage();
        showAlert(`Карта ${type} добавлена!`);
        vibrate(40);
        currentCardIndex = state.cards.length - 1; renderCarousel();
    }
    return newCard;
}
function createCardWithHolder(type) { createCardInternal(type, false); closeModal('modal-add-card'); }
function promptTopupCard() {
    if (!state.cards.length) return;
    const limitText = state.topupLimit === Infinity ? '∞' : state.topupLimit.toLocaleString() + ' ₽';
    const showLimit = !state.hasPro;
    askInput(showLimit ? `Сумма пополнения (макс. ${limitText})` : 'Сумма пополнения', "", (val) => {
        const n = parseFloat(val);
        if (isNaN(n) || n <= 0) return showAlert(MSG.invalidSum || "Неверная сумма");
        if (showLimit && n > state.topupLimit) return showAlert(`Лимит: ${limitText}`);
        state.cards[currentCardIndex].balance += n;
        const pts = calculatePoints(n, D.pointsRates?.topup || 0.01);
        if (pts > 0) state.points += pts;
        addHistory('income', `Пополнение карты ${state.cards[currentCardIndex].type}`, n);
        updateUI(); saveToLocalStorage();
        pushNotify(`Пополнение: +${n.toLocaleString('ru-RU')} ₽`);
        vibrate([50, 30, 50]);
        showAlert(pts > 0 ? `+${n} ₽ · +${pts} баллов` : `+${n} ₽`);
    }, 'number');
}
function toggleCardBlock() {
    if (!state.cards.length) return;
    const c = state.cards[currentCardIndex]; c.blocked = !c.blocked;
    saveToLocalStorage(); renderCarousel();
    vibrate(40);
    showAlert(c.blocked ? "Карта заблокирована" : "Карта разблокирована");
}
function confirmDeleteCard() {
    if (!state.cards.length) return;
    if (state.cards.length <= 1) return showAlert(MSG.lastCardError || "Нельзя удалить единственную карту");
    const c = state.cards[currentCardIndex];
    pendingDeleteCardId = c.id;
    askConfirm("Удалить карту?", `Карта «${c.type}» будет удалена.`, () => {
        state.cards = state.cards.filter(x => x.id !== pendingDeleteCardId);
        if (currentCardIndex >= state.cards.length) currentCardIndex = Math.max(0, state.cards.length - 1);
        if (state.paymentCardId == pendingDeleteCardId) state.paymentCardId = 'balance';
        if (state.salaryCardId == pendingDeleteCardId) state.salaryCardId = 'balance';
        saveToLocalStorage(); updateUI(); renderCarousel();
        showAlert(MSG.cardDeleted || "Карта удалена");
        pendingDeleteCardId = null;
    });
}
function openCardDesign() {
    if (!state.cards.length) return;
    selectedDesign = state.cards[currentCardIndex].theme || 'blue';
    document.querySelectorAll('#design-grid [data-theme]').forEach(el => {
        const isActive = el.dataset.theme === selectedDesign;
        el.style.borderColor = isActive ? '#2563eb' : 'transparent';
        el.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
        if (el.dataset.theme === 'gold' && !state.ownedDesigns.includes('gold')) el.style.opacity = '0.4'; else el.style.opacity = '1';
    });
    updateDesignModal();
    document.getElementById('modal-design').classList.remove('hidden');
}
function selectDesign(theme) {
    if (theme === 'gold' && !state.ownedDesigns.includes('gold')) return showAlert("Купите золотой дизайн в магазине");
    selectedDesign = theme;
    document.querySelectorAll('#design-grid [data-theme]').forEach(el => {
        const isActive = el.dataset.theme === theme;
        el.style.borderColor = isActive ? '#2563eb' : 'transparent';
        el.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
    });
}
function saveCardDesign() {
    if (!state.cards.length) return;
    state.cards[currentCardIndex].theme = selectedDesign;
    saveToLocalStorage(); renderCarousel();
    closeModal('modal-design');
    showAlert(MSG.designSaved || "Дизайн сохранён");
}
function updateDesignModal() {
    const removeBtn = document.getElementById('remove-image-btn'); if (!removeBtn) return;
    const has = state.cards.length && state.cards[currentCardIndex] && state.cards[currentCardIndex].customImage;
    removeBtn.classList.toggle('hidden', !has);
}
function uploadCardImage() {
    if (!state.cards.length) return;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        if (f.size > 3 * 1024 * 1024) { showAlert("Максимум 3 МБ"); return; }
        const fr = new FileReader();
        fr.onload = ev => {
            state.cards[currentCardIndex].customImage = ev.target.result;
            saveToLocalStorage(); renderCarousel(); closeModal('modal-design');
            showAlert("Своя картинка загружена!");
        };
        fr.readAsDataURL(f);
    };
    inp.click();
}
function removeCardImage() {
    if (!state.cards.length) return;
    if (!state.cards[currentCardIndex].customImage) return;
    state.cards[currentCardIndex].customImage = null;
    saveToLocalStorage(); renderCarousel(); showAlert("Картинка убрана");
}
function bind3DRotation(el) {
    if (!el) return;
    const onMove = (e) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        let ry = ((rect.width/2 - x) / rect.width * 2) * 20;
        let rx = ((rect.height/2 - y) / rect.height * 2) * 20;
        ry = Math.min(Math.max(ry, -25), 25); rx = Math.min(Math.max(rx, -25), 25);
        el.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
    };
    const onLeave = () => { el.style.transform = 'rotateY(0deg) rotateX(2deg)'; };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onLeave);
}
function renderCarousel(animate = false) {
    const container = document.getElementById('active-card-3d');
    if (!container) return;
    if (!state.cards.length) { container.innerHTML = '<div class="p-5 bg-gray-700 rounded-3xl text-white text-center">Нет карт</div>'; return; }
    if (currentCardIndex >= state.cards.length) currentCardIndex = state.cards.length - 1;
    const card = state.cards[currentCardIndex];
    const theme = card.theme || 'blue';
    const hasCustom = !!card.customImage;
    const bgClass = hasCustom ? '' : (card.isGold ? 'card-theme-gold' : `card-theme-${theme}`);
    const frontBgStyle = hasCustom ? `background-image: url(${card.customImage}); background-size: cover; background-position: center;` : '';
    const brandIcon = card.isGold ? 'fa-gem' : (card.type === 'PayPal' ? 'fa-cc-paypal' : (card.type === 'MasterCard' ? 'fa-cc-mastercard' : 'fa-cc-visa'));
    const html = `<div class="${bgClass} card-inner" style="position:relative; ${frontBgStyle}">${hasCustom ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.35);border-radius:28px;"></div>' : ''}${card.blocked ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);border-radius:28px;display:flex;align-items:center;justify-content:center;font-size:40px;color:white;z-index:5;"><i class="fa-solid fa-lock"></i></div>' : ''}<div style="position:relative;z-index:1;"><div class="card-brand"><i class="fa-brands ${brandIcon} text-3xl"></i></div><div class="card-number">${card.fullNumber}</div><div class="card-details"><div><div class="text-[8px] opacity-70">CARD HOLDER</div><div class="font-bold text-sm">${card.holder}</div></div><div class="text-right"><div class="text-[8px] opacity-70">VALID THRU</div><div class="font-bold text-sm">${card.expiry}</div></div></div></div></div>`;
    if (animate) {
        container.classList.add('switching');
        setTimeout(() => { container.innerHTML = html; bind3DRotation(container.firstElementChild); container.classList.remove('switching'); }, 180);
    } else { container.innerHTML = html; bind3DRotation(container.firstElementChild); }
    const dcn = document.getElementById('details-card-number'); if (dcn) dcn.innerText = card.fullNumber;
    const dcv = document.getElementById('details-cvv'); if (dcv) dcv.innerText = state.cvvVisible ? card.cvv : '•••';
    const dh = document.getElementById('details-holder'); if (dh) dh.innerText = card.holder;
    const de = document.getElementById('details-expiry'); if (de) de.innerText = card.expiry;
    const db = document.getElementById('details-balance'); if (db) db.innerText = card.isGold ? '∞' : card.balance.toLocaleString();
    const dtl = document.getElementById('details-topup-limit'); if (dtl) dtl.innerText = formatLimit(state.topupLimit);
    const dots = document.getElementById('card-dots'); if (!dots) return;
    dots.innerHTML = '';
    state.cards.forEach((_, i) => {
        const d = document.createElement('div');
        d.className = `dot-indicator ${i === currentCardIndex ? 'active' : ''}`;
        d.onclick = () => { currentCardIndex = i; renderCarousel(true); };
        dots.appendChild(d);
    });
}
function prevCard() { if (state.cards.length) currentCardIndex = (currentCardIndex - 1 + state.cards.length) % state.cards.length; renderCarousel(true); }
function nextCard() { if (state.cards.length) currentCardIndex = (currentCardIndex + 1) % state.cards.length; renderCarousel(true); }
function toggleCVV() { state.cvvVisible = !state.cvvVisible; renderCarousel(); }

function deduct(id, am) {
    if (am <= 0) return false;
    if (id === 'balance') {
        if (state.balance >= am) { state.balance -= am; saveToLocalStorage(); return true; }
    } else {
        const c = state.cards.find(x => x.id == id);
        if (c) {
            if (c.isGold) return true;
            if (c.blocked) { showAlert(MSG.cardBlocked || "Карта заблокирована"); return false; }
            if (c.balance >= am) { c.balance -= am; saveToLocalStorage(); return true; }
        }
    }
    return false;
}
function getValidAmount(id) {
    const v = parseFloat(document.getElementById(id).value);
    if (isNaN(v) || v <= 0) { showAlert(MSG.invalidAmount || 'Сумма > 0'); return null; }
    return v;
}
function populateCardSelect(id) {
    const sel = document.getElementById(id); if (!sel) return;
    sel.innerHTML = '<option value="balance">Основной баланс</option>';
    state.cards.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.type} ****${c.number} (${c.holder})</option>`);
}

/* ===================== BF-PAY ===================== */
function openBFPay() {
    document.getElementById('bf-am').value = '';
    document.querySelectorAll('.bf-cat').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.bf-cat').forEach(el => { if (el.dataset.cat === state.selectedBFCat) el.classList.add('selected'); });
    const sel = document.getElementById('bfpay-card');
    sel.innerHTML = '<option value="balance">Основной баланс</option>';
    state.cards.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.type} ****${c.number}</option>`);
    sel.value = state.paymentCardId || 'balance';
    bfpaySelectedCard = sel.value;
    document.getElementById('bfpay-step1').classList.remove('hidden');
    document.getElementById('bfpay-step2').classList.add('hidden');
    updateBFPayPreview();
    document.getElementById('modal-bfpay').classList.remove('hidden');
}
function closeBFPay() { closeModal('modal-bfpay'); }
function setBFAmount(v) { document.getElementById('bf-am').value = v; updateBFPayPreview(); }
function updateBFPayPreview() {
    const am = parseFloat(document.getElementById('bf-am').value) || 0;
    document.getElementById('bfpay-amount-preview').innerText = formatMoney(am);
    document.getElementById('bfpay-cashback-preview').innerText = `+${calculatePoints(am, D.pointsRates?.bfpay || 0.05)} баллов`;
}
function selectBFCategory(name, e) {
    state.selectedBFCat = name; saveToLocalStorage();
    document.querySelectorAll('.bf-cat').forEach(b => b.classList.remove('selected'));
    if (e && e.currentTarget) e.currentTarget.classList.add('selected');
}
function bfpayStep2() {
    const am = parseFloat(document.getElementById('bf-am').value);
    if (!am || am <= 0) return showAlert("Введите сумму");
    if (!state.selectedBFCat) return showAlert("Выберите категорию");
    document.getElementById('bfpay-cat-preview').innerText = state.selectedBFCat;
    bfpaySelectedCard = document.getElementById('bfpay-card').value;
    let cardName = 'Основной баланс';
    if (bfpaySelectedCard !== 'balance') { const c = state.cards.find(x => x.id == bfpaySelectedCard); if (c) cardName = `${c.type} ****${c.number}`; }
    document.getElementById('bfpay-card-preview').innerText = cardName;
    document.getElementById('bfpay-cashback-preview').innerText = `+${calculatePoints(am, D.pointsRates?.bfpay || 0.05)} баллов`;
    document.getElementById('bfpay-amount-preview').innerText = formatMoney(am);
    document.getElementById('bfpay-step1').classList.add('hidden');
    document.getElementById('bfpay-step2').classList.remove('hidden');
}
function bfpayBack() { document.getElementById('bfpay-step2').classList.add('hidden'); document.getElementById('bfpay-step1').classList.remove('hidden'); }
function confirmBFPay() {
    const am = parseFloat(document.getElementById('bf-am').value);
    if (!am || am <= 0) return showAlert("Введите сумму");
    const cardId = bfpaySelectedCard || document.getElementById('bfpay-card').value;
    if (deduct(cardId, am)) {
        const pts = calculatePoints(am, D.pointsRates?.bfpay || 0.05);
        state.points += pts;
        addHistory('expense', `BF-Pay: ${state.selectedBFCat}`, am);
        closeBFPay();
        showTransferSuccess(am, 0, `BF-Pay · ${state.selectedBFCat}`);
    } else showAlert(MSG.insufficientFunds || "Недостаточно средств");
}
function showTransferSuccess(amount, commission, recipientName) {
    document.getElementById('ts-amount').innerText = formatMoney(amount);
    document.getElementById('ts-commission').innerText = formatMoney(commission);
    document.getElementById('ts-recipient').innerText = recipientName;
    document.getElementById('transfer-success').classList.remove('hidden');
    vibrate([60, 40, 60]);
    pushNotify(`${recipientName} · ${formatMoney(amount)}`);
}
function showTransferReceipt() { document.getElementById('transfer-success').classList.add('hidden'); if (state.history.length) openReceipt(0); }
function goToHistoryFromSuccess() { document.getElementById('transfer-success').classList.add('hidden'); switchTab('history'); }

/* ===================== ОПЛАТЫ ===================== */
function confirmForeignTransfer() {
    const am = getValidAmount('foreign-am'); if (am === null) return;
    const card = document.getElementById('foreign-card').value;
    if (!state.selectedCountry) return showAlert("Выберите страну");
    const commission = getCommission(am);
    if (deduct(card, am + commission)) {
        const pts = calculatePoints(am, D.pointsRates?.foreign || 0.05); state.points += pts;
        addHistory('expense', `Перевод в ${state.selectedCountry}`, am);
        document.getElementById('foreign-am').value = '';
        closeModal('modal-foreign');
        showTransferSuccess(am, commission, `Перевод в ${state.selectedCountry}`);
    } else showAlert(MSG.insufficientFunds || "Недостаточно средств");
}
function confirmJKH() {
    const am = getValidAmount('jkh-am'); if (am === null) return;
    if (!state.selectedJKH) return showAlert("Выберите ЖКХ");
    if (deduct(state.paymentCardId, am)) {
        const pts = calculatePoints(am, D.pointsRates?.jkh || 0.03); state.points += pts;
        addHistory('expense', `ЖКХ: ${state.selectedJKH}`, am);
        document.getElementById('jkh-am').value = ''; closeModal('modal-jkh');
        showTransferSuccess(am, 0, `ЖКХ · ${state.selectedJKH}`);
    } else showAlert(MSG.insufficientFunds || "Недостаточно");
}
function confirmMobilePay() {
    const am = getValidAmount('mob-am'); if (am === null) return;
    const ph = document.getElementById('mob-phone').value.trim();
    if (!ph) return showAlert("Введите номер");
    if (deduct(state.paymentCardId, am)) {
        const pts = calculatePoints(am, D.pointsRates?.mobile || 0.03); state.points += pts;
        addHistory('expense', `Мобильная связь (${ph})`, am);
        document.getElementById('mob-am').value = ''; closeModal('modal-mobile');
        showTransferSuccess(am, 0, `МТС · ${ph}`);
    } else showAlert("Ошибка");
}
function confirmServicePay() {
    const am = parseFloat(document.getElementById('service-am').value);
    if (!am || am <= 0) return showAlert(MSG.invalidAmount || "Введите сумму");
    const cardId = document.getElementById('service-card').value;
    const svc = SERVICES[currentService];
    if (!svc || !currentServiceProvider) return showAlert("Выберите провайдера");
    if (deduct(cardId, am)) {
        const pts = calculatePoints(am, D.pointsRates?.service || 0.03);
        state.points += pts;
        addHistory('expense', `${svc.title}: ${currentServiceProvider}`, am);
        closeModal('modal-service');
        showTransferSuccess(am, 0, `${svc.title} · ${currentServiceProvider}`);
    } else showAlert(MSG.insufficientFunds || "Недостаточно средств");
}
let curTarget = null;
function openTransfer(idx) {
    curTarget = state.contacts[idx];
    document.getElementById('tr-name').innerText = curTarget.name;
    document.getElementById('tr-avatar').innerText = curTarget.name[0];
    populateCardSelect('tr-card');
    document.getElementById('tr-am').value = '';
    updateTransferCommission();
    document.getElementById('tr-am').oninput = updateTransferCommission;
    document.getElementById('modal-transfer').classList.remove('hidden');
}
function updateTransferCommission() {
    const am = parseFloat(document.getElementById('tr-am').value) || 0;
    const comm = getCommission(am);
    document.getElementById('tr-commission').innerText = formatMoney(comm);
    document.getElementById('tr-total').innerText = formatMoney(am + comm);
}
function confirmTransfer() {
    const am = getValidAmount('tr-am'); if (am === null) return;
    const card = document.getElementById('tr-card').value;
    const commission = getCommission(am);
    if (deduct(card, am + commission)) {
        const pts = calculatePoints(am, D.pointsRates?.transfer || 0.05); state.points += pts;
        addHistory('expense', `Перевод ${curTarget.name}`, am);
        closeModal('modal-transfer');
        showTransferSuccess(am, commission, curTarget.name);
    } else showAlert("Не хватает средств");
}
function openTransferBetweenCards() {
    if (state.cards.length < 2) return showAlert("Нужно ≥2 карты");
    populateCardSelect('transfer-from-card'); populateCardSelect('transfer-to-card');
    document.getElementById('modal-card-transfer').classList.remove('hidden');
}
function confirmCardTransfer() {
    const fromId = document.getElementById('transfer-from-card').value;
    const toId = document.getElementById('transfer-to-card').value;
    const am = getValidAmount('transfer-amount'); if (am === null) return;
    if (fromId === toId) return showAlert("Выберите разные карты");
    const fromCard = fromId === 'balance' ? null : state.cards.find(c => c.id == fromId);
    const toCard = toId === 'balance' ? null : state.cards.find(c => c.id == toId);
    const ok = fromId === 'balance' ? state.balance >= am : (fromCard && fromCard.balance >= am && !fromCard.blocked);
    if (!ok) return showAlert(MSG.insufficientFunds || "Недостаточно");
    if (fromId === 'balance') state.balance -= am; else fromCard.balance -= am;
    if (toId === 'balance') state.balance += am; else toCard.balance += am;
    addHistory('expense', 'Перевод между счетами', am);
    addHistory('income', 'Зачисление', am);
    document.getElementById('transfer-amount').value = '';
    closeModal('modal-card-transfer');
    updateUI();
}

/* ===================== КРЕДИТ ===================== */
function openCredit() {
    document.getElementById('credit-am').value = '';
    updateCreditCalc();
    document.getElementById('modal-credit').classList.remove('hidden');
}
document.getElementById('credit-am')?.addEventListener('input', updateCreditCalc);
document.getElementById('credit-term')?.addEventListener('change', updateCreditCalc);
function updateCreditCalc() {
    const am = parseFloat(document.getElementById('credit-am').value) || 0;
    const term = parseInt(document.getElementById('credit-term').value) || 12;
    const rate = (CREDIT.rates[term] && CREDIT.rates[term].rate) || 0.129;
    const totalPay = am * (1 + rate * (term / 12));
    const monthly = am > 0 ? totalPay / term : 0;
    document.getElementById('credit-monthly').innerText = formatMoney(Math.round(monthly));
    document.getElementById('credit-overpay').innerText = formatMoney(Math.round(totalPay - am));
}
function confirmCredit() {
    const am = parseFloat(document.getElementById('credit-am').value);
    const maxA = CREDIT.maxAmount || 1000000;
    if (!am || am <= 0) return showAlert("Введите сумму");
    if (am > maxA) return showAlert(`Максимум ${maxA.toLocaleString()} ₽`);
    const term = parseInt(document.getElementById('credit-term').value);
    const rate = (CREDIT.rates[term] && CREDIT.rates[term].rate) || 0.129;
    const totalPay = am * (1 + rate * (term / 12));
    const monthly = totalPay / term;
    askConfirm('Оформить кредит?', `${formatMoney(am)} на ${term} мес.`, () => {
        state.balance += am;
        state.credits.push({ amount: am, term, monthly: Math.round(monthly), total: Math.round(totalPay), date: new Date().toLocaleDateString() });
        addHistory('income', `Кредит на ${term} мес.`, am);
        addNotification(`Кредит оформлен: ${formatMoney(am)}`);
        pushNotify(`Кредит зачислен: ${formatMoney(am)}`);
        vibrate([50, 40, 80]);
        closeModal('modal-credit');
        saveToLocalStorage(); updateUI();
        showAlert(`Кредит ${formatMoney(am)} зачислен!`);
    }, 'primary');
}
/* ===================== UI ===================== */
function renderWalletCards() {
    const container = document.getElementById('wallet-cards-container'); if (!container) return;
    if (!state.cards.length) { container.innerHTML = '<div class="wallet-card-mini card-theme-blue"><div class="mini-brand"><span class="text-xs font-bold opacity-80">Карта</span></div><div><div class="mini-balance">0 ₽</div><div class="mini-num">Нет карты</div></div></div>'; return; }
    container.innerHTML = '';
    state.cards.forEach((c, i) => {
        const theme = c.isGold ? 'gold' : (c.theme || 'blue');
        const hasCustom = !!c.customImage;
        const bgStyle = hasCustom ? `background-image:url(${c.customImage});background-size:cover;background-position:center;` : '';
        const bgClass = hasCustom ? '' : `card-theme-${theme}`;
        const bal = c.isGold ? '∞' : c.balance.toLocaleString();
        const brandIcon = c.isGold ? 'fa-gem' : (c.type === 'PayPal' ? 'fa-cc-paypal' : (c.type === 'MasterCard' ? 'fa-cc-mastercard' : 'fa-cc-visa'));
        const overlay = hasCustom ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.35);border-radius:24px;"></div>' : '';
        container.innerHTML += `<div class="wallet-card-mini ${bgClass}" style="${bgStyle}position:relative;" onclick="openCardFromWallet(${i})">${overlay}<div style="position:relative;z-index:1;display:flex;flex-direction:column;justify-content:space-between;height:100%;"><div class="mini-brand"><span class="text-[10px] font-bold opacity-85 uppercase tracking-wider">${c.blocked ? '🔒 ' : ''}${c.type}</span><i class="fa-brands ${brandIcon} text-xl"></i></div><div><div class="mini-balance">${bal} ₽</div><div class="mini-num">${c.fullNumber}</div></div></div></div>`;
    });
}
function openCardFromWallet(idx) { currentCardIndex = idx; switchTab('cards'); }
function renderMainHistory() {
    const el = document.getElementById('main-history-preview'); if (!el) return;
    if (!state.history.length) { el.innerHTML = '<p class="text-center py-6 text-slate-300 text-sm">История пуста</p>'; return; }
    el.innerHTML = '';
    state.history.slice(0, 3).forEach((h, i) => {
        el.innerHTML += `<div onclick="openReceipt(${i})" class="flex justify-between p-3 rounded-2xl cursor-pointer"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-2xl flex items-center justify-center ${h.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}"><i class="fa-solid ${h.type === 'income' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i></div><div><p class="font-bold text-sm">${h.title}</p><p class="text-[10px] text-slate-400">${h.time}</p></div></div><p class="font-black ${h.type === 'income' ? 'text-emerald-600' : ''}">${h.type === 'income' ? '+' : '-'} ${h.amount} ₽</p></div>`;
    });
}
function updateUI() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('display-name', state.name);
    set('main-balance', (state.balance || 0).toLocaleString());
    set('points-balance', (state.points || 0).toLocaleString());
    set('profile-points', (state.points || 0).toLocaleString());
    set('shop-points', (state.points || 0).toLocaleString());
    set('profile-name', state.name);
    set('profile-id-display', "ID: " + (D.userId || '—'));
    set('profile-avatar-initials', (state.name[0] || 'М').toUpperCase());
    set('limit-topup', formatLimit(state.topupLimit));
    set('limit-salary', formatLimit(state.salaryLimit));
    set('salary-limit-hint', formatLimit(state.salaryLimit));

    const histDiv = document.getElementById('history-list');
    if (histDiv) {
        let filtered = state.history;
        if (historyFilter !== 'all') {
            filtered = state.history.filter(h => {
                const cat = categorizeHistoryItem(h);
                if (historyFilter === 'expense') return h.type === 'expense';
                return cat === historyFilter;
            });
        }
        histDiv.innerHTML = filtered.length ? '' : '<p class="text-center py-20 text-slate-300">Ничего не найдено</p>';
        filtered.forEach((h) => {
            const originalIndex = state.history.indexOf(h);
            histDiv.innerHTML += `<div onclick="openReceipt(${originalIndex})" class="flex justify-between p-3 bg-white rounded-2xl border border-slate-100 cursor-pointer animate-press"><div><p class="font-bold text-sm">${h.title}</p><p class="text-[10px] text-slate-400">${h.time}</p></div><p class="font-black ${h.type === 'income' ? 'text-emerald-600' : ''}">${h.type === 'income' ? '+' : '-'} ${h.amount} ₽</p></div>`;
        });
    }
    const contactsDiv = document.getElementById('contacts-list');
    if (contactsDiv) {
        contactsDiv.innerHTML = '';
        state.contacts.forEach((c, i) => {
            contactsDiv.innerHTML += `<div class="flex items-center gap-4 p-4 active:bg-slate-50 rounded-2xl animate-press cursor-pointer" onclick="openTransfer(${i})"><div class="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center font-black">${c.name[0]}</div><div><p class="font-bold">${c.name}</p><p class="text-[10px] text-slate-400">${c.phone}</p></div></div>`;
        });
    }
    renderWalletCards(); renderMainHistory(); updateProUI();
    renderMainGoals(); syncWidget();
    if (document.getElementById('tab-cards')?.classList.contains('active')) renderCarousel();
    if (chartVisible) drawExpensesChart();
    renderShop();
}
function renderShop() {
    const grid = document.getElementById('shop-grid'); if (!grid) return;
    grid.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        let available = true;
        if (item.category === 'limit') {
            if (item.type === 'topup') available = item.tier === state.topupTier + 1;
            else if (item.type === 'salary') available = item.tier === state.salaryTier + 1;
        }
        if (item.id === 'pro_sub' && state.hasPro) {
            grid.innerHTML += `<div class="shop-item owned"><div><div class="icon" style="background:${item.color};"><i class="fa-solid ${item.icon}"></i></div><div class="name">${item.name}</div><div class="desc">Активна</div></div><div class="price"><i class="fa-solid fa-check"></i> Куплено</div></div>`;
            return;
        }
        const owned = !item.repeatable && state.shopItems[item.id];
        const canAfford = state.points >= item.price;
        let displayPrice = `<i class="fa-solid fa-star"></i> ${item.price}`;
        let extraClass = '';
        if (item.category === 'limit' && !available && !owned) { displayPrice = '<i class="fa-solid fa-lock"></i> Закрыто'; extraClass = 'style="opacity:0.5;"'; }
        if (owned) extraClass = 'style="opacity:0.55;"';
        grid.innerHTML += `<div class="shop-item ${owned ? 'owned' : ''}" ${extraClass} onclick="buyShopItem('${item.id}')"><div><div class="icon" style="background:${item.color};"><i class="fa-solid ${item.icon}"></i></div><div class="name">${item.name}</div><div class="desc">${item.desc}</div></div><div class="price" style="${owned ? 'background:#d1fae5;color:#059669;' : (!canAfford ? 'opacity:0.5;' : '')}">${owned ? '<i class="fa-solid fa-check"></i> Куплено' : displayPrice}</div></div>`;
    });
}
function buyShopItem(id) {
    const item = SHOP_ITEMS.find(x => x.id === id); if (!item) return;
    if (id === 'pro_sub') return buyPro();
    if (!item.repeatable && state.shopItems[id]) return showAlert(MSG.alreadyOwned || "Уже куплено");
    if (item.category === 'limit') {
        if (item.type === 'topup' && item.tier !== state.topupTier + 1) return showAlert("Сначала предыдущий уровень");
        if (item.type === 'salary' && item.tier !== state.salaryTier + 1) return showAlert("Сначала предыдущий уровень");
    }
    if (state.points < item.price) return showAlert(MSG.notEnoughPoints || "Недостаточно баллов");
    askConfirm(`Купить «${item.name}»?`, `Списать ${item.price} баллов?`, () => {
        state.points -= item.price;
        state.shopItems[id] = (state.shopItems[id] || 0) + 1;
        const val = item.value === -1 ? Infinity : item.value;
        switch(item.category) {
            case 'limit':
                if (item.type === 'topup') { state.topupLimit = val; state.topupTier = item.tier; }
                else if (item.type === 'salary') { state.salaryLimit = val; state.salaryTier = item.tier; }
                showAlert(val === Infinity ? "Безлимит!" : `Лимит: ${val.toLocaleString()} ₽`);
                break;
            case 'design': if (!state.ownedDesigns.includes('gold')) state.ownedDesigns.push('gold'); showAlert("Золотой дизайн!"); break;
            case 'cash': state.balance += item.value; addHistory('income', `Магазин: +${item.value} ₽`, item.value); break;
            case 'bonus':
                if (id === 'boost_salary') { state.salary *= 2; showAlert("ЗП ×2!"); }
                else if (id === 'instant_salary') addSalary();
                break;
        }
        updateUI(); saveToLocalStorage();
    }, 'primary');
}
function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + t).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active-nav'));
    document.querySelector(`[data-tab="${t}"]`)?.classList.add('active-nav');
    if (t === 'cards') renderCarousel();
    if (t === 'shop') renderShop();
    if (t === 'history' && chartVisible) drawExpensesChart();
    if (t === 'main') { renderWalletCards(); renderMainHistory(); }
    if (t === 'assistant' && window.BFA && typeof window.BFA.open === 'function') window.BFA.open();
    document.getElementById('main-scroll').scrollTop = 0;
}
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

/* ===================== НАСТРОЙКИ ===================== */
function openSettings() {
    document.getElementById('set-name').value = state.name;
    document.getElementById('set-salary-amount').value = state.salary;
    document.getElementById('set-salary-time').value = state.interval;
    document.getElementById('set-subscription').checked = state.hasSubscription;
    populateCardSelect('set-payment-card'); populateCardSelect('set-salary-card');
    if (document.getElementById('set-payment-card')) document.getElementById('set-payment-card').value = state.paymentCardId;
    if (document.getElementById('set-salary-card')) document.getElementById('set-salary-card').value = state.salaryCardId;
    document.getElementById('salary-limit-hint').innerText = formatLimit(state.salaryLimit);
    document.getElementById('modal-settings').classList.remove('hidden');
}
function saveSettings() {
    state.name = document.getElementById('set-name').value.trim() || state.name;
    let newSalary = parseInt(document.getElementById('set-salary-amount').value) || 0;
    let newInterval = parseInt(document.getElementById('set-salary-time').value) || 60;
    const minInt = D.minSalaryInterval || 60;
    if (newInterval < minInt) { newInterval = minInt; showAlert(MSG.minInterval || "Мин. интервал — 1 минута"); }
    if (!state.hasPro && newSalary > state.salaryLimit) { newSalary = state.salaryLimit; showAlert(`Макс: ${formatLimit(state.salaryLimit)} ₽`); }
    if (newInterval !== state.interval && state.interval > 0) {
        const elapsedRatio = (state.interval - state.nextSalary) / state.interval;
        state.nextSalary = Math.max(1, Math.floor(newInterval * (1 - elapsedRatio)));
    }
    state.salary = newSalary; state.interval = newInterval;
    state.paymentCardId = document.getElementById('set-payment-card').value;
    state.salaryCardId = document.getElementById('set-salary-card').value;
    saveToLocalStorage(); updateUI();
    closeModal('modal-settings');
    showAlert(MSG.settingsSaved || "Настройки сохранены");
}
function toggleSubscription() {
    const ch = document.getElementById('set-subscription');
    const subPrice = D.subscriptionPrice || 299;
    if (ch.checked && !state.hasSubscription) {
        if (state.balance >= subPrice) {
            state.balance -= subPrice; state.hasSubscription = true;
            addHistory('expense', 'BankFake+ подписка', subPrice);
            showAlert(MSG.subscriptionActivated || "Подписка активирована");
        } else { ch.checked = false; showAlert(`Не хватает ${subPrice}₽`); }
    } else if (!ch.checked && state.hasSubscription) {
        state.hasSubscription = false; showAlert(MSG.subscriptionOff || "Подписка отключена");
    }
    updateUI(); saveToLocalStorage();
}
function handleAvatar(input) {
    if (input.files && input.files[0]) {
        const fr = new FileReader();
        fr.onload = e => { applyAvatar(e.target.result); };
        fr.readAsDataURL(input.files[0]);
    }
}

/* ===================== ВСПОМОГАТЕЛЬНЫЕ РЕНДЕРЫ ===================== */
function renderPayTiles() {
    const c = document.getElementById('pay-tiles-container'); if (!c) return;
    c.innerHTML = '';
    PAY_TILES.forEach(t => {
        const el = document.createElement('div'); el.className = 'pay-tile';
        el.innerHTML = `<div class="t-icon" style="background:${t.bg};color:${t.color}"><i class="fa-solid ${t.icon}"></i></div><div class="t-label">${t.label}</div>`;
        if (t.action.startsWith('openService_')) { const key = t.action.replace('openService_',''); el.onclick = () => openService(key); }
        else el.onclick = () => (window[t.action] ? window[t.action]() : null);
        c.appendChild(el);
    });
}
function renderBFCategories() {
    const c = document.getElementById('bf-categories-container'); if (!c) return;
    c.innerHTML = '';
    BF_CATEGORIES.forEach(cat => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'bf-cat'; el.dataset.cat = cat.name;
        el.innerHTML = `<div class="cat-icon" style="background:${cat.bg};color:${cat.color}"><i class="fa-solid ${cat.icon}"></i></div><span class="cat-name">${cat.name}</span>`;
        el.onclick = (e) => selectBFCategory(cat.name, e);
        c.appendChild(el);
    });
}
function renderRecentMerchants() {
    const c = document.getElementById('bf-recent-container'); if (!c) return;
    c.innerHTML = '';
    RECENT_MERCHANTS.forEach(m => {
        const el = document.createElement('div'); el.className = 'merchant-row';
        el.innerHTML = `<div class="m-icon" style="background:${m.bg};color:${m.color}"><i class="fa-solid ${m.icon}"></i></div><div class="flex-1"><p class="font-bold text-sm">${m.name}</p><p class="text-[10px] text-slate-400">${m.desc}</p></div><i class="fa-solid fa-chevron-right text-slate-300"></i>`;
        el.onclick = () => setBFAmount(m.amount);
        c.appendChild(el);
    });
}
function renderForeignCountries() {
    const c = document.getElementById('foreign-countries-container'); if (!c) return;
    c.innerHTML = '';
    FOREIGN_COUNTRIES.forEach(fc => {
        const el = document.createElement('button');
        el.className = 'country-btn p-4 border-2 rounded-2xl text-xs font-bold border-slate-100 animate-press';
        el.innerText = `${fc.flag} ${fc.name}`;
        el.onclick = (e) => selectCountry(fc.name, e);
        c.appendChild(el);
    });
}
function renderDesignGrid() {
    const c = document.getElementById('design-grid'); if (!c) return;
    c.innerHTML = '';
    CARD_THEMES.forEach(t => {
        const el = document.createElement('div');
        el.className = `w-11 h-8 rounded-lg cursor-pointer transition border-[3px] border-transparent card-theme-${t}`;
        el.dataset.theme = t; el.onclick = () => selectDesign(t);
        c.appendChild(el);
    });
    const gold = document.createElement('div');
    gold.className = 'w-11 h-8 rounded-lg cursor-pointer transition border-[3px] border-transparent card-theme-gold';
    gold.dataset.theme = 'gold'; gold.onclick = () => selectDesign('gold');
    c.appendChild(gold);
}
function renderCreditTerms() {
    const sel = document.getElementById('credit-term'); if (!sel) return;
    sel.innerHTML = '';
    Object.entries(CREDIT.rates).forEach(([k, v]) => {
        const opt = document.createElement('option'); opt.value = k; opt.innerText = v.label;
        if (k === '12') opt.selected = true; sel.appendChild(opt);
    });
}

/* ===================== УСЛУГИ ===================== */
function openService(type) {
    const svc = SERVICES[type]; if (!svc) return;
    currentService = type; currentServiceProvider = svc.providers[0];
    document.getElementById('service-title').innerText = svc.title;
    const iconEl = document.getElementById('service-header-icon');
    iconEl.style.background = svc.iconBg; iconEl.style.color = svc.iconColor;
    iconEl.innerHTML = `<i class="fa-solid ${svc.icon}"></i>`;
    document.getElementById('service-header-name').innerText = svc.title;
    document.getElementById('service-header-desc').innerText = svc.desc;
    const provContainer = document.getElementById('service-providers'); provContainer.innerHTML = '';
    svc.providers.forEach((p, i) => {
        const btn = document.createElement('button');
        btn.className = 'p-4 border-2 rounded-2xl text-left font-bold border-slate-100 animate-press';
        if (i === 0) btn.classList.add('border-emerald-500','bg-emerald-50');
        btn.innerText = p;
        btn.onclick = () => { currentServiceProvider = p; provContainer.querySelectorAll('button').forEach(b => b.classList.remove('border-emerald-500','bg-emerald-50')); btn.classList.add('border-emerald-500','bg-emerald-50'); };
        provContainer.appendChild(btn);
    });
    document.getElementById('service-am').value = '';
    populateCardSelect('service-card');
    document.getElementById('service-card').value = state.paymentCardId || 'balance';
    document.getElementById('modal-service').classList.remove('hidden');
}

/* ===================== ВСПОМОГАТЕЛЬНЫЕ ===================== */
function openMobilePay() { document.getElementById('modal-mobile').classList.remove('hidden'); }
function openJKH() { document.getElementById('modal-jkh').classList.remove('hidden'); }
function openForeignTransfer() { populateCardSelect('foreign-card'); document.getElementById('modal-foreign').classList.remove('hidden'); }
function openAddContactModal() { document.getElementById('modal-add-contact').classList.remove('hidden'); }
function openAddCard() { document.getElementById('modal-add-card').classList.remove('hidden'); }
function selectCountry(name, e) {
    state.selectedCountry = name; saveToLocalStorage();
    document.querySelectorAll('.country-btn').forEach(b => b.classList.remove('border-indigo-500','bg-indigo-50'));
    if (e && e.currentTarget) e.currentTarget.classList.add('border-indigo-500','bg-indigo-50');
}
function selectJKH(name, e) {
    state.selectedJKH = name; saveToLocalStorage();
    document.querySelectorAll('.jkh-btn').forEach(b => b.classList.remove('border-emerald-500','bg-emerald-50'));
    if (e && e.currentTarget) e.currentTarget.classList.add('border-emerald-500','bg-emerald-50');
}
function openNotifications() {
    document.getElementById('notif-dot')?.classList.add('hidden');
    const list = document.getElementById('notif-list');
    list.innerHTML = state.notifications.length ? '' : '<p class="text-center py-10 text-slate-400">Пусто</p>';
    state.notifications.forEach(n => list.innerHTML += `<div class="p-4 bg-slate-50 rounded-2xl"><p class="font-bold">${n.text}</p><p class="text-[10px] text-slate-400">${n.time}</p></div>`);
    document.getElementById('modal-notif').classList.remove('hidden');
}
function clearNotifications() { state.notifications = []; saveToLocalStorage(); updateUI(); closeModal('modal-notif'); }
function openReceipt(idx) {
    const item = state.history[idx]; if (!item) return;
    document.getElementById('receipt-title').innerText = item.title;
    document.getElementById('receipt-time').innerText = "Чек от " + item.time;
    document.getElementById('receipt-amount').innerText = (item.type === 'income' ? '+ ' : '- ') + item.amount.toLocaleString() + " ₽";
    document.getElementById('receipt-category').innerText = item.type === 'income' ? 'Пополнение' : 'Расход';
    const icon = document.getElementById('receipt-icon'); const line = document.getElementById('receipt-line');
    if (item.type === 'income') {
        icon.style.background = '#d1fae5'; icon.style.color = '#10b981';
        icon.innerHTML = '<i class="fa-solid fa-arrow-down"></i>'; line.style.background = '#10b981';
    } else {
        icon.style.background = '#f1f5f9'; icon.style.color = '#475569';
        icon.innerHTML = '<i class="fa-solid fa-arrow-up"></i>'; line.style.background = '#1e293b';
    }
    document.getElementById('modal-receipt').classList.remove('hidden');
}
function saveContact() {
    const n = document.getElementById('con-name').value.trim();
    const p = document.getElementById('con-phone').value.trim();
    if (!n || !p) return showAlert(MSG.fillFields || "Заполните поля");
    state.contacts.push({id: Date.now(), name: n, phone: p});
    saveToLocalStorage(); updateUI();
    document.getElementById('con-name').value = ''; document.getElementById('con-phone').value = '';
    closeModal('modal-add-contact'); showAlert(MSG.contactAdded || "Контакт добавлен");
}
function clearAllHistoryNow() { state.history = []; saveToLocalStorage(); updateUI(); if (chartVisible) drawExpensesChart(); showAlert(MSG.historyCleared || "История очищена"); }

/* ===================== СБРОС ДАННЫХ ===================== */
function doResetData() {
    isResetting = true;
    if (salaryInterval) { clearInterval(salaryInterval); salaryInterval = null; }
    if (depositsTimer) { clearInterval(depositsTimer); depositsTimer = null; }
    if (stocksTimer) { clearInterval(stocksTimer); stocksTimer = null; }
    try { storeClearAll(); } catch(e){}
    showAlert("Данные сброшены. Перезагрузка...");
    setTimeout(() => { window.location.reload(); }, 500);
}

/* ===================== КАТЕГОРИИ / ГРАФИК ===================== */
function getCategoryFromTitle(title) {
    if (title.includes('ЖКХ')) return 'ЖКХ';
    if (title.includes('Мобильная')) return 'Связь';
    if (title.includes('Перевод в')) return 'За границу';
    if (title.includes('BF-Pay:')) return title.split(':')[1]?.trim() || 'BF-Pay';
    if (title.includes('Перевод между')) return 'Внутренний';
    if (title.includes('Подписка')) return 'Подписки';
    if (title.includes('Кредит')) return 'Кредит';
    if (title.includes('Вклад')) return 'Вклады';
    if (title.includes('Копилка')) return 'Копилки';
    if (title.includes('Покупка') || title.includes('Продажа')) return 'Инвестиции';
    if (title.includes('Интернет')) return 'Интернет';
    if (title.includes('Домофон')) return 'Домофон';
    if (title.includes('Образование')) return 'Образование';
    if (title.includes('Кино')) return 'Развлечения';
    if (title.includes('Путешествия')) return 'Путешествия';
    if (title.includes('Госуслуги')) return 'Госуслуги';
    if (title.includes('Штрафы')) return 'Штрафы';
    if (title.includes('Благотворительность')) return 'Благотворительность';
    return 'Прочее';
}
function drawExpensesChart() {
    const canvas = document.getElementById('expenses-chart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const expenses = state.history.filter(h => h.type === 'expense');
    const legend = document.getElementById('chart-legend');
    renderWeekBars(); updateAILimitUI();
    if (!expenses.length) { ctx.clearRect(0, 0, canvas.width, canvas.height); legend.innerHTML = '<span class="text-slate-400">Нет данных</span>'; return; }
    const cats = {};
    expenses.forEach(e => { const c = getCategoryFromTitle(e.title); cats[c] = (cats[c] || 0) + e.amount; });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    let a0 = -Math.PI / 2; legend.innerHTML = '';
    sorted.forEach(([cat, val], i) => {
        const a1 = a0 + (val / total) * Math.PI * 2;
        ctx.beginPath(); ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
        ctx.moveTo(150, 150); ctx.arc(150, 150, 130, a0, a1); ctx.fill();
        legend.innerHTML += `<div class="flex items-center gap-1.5 text-xs"><span style="width:10px;height:10px;border-radius:2px;background:${CHART_COLORS[i % CHART_COLORS.length]};display:inline-block"></span>${cat} · ${((val/total)*100).toFixed(0)}%</div>`;
        a0 = a1;
    });
}
function toggleChartView() { const b = document.getElementById('chart-block'); b.classList.toggle('hidden'); chartVisible = !b.classList.contains('hidden'); if (chartVisible) drawExpensesChart(); }

/* ===================== ЗАРПЛАТА ===================== */
let salaryInterval = null;
function addSalary() {
    let amt = state.salary;
    if (!state.hasPro && amt > state.salaryLimit) amt = state.salaryLimit;
    const target = state.salaryCardId;
    if (target === 'balance') state.balance += amt;
    else { const c = state.cards.find(x => x.id == target); if (c) c.balance += amt; else state.balance += amt; }
    addHistory('income', 'Зарплата', amt);
    addNotification(`Зарплата: +${amt} ₽`);
    vibrate([40, 30, 40]);
    pushNotify(`Зарплата: +${amt.toLocaleString('ru-RU')} ₽`);
}
function startSalaryTimer() {
    if (salaryInterval) clearInterval(salaryInterval);
    salaryInterval = setInterval(() => {
        if (isResetting) return;
        if (state.nextSalary > 0) state.nextSalary--;
        if (state.nextSalary <= 0) { addSalary(); state.nextSalary = state.interval; }
        saveToLocalStorage();
    }, 1000);
}
function toggleDarkTheme() { state.darkTheme = !state.darkTheme; document.body.classList.toggle('dark', state.darkTheme); saveToLocalStorage(); }
function bindSearch() {
    const hs = document.getElementById('history-search');
    if (hs) hs.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#history-list > div').forEach(d => { d.style.display = d.innerText.toLowerCase().includes(q) ? '' : 'none'; });
    });
}

/* ===================== ИИ-ВЕРДИКТ + НЕДЕЛЬНЫЕ БАРЫ ===================== */
function escHTML(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function updateAILimitUI() {
    const n = (window.BFA && BFA.remaining) ? BFA.remaining() : null;
    if (n === null) return;
    const txt = 'ИИ-запросов сегодня: ' + n + ' из ' + ((BFA.dailyLimit) || 15);
    ['chart-ai-left', 'term-left'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = txt; });
}
function renderWeekBars() {
    const box = document.getElementById('chart-week'); if (!box) return;
    const labels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        days.push({ label: labels[d.getDay()], from: d.getTime(), sum: 0 });
    }
    state.history.forEach(h => {
        if (h.type !== 'expense' || !h.ts) return;
        const day = days.find(x => h.ts >= x.from && h.ts < x.from + 86400000);
        if (day) day.sum += h.amount;
    });
    const max = Math.max.apply(null, days.map(d => d.sum).concat([1]));
    const total = days.reduce((s, d) => s + d.sum, 0);
    box.innerHTML = '<div class="chart-week-title">Последние 7 дней · ' + formatMoney(total) + '</div><div class="chart-week-bars">' +
        days.map(d => '<div class="week-bar-col"><div class="week-bar-wrap"><div class="week-bar' + (d.sum > 0 ? '' : ' empty') +
            '" style="height:' + Math.max(4, Math.round(d.sum / max * 70)) + 'px" title="' + formatMoney(d.sum) + '"></div></div><span class="week-bar-label">' + d.label + '</span></div>').join('') +
        '</div>';
}
function askChartVerdict() {
    const btn = document.getElementById('chart-ai-btn'), out = document.getElementById('chart-ai-out');
    if (!btn || !out) return;
    if (!window.BFA || !BFA.askText) return showAlert('Ассистент недоступен');
    btn.disabled = true; out.classList.remove('hidden');
    out.innerHTML = '<span class="ai-typing">ИИ анализирует ваши траты…</span>';
    BFA.askText('Проанализируй мои траты за последние 7 дней и ответь: 2 главные статьи расходов + 2 коротких совета по экономии. Максимум 4 строки, по-русски, без эмодзи.').then(r => {
        btn.disabled = false;
        out.classList.remove('hidden');
        out.innerHTML = r.ok ? escHTML(r.text).replace(/\n/g, '<br>') : '<span class="ai-err">' + escHTML(r.error || 'Ошибка') + '</span>';
        updateAILimitUI();
    });
}

/* ===================== ФИНАНСОВЫЙ СЛОВАРЬ (тап по термину) ===================== */
const FIN_TERMS = ['Кэшбэк', 'Номинал', 'Грейс-период', 'Кредитная история', 'Кредитный рейтинг', 'Инфляция', 'Валютный спред', 'Ставка по вкладу', 'Платёжеспособность', 'Банковская гарантия'];
function renderDictHTML() {
    let html = '<h3 class="text-xs font-bold text-slate-400 uppercase mb-3 px-1">Финансовый словарь</h3><div class="dict-grid">';
    FIN_TERMS.forEach(t => { html += '<button class="dict-chip" onclick="openTerm(\'' + t + '\')">' + t + '</button>'; });
    html += '</div><p class="dict-hint"><i class="fa-solid fa-circle-info mr-1"></i>Объяснения даёт ИИ-ассистент: каждый ответ списывает 1 запрос из дневного лимита (' +
        ((window.BFA && BFA.dailyLimit) || 15) + ' в день).</p>';
    return html;
}
function openTerm(name) {
    document.getElementById('term-title').textContent = name;
    const body = document.getElementById('term-body');
    body.innerHTML = '<span class="ai-typing">ИИ объясняет…</span>';
    document.getElementById('modal-term').classList.remove('hidden');
    updateAILimitUI();
    if (!window.BFA || !BFA.askText) { body.textContent = 'Ассистент недоступен'; return; }
    BFA.askText('Объясни простыми словами для новичка финансовый термин «' + name + '». 2-3 предложения, без эмодзи.').then(r => {
        body.innerHTML = r.ok ? escHTML(r.text).replace(/\n/g, '<br>') : '<span class="ai-err">' + escHTML(r.error || 'Ошибка') + '</span>';
        updateAILimitUI();
    });
}

/* ===================== ОБНОВЛЕНИЕ (проверка релизов GitHub) ===================== */
const UPDATE_REPO = 'rusty-prdc/BankFake';
const UPDATE_STORE_URL = 'https://www.rustore.ru/catalog/app/org.xprodc.ivan';
let updateInfo = null;
function parseVer(v) {
    const p = String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    return [p[0] || 0, p[1] || 0, p[2] || 0];
}
function verGt(a, b) {
    const x = parseVer(a), y = parseVer(b);
    for (let i = 0; i < 3; i++) { if (x[i] > y[i]) return true; if (x[i] < y[i]) return false; }
    return false;
}
function checkUpdates() {
    let cur;
    try { cur = (window.APP_DATA && APP_DATA.app && APP_DATA.app.version) || '0'; } catch (e) { cur = '0'; }
    fetch('https://api.github.com/repos/' + UPDATE_REPO + '/releases/latest', { headers: { 'Accept': 'application/vnd.github+json' } })
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
            if (!j || !j.tag_name) return;
            const tag = j.tag_name, ver = String(tag).replace(/^v/i, '');
            if (!verGt(ver, cur)) return;
            if (state.updaterSeen === tag) return;
            const asset = (j.assets || []).find(a => /\.apk$/i.test(a.name || '')) || null;
            updateInfo = { tag: tag, ver: ver, assetUrl: asset ? asset.browser_download_url : (j.html_url || '') };
            document.getElementById('update-title').textContent = 'Вышло обновление ' + ver + '!';
            document.getElementById('update-text').textContent = 'Установлена версия ' + cur + '. Доступна новая — ' + ver + '.';
            setTimeout(() => {
                const m = document.getElementById('modal-update');
                if (m && m.classList.contains('hidden')) m.classList.remove('hidden');
            }, 1500);
        })
        .catch(() => { /* нет сети — молча */ });
}
function openUpdate(kind) {
    const info = updateInfo; closeModal('modal-update');
    if (!info) return;
    if (kind === 'store') {
        const u = UPDATE_STORE_URL;
        if (window.BFJson && BFJson.openLink) BFJson.openLink(u);
        else window.open(u, '_blank');
        return;
    }
    // «Установить»: приложение само скачивает APK и открывает установщик,
    // после установки установщик удаляется (кэш чистится при старте).
    const url = info.assetUrl || ('https://github.com/' + UPDATE_REPO + '/releases/latest');
    if (window.BFJson && BFJson.installApk) BFJson.installApk(url);
    else if (window.BFJson && BFJson.openLink) BFJson.openLink(url);
    else window.open(url, '_blank');
}
function closeUpdateLater() {
    if (updateInfo) { state.updaterSeen = updateInfo.tag; saveToLocalStorage(); }
    closeModal('modal-update');
}

/* ===================== INIT ===================== */
document.addEventListener('DOMContentLoaded', () => {
    renderPayTiles(); renderBFCategories(); renderRecentMerchants();
    renderForeignCountries(); renderDesignGrid(); renderCreditTerms();
    const box = document.getElementById('profile-avatar-box');
    if (box) box.addEventListener('click', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = e => handleAvatar(inp); inp.click(); });
    const dk = document.getElementById('set-dark-theme');
    if (dk) { dk.checked = state.darkTheme; dk.addEventListener('change', toggleDarkTheme); }
    document.querySelectorAll('.history-filter-btn').forEach(b => {
        b.addEventListener('click', () => {
            historyFilter = b.dataset.filter;
            document.querySelectorAll('.history-filter-btn').forEach(x => x.classList.toggle('active', x === b));
            updateUI();
        });
    });
});
window.addEventListener('load', () => {
    loadFromLocalStorage();
    updateUI();
    setTimeout(() => fetchRates(), 1500);   /* курсы ЦБ — для кошелька и виджета */
    startSalaryTimer();
    startDepositsTick();
    startStocksTimer();
    bindSearch();
    if (state.cards.length) currentCardIndex = 0;
    renderCarousel();
    renderShop();
    updateProUI();
    if (!state.hasAcceptedConsent) {
        setTimeout(() => showConsent(), 300);
    } else if (!state.hasSeenTutorial) {
        setTimeout(startTutorial, 800);
    }
    const pushCb = document.getElementById('set-push'); if (pushCb) pushCb.checked = state.pushEnabled !== false;
    const vibCb = document.getElementById('set-vibrate'); if (vibCb) vibCb.checked = state.vibrateEnabled !== false;
    setTimeout(checkUpdates, 5000);   /* проверка новых версий на GitHub */
});
window.addEventListener('resize', () => { if (tutActive) renderTutStep(); });