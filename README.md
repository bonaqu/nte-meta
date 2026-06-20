# NTE Meta

Русскоязычный meta-hub по **Neverness to Everness**: практические гайды, гибкие ротации, команды, тир-листы, новости, сливы и обсуждения игроков.

Production:

- сайт: <https://bonaqu.github.io/nte-meta/>
- API: <https://nte-meta-api.bonaqu.workers.dev>
- репозиторий: <https://github.com/bonaqu/nte-meta>

## Архитектура

Проект разделен на три независимые части:

1. **React + TypeScript + Vite** отвечает за быстрый адаптивный интерфейс и GitHub Pages.
2. **Cloudflare Worker** предоставляет REST API, авторизацию, проверку ролей, валидацию и аудит.
3. **Cloudflare D1** хранит пользователей, контент, комментарии, реакции и настройки.

Такое разделение не передает секреты в браузер, оставляет frontend статическим и бесплатным, а backend можно развивать без переноса сайта.

## Реализовано

- Главная-dashboard, персонажи, гайды, ротации, команды, тир-листы C0/C6, новости, сливы, видео и комьюнити.
- Поиск и фильтры персонажей по тиру, роли, атрибуту, редкости и тегам.
- Гайды с произвольными секциями, markdown, live preview, YouTube и drag-and-drop сортировкой.
- Админка для всего контента, источников, комментариев, пользователей, ролей и настроек.
- Статусы `draft`, `review`, `published`, предпросмотр и защита непубличных материалов.
- Регистрация, вход, выход, профиль, смена пароля и безопасные `HttpOnly` session cookies.
- PBKDF2-SHA-256 с индивидуальной солью, Worker pepper и 210 000 итераций. Старые хеши автоматически усиливаются после успешного входа.
- Роли `owner`, `admin`, `editor`, `moderator`, `user` с обязательной серверной проверкой прав.
- Комментарии с ответами, сортировкой, редактированием, удалением, модерацией и предупреждениями.
- Реакции `like`, `dislike`, `helpful` с ограничением одной оценки каждого типа от пользователя.
- Ручное одобрение сливов и явная маркировка уровня доверия и статуса.
- Rate limit для чувствительных действий, CORS allowlist, валидация URL/body и audit log.
- Skeleton/loading, empty/error/success states, клавиатурная навигация и видимый focus.
- Build-time prerender публичных маршрутов, sitemap, canonical, OpenGraph и JSON-LD.
- Playwright-проверки API, D1, ролей, CRUD, responsive layout и WCAG 2.1 AA.

## Структура

```text
.
├─ .github/workflows/
│  ├─ pages.yml                  # проверки, prerender и GitHub Pages
│  └─ worker.yml                 # ручной deploy Worker и D1 migrations
├─ migrations/
│  ├─ 0001_initial_schema.sql    # полная схема, ограничения и индексы
│  ├─ 0002_seed_content.sql      # стартовые персонажи и материалы
│  ├─ 0003_profile_and_security.sql
│  ├─ 0004_security_and_content_cleanup.sql
│  └─ 0005_moderation_warnings.sql
├─ public/
│  ├─ assets/characters/         # локальные оптимизированные арты
│  ├─ logo.svg
│  └─ robots.txt
├─ scripts/
│  ├─ prepare-test-db.mjs        # отдельная локальная D1 для тестов
│  └─ prerender.mjs              # статические SEO-страницы и sitemap
├─ src/
│  ├─ components/ui-state.tsx    # общие loading/error/empty состояния
│  ├─ data/seed.ts               # fallback-данные при недоступном API
│  ├─ features/admin/            # формы и редакторы контента админки
│  ├─ lib/
│  │  ├─ api.ts                  # типизированный API client
│  │  ├─ markdown.tsx            # безопасный React markdown renderer
│  │  ├─ seo.ts                  # metadata для клиентской навигации
│  │  └─ youtube.ts              # проверка и privacy-friendly embed
│  ├─ App.tsx                    # маршруты и публичные представления
│  ├─ styles.css                 # дизайн-система и responsive layout
│  ├─ types.ts                   # общие типы frontend/API
│  └─ worker.js                  # Cloudflare Worker REST API
├─ tests/
│  ├─ api.spec.ts                # auth, роли, CRUD, модерация
│  ├─ portal.spec.ts             # публичные продуктовые сценарии
│  ├─ quality.spec.ts            # a11y, изображения, переполнение
│  └─ smoke.spec.ts              # базовая загрузка приложения
├─ .dev.vars.example
├─ .env.example
├─ index.html
├─ package.json
├─ playwright.config.ts
├─ vite.config.ts
└─ wrangler.jsonc
```

## Локальный запуск

```powershell
Set-Location "D:\Projects\nte-hub"
npm install
npm run db:migrate:local
```

Терминал 1, Worker и локальная D1:

```powershell
Set-Location "D:\Projects\nte-hub"
npm run worker:dev -- --local --port 8787
```

Терминал 2, frontend:

