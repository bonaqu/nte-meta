import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import vm from 'node:vm';
import type { GameDataRecord } from '../src/lib/api';
import {
  calculateProgression,
  type ProgressionData,
} from '../src/lib/progression';

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
  const stats = { heavyReads: 0 };
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
        if (sql.includes('json_each(c.records_json)')) stats.heavyReads++;
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
      '\ngetAuthUser=async()=>globalThis.testUser;logAudit=async()=>{};globalThis.contracts={handleGameData,gameTermReplacements,translateCandidate,buildLocalGameCharacterSource,localizeGameImportSuggestions,normalizeCharacterProfile,prepareCharacterImportProposal};',
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
      variants?: Array<{
        name: string;
        status: string;
        suggestions: Array<{ field: string; value: string }>;
      }>;
    }>;
    localizeGameImportSuggestions: (
      env: object,
      suggestions: Array<{ field: string; value: string }>,
    ) => Promise<void>;
    normalizeCharacterProfile: (profile: object) => {
      awakenings: unknown[];
      abilities: unknown[];
      friendship: unknown[];
    };
    prepareCharacterImportProposal: (
      sources: object[],
      character: object,
    ) => {
      suggestions: Array<{ sourceId: string; field: string; value: string }>;
      fields: Record<string, string>;
    };
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
  return { db, env, m, context, insert, api, stats };
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

test('варианты Зеро доступны отдельно; общие данные не смешивают внешность и голос', async () => {
  const f = await contract(
    JSON.parse(
      await readFile('tests/fixtures/game-data-native-zero.json', 'utf8'),
    ),
  );
  try {
    const source = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Esper Zero',
      name: 'Эспер Зеро',
    });
    expect(source.variants).toHaveLength(2);
    expect(source.variants!.map((row) => row.name).join(' ')).toContain(
      'женский вариант',
    );
    expect(source.variants!.map((row) => row.name).join(' ')).toContain(
      'мужской вариант',
    );
    const stats = JSON.parse(
      source.suggestions.find((row) => row.field === 'profile.baseStats')!
        .value,
    );
    expect(stats).toHaveLength(5);
    expect(stats).toContainEqual(
      expect.objectContaining({ label: 'АТК', value: '85' }),
    );
    expect(
      JSON.parse(
        source.suggestions.find((row) => row.field === 'profile.awakenings')!
          .value,
      ),
    ).toHaveLength(8);
    expect(
      source.suggestions.some((row) =>
        [
          'imageUrl',
          'splashUrl',
          'profile.voiceLines',
          'profile.skins',
        ].includes(row.field),
      ),
    ).toBe(false);
    const proposal = f.m.prepareCharacterImportProposal(
      [
        { ...source, id: 'local-installed-game' },
        ...source.variants!.map((variant, index) => ({
          ...variant,
          id: `local-installed-game-${index === 0 ? '1046' : '1051'}`,
        })),
      ],
      { originalName: 'Esper Zero' },
    );
    const commonAbilities = JSON.parse(
      source.suggestions.find((row) => row.field === 'profile.abilities')!
        .value,
    );
    expect(JSON.parse(proposal.fields['profile.abilities'])).toHaveLength(
      commonAbilities.length,
    );
    expect(
      proposal.suggestions.filter((row) => row.field === 'profile.abilities')
        .length,
    ).toBeGreaterThanOrEqual(3);
    expect(proposal.fields['profile.skins']).toBeUndefined();
    const progression = (await (await f.api('progression')).json()).data;
    expect(
      progression.costs.find((row: { id: string }) => row.id === '1046').name,
    ).toContain('мужской вариант');
    expect(
      progression.costs.find((row: { id: string }) => row.id === '1051').name,
    ).toContain('женский вариант');
  } finally {
    f.db.close();
  }
});

