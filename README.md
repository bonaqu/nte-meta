# NTE Meta

Русскоязычный meta-hub по **Neverness to Everness**: глубокие персонажные гайды, команды и ротации внутри гайдов, тир-листы, новости, сливы и обсуждения игроков.

Production:

- сайт: <https://bonaqu.github.io/nte-meta/>
- API: <https://nte-meta-api.bonaqu.workers.dev>
- репозиторий: <https://github.com/bonaqu/nte-meta>

## Архитектура

Проект остается на бесплатной схеме **GitHub Pages + Vite/React + prerender + Cloudflare Worker API + Cloudflare D1**.

1. **React + TypeScript + Vite** отвечает за публичный интерфейс, inline-редакторы и GitHub Pages.
2. **Cloudflare Worker** предоставляет REST API, авторизацию, роли, валидацию, rate limit и audit log.
3. **Cloudflare D1** хранит пользователей, контент, комментарии, реакции, sources и настройки.

Секреты не попадают во frontend. `VITE_API_BASE_URL` для production должен указывать на Worker: `https://nte-meta-api.bonaqu.workers.dev`.

## Реализовано

- Минимальная шапка: Главная, Гайды, Персонажи, Тир-листы; системная админка видна только `moderator/admin/owner`.
- Новости и сливы находятся на главной; detail routes `/news/<slug>/` и `/leaks/<slug>/` остаются для ссылок и SEO.
- Гайды являются главным meta-продуктом: секции, команды, ротации, YouTube и билды редактируются внутри гайда.
- Страница персонажа отделена от гайда: lore/profile, способности, материалы, озвучка, симпатия, скины и CTA “Гайд на персонажа”.
- Inline-редакторы в нужных разделах: гайды, персонажи, новости, сливы, тир-лист и комьюнити-треды.
- Системная админка: dashboard, пользователи, права редакторов, модерация комментариев, предупреждения, sources, настройки, audit log, статус API/D1.
- Единый тир-лист без разделения на C0/C6 с тирами `S`, `A`, `B`, `C`, `D`.
- Автоимпорт персонажей и гайдов из проверяемых источников: NTE Wiki, GenshinBuilds, GameWith, Game8, BTVA, Dubbing Wiki, Neverness.gg voice cast, Icy Veins, Kaiden, YouTube Voice Records и официальный сайт как статус-источник. Каждая строка подтверждается редактором вручную.
- Комьюнити-треды v1: создание треда, markdown, теги, комментарии и реакции.
- Поиск и фильтры персонажей и гайдов по тиру, роли, типу, атрибуту, редкости и тегам.

## Структура

```text
.
├─ .github/workflows/
│  ├─ pages.yml
│  └─ worker.yml
├─ migrations/
│  ├─ 0001_initial_schema.sql
│  ├─ 0002_seed_content.sql
│  ├─ 0003_profile_and_security.sql
│  ├─ 0004_security_and_content_cleanup.sql
│  ├─ 0005_moderation_warnings.sql
│  ├─ 0006_editorial_architecture.sql
│  ├─ 0007_inline_editing_threads_tiers.sql
│  ├─ 0008_character_tier_d.sql
│  ├─ 0009_restore_public_guide_seed.sql
│  ├─ 0010_remove_s_plus_tier.sql
│  ├─ 0011_clean_editorial_placeholder_copy.sql
│  └─ 0012_backfill_public_hotori_guide.sql
├─ scripts/
│  ├─ prepare-test-db.mjs
│  └─ prerender.mjs
├─ src/
│  ├─ components/
│  ├─ data/
│  ├─ features/admin/
│  ├─ features/inline-editors/
│  ├─ lib/
│  ├─ App.tsx
│  ├─ styles.css
│  ├─ types.ts
│  └─ worker.js
└─ tests/
   ├─ api.spec.ts
   ├─ portal.spec.ts
   ├─ quality.spec.ts
   └─ smoke.spec.ts
```

## Локальный запуск

```powershell
Set-Location "D:\Projects\nte-hub"
npm install
npm run db:migrate:local
```

Терминал 1, Worker и локальная D1:

```powershell
npm run worker:dev -- --local --port 8787
```