```powershell
Set-Location "D:\Projects\nte-hub"
$env:VITE_API_BASE_URL="http://127.0.0.1:8787"
npm run dev -- --port 4173
```

Откройте <http://127.0.0.1:4173>.

## Проверки

```powershell
npm run format:check
npm run typecheck
npm run lint
npm run build
npm run test:ui
npm audit
```

`npm run test:ui` сам создает изолированную тестовую D1 и запускает нужные локальные серверы.

## Создание первого owner

Эти шаги нужны только для новой пустой D1. В текущей production-базе owner уже создан.

1. Задайте два Cloudflare secret. Значения не сохраняйте в Git и не вставляйте во frontend:

```powershell
npx wrangler secret put PASSWORD_PEPPER
npx wrangler secret put OWNER_BOOTSTRAP_TOKEN
```

2. Примените миграции и разверните Worker:

```powershell
npm run db:migrate:remote
npm run worker:deploy -- --env=""
```

3. Откройте `https://bonaqu.github.io/nte-meta/admin`, выберите регистрацию и заполните логин, пароль и код первого owner.
4. После создания аккаунта следующий зарегистрированный пользователь всегда получит роль `user`. Код bootstrap больше не принимается, пока в базе есть активные пользователи.
5. Для аварийного восстановления храните bootstrap-код в менеджере паролей или замените его новым через `npx wrangler secret put OWNER_BOOTSTRAP_TOKEN`.

Пароль должен содержать не меньше 10 символов. Worker никогда не возвращает хеш, соль, pepper или session token клиенту.

## Production deploy

### Worker и D1

```powershell
Set-Location "D:\Projects\nte-hub"
npm run db:migrate:remote
npm run worker:deploy -- --env=""
```

`wrangler deploy` сохраняет Cloudflare secrets; они не находятся в `wrangler.jsonc`.

### GitHub Pages

Push в ветку `bonaqu_projects` запускает `.github/workflows/pages.yml`. Workflow выполняет типизацию, lint, Playwright, production build, prerender и публикацию `dist`.

Repository variable:

```text
VITE_API_BASE_URL=https://nte-meta-api.bonaqu.workers.dev
```

Для ручного workflow Worker нужны GitHub secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Токену достаточно прав `Workers Scripts: Edit` и `D1: Edit` на нужном аккаунте.

## Роли

| Роль        | Возможности                                                      |
| ----------- | ---------------------------------------------------------------- |
| `owner`     | Полный доступ, роли, статусы и удаление пользователей, настройки |
| `admin`     | Контент, источники, новости/сливы, модерация, editor/moderator   |
| `editor`    | Персонажи, гайды, секции, ротации, команды, тир-листы            |
| `moderator` | Комментарии, скрытие, удаление и предупреждения                  |
| `user`      | Профиль, комментарии и реакции                                   |

Иерархия и права проверяются Worker для каждого защищенного endpoint. Скрытие кнопки в интерфейсе не считается защитой.

## API

Основные группы маршрутов:

- `/api/auth/*` — конфигурация регистрации, регистрация, сессия, профиль, пароль и предупреждения;
- `/api/users/*` — роли, статус аккаунта, предупреждения и мягкое удаление;
- `/api/characters`, `/api/guides`, `/api/guide-sections`, `/api/rotations`;
- `/api/teams`, `/api/tierlists`, `/api/news`, `/api/leaks`;
- `/api/comments`, `/api/reactions`;
- `/api/sources`, `/api/settings`, `/api/audit-log`.

API отвечает в едином формате `{ "data": ... }` или `{ "error": { "code", "message" } }`. Команды/тир-листы принимают вложенные `members`/`items`, а гайд может сразу создаваться с массивом секций.

## SEO

GitHub Pages остается бесплатным статическим хостингом, но сайт больше не зависит только от hash routing. Во время `npm run build` скрипт `scripts/prerender.mjs` получает опубликованный контент из API и создает реальные документы:

```text
/nte-meta/characters/<slug>/
/nte-meta/guides/<slug>/
/nte-meta/news/<slug>/
/nte-meta/leaks/<slug>/
/nte-meta/teams/<slug>/
```

Каждый документ получает собственные `title`, description, canonical, OpenGraph и JSON-LD. Клиентская навигация после загрузки остается быстрой SPA-навигацией. Это лучший бесплатный компромисс для GitHub Pages; перенос на Cloudflare Pages не требуется для текущего объема.

## Следующие улучшения

- Автоматический импорт Telegram/website/YouTube/X в очередь `sources` с обязательным ручным одобрением.
- Cloudflare R2 для пользовательских артов и генерация responsive AVIF/WebP.
- История ревизий материалов и сравнение тир-листов между патчами.
- D1 FTS-поиск по гайдам, секциям, новостям и комментариям.
- Временные mute/ban, снятие предупреждений и журнал решений модератора.
- Уникальные OpenGraph-изображения для персонажей и материалов.
- Собственный домен и Cloudflare Web Analytics после согласования privacy-политики.