test('нативный профиль Хатор: исходные статы, навыки без дублей, коэффициенты, 6 пробуждений и 2 резонанса, аудио', async () => {
  const records = JSON.parse(
    await readFile('tests/fixtures/game-data-native-hathor.json', 'utf8'),
  ) as SourceRecord[];
  const f = await contract(records);
  try {
    const source = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Hathor',
      name: 'Хатор',
    });
    const field = (name: string) =>
      JSON.parse(
        source.suggestions.find((item) => item.field === name)?.value || '[]',
      );
    expect(field('profile.baseStats')).toContainEqual({
      id: 'AtkBase',
      label: 'АТК',
      value: '81',
    });
    const abilities = field('profile.abilities') as Array<{
      id: string;
      type: string;
      iconUrl: string;
      attributes: Array<{ value: string }>;
    }>;
    expect(
      abilities.filter((item) => item.type === 'Городской пассивный навык'),
    ).toHaveLength(1);
    expect(abilities).toHaveLength(8);
    expect(abilities.some((row) => row.id === 'GA_Hathor_Skill2')).toBe(false);
    expect(
      abilities.find((row) => row.id === 'GA_Hathor_Passive_3')?.type,
    ).toBe('Черта персонажа');
    expect(new Set(abilities.map((item) => item.id)).size).toBe(
      abilities.length,
    );
    const melee = abilities.find((item) => item.id === 'GA_Hathor_Melee');
    expect(melee?.iconUrl).toMatch(/game-assets/);
    expect(
      melee?.attributes.some((item) => /24\.3\s*%/.test(item.value)),
    ).toBeTruthy();
    const awakenings = field('profile.awakenings') as Array<{
      kind: string;
      level: number;
      iconUrl: string;
    }>;
    expect(awakenings.filter((item) => item.kind === 'awakening')).toHaveLength(
      6,
    );
    expect(
      awakenings
        .filter((item) => item.kind === 'resonance')
        .map((item) => item.level),
    ).toEqual([3, 6]);
    expect(
      awakenings.every((item) => item.iconUrl.includes('game-assets')),
    ).toBeTruthy();
    expect(field('profile.voiceLines').length).toBeGreaterThan(0);
    const friendship = field('profile.friendship') as Array<{
      level: number;
      rewards: Array<{ name: string; iconUrl: string }>;
    }>;
    expect(friendship).toHaveLength(10);
    expect(friendship.every((row) => row.rewards.length > 0)).toBeTruthy();
    expect(friendship[0].rewards[0].name).toMatch(/[А-Яа-я]/);
    const profile = Object.fromEntries(
      source.suggestions
        .filter((s) => s.field.startsWith('profile.'))
        .map((s) => {
          let value;
          try {
            value = JSON.parse(s.value);
          } catch {
            value = s.value;
          }
          return [s.field.slice(8), value];
        }),
    );
    const normalized = f.m.normalizeCharacterProfile(profile);
    expect(normalized.awakenings).toHaveLength(8);
    expect(normalized.abilities).toHaveLength(abilities.length);
    expect(normalized.friendship).toHaveLength(10);
    f.context.testUser = null;
    const progression = await (await f.api('progression')).json();
    expect(progression.data.costs).toContainEqual(
      expect.objectContaining({ id: '1025', kind: 'character' }),
    );
    expect(progression.data.experienceItems).toHaveLength(6);
    const data = progression.data as ProgressionData;
    const option = data.costs.find((row) => row.id === '1025')!;
    expect(option.stages[0]).toMatchObject({ fromLevel: 20, level: '30' });
    expect(option.stages.at(-1)).toMatchObject({ fromLevel: 70, level: '80' });
    const full = calculateProgression(data, option, 1, 80, false);
    expect(full.experience).toBe(6171460);
    expect(full.missingLevels).toEqual([]);
    expect(full.materials.find((row) => row.id === 'gold')).toMatchObject({
      name: 'Жук-монета',
      amount: 525000,
    });
    expect(
      full.materials.find((row) => row.id === 'Worldboss_material_06')?.amount,
    ).toBe(86);
    const withBooks = calculateProgression(
      data,
      option,
      1,
      80,
      false,
      {},
      'CharacterUpMaterial_lv1',
    );
    expect(withBooks.materials.find((row) => row.id === 'gold')?.amount).toBe(
      2068000,
    );
    expect(
      calculateProgression(data, option, 20, 21, false).materials.find(
        (row) => row.id === 'gold',
      )?.amount,
    ).toBe(25000);
    expect(
      calculateProgression(data, option, 70, 71, false).materials.find(
        (row) => row.id === 'gold',
      )?.amount,
    ).toBe(150000);
  } finally {
    f.db.close();
  }
});

