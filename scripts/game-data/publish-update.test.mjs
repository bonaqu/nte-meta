import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { updateProject, publishUpdate } from './publish-update.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nte-publish-test-'));
  t.after(() => {
    const boundary = resolve(tmpdir()) + sep;
    assert.ok(resolve(root).startsWith(boundary));
    rmSync(root, { recursive: true, force: true });
  });
  const work = join(root, 'work');
  const remote = join(root, 'remote.git');
  mkdirSync(work);
  const git = (args, cwd = work) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trimEnd();
  git(['init', '--bare', remote]);
  git(['init', '--initial-branch=bonaqu_projects']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'user.name', 'Fixture']);
  for (const directory of [
    'scripts/content/game-data',
    'public/game-assets',
    'public/game-audio',
    'src/data',
    'migrations',
  ]) {
    mkdirSync(join(work, directory), { recursive: true });
    writeFileSync(join(work, directory, '.keep'), 'fixture');
  }
  writeFileSync(join(work, 'README.md'), 'initial');
  git(['add', '.']);
  git(['commit', '-m', 'Initial']);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-u', 'origin', 'bonaqu_projects']);
  const calls = [];
  const pulls = [];
  let failPull = false;
  const run = (file, args, input) => {
    if (file === 'git') return git(args);
    calls.push({ args, input });
    if (args[0] === 'auth') return '';
    if (args[1].endsWith('/issues')) return JSON.stringify({ number: 1 });
    if (args[1].includes('/pulls?')) return JSON.stringify(pulls);
    if (failPull) throw Error('fixture network outage');
    const body = JSON.parse(input);
    assert.equal(body.base, 'bonaqu_projects');
    const pr = { html_url: 'https://example.invalid/pull/1', state: 'open' };
    pulls.push(pr);
    return JSON.stringify(pr);
  };
  return {
    root,
    work,
    git,
    run,
    calls,
    pulls,
    setFailPull: (value) => {
      failPull = value;
    },
  };
}

test('publishing can resume after PR failure and then publish a second snapshot', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.work, 'scripts/content/game-data/manifest.json'), 'one');
  f.setFailPull(true);
  assert.throws(() => publishUpdate(f.run), /network outage/);
  const pending = f.git(['branch', '--show-current']);
  assert.match(pending, /^codex\/game-data-/);
  const savedHead = f.git(['rev-parse', 'HEAD']);
  f.setFailPull(false);
  assert.match(publishUpdate(f.run), /https:\/\/example.invalid\/pull\/1/);
  assert.equal(f.git(['branch', '--show-current']), 'bonaqu_projects');
  assert.equal(f.git(['rev-parse', pending]), savedHead);
  assert.equal(f.calls.filter((x) => x.args[1]?.endsWith('/issues')).length, 1);

  // Simulate the user's merge, then update through the normal button action.
  f.git(['merge', '--ff-only', pending]);
  f.git(['push', 'origin', 'bonaqu_projects']);
  assert.match(updateProject(f.run), /обновлён/);
  writeFileSync(join(f.work, 'scripts/content/game-data/manifest.json'), 'two');
  f.pulls.length = 0;
  publishUpdate(f.run);
  assert.equal(f.git(['branch', '--show-current']), 'bonaqu_projects');
  assert.equal(f.calls.filter((x) => x.args[1]?.endsWith('/issues')).length, 2);
});

test('project update preserves prepared files and rejects unrelated edits', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.work, 'src/data/native-test.json'), 'local snapshot');
  assert.match(updateProject(f.run), /обновлён/);
  assert.equal(
    readFileSync(join(f.work, 'src/data/native-test.json'), 'utf8'),
    'local snapshot',
  );
  writeFileSync(join(f.work, 'README.md'), 'user text');
  assert.throws(() => updateProject(f.run), /другие изменения/);
  assert.equal(readFileSync(join(f.work, 'README.md'), 'utf8'), 'user text');
  assert.equal(f.calls.length, 0);
});

test('a clean pushed snapshot branch returns to main without deleting its commits', (t) => {
  const f = fixture(t);
  f.git(['switch', '-c', 'codex/game-data-previous']);
  writeFileSync(
    join(f.work, 'scripts/content/game-data/manifest.json'),
    'retained',
  );
  f.git(['add', '.']);
  f.git(['commit', '-m', 'Update native game snapshot (#1)']);
  f.git(['push', '-u', 'origin', 'codex/game-data-previous']);
  const head = f.git(['rev-parse', 'HEAD']);
  updateProject(f.run);
  assert.equal(f.git(['branch', '--show-current']), 'bonaqu_projects');
  assert.equal(f.git(['rev-parse', 'codex/game-data-previous']), head);
});
