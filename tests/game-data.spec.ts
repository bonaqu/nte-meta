import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import vm from 'node:vm';
import type { GameDataRecord } from '../src/lib/api';

type SourceRecord = GameDataRecord & {
  sourceHash: string;
  search: string;
  term: boolean;
};
async function fixture() {
  return JSON.parse(
    await readFile('tests/fixtures/game-data.json', 'utf8'),
  ) as SourceRecord[];
}
async function contract(records: SourceRecord[]) {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile('migrations/0036_local_game_reference.sql', 'utf8'));
  db.exec('CREATE TABLE characters(name TEXT,original_name TEXT)');
  const { chunkImportSql } = await import('../scripts/game-data/import.mjs');
  function insert(items: SourceRecord[]) {
    const chunks = new Map<string, SourceRecord[]>();
    for (const row of items) {
      const id = row.id.split('|')[0];
      chunks.set(id, [...(chunks.get(id) || []), row]);
    }
    for (const [id, rows] of chunks) {
      db.prepare(chunkImportSql).run(
        id,
        rows[0].kind,
        JSON.stringify(rows),
        rows.map((r) => r.search).join(' '),
        rows.map((r) => r.sourceHash).join(''),
        rows.length,
      );
    }
  }
  insert(records);
  const env = {
    DB: {
      prepare(sql: string) {
        let args: SQLInputValue[] = [];
        return {
          bind(...values: SQLInputValue[]) {
            args = values;
            return this;
          },
          async all() {
            return { results: db.prepare(sql).all(...args) };
          },
          async first() {
            return db.prepare(sql).get(...args) || null;
          },
          async run() {
            const result = db.prepare(sql).run(...args);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      },
    },
  };
  const context = vm.createContext({
    URL,
    Request,
    Response,
    AbortController,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return new Response(
        JSON.stringify([[[url.searchParams.get('q') + ' перевод']]]),
      );
    },
  });
  new vm.Script(
    (await readFile('src/worker.js', 'utf8')).replace(
      'export default {',
      'const worker={',
    ) +
      '\ngetAuthUser=async()=>globalThis.testUser;logAudit=async()=>{};globalThis.contracts={handleGameData,gameTermReplacements,translateCandidate,buildLocalGameCharacterSource,localizeGameImportSuggestions};',
  ).runInContext(context);
  const m = context.contracts as {
    handleGameData: (r: Request, e: object, p: string[]) => Promise<Response>;
    gameTermReplacements: (
      e: object,
      text: string,
    ) => Promise<{ text: string; matches: unknown[] }>;
    translateCandidate: (c: object, e: object) => Promise<{ title: string }>;
    buildLocalGameCharacterSource: (
      e: object,
      c: object,
    ) => Promise<{
      suggestions: Array<{ field: string; value: string }>;
      message?: string;
    }>;
    localizeGameImportSuggestions: (
      env: object,
      suggestions: Array<{ field: string; value: string }>,
    ) => Promise<void>;
  };
  context.testUser = { id: 'owner', role: 'owner' };
  async function api(path: string, body?: object) {
    return m.handleGameData(
      new Request('https://example.com/api/game-data/' + path, {
        method: body ? 'PATCH' : 'GET',
        ...(body
          ? {
              body: JSON.stringify(body),
              headers: { 'content-type': 'application/json' },
            }
          : {}),
      }),
      env,
      ['game-data', path.split('?')[0]],
    );
  }
  return { db, env, m, context, insert, api };
}