test('кэш калькулятора исключает повторное чтение корпуса и обновляется после ручной правки', async () => {
  const records = JSON.parse(
    await readFile('tests/fixtures/game-data-native-hathor.json', 'utf8'),
  ) as SourceRecord[];
  const f = await contract(records);
  const cache = new Map<string, Response>();
  f.context.caches = {
    default: {
      async match(request: Request) {
        return cache.get(request.url)?.clone();
      },
      async put(request: Request, response: Response) {
        cache.set(request.url, response.clone());
      },
    },
  };
  try {
    const first = await f.api('progression');
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    const reads = f.stats.heavyReads;
    expect(reads).toBeGreaterThan(0);
    await f.api('progression');
    expect(f.stats.heavyReads).toBe(reads);
    const gold = records.find(
      (row) =>
        row.namespace === 'NTE_ReferenceCurrency' && row.gameId === 'gold',
    )!;
    const row = (
      await (await f.api('record?id=' + encodeURIComponent(gold.id))).json()
    ).data;
    await f.api('record', {
      id: gold.id,
      revision: row.revision,
      overrides: { values: { ru: 'Жук-монета вручную' } },
    });
    const after = (await (await f.api('progression')).json()).data;
    expect(after.items.gold.name).toBe('Жук-монета вручную');
    const refreshed = f.stats.heavyReads;
    await f.api('progression');
    expect(f.stats.heavyReads).toBe(refreshed);
    f.db
      .prepare(
        "INSERT INTO game_import_runs(dataset_hash,status) VALUES('new-dataset','complete')",
      )
      .run();
    await f.api('progression');
    expect(f.stats.heavyReads).toBeGreaterThan(refreshed);
  } finally {
    f.db.close();
  }
});

test('нативный профиль в браузере: резонансы, иконки, локальное EN/JP аудио и четыре ширины', async ({
  page,
  request,
}, testInfo) => {
  const records = JSON.parse(
    await readFile('tests/fixtures/game-data-native-hathor.json', 'utf8'),
  ) as SourceRecord[];
  const f = await contract(records);
  try {
    const source = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Hathor',
      name: 'Хатор',
    });
    const profile = Object.fromEntries(
      source.suggestions
        .filter((s) => s.field.startsWith('profile.'))
        .map((s) => {
          let value;
          try {
            value = JSON.parse(s.value);
          } catch {
            value = s.value;
          }
          return [s.field.slice(8), value];
        }),
    );
    const characters = (
      await (await request.get('http://127.0.0.1:8788/api/characters')).json()
    ).data;
    const hathor = characters.find((c: { id: string }) => c.id === 'hathor');
    hathor.profile = { ...hathor.profile, ...profile };
    await page.route('**/api/characters', (route) =>
      route.fulfill({ json: { data: characters } }),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/#/characters/hathor');
    await expect(
      page.getByText('Бонус за 3 пробуждений', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Бонус за 6 пробуждений', { exact: true }),
    ).toBeVisible();
    const basic = page.locator('.ability-card').filter({
      has: page
        .locator('summary strong')
        .filter({ hasText: 'Быстрая доставка' }),
    });
    if ((await basic.getAttribute('open')) === null)
      await basic.locator('summary').click();
    await basic.getByRole('tab', { name: /^Атрибуты/ }).click();
    await basic
      .getByRole('combobox', { name: /^Уровень навыка/ })
      .selectOption('13');
    await expect(
      basic.locator('.ability-attribute-grid dd').first(),
    ).toContainText('61.2');
    for (const language of ['Японский', 'Английский']) {
      await page.getByRole('tab', { name: new RegExp('^' + language) }).click();
      const player = page.locator('.voice-library audio').first();
      await expect(player).toBeAttached();
      const audio = await player.evaluate(async (element: HTMLAudioElement) => {
        element.load();
        await new Promise<void>((resolve, reject) => {
          element.addEventListener('loadedmetadata', () => resolve(), {
            once: true,
          });
          element.addEventListener(
            'error',
            () => reject(new Error('Audio failed')),
            { once: true },
          );
        });
        const context = new AudioContext();
        const buffer = await context.decodeAudioData(
          await (await fetch(element.currentSrc)).arrayBuffer(),
        );
        const samples = buffer.getChannelData(0);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        await context.close();
        return { duration: element.duration, peak };
      });
      expect(audio.duration).toBeGreaterThan(0);
      expect(audio.peak).toBeGreaterThan(0.001);
    }
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        String(width),
      ).toBeTruthy();
      if (width === 360 || width === 1440) {
        if (width === 360) {
          const widths = await page
            .locator('.awakening-card .character-detail-card-copy')
            .evaluateAll((elements) =>
              elements.map((element) => element.getBoundingClientRect().width),
            );
          expect(widths.every((width) => width >= 160)).toBeTruthy();
        }
        await page
          .locator('#character-awakenings')
          .evaluate((element) =>
            element.scrollIntoView({ block: 'start', behavior: 'instant' }),
          );
        await page.screenshot({
          path: testInfo.outputPath(`native-profile-${width}.png`),
        });
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
      }
    }
    expect(errors).toEqual([]);
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
