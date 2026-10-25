// Invoked explicitly by the desktop button. A PR is reviewable; no auto-merge.
import { execFileSync } from 'node:child_process';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const gh = process.env.NTE_GH || 'D:\\CODEX\\Programs\\GitHubCLI\\gh.exe';
const run = (file, args) =>
  execFileSync(file, args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trimEnd();
const branch = run('git', ['branch', '--show-current']);
if (branch !== 'bonaqu_projects')
  throw Error(
    'Публикация данных выполняется из основной ветки bonaqu_projects. Сохраните текущую работу и переключите проект на неё.',
  );
const changes = run('git', [
  'status',
  '--porcelain=v1',
  '-z',
  '--untracked-files=all',
])
  .split('\0')
  .filter(Boolean);
const files = changes.map((line) => line.slice(3));
const allowed = (file) =>
  /^(?:scripts\/content\/game-data\/|public\/game-(?:assets|audio)\/|src\/data\/native-[\w-]+\.json$|migrations\/\d{4}_native_profile_update\.sql$)/.test(
    file,
  );
if (!files.length)
  throw Error(
    'Подготовленные данные совпадают с репозиторием. Публиковать нечего.',
  );
if (
  changes.some((line) => /[DRC]/.test(line.slice(0, 2))) ||
  files.some((file) => !allowed(file))
)
  throw Error(
    'В проекте есть изменения вне снимка игры или удалённые файлы. Сохраните эту работу отдельно перед публикацией данных. Ничего не отправлено.',
  );
run(gh, ['auth', 'status']);
run('git', ['fetch', 'origin', 'bonaqu_projects', '--quiet']);
if (
  run('git', ['rev-parse', 'HEAD']) !==
  run('git', ['rev-parse', 'origin/bonaqu_projects'])
)
  throw Error(
    'Основная ветка отстаёт от GitHub. Обновите проект, сохранив подготовленные файлы, затем повторите публикацию.',
  );
const nativeBranch = `codex/game-data-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
const temporary = await mkdtemp(join(tmpdir(), 'nte-publish-'));
const body =
  'Обновить снимок установленной игры и медиа. Ручные правки D1 хранятся отдельно и сохраняются. После объединения PR GitHub Actions публикует медиа и импортирует справочник. Новых персонажей можно создать черновиками из файла «Персонажи для сайта.json» в админке.';
await writeFile(
  join(temporary, 'issue.json'),
  JSON.stringify({ title: 'Обновить локальные данные NTE', body }),
);
const issue = JSON.parse(
  run(gh, [
    'api',
    'repos/bonaqu/nte-meta/issues',
    '--method',
    'POST',
    '--input',
    join(temporary, 'issue.json'),
  ]),
);
run('git', ['switch', '-c', nativeBranch]);
// Pathspecs are fixed, never shell-interpolated file names from a game archive.
run('git', [
  'add',
  '--',
  'scripts/content/game-data',
  'public/game-assets',
  'public/game-audio',
  'src/data',
  'migrations',
]);
run('git', ['commit', '-m', `Update native game snapshot (#${issue.number})`]);
run('git', ['push', '--set-upstream', 'origin', nativeBranch]);
await writeFile(
  join(temporary, 'pr.json'),
  JSON.stringify({
    title: 'Обновить данные игры NTE',
    head: nativeBranch,
    base: 'bonaqu_projects',
    body: `${body}\n\nCloses #${issue.number}`,
  }),
);
const pr = JSON.parse(
  run(gh, [
    'api',
    'repos/bonaqu/nte-meta/pulls',
    '--method',
    'POST',
    '--input',
    join(temporary, 'pr.json'),
  ]),
);
console.log(
  `PR создан: ${pr.html_url}\nДождитесь проверок и объедините PR на GitHub. Файлы игры не менялись.`,
);