test('локальные данные: четыре языка, сохранение, поиск, перевод, конфликт и повторный импорт', async () => {
  const records = await fixture();
  const f = await contract(records);
  const row = records.find((r) => r.gameId === 'Role_Name_025')!;
  try {
    const result = await (
      await f.api('records?q=Hathor&owner=1025&kind=character')
    ).json();
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].values).toMatchObject({
      ru: 'Хатор',
      en: 'Hathor',
      ja: 'ハソール',
      zh: '哈索尔',
    });
    const original = await (
      await f.api('record?id=' + encodeURIComponent(row.id))
    ).json();
    const saved = await (
      await f.api('record', {
        id: row.id,
        revision: original.data.revision,
        overrides: { values: { ru: 'Хатор вручную' }, details: { level: 80 } },
      })
    ).json();
    expect(saved.data.values.ru).toBe('Хатор вручную');
    expect(saved.data.original.values.ru).toBe('Хатор');
    const proposals = [
      {
        field: 'guide.equipment',
        value: JSON.stringify({
          name: 'Hathor',
          id: 'Hathor',
          imageUrl: 'https://example.com/Hathor.png',
        }),
      },
    ];
    await f.m.localizeGameImportSuggestions(f.env, proposals);
    expect(JSON.parse(proposals[0].value)).toEqual({
      name: 'Хатор вручную',
      id: 'Hathor',
      imageUrl: 'https://example.com/Hathor.png',
    });
    expect(
      (await f.m.gameTermReplacements(f.env, 'Hathor uses a skill.')).text,
    ).toBe('Хатор вручную uses a skill.');
    expect(
      (await f.m.gameTermReplacements(f.env, 'ハソールのスキル')).text,
    ).toBe('Хатор вручнуюのスキル');
    expect((await f.m.gameTermReplacements(f.env, '哈索尔使用技能')).text).toBe(
      'Хатор вручную使用技能',
    );
    expect(
      (
        await f.m.translateCandidate(
          { language: 'en', title: 'Hathor uses a skill', excerpt: '' },
          f.env,
        )
      ).title,
    ).toContain('Хатор вручную');
    expect(
      (await (await f.api('records?q=вручную')).json()).data.items[0].id,
    ).toBe(row.id);
    await expect(
      f.api('record', {
        id: row.id,
        revision: original.data.revision,
        overrides: { values: { ru: 'Stale' } },
      }),
    ).rejects.toMatchObject({ status: 409 });
    f.insert(records);
    expect(
      f.db
        .prepare('SELECT overrides_json FROM game_record_overrides WHERE id=?')
        .get(row.id),
    ).toMatchObject({
      overrides_json: JSON.stringify({
        values: { ru: 'Хатор вручную' },
        details: { level: 80 },
      }),
    });
    const changed = records.map((r) =>
      r.id === row.id
        ? {
            ...r,
            sourceHash: 'new-source-hash',
            values: { ...r.values, ru: 'Хатор новая исходная' },
          }
        : r,
    );
    f.insert(changed);
    const refreshed = await (
      await f.api('record?id=' + encodeURIComponent(row.id))
    ).json();
    expect(refreshed.data.values.ru).toBe('Хатор вручную');
    expect(refreshed.data.original.values.ru).toBe('Хатор новая исходная');
    await expect(
      f.api('record', {
        id: row.id,
        revision: saved.data.revision,
        reset: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const reset = await (
      await f.api('record', {
        id: row.id,
        revision: refreshed.data.revision,
        reset: true,
      })
    ).json();
    expect(reset.data.values.ru).toBe('Хатор новая исходная');
    const source = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Hathor',
    });
    expect(source.suggestions).toContainEqual(
      expect.objectContaining({ field: 'name', value: 'Хатор новая исходная' }),
    );
  } finally {
    f.db.close();
  }
});

test('справочник защищён правами; некорректные данные не сохраняются', async () => {
  const records = await fixture();
  const f = await contract(records);
  const row = records[0];
  try {
    f.context.testUser = null;
    await expect(f.api('records')).rejects.toMatchObject({ status: 401 });
    f.context.testUser = { id: 'editor', role: 'editor' };
    await expect(f.api('records')).rejects.toMatchObject({ status: 403 });
    f.context.testUser = { id: 'owner', role: 'owner' };
    const current = await (
      await f.api('record?id=' + encodeURIComponent(row.id))
    ).json();
    for (const overrides of [
      { values: { fr: 'not supported' } },
      { assets: [{ url: 'javascript:alert(1)' }] },
      { details: [] },
      { kind: 'invalid' },
    ])
      await expect(
        f.api('record', {
          id: row.id,
          revision: current.data.revision,
          overrides,
        }),
      ).rejects.toMatchObject({ status: 400 });
    expect(
      f.db.prepare('SELECT COUNT(*) AS count FROM game_record_overrides').get(),
    ).toMatchObject({ count: 0 });
  } finally {
    f.db.close();
  }
});

