import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { recordGuideSources } from '../src/lib/guide-sources';
import type { CharacterImportSuggestion, GuideSection } from '../src/types';

type Source = {
  id: string;
  url: string;
  publicUrl?: string;
  referenceOnly?: boolean;
  guideOnly?: boolean;
  raw?: boolean;
  parser?: () => Array<{ field: string; value: string }>;
  resolveUrl?: WorkerContracts['resolveCatalogueImportSource'];
};
type WorkerContracts = {
  nevernessAppCharacterCode: (character: object) => string;
  resolveCatalogueImportSource: (
    source: Source,
    character: object,
    options: object,
  ) => Promise<Source>;
  findImportCharacter: (
    env: unknown,
    query: string,
  ) => Promise<{ slug?: string }>;
  fetchImportSource: (
    source: Source,
    character: object,
    deadline: object,
  ) => Promise<{
    status: string;
    publicUrl?: string;
    updatedAt?: string;
    suggestions: unknown[];
  }>;
  resolveWotpackGuideSource: (
    source: Source,
    character: object,
    options: object,
  ) => Promise<Source | null>;
};

async function workerContracts(fetcher: typeof fetch) {
  const source = await readFile('src/worker.js', 'utf8');
  const context = vm.createContext({
    URL,
    Response,
    AbortController,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    fetch: fetcher,
  });
  new vm.Script(
    source.replace('export default {', 'const worker = {') +
      '\n globalThis.contracts = { findImportCharacter, fetchImportSource, resolveWotpackGuideSource, resolveCatalogueImportSource, nevernessAppCharacterCode };',
  ).runInContext(context);
  return context.contracts as WorkerContracts;
}

test('каталог источника находит akane_rin и даёт рабочую ссылку вместо отсутствующей страницы', async () => {
  const m = await workerContracts(
    async () =>
      new Response(
        '<a href="/ru/neverness-to-everness/characters/akane_rin">Аканэ</a>',
      ),
  );
  const found = await m.resolveCatalogueImportSource(
    {
      id: 'genshin-builds-ru',
      url: 'https://genshin-builds.com/ru/neverness-to-everness/characters/akane',
    },
    { slug: 'akane', originalName: 'Akane Rin' },
    {},
  );
  expect(found.url).toBe(
    'https://genshin-builds.com/ru/neverness-to-everness/characters/akane_rin',
  );
  expect(found.referenceOnly).toBeFalsy();
  const absent = await m.resolveCatalogueImportSource(
    {
      id: 'gamewith-detail-ru',
      url: 'https://gamewith.ai/nte/ru/character/blackbird',
    },
    { slug: 'blackbird', originalName: 'Blackbird' },
    {},
  );
  expect(absent).toMatchObject({
    url: 'https://gamewith.ai/nte/ru/character',
    referenceOnly: true,
  });
  const result = await m.fetchImportSource(
    {
      id: 'gamewith-detail-ru',
      url: 'https://gamewith.ai/nte/ru/character/blackbird',
      resolveUrl: m.resolveCatalogueImportSource,
      // A catalog parser must never propose another character's fields.
      parser: () => [{ field: 'name', value: 'Другой персонаж' }],
    },
    { slug: 'blackbird', originalName: 'Blackbird' },
    { signal: new AbortController().signal, remainingMs: () => 45000 },
  );
  expect(result.status).toBe('reference');
  expect(result.suggestions).toEqual([]);
});

test('Аканэ Рин использует действующий адрес Neverness.app для профиля и гайда', async () => {
  const m = await workerContracts(async () => new Response(''));
  for (const character of [
    { slug: 'akane' },
    { slug: 'akane-rin' },
    { originalName: 'Akane Rin' },
  ])
    expect(m.nevernessAppCharacterCode(character)).toBe('akane');
});

