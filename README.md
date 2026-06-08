# NTE Meta

Русскоязычный meta-hub по **Neverness to Everness**: глубокие гайды, ротации, команды, тир-листы, новости, сливы и комьюнити. Проект построен как SPA на GitHub Pages с Cloudflare Worker API и Cloudflare D1.

## Что готово

- React + TypeScript + Vite frontend, адаптивная игровая дизайн-система.
- Главная, персонажи, гайды, S+/S/A/B/C тир-листы, новости, сливы, видео и комьюнити.
- Админка с ролями, markdown preview, YouTube, кастомными секциями и drag/drop сортировкой.
- Worker REST API с D1, валидацией, CORS, rate limit, audit log и проверкой ролей.
- Регистрация, вход, выход, смена пароля и `HttpOnly` session cookie.
- PBKDF2-SHA-256, индивидуальная соль, 20000 итераций и отдельный Worker pepper; открытые пароли и pepper не хранятся в D1.
- Профиль поддерживает изменение отображаемого имени и безопасную смену пароля с завершением всех сессий.
- Owner/admin видят список пользователей из D1 и могут назначать роли в пределах своих полномочий.
- Owner может мягко удалить чужой аккаунт; Worker немедленно отзывает его активные сессии.
- Настройки сайта и SEO редактируются в админке и сохраняются в D1; отключение регистрации проверяется на Worker.
- Все сливы требуют ручного одобрения перед публичной выдачей независимо от клиентского состояния.
- Комментарии поддерживают ответы, сортировку, редактирование, удаление, отметку полезности и очередь модерации.
- Реакции работают через API; один пользователь не может одновременно держать like и dislike.
- Черновики видят только editor/admin/owner; неподтвержденные сливы публично не выдаются.
- Playwright проверяет frontend, Worker, D1, auth, comments, reactions и logout.

## Структура

```text
.
├─ .github/workflows/
│  ├─ pages.yml                 # проверки и GitHub Pages
│  └─ worker.yml                # ручной deploy Worker + D1 migrations
├─ migrations/
│  ├─ 0001_initial_schema.sql   # полная D1 schema и индексы
│  └─ 0002_seed_content.sql     # стартовый контент
├─ public/
│  ├─ assets/
│  │  ├─ characters/            # локальные оптимизированные арты
│  │  └─ logo.svg
│  ├─ robots.txt
│  └─ sitemap.xml
├─ src/
│  ├─ data/seed.ts              # graceful fallback без API
│  ├─ lib/
│  │  ├─ api.ts                 # типизированный API client
│  │  ├─ markdown.tsx           # безопасный React renderer
│  │  └─ youtube.ts
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ styles.css
│  ├─ types.ts
│  └─ worker.js
├─ scripts/
│  └─ prepare-test-db.mjs        # изолированная D1 для Playwright
├─ tests/
│  ├─ api.spec.ts
│  └─ smoke.spec.ts
├─ .dev.vars.example
├─ .env.example
├─ index.html
├─ package.json
├─ playwright.config.ts
├─ tsconfig.json
├─ vite.config.ts
└─ wrangler.jsonc
```

## Локальный запуск

Установить зависимости и применить локальные миграции:

```powershell
Set-Location "D:\Projects\nte-meta"
npm install
npm run db:migrate:local
```

Терминал 1, API:

```powershell
npm run worker:dev -- --local --port 8787
```

Терминал 2, frontend:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8787"
npm run dev -- --port 4173
```

Открыть `http://127.0.0.1:4173`.

Проверки:

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:ui
```

## Production deploy

Текущие production-ресурсы:

- Frontend: `https://bonaqu.github.io/nte-meta/`
- API: `https://nte-meta-api.bonaqu.workers.dev`
- D1: `nte-meta-db`, регион `WEUR`

Cloudflare D1 создан, миграции применены, Worker развернут. `OWNER_BOOTSTRAP_TOKEN` хранится только как Cloudflare secret.

### Обновить production

```powershell
Set-Location "D:\Projects\nte-meta"
npm run db:migrate:remote
npm run worker:deploy -- --env=""
```

### Создать первого owner

```powershell
$workerUrl = "https://nte-meta-api.bonaqu.workers.dev"
$ownerLogin = "YOUR_OWNER_LOGIN"
$ownerPassword = Read-Host "Новый пароль owner"
$bootstrapToken = Read-Host "Одноразовый код owner"
$body = @{
  username = $ownerLogin
  password = $ownerPassword
  confirmPassword = $ownerPassword
  bootstrapToken = $bootstrapToken
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "$workerUrl/api/auth/register" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body

Remove-Variable ownerPassword, bootstrapToken
npx wrangler secret delete OWNER_BOOTSTRAP_TOKEN
```

Первый пользователь создается как `owner`. Следующие регистрации получают роль `user`.

После создания owner Cloudflare secret можно оставить: Worker больше не использует его для обычных регистраций, а конфигурация требует его наличия перед каждым production deploy.

### GitHub Actions

Repository variable `VITE_API_BASE_URL` должна содержать `https://nte-meta-api.bonaqu.workers.dev`.

Для workflow `Deploy Cloudflare Worker` добавьте secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Cloudflare API Token должен иметь минимум `Workers Scripts: Edit` и `D1: Edit` для нужного аккаунта.

GitHub Pages собирается workflow `Deploy GitHub Pages`. Worker workflow запускается вручную в разделе `Actions`.

## Роли

- `owner`: полный доступ, роли admin/owner, пользователи, настройки.
- `admin`: контент, сливы, новости, модерация, назначение editor/moderator.
- `editor`: персонажи, гайды, секции, ротации, команды, тир-листы.
- `moderator`: редактирование и скрытие комментариев.
- `user`: профиль, комментарии и реакции.

Права всегда проверяются в Worker, а не только в интерфейсе.

## API

Поддержаны `/api/auth/*`, включая профиль и смену пароля, `/api/users/*`, CRUD для `characters`, `guides`, `rotations`, `teams`, `tierlists`, `news`, `leaks`, а также `guide-sections`, `comments`, `reactions`, `settings`, `sources` и `audit-log`.

Команды и тир-листы принимают вложенные `members`/`items`. Гайд может создаваться с `sections`, а затем секции редактируются и сортируются отдельными endpoints.

## SEO

GitHub Pages остается выбранным бесплатным frontend-хостингом, потому что это требование проекта. Hash routing надежен для SPA, но поисковые системы не считают fragment URL отдельными документами. Поэтому текущий sitemap должен описывать только реальные статические URL.

Лучшее дальнейшее SEO-улучшение без платного сервера: build-time prerender гайдов/новостей или перенос frontend на Cloudflare Pages с файловыми маршрутами. Worker и D1 при этом менять не потребуется.

## Следующие улучшения

- Очередь импорта Telegram/website/youtube/twitter через `sources`.
- R2 для артов и автоматическая генерация responsive WebP/AVIF.
- Build-time prerender и отдельные OpenGraph изображения материалов.
- История ревизий контента и сравнение тир-листов между патчами.
- Mute/ban/warnings и расширенная очередь модерации.
- Полнотекстовый поиск D1 FTS по гайдам и секциям.