test('одноимённые старые ID не подменяют действующего персонажа', async () => {
  const records = JSON.parse(
    await readFile('tests/fixtures/game-data-active-characters.json', 'utf8'),
  ) as SourceRecord[];
  const f = await contract(records);
  try {
    const source = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Adler',
      name: 'Адлер',
    });
    expect(source.message).toContain('Игровой ID 1033.');
    expect(source.suggestions).toContainEqual(
      expect.objectContaining({ field: 'name', value: 'Адлер' }),
    );
  } finally {
    f.db.close();
  }
});

test('админка справочника: фильтры, JSON-валидация, сохранение и четыре ширины', async ({
  page,
}, testInfo) => {
  const rows = await fixture();
  let record = {
    ...rows[0],
    revision: rows[0].sourceHash + ':0',
    modified: false,
    original: rows[0],
  };
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'owner',
          role: 'owner',
          username: 'owner',
          status: 'active',
        },
      },
    }),
  );
  await page.route('**/api/auth/warnings', (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route('**/api/game-data/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/stats'))
      return route.fulfill({
        json: { data: { total: rows.length, kinds: [] } },
      });
    if (url.pathname.endsWith('/records'))
      return route.fulfill({
        json: {
          data: {
            items: rows
              .filter(
                (r) =>
                  (!url.searchParams.get('kind') ||
                    r.kind === url.searchParams.get('kind')) &&
                  (!url.searchParams.get('q') ||
                    r.search.includes(
                      url.searchParams.get('q')!.toLowerCase(),
                    )),
              )
              .map((r) => (r.id === record.id ? record : r)),
            nextOffset: null,
          },
        },
      });
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      record = {
        ...record,
        ...body.overrides,
        values: { ...record.original.values, ...body.overrides.values },
        revision: record.sourceHash + ':1',
        modified: true,
      };
    }
    return route.fulfill({ json: { data: record } });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/admin/game-data');
  await expect(
    page.getByRole('heading', { name: 'Данные игры', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Хатор Персонажи/ }).click();
  const editor = page.getByRole('form', { name: 'Редактирование записи игры' });
  await expect(editor.getByLabel('English', { exact: true })).toHaveValue(
    'Hathor',
  );
  await editor.getByLabel('Русский', { exact: true }).fill('Хатор вручную');
  await editor.getByLabel('Данные записи (JSON)').fill('{');
  await editor
    .getByRole('button', { name: 'Сохранить в базу', exact: true })
    .click();
  await expect(editor.getByRole('alert')).toContainText('JSON');
  await editor.getByLabel('Данные записи (JSON)').fill('{"level":80}');
  await editor
    .getByRole('button', { name: 'Сохранить в базу', exact: true })
    .click();
  await expect(
    page.getByText('Данные обновлены в базе.', { exact: true }),
  ).toBeVisible();
  expect(record.values.ru).toBe('Хатор вручную');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const editorBounds = await editor.boundingBox();
    expect(editorBounds!.x).toBeGreaterThanOrEqual(0);
    expect(editorBounds!.x + editorBounds!.width).toBeLessThanOrEqual(
      width + 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      String(width),
    ).toBeTruthy();
    if (width === 360 || width === 1440)
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    if (width === 360 || width === 1440) {
      await editor.getByRole('heading').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`game-data-${width}.png`),
      });
    }
  }
  await page
    .getByRole('combobox', { name: 'Тип записи', exact: true })
    .first()
    .selectOption('skill');
  await expect(page.locator('.game-data-list li')).toHaveCount(rows.length - 1);
  expect(errors).toEqual([]);
});