test('импорт узнаёт русское имя без учёта регистра и внутренние алиасы', async () => {
  const m = await workerContracts(fetch);
  const rows = [
    { slug: 'hotori', name: 'Хотори', original_name: 'Hotori' },
    { slug: 'baicang', name: 'Байканг', original_name: 'Baicang' },
  ];
  const env = {
    DB: { prepare: () => ({ all: async () => ({ results: rows }) }) },
  };
  for (const query of ['хотори', 'ХОТОРИ', 'Hotori', 'jin'])
    expect((await m.findImportCharacter(env, query)).slug).toBe('hotori');
  expect((await m.findImportCharacter(env, 'cang')).slug).toBe('baicang');
  expect(await m.findImportCharacter(env, 'Чужой персонаж')).toEqual({});
});

test('крупный гайд разбирается в своём лимите, API-ссылка сохраняет публичный адрес', async () => {
  let body =
    '<script type="application/ld+json">{"dateModified":"2026-10-20T12:00:00Z"}</script>' +
    ' '.repeat(620000);
  const m = await workerContracts(async () => new Response(body));
  const source: Source = {
    id: 'kaiden-character-guide',
    url: 'https://example.com/api',
    publicUrl: 'https://example.com/guide',
    guideOnly: true,
    raw: true,
    parser: () => [
      { field: 'guide.teams', value: 'Состав' },
      { field: 'imageUrl', value: 'https://example.com/image.webp' },
    ],
  };
  const deadline = {
    signal: new AbortController().signal,
    remainingMs: () => 45000,
  };
  const result = await m.fetchImportSource(source, {}, deadline);
  expect(result.status).toBe('ok');
  expect(result.publicUrl).toBe('https://example.com/guide');
  expect(result.updatedAt).toBe('2026-10-20T12:00:00.000Z');
  expect(result.suggestions).toHaveLength(1);
  expect(
    (
      await m.fetchImportSource(
        { ...source, id: 'ordinary-source' },
        {},
        deadline,
      )
    ).status,
  ).toBe('failed');
  body = ' '.repeat(1500001);
  expect((await m.fetchImportSource(source, {}, deadline)).status).toBe(
    'failed',
  );
  expect(
    (
      await m.fetchImportSource(
        { ...source, referenceOnly: true },
        {},
        deadline,
      )
    ).status,
  ).toBe('reference');
});

test('Wotpack ищет текущий адрес, известный URL используется как запасной', async () => {
  let rows = [
    {
      title: 'Хотори в NTE: новый гайд',
      url: 'https://wotpack.ru/current-hotori-guide/',
    },
  ];
  const m = await workerContracts(async () => Response.json(rows));
  const source = {
    id: 'wotpack',
    url: 'https://wotpack.ru/wp-json/wp/v2/search',
  };
  const character = { slug: 'hotori', name: 'Хотори', originalName: 'Hotori' };
  expect((await m.resolveWotpackGuideSource(source, character, {}))?.url).toBe(
    rows[0].url,
  );
  rows = [];
  expect(
    (await m.resolveWotpackGuideSource(source, character, {}))?.url,
  ).toContain('/hotori-v-neverness-to-everness-nte-gayd-i-luchshiy-bild/');
});

test('принятый импорт сохраняет источники без дублей и потери авторского текста', () => {
  const sections: GuideSection[] = [
    {
      id: 'original',
      title: 'Ротация',
      type: 'rotation',
      content: 'Авторская ротация',
      position: 1,
    },
  ];
  const suggestion = {
    sourceName: 'Первичный источник',
    sourceUrl: 'https://example.com/guide',
    sources: [
      { name: 'Первичный источник', url: 'https://example.com/guide' },
      { name: 'Сверка', url: 'https://example.org/build' },
    ],
  } as CharacterImportSuggestion;
  const next = recordGuideSources(sections, suggestion);
  expect(next[0]).toEqual(sections[0]);
  expect(next[1].type).toBe('sources');
  expect(next[1].content).toContain(
    '[Первичный источник](https://example.com/guide)',
  );
  expect(next[1].content).toContain('[Сверка](https://example.org/build)');
  expect(recordGuideSources(next, suggestion)).toEqual(next);
  expect(
    recordGuideSources(sections, {
      ...suggestion,
      sources: [{ name: 'Bad', url: 'javascript:alert(1)' }],
    }),
  ).toEqual(sections);
});
