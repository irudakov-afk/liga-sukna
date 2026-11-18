# Лига Сукна — MVP

Мобильное приложение для дружеских турниров по бильярду (4 игрока, групповой этап + Double Elimination).

## Что умеет MVP

- Выбор вида спорта (бильярд готов, боулинг / карты / свой спор — заглушки)
- Настройка 4 участников + ставка за проигрыш
- Турнирная сетка как в оригинале (группа «каждый с каждым» → посев → Winner / Loser Bracket → Grand Final)
- Автоматический расчёт призового фонда (50 / 25 / 17 / 8 %)
- Локальное сохранение игроков, винрейта, медалей и баланса
- Работает офлайн (PWA)

## Как установить на Android

### Способ 1 — «Добавить на главный экран» (рекомендуется)

1. Залей папку `billiard-league` на любой хостинг (GitHub Pages, Netlify, Vercel, даже простой nginx).
2. Открой сайт в **Chrome** на телефоне.
3. Меню → **«Установить приложение»** / **«Добавить на главный экран»**.
4. Иконка появится как у обычного приложения, открывается без адресной строки.

### Способ 2 — APK через PWA Builder (без кода)

1. Залей приложение на HTTPS.
2. Зайди на https://www.pwabuilder.com
3. Вставь URL → Generate → Android → Download package.
4. Получишь готовый `.apk` (или `.aab` для Google Play).

### Способ 3 — Capacitor (если есть Android Studio)

```bash
npm create @capacitor/app
# скопируй файлы в www/
npx cap add android
npx cap open android
# Build → Generate Signed Bundle / APK
```

## Локальный запуск

Открой `index.html` в браузере или подними простой сервер:

```bash
cd billiard-league
npx serve .
# или python -m http.server 8080
```

## Структура

```
billiard-league/
├── index.html
├── css/app.css
├── js/
│   ├── storage.js      # localStorage (игроки, история, текущий турнир)
│   ├── tournament.js   # логика 4×4 + DE
│   └── app.js          # UI и навигация
├── icons/
├── manifest.json
└── sw.js               # service worker (офлайн)
```

Данные хранятся только на устройстве. При очистке данных браузера статистика пропадёт.