Терминал 2, frontend:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8787"
npm run dev -- --port 4173
```

Откройте <http://127.0.0.1:4173>.

## Проверки

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:ui -- tests/portal.spec.ts tests/api.spec.ts tests/quality.spec.ts
```

`npm run test:ui` сам создает изолированную тестовую D1 и запускает нужные локальные серверы.

## Создание первого owner

Для новой пустой D1 задайте Worker secrets:

```powershell
npx wrangler secret put PASSWORD_PEPPER
npx wrangler secret put OWNER_BOOTSTRAP_TOKEN
```

Затем примените миграции и разверните Worker:

```powershell
npm run db:migrate:remote
npm run worker:deploy -- --env=""
```

Откройте `https://bonaqu.github.io/nte-meta/#/profile`, переключитесь на регистрацию и введите bootstrap-код первого owner. После появления активных пользователей bootstrap больше не выдаёт owner.

## Production Deploy

Перед remote D1 migration сделайте backup:

```powershell
New-Item -ItemType Directory -Force ".\backups"
npx wrangler d1 export nte-meta-db --remote --output ".\backups\nte-meta-db-before-migrate.sql"
npm run db:migrate:remote
npm run worker:deploy -- --env=""
```

Push в ветку `bonaqu_projects` запускает `.github/workflows/pages.yml`. GitHub Actions variable:

```text
VITE_API_BASE_URL=https://nte-meta-api.bonaqu.workers.dev
```

## Роли

| Роль | Возможности |
| --- | --- |
| `owner` | Полный доступ, пользователи, роли, настройки и удаление пользователей |
| `admin` | Пользователи, права редакторов, sources, настройки, модерация, статус системы |
| `editor` | Inline-создание/редактирование только разрешённых разделов; один из 4 грейдов |
| `moderator` | Комментарии, предупреждения, базовая модерация, системная админка |
| `user` | Профиль, комментарии, реакции и треды |

Worker проверяет роли и точечные права для каждого защищенного endpoint. Скрытие кнопки в UI не считается защитой.

## API

- `/api/auth/*` — регистрация, сессия, профиль, пароль и предупреждения.
- `/api/users/*` — роли, точечные права редакторов, статус аккаунта, предупреждения и мягкое удаление.
- `/api/characters`, `/api/guides`, `/api/guide-sections`.
- `/api/teams`, `/api/rotations` — внутренние данные гайдов, не самостоятельные публичные разделы.
- `/api/tierlists`, `/api/news`, `/api/leaks`, `/api/threads`.
- `/api/comments`, `/api/reactions`.
- `/api/sources`, `/api/settings`, `/api/warnings`, `/api/system/status`, `/api/audit-log`.
- `/api/character-import/lookup`, `/api/guide-import/lookup` — editor-only автоимпорт из внешних источников; данные не пишутся автоматически и требуют подтверждения каждой строки.

Актуальная последняя миграция D1: `0015_hotori_arc_voice_sources.sql`.

Для озвучки система различает `audioUrl` и `sourceUrl`: прямой аудиофайл можно проигрывать нативным `<audio>`, а YouTube/страница источника сохраняется как ссылка для ручной проверки и не притворяется mp3-файлом.

## SEO

Prerender создает реальные public/detail pages:

```text
/nte-meta/
/nte-meta/characters/
/nte-meta/guides/
/nte-meta/tierlists/
/nte-meta/characters/<slug>/
/nte-meta/guides/<slug>/
/nte-meta/news/<slug>/
/nte-meta/leaks/<slug>/
/nte-meta/threads/<slug>/
```

List pages `news`, `leaks`, `videos`, `teams`, `rotations` не индексируются как отдельные разделы. Если `VITE_API_BASE_URL` задан и API недоступен, prerender падает вместо тихого demo fallback.

## Следующие улучшения

- Автоимпорт Telegram/website/YouTube/X в очередь `sources` с ручным подтверждением.
- Cloudflare R2 для пользовательских артов и responsive AVIF/WebP.
- История ревизий материалов и сравнение тир-листов между патчами.
- D1 FTS-поиск по гайдам, секциям, новостям, тредам и комментариям.
- Расширенная модерация тредов: mute/ban, очереди жалоб, журнал решений.
- Уникальные OpenGraph-изображения для персонажей и материалов.
