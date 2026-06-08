import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspace = process.cwd();
const wranglerRoot = path.resolve(workspace, '.wrangler');
const target = path.resolve(wranglerRoot, 'test-state');

if (!target.startsWith(`${wranglerRoot}${path.sep}`)) {
  throw new Error('Небезопасный путь тестовой D1');
}

await rm(target, { recursive: true, force: true });
