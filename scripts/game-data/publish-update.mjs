import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainBranch = 'bonaqu_projects';
const nativeBranchPattern = /^codex\/game-data-[\w-]+$/;
const repository = 'bonaqu/nte-meta';
const gh =
  process.env.NTE_GH ||
  (process.platform === 'win32'
    ? 'D:\\CODEX\\Programs\\GitHubCLI\\gh.exe'
    : 'gh');

export function runCommand(file, args, input) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    windowsHide: true,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trimEnd();
}

function workingChanges(run) {
  return run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    .split('\0')
    .filter(Boolean);
}

function checkPreparedChanges(changes) {
  const allowed = (file) =>
    /^(?:scripts\/content\/game-data\/|public\/game-(?:assets|audio)\/|src\/data\/native-[\w-]+\.json$|migrations\/\d{4}_native_profile_update\.sql$)/.test(
      file,
    );
  if (
    changes.some(
      (line) => /[DRC]/.test(line.slice(0, 2)) || !allowed(line.slice(3)),
    )
  ) {
    throw Error(
      'В проекте есть другие изменения или удалённые файлы. Сохраните эту работу отдельно перед обновлением программы. Подготовленный снимок остаётся в рабочей папке.',
    );
  }
}

export function updateProject(run = runCommand) {
  const branch = run('git', ['branch', '--show-current']);
  const changes = workingChanges(run);
  if (branch !== mainBranch) {
    if (!nativeBranchPattern.test(branch) || changes.length) {
      throw Error(
        'Сейчас открыта другая работа в проекте. Обновление доступно из основной ветки или чистой ветки игровых данных.',
      );
    }
    const upstream = run('git', [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ]);
    if (
      upstream !== 'origin/' + branch ||
      run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', upstream])
    ) {
      throw Error(
        'Ветка данных ещё не полностью отправлена. Нажмите «Создать PR данных», чтобы продолжить отправку.',
      );
    }
    run('git', ['switch', mainBranch]);
  } else {
    checkPreparedChanges(changes);
  }
  run('git', ['fetch', 'origin', mainBranch, '--quiet']);
  // Git refuses overlapping local changes and divergent history itself.
  run('git', ['merge', '--ff-only', 'origin/' + mainBranch]);
  return 'Проект обновлён. Можно готовить следующий снимок игры.';
}

function openPullRequest(run, branch, body) {
  const existing = JSON.parse(
    run(gh, [
      'api',
      'repos/' + repository + '/pulls?head=bonaqu:' + branch + '&state=all',
    ]),
  );
  const published = existing.find((pr) => pr.state === 'open' || pr.merged_at);
  if (published) return published;
  return JSON.parse(
    run(
      gh,
      [
        'api',
        'repos/' + repository + '/pulls',
        '--method',
        'POST',
        '--input',
        '-',
      ],
      JSON.stringify({
        title: 'Обновить данные игры NTE',
        head: branch,
        base: mainBranch,
        body,
      }),
    ),
  );
}

export function publishUpdate(run = runCommand) {
  let branch = run('git', ['branch', '--show-current']);
  const changes = workingChanges(run);
  run(gh, ['auth', 'status']);
  let body =
    'Обновить снимок установленной игры, медиа и профили. После объединения PR GitHub Actions публикует сайт и импортирует справочник. Новых персонажей можно создать черновиками из файла «Персонажи для сайта.json» в админке.';
  if (branch === mainBranch) {
    checkPreparedChanges(changes);
    if (!changes.length)
      throw Error(
        'Подготовленные данные совпадают с репозиторием. Публиковать нечего.',
      );
    updateProject(run);
    const remainingChanges = workingChanges(run);
    checkPreparedChanges(remainingChanges);
    if (!remainingChanges.length) {
      throw Error('Эти данные уже опубликованы. Проект обновлён.');
    }
    const issue = JSON.parse(
      run(
        gh,
        [
          'api',
          'repos/' + repository + '/issues',
          '--method',
          'POST',
          '--input',
          '-',
        ],
        JSON.stringify({ title: 'Обновить локальные данные NTE', body }),
      ),
    );
    body += '\n\nCloses #' + issue.number;
    branch =
      'codex/game-data-' +
      new Date().toISOString().replace(/\D/g, '').slice(0, 14) +
      '-' +
      randomUUID().slice(0, 8);
    run('git', ['switch', '-c', branch]);
    run('git', [
      'add',
      '--',
      'scripts/content/game-data',
      'public/game-assets',
      'public/game-audio',
      'src/data',
      'migrations',
    ]);
    run('git', [
      'commit',
      '-m',
      'Update native game snapshot (#' + issue.number + ')',
    ]);
  } else {
    if (!nativeBranchPattern.test(branch) || changes.length) {
      throw Error(
        'Публикация доступна из основной ветки или чистой ветки игровых данных. Сохраните текущие изменения отдельно.',
      );
    }
    const message = run('git', ['log', '-1', '--format=%s']);
    const issue = message.match(
      /^Update native game snapshot \(#(\d+)\)$/,
    )?.[1];
    if (!issue)
      throw Error('Ветка не содержит подготовленную публикацию программы.');
    body += '\n\nCloses #' + issue;
  }
  // A retry resumes the committed snapshot after a failed push or PR request.
  run('git', ['push', '--set-upstream', 'origin', branch]);
  const pr = openPullRequest(run, branch, body);
  run('git', ['switch', mainBranch]);
  return (
    'PR создан: ' +
    pr.html_url +
    '\nПроект готов к следующему обновлению. Дождитесь проверок и объедините PR на GitHub.'
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      process.argv.includes('--update-project')
        ? updateProject()
        : publishUpdate(),
    );
  } catch (error) {
    console.error(error.message);
    if (error.stderr) console.error(String(error.stderr).trim());
    process.exitCode = 1;
  }
}
