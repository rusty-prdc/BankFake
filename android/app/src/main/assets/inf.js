window.APP_DATA = {
  "app": { "name": "BankFake Pro", "version": "2.2", "storageKey": "bankfake_pro_v3", "currency": "₽" },
  "defaults": {
    "userName": "Михаил", "userId": "1021578330",
    "startBalance": 2500, "startPoints": 158,
    "salary": 1000, "salaryInterval": 60, "minSalaryInterval": 60,
    "topupLimit": 10000, "salaryLimit": 5000,
    "subscriptionPrice": 299, "proPrice": 1000, "commissionRate": 0.01,
    "pointsRates": { "transfer": 0.05, "bfpay": 0.05, "foreign": 0.05, "jkh": 0.03, "mobile": 0.03, "service": 0.03, "topup": 0.01 },
    "contacts": [{ "id": 1, "name": "Иван Иванов", "phone": "+7 900 123-45-67" }],
    "notifications": [{ "id": 1, "text": "Добро пожаловать в BankFake!", "time": "Сегодня" }]
  },
  "cardThemes": ["blue","dark","purple","grey","teal","red"],
  "goldTheme": "gold",
  "chartColors": ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec489a","#06b6d4","#84cc16"],
  "foreignCountries": [
    { "name": "Казахстан", "flag": "🇰🇿" },
    { "name": "Армения", "flag": "🇦🇲" },
    { "name": "Турция", "flag": "🇹🇷" },
    { "name": "ОАЭ", "flag": "🇦🇪" },
    { "name": "Беларусь", "flag": "🇧🇾" },
    { "name": "Киргизия", "flag": "🇰🇬" }
  ],
  "credit": {
    "maxAmount": 1000000,
    "rates": {
      "6":  { "rate": 0.169, "label": "6 месяцев · 16.9%" },
      "12": { "rate": 0.129, "label": "12 месяцев · 12.9%" },
      "24": { "rate": 0.099, "label": "24 месяца · 9.9%" },
      "36": { "rate": 0.079, "label": "36 месяцев · 7.9%" },
      "60": { "rate": 0.049, "label": "60 месяцев · 4.9%" }
    }
  },
  "bfCategories": [
    { "name": "Ресторан", "icon": "fa-utensils",    "bg": "#fee2e2", "color": "#ef4444" },
    { "name": "Заправка", "icon": "fa-gas-pump",     "bg": "#fef3c7", "color": "#f59e0b" },
    { "name": "ТЦ",       "icon": "fa-bag-shopping", "bg": "#ede9fe", "color": "#8b5cf6" },
    { "name": "Спорт",    "icon": "fa-football",     "bg": "#dbeafe", "color": "#3b82f6" },
    { "name": "Подарки",  "icon": "fa-gifts",        "bg": "#fce7f3", "color": "#ec4899" },
    { "name": "Стройка",  "icon": "fa-hammer",       "bg": "#fed7aa", "color": "#ea580c" },
    { "name": "Аптека",   "icon": "fa-pills",        "bg": "#ccfbf1", "color": "#0d9488" },
    { "name": "Такси",    "icon": "fa-taxi",         "bg": "#fef9c3", "color": "#ca8a04" }
  ],
  "recentMerchants": [
    { "name": "Яндекс Еда",  "desc": "Ресторан", "amount": 350,  "icon": "fa-utensils", "bg": "#fee2e2", "color": "#ef4444" },
    { "name": "Лукойл",      "desc": "Заправка", "amount": 1500, "icon": "fa-gas-pump","bg": "#fef3c7", "color": "#f59e0b" }
  ],
  "services": {
    "internet":    { "title": "Интернет и ТВ",       "icon": "fa-wifi",       "iconBg": "#cffafe", "iconColor": "#0891b2", "desc": "Провайдеры связи",          "providers": ["Дом.ру","Ростелеком","ЭР-Телеком","МТС","Билайн"] },
    "intercom":    { "title": "Домофон",             "icon": "fa-bell",       "iconBg": "#fef3c7", "iconColor": "#d97706", "desc": "Домофонные компании",        "providers": ["Визит","Метаком","Элтис","Болид"] },
    "education":   { "title": "Образование",         "icon": "fa-graduation-cap", "iconBg": "#ede9fe", "iconColor": "#8b5cf6", "desc": "Курсы, школы, репетиторы", "providers": ["Skillbox","Нетология","GeekBrains","Яндекс Практикум","Учи.ру"] },
    "entertainment":{ "title": "Кино и игры",        "icon": "fa-film",       "iconBg": "#fce7f3", "iconColor": "#ec4899", "desc": "Кинотеатры, подписки",     "providers": ["Кинопоиск","IVI","OKKO","VK Play","RuStore"] },
    "travel":      { "title": "Путешествия",         "icon": "fa-plane",      "iconBg": "#dbeafe", "iconColor": "#0284c7", "desc": "Авиа, отели, туры",          "providers": ["Аэрофлот","S7","РЖД","Ostrovok","Яндекс Путешествия"] },
    "gov":         { "title": "Госуслуги",           "icon": "fa-landmark",   "iconBg": "#fee2e2", "iconColor": "#dc2626", "desc": "Оплата услуг порталов",      "providers": ["Госуслуги","ФНС","Почта России","Росреестр","ФССП"] },
    "fines":       { "title": "Штрафы",              "icon": "fa-file-circle-exclamation", "iconBg": "#fee2e2", "iconColor": "#b91c1c", "desc": "Оплата штрафов", "providers": ["ГИБДД","Госуслуги","ФССП","Почта России"] },
    "charity":     { "title": "Благотворительность", "icon": "fa-heart",      "iconBg": "#fef2f2", "iconColor": "#e11d48", "desc": "Помощь фондам",              "providers": ["Ночлежка","Подари жизнь","Старость в радость","Русь"] }
  },
  "payTiles": [
    { "id": "bfpay",     "label": "BF-Pay",              "icon": "fa-qrcode",                 "bg": "#d1fae5", "color": "#10b981", "action": "openBFPay" },
    { "id": "mobile",    "label": "Мобильная",           "icon": "fa-mobile-screen-button",   "bg": "#dbeafe", "color": "#2563eb", "action": "openMobilePay" },
    { "id": "jkh",       "label": "ЖКХ",                 "icon": "fa-house",                  "bg": "#e0e7ff", "color": "#4f46e5", "action": "openJKH" },
    { "id": "internet",  "label": "Интернет<br>и ТВ",    "icon": "fa-wifi",                   "bg": "#cffafe", "color": "#0891b2", "action": "openService_internet" },
    { "id": "intercom",  "label": "Домофон",             "icon": "fa-bell",                   "bg": "#fef3c7", "color": "#d97706", "action": "openService_intercom" },
    { "id": "education", "label": "Образование",         "icon": "fa-graduation-cap",         "bg": "#ede9fe", "color": "#8b5cf6", "action": "openService_education" },
    { "id": "entertain", "label": "Кино<br>и игры",      "icon": "fa-film",                   "bg": "#fce7f3", "color": "#ec4899", "action": "openService_entertainment" },
    { "id": "travel",    "label": "Путешествия",         "icon": "fa-plane",                  "bg": "#dbeafe", "color": "#0284c7", "action": "openService_travel" },
    { "id": "gov",       "label": "Госуслуги",           "icon": "fa-landmark",               "bg": "#fee2e2", "color": "#dc2626", "action": "openService_gov" },
    { "id": "fines",     "label": "Штрафы",              "icon": "fa-file-circle-exclamation", "bg": "#fee2e2", "color": "#b91c1c", "action": "openService_fines" },
    { "id": "charity",   "label": "Благотворительность", "icon": "fa-heart",                  "bg": "#fef2f2", "color": "#e11d48", "action": "openService_charity" },
    { "id": "between",   "label": "Между<br>картами",    "icon": "fa-arrow-right-arrow-left", "bg": "#f3e8ff", "color": "#9333ea", "action": "openTransferBetweenCards" }
  ],
  "shopItems": [
    { "id": "pro_sub",       "name": "BankFake Pro",           "desc": "0% комиссия, безлимиты", "icon": "fa-crown",           "color": "linear-gradient(135deg, #8b5cf6, #6366f1)", "price": 1000, "category": "sub",    "repeatable": false },
    { "id": "topup_1",       "name": "Пополнение до 50 000 ₽", "desc": "Лимит пополнения",       "icon": "fa-arrow-up",        "color": "linear-gradient(135deg, #10b981, #059669)", "price": 300,  "category": "limit", "tier": 1, "type": "topup",  "repeatable": false, "value": 50000 },
    { "id": "topup_2",       "name": "Пополнение до 200 000 ₽","desc": "Расширенный лимит",      "icon": "fa-arrow-up",        "color": "linear-gradient(135deg, #10b981, #047857)", "price": 900,  "category": "limit", "tier": 2, "type": "topup",  "repeatable": false, "value": 200000 },
    { "id": "topup_3",       "name": "Безлимит пополнения",    "desc": "Без ограничений",        "icon": "fa-infinity",        "color": "linear-gradient(135deg, #f59e0b, #b45309)", "price": 2500, "category": "limit", "tier": 3, "type": "topup",  "repeatable": false, "value": -1 },
    { "id": "salary_1",      "name": "Зарплата до 20 000 ₽",   "desc": "Увеличить лимит ЗП",     "icon": "fa-wallet",          "color": "linear-gradient(135deg, #3b82f6, #1e40af)", "price": 400,  "category": "limit", "tier": 1, "type": "salary", "repeatable": false, "value": 20000 },
    { "id": "salary_2",      "name": "Зарплата до 100 000 ₽",  "desc": "Расширенный лимит",      "icon": "fa-wallet",          "color": "linear-gradient(135deg, #3b82f6, #1e3a8a)", "price": 1200, "category": "limit", "tier": 2, "type": "salary", "repeatable": false, "value": 100000 },
    { "id": "salary_3",      "name": "Безлимит зарплаты",      "desc": "Любая сумма",            "icon": "fa-infinity",        "color": "linear-gradient(135deg, #8b5cf6, #4c1d95)", "price": 3000, "category": "limit", "tier": 3, "type": "salary", "repeatable": false, "value": -1 },
    { "id": "gold_design",   "name": "Золотой дизайн",         "desc": "Премиум-карта",          "icon": "fa-gem",             "color": "linear-gradient(135deg, #b45309, #fbbf24)", "price": 500,  "category": "design", "repeatable": false },
    { "id": "cash_1000",     "name": "+1000 ₽ на баланс",      "desc": "Обмен баллов",           "icon": "fa-ruble-sign",      "color": "linear-gradient(135deg, #10b981, #059669)", "price": 100,  "category": "cash",  "repeatable": true, "value": 1000 },
    { "id": "cash_5000",     "name": "+5000 ₽ на баланс",      "desc": "Выгодно",                "icon": "fa-money-bill-wave", "color": "linear-gradient(135deg, #3b82f6, #2563eb)", "price": 450,  "category": "cash",  "repeatable": true, "value": 5000 },
    { "id": "boost_salary",  "name": "×2 Зарплата",            "desc": "Удвоить ЗП",             "icon": "fa-bolt",            "color": "linear-gradient(135deg, #f59e0b, #ef4444)", "price": 300,  "category": "bonus", "repeatable": true },
    { "id": "instant_salary","name": "Зарплата сейчас",        "desc": "Мгновенно",              "icon": "fa-clock",           "color": "linear-gradient(135deg, #8b5cf6, #6366f1)", "price": 150,  "category": "bonus", "repeatable": true }
  ],
  "products": {
    "deposits": [
      { "id": "dep_1", "name": "Быстрый",   "desc": "1 минута", "duration": 60,  "rate": 0.02, "minAmount": 500,  "icon": "fa-bolt", "color": "linear-gradient(135deg, #10b981, #059669)" },
      { "id": "dep_2", "name": "Стандарт",  "desc": "3 минуты", "duration": 180, "rate": 0.05, "minAmount": 1000, "icon": "fa-clock","color": "linear-gradient(135deg, #3b82f6, #1e40af)" },
      { "id": "dep_3", "name": "Максимум",  "desc": "5 минут",  "duration": 300, "rate": 0.09, "minAmount": 2000, "icon": "fa-fire", "color": "linear-gradient(135deg, #f59e0b, #b45309)" }
    ],
    "stocks": [
      { "symbol": "GAZP", "name": "Газпром",    "base": 140,  "icon": "fa-fire-flame-curved","color": "linear-gradient(135deg, #ef4444, #b91c1c)" },
      { "symbol": "LKOH", "name": "Лукойл",     "base": 6800, "icon": "fa-oil-well",        "color": "linear-gradient(135deg, #0f766e, #0d9488)" },
      { "symbol": "SBER", "name": "Сбербанк",   "base": 310,  "icon": "fa-building-columns","color": "linear-gradient(135deg, #10b981, #059669)" },
      { "symbol": "YDEX", "name": "Яндекс",     "base": 4300, "icon": "fa-yandex",          "color": "linear-gradient(135deg, #f59e0b, #eab308)" },
      { "symbol": "ROSN", "name": "Роснефть",   "base": 540,  "icon": "fa-industry",        "color": "linear-gradient(135deg, #0284c7, #0369a1)" }
    ],
    "piggyIcons": ["fa-gift","fa-plane","fa-mobile-screen","fa-car","fa-house","fa-graduation-cap","fa-heart","fa-gamepad"],
    "piggyColors": ["#f59e0b","#3b82f6","#8b5cf6","#ec4899","#10b981","#ef4444","#06b6d4","#6366f1"]
  },
  "tutorial": {
    "steps": [
      { "tab": "main", "target": "#header-avatar-container", "icon": "fa-user",             "iconBg": "linear-gradient(135deg, #8b5cf6, #6366f1)", "title": "Ваш профиль",         "text": "Нажмите на аватар — откроются настройки: имя, фото, зарплата, карты для списаний." },
      { "tab": "main", "target": "#balance-block",           "icon": "fa-wallet",           "iconBg": "linear-gradient(135deg, #10b981, #059669)", "title": "Баланс",              "text": "Здесь ваш общий остаток по всем счетам. Растёт от зарплаты, кредитов и переводов." },
      { "tab": "main", "target": "#bfpay-btn-tour",          "icon": "fa-qrcode",           "iconBg": "linear-gradient(135deg, #10b981, #047857)", "title": "BF-Pay",              "text": "Быстрая оплата в один тап. NFC-анимация, чек, кэшбэк баллами." },
      { "tab": "main", "target": "#points-block-tour",       "icon": "fa-star",             "iconBg": "linear-gradient(135deg, #f59e0b, #ea580c)", "title": "Баллы",               "text": "Копите баллы за операции и тратьте их в магазине на Pro, лимиты и дизайны." },
      { "tab": "main", "target": "#history-preview-tour",    "icon": "fa-clock-rotate-left","iconBg": "linear-gradient(135deg, #3b82f6, #1e40af)", "title": "История на главной",  "text": "Три последние операции. Нажмите «Все», чтобы открыть полную историю." },
      { "tab": "main", "target": "#services-tour",           "icon": "fa-store",            "iconBg": "linear-gradient(135deg, #8b5cf6, #4c1d95)", "title": "Сервисы",             "text": "Вклады, копилки, акции, кредиты и магазин — всё здесь." },
      { "tab": "cards", "target": "#active-card-3d",         "icon": "fa-credit-card",      "iconBg": "linear-gradient(135deg, #3b82f6, #1e40af)", "title": "Ваши карты",          "text": "Вращайте карту в 3D (мышью или пальцем). Листайте стрелками или точками ниже." },
      { "tab": "cards", "target": ".card-actions-row",       "icon": "fa-sliders",          "iconBg": "linear-gradient(135deg, #6366f1, #4f46e5)", "title": "Управление картой",    "text": "Пополнить, изменить дизайн, загрузить свою картинку, заблокировать или удалить." },
      { "tab": "cards", "target": ".card-details",           "icon": "fa-list",             "iconBg": "linear-gradient(135deg, #06b6d4, #0891b2)", "title": "Данные карты",         "text": "Номер, CVV, владелец и срок. CVV скрыт — нажмите, чтобы показать." },
      { "tab": "history", "target": "#history-filters",      "icon": "fa-filter",           "iconBg": "linear-gradient(135deg, #f59e0b, #d97706)", "title": "Фильтры истории",     "text": "Отдельно смотрите пополнения, расходы, переводы и платежи." },
      { "tab": "history", "target": "#history-search",       "icon": "fa-magnifying-glass", "iconBg": "linear-gradient(135deg, #64748b, #334155)", "title": "Поиск по истории",    "text": "Найдите любую операцию по названию: «ЖКХ», «Перевод» и т.д." },
      { "tab": "history", "target": ".fa-chart-pie",         "icon": "fa-chart-pie",        "iconBg": "linear-gradient(135deg, #10b981, #059669)", "title": "График расходов",     "text": "Круговая диаграмма всех ваших трат по категориям." },
      { "tab": "payments", "target": "#pay-tiles-container", "icon": "fa-paper-plane",      "iconBg": "linear-gradient(135deg, #06b6d4, #0891b2)", "title": "Платежи",             "text": "BF-Pay, мобильная связь, ЖКХ, интернет, образование, штрафы, госуслуги и другое." },
      { "tab": "payments", "target": "#contacts-list",       "icon": "fa-users",            "iconBg": "linear-gradient(135deg, #ec4899, #be185d)", "title": "Переводы контактам",  "text": "Нажмите на контакт — отправите перевод. Плюс кнопка «+» вверху для нового контакта." },
      { "tab": "profile", "target": "#pro-block-container",  "icon": "fa-crown",            "iconBg": "linear-gradient(135deg, #8b5cf6, #6366f1)", "title": "BankFake Pro",        "text": "Подписка за 1000 баллов: 0% комиссия, безлимитная зарплата и переводы, PRO-значок." },
      { "tab": "profile", "target": ".settings-card",        "icon": "fa-gear",             "iconBg": "linear-gradient(135deg, #64748b, #334155)", "title": "Настройки",           "text": "Тёмная тема, уведомления, повторный запуск обучения и настройки зарплаты." },
      { "tab": "profile", "target": "#row-widgets-help",     "icon": "fa-object-group",      "iconBg": "linear-gradient(135deg, #10b981, #0891b2)", "title": "Виджеты на экране",    "text": "Виджеты BankFake — баланс, курсы валют и цели — можно вынести на рабочий стол.<br><br><b>Как добавить (все Android):</b> долгое нажмите на пустое место экрана → «Виджеты» → BankFake → нужный виджет → «Добавить».<br><br><b>Samsung:</b> долгое нажатие → «Виджеты» внизу.<br><b>Xiaomi / Redmi:</b> щипок двумя пальцами → «Виджеты».<br><b>Huawei / Honor:</b> долгое нажатие → «Виджеты» → «Готово».<br><b>Pixel / чистый Android:</b> долгое нажатие → «Виджеты» → удерживайте и перетащите.<br><br>Полная инструкция по брендам — в строке «Виджеты на экране»." },
      { "tab": "profile", "target": "#profile-points",       "icon": "fa-star",             "iconBg": "linear-gradient(135deg, #f59e0b, #ea580c)", "title": "Ваши баллы",          "text": "Полный баланс баллов и быстрая кнопка «В магазин»." },
      { "tab": "main", "target": ".bottom-nav .nav-item[data-tab=\"assistant\"]", "icon": "fa-robot", "iconBg": "linear-gradient(135deg, #10b981, #059669)", "title": "Ассистент", "text": "AI-помощник BankFake по центру навигации. Спрашивайте про баланс, карты, операции, баллы и зарплату — он отвечает по вашему аккаунту." },
      { "tab": "assistant", "target": ".bf-as-quick",         "icon": "fa-bolt",             "iconBg": "linear-gradient(135deg, #f59e0b, #d97706)", "title": "Быстрые вопросы",     "text": "«Мой баланс», «Последние операции», «Мои карты», «Мои баллы», «Зарплата», «Прогноз» — вопрос отправляется в один тап." },
      { "tab": "assistant", "target": "#bf-as-input",         "icon": "fa-comment-dots",     "iconBg": "linear-gradient(135deg, #06b6d4, #0891b2)", "title": "Спросите ассистента", "text": "Напишите вопрос и нажмите ➤. Ответы появятся здесь, кнопка «Очистить чат» вверху стирает переписку." },
      { "tab": "main", "target": ".bottom-nav",              "icon": "fa-compass",          "iconBg": "linear-gradient(135deg, #0f766e, #14b8a6)", "title": "Навигация",           "text": "6 разделов: Главная, Карты, Ассистент, История, Платежи, Профиль — всегда под рукой." }
    ]
  },
  "messages": {
    "insufficientFunds": "Недостаточно средств",
    "invalidAmount": "Сумма должна быть > 0",
    "invalidSum": "Неверная сумма",
    "cardBlocked": "Карта заблокирована",
    "notEnoughPoints": "Недостаточно баллов",
    "alreadyOwned": "Уже куплено",
    "minInterval": "Минимальный интервал — 1 минута",
    "settingsSaved": "Настройки сохранены",
    "designSaved": "Дизайн сохранён",
    "contactAdded": "Контакт добавлен",
    "fillFields": "Заполните поля",
    "historyCleared": "История очищена",
    "proActivated": "🎉 BankFake Pro активирован!",
    "proAlready": "Pro уже активирован",
    "subscriptionActivated": "Подписка активирована",
    "subscriptionOff": "Подписка отключена",
    "cardDeleted": "Карта удалена",
    "lastCardError": "Нельзя удалить единственную карту"
  }
};