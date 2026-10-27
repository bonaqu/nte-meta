import { gunzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import vm from 'node:vm';
import type { GameDataRecord } from '../src/lib/api';
import type { GuideVisualItem } from '../src/types';
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
      '\ngetAuthUser=async()=>globalThis.testUser;logAudit=async()=>{};globalThis.contracts={handleGameData,handleGuideImportLookup,gameTermReplacements,translateCandidate,buildLocalGameCharacterSource,buildLocalGameGuideSources,localizeGameImportSuggestions,normalizeCharacterProfile,prepareCharacterImportProposal};',
  ).runInContext(context);
  const m = context.contracts as {
    handleGameData: (r: Request, e: object, p: string[]) => Promise<Response>;
    handleGuideImportLookup: (r: Request, e: object) => Promise<Response>;
    gameTermReplacements: (
      e: object,
      text: string,
    ) => Promise<{ text: string; matches: unknown[] }>;
    translateCandidate: (c: object, e: object) => Promise<{ title: string }>;
    buildLocalGameGuideSources: (
      e: object,
      c: object,
    ) => Promise<
      Array<{
        ownerId: string;
        suggestions: Array<{ field: string; value: string }>;
        recommendations: {
          arcs: GuideVisualItem[];
          stats: GuideVisualItem[];
          stages: Array<{
            skills: Array<{
              id: string;
              name: string;
              imageUrl: string;
              level: number;
            }>;
          }>;
          unresolved: string[];
        };
      }>
    >;
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
    const appearanceVariants = JSON.parse(
      source.suggestions.find(
        (row) => row.field === 'profile.appearanceVariants',
      )!.value,
    );
    expect(
      appearanceVariants.map((row: { id: string }) => row.id).sort(),
    ).toEqual(['1046', '1051']);
    expect(
      appearanceVariants.find((row: { id: string }) => row.id === '1046').name,
    ).toBe('Мужской вариант');
    expect(
      appearanceVariants.find((row: { id: string }) => row.id === '1051').name,
    ).toBe('Женский вариант');
    expect(
      appearanceVariants.every(
        (row: { skins: unknown[] }) => row.skins.length > 0,
      ),
    ).toBeTruthy();
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
    for (const [id, gender] of [
      ['1046', /мужск/iu],
      ['1051', /женск/iu],
    ] as const) {
      const original = source.variants!.find((variant) =>
        gender.test(variant.name),
      )!;
      const expected = JSON.parse(
        original.suggestions.find((row) => row.field === 'profile.abilities')!
          .value,
      );
      expect(expected.length).toBeGreaterThan(4);
      expect(
        appearanceVariants.find((row: { id: string }) => row.id === id)
          .abilities,
      ).toEqual(expected);
    }
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
    expect(
      progression.data.experienceItems.every((item: { id: string }) =>
        progression.data.items[item.id]?.iconUrl?.includes('game-assets/'),
      ),
    ).toBe(true);
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

test('видимые начальные характеристики используют игровые метаданные и проценты, не выдумывая отсутствующие значения', async () => {
  const records = JSON.parse(
    await readFile('tests/fixtures/game-data-native-hathor.json', 'utf8'),
  ) as SourceRecord[];
  const metadata = JSON.parse(
    await readFile('tests/fixtures/native-attributes.json', 'utf8'),
  ) as SourceRecord[];
  const f = await contract([...records, ...metadata]);
  try {
    const source = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Hathor',
      name: 'Хатор',
    });
    const stats = JSON.parse(
      source.suggestions.find((s) => s.field === 'profile.baseStats')!.value,
    ) as { id: string; label: string; value: string }[];
    expect(stats).toHaveLength(23);
    expect(new Set(stats.map((s) => s.id)).size).toBe(23);
    expect(stats.find((s) => s.id === 'ChargeGetEfficiencyBase')).toEqual({
      id: 'ChargeGetEfficiencyBase',
      label: 'Скорость зарядки',
      value: '100%',
    });
    expect(stats.find((s) => s.id === 'Mag')).toEqual({
      id: 'Mag',
      label: 'Интенсивность цикла',
      value: '0',
    });
    expect(stats.find((s) => s.id === 'DamageResistCosmos')).toEqual({
      id: 'DamageResistCosmos',
      label: 'Сопротивление космосу',
      value: '0%',
    });
    expect(
      stats.some((s) =>
        [
          'StrengthMax',
          'HealUp',
          'HealBeUp',
          'AtkAdd',
          'SumCosmosEfficiency',
        ].includes(s.id),
      ),
    ).toBe(false);
    expect(stats.every((s) => /[А-Яа-яЁё]/.test(s.label))).toBe(true);
    const pack = records.find((r) => r.namespace === 'DT_PlayerPackData')!;
    f.db
      .prepare(
        'INSERT INTO game_record_overrides(id,chunk_id,overrides_json,search_text,revision) VALUES(?,?,?,?,1)',
      )
      .run(
        pack.id,
        pack.id.split('|')[0],
        JSON.stringify({
          details: { ...pack.details, ChargeGetEfficiencyBase: 1.125 },
        }),
        'override',
      );
    const edited = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Hathor',
      name: 'Хатор',
    });
    expect(
      JSON.parse(
        edited.suggestions.find((s) => s.field === 'profile.baseStats')!.value,
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: 'ChargeGetEfficiencyBase',
        value: '112.5%',
      }),
    );
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
    await page.clock.install();
    await page.goto('/#/characters/hathor');
    await expect(
      page.getByText('Бонус за 3 пробуждения', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Бонус за 6 пробуждений', { exact: true }),
    ).toBeVisible();
    // A lazy image below the fold must survive time spent reading the biography.
    await page.clock.fastForward(4_000);
    await expect(page.locator('.skin-media img').first()).toBeAttached();
    await page.locator('.skin-media img').first().scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page
          .locator('.skin-media img')
          .first()
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBeTruthy();
    const basic = page.locator('.ability-card').filter({
      has: page
        .locator('summary strong')
        .filter({ hasText: 'Быстрая доставка' }),
    });
    if ((await basic.getAttribute('open')) === null)
      await basic.locator('summary').click();
    await basic.getByRole('tab', { name: /^Атрибуты/ }).click();
    const levels = basic.getByRole('group', { name: /^Уровень навыка/ });
    await expect(levels.getByRole('button')).toHaveCount(13);
    await levels.getByRole('button', { name: 'Ур. 13', exact: true }).click();
    await expect(
      levels.getByRole('button', { name: 'Ур. 13', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
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

test('рекомендации клиента: 25 вариантов, русские дуги/статы/уровни навыков и ручные переопределения', async () => {
  const namespaces = new Set([
    'ST_Player',
    'NTE_ReferenceCharacter',
    'DT_DefaultAppearanceData',
    'DT_CultivationGuideData',
    'DT_GameplayAbilityTipsData',
    'DT_AttributeStaticData',
    'ST_Attribute',
    'ST_Fork',
    'NTE_ReferenceWeapon',
  ]);
  const records = gunzipSync(
    await readFile('scripts/content/game-data/chunks.jsonl.gz'),
  )
    .toString('utf8')
    .trim()
    .split('\n')
    .flatMap((line) =>
      (JSON.parse(line).records as SourceRecord[]).filter(
        (row) =>
          namespaces.has(row.namespace) || /SkillDes$/i.test(row.namespace),
      ),
    );
  const f = await contract(records);
  try {
    const active = new Set(
      records
        .filter((row) => row.namespace === 'DT_DefaultAppearanceData')
        .map((row) => row.gameId),
    );
    const identities = records.filter(
      (row) =>
        row.namespace === 'NTE_ReferenceCharacter' && active.has(row.ownerId),
    );
    expect(identities).toHaveLength(25);
    for (const identity of identities) {
      const sources = await f.m.buildLocalGameGuideSources(f.env, {
        name: identity.values.ru,
        originalName: identity.values.en,
        gameDataOwnerId: identity.ownerId,
      });
      expect(sources, identity.ownerId).toHaveLength(1);
      const source = sources[0];
      expect(source.ownerId).toBe(identity.ownerId);
      expect(source.recommendations.unresolved, identity.ownerId).toEqual([]);
      expect(source.recommendations.arcs).toHaveLength(2);
      expect(source.recommendations.stats.length).toBeGreaterThan(0);
      expect(source.suggestions.map((row) => row.field)).toEqual([
        'guide.bestArcs',
        'guide.mainStats',
      ]);
      expect(source.recommendations.stages).toHaveLength(8);
      for (const stage of source.recommendations.stages) {
        expect(stage.skills).toHaveLength(4);
        for (const skill of stage.skills) {
          expect(skill.name).toMatch(/[а-яё]/i);
          expect(skill.imageUrl).toContain('game-assets/');
          expect(skill.level).toBeGreaterThanOrEqual(1);
          expect(skill.level).toBeLessThanOrEqual(10);
          if (identity.ownerId === '1046') expect(skill.id).toContain('046');
          if (identity.ownerId === '1051') expect(skill.id).toContain('051');
        }
      }
      for (const row of [
        ...source.recommendations.arcs,
        ...source.recommendations.stats,
      ]) {
        expect(row.name).toMatch(/[а-яё]/i);
        expect(row.imageUrl).toContain('game-assets/');
      }
    }
    const zero = await f.m.buildLocalGameGuideSources(f.env, {
      name: 'Зеро',
      originalName: 'Esper Zero',
    });
    expect(zero.map((row) => row.ownerId)).toEqual(['1046', '1051']);
    expect(
      await f.m.buildLocalGameGuideSources(f.env, {
        name: 'Незнакомый персонаж',
        gameDataOwnerId: '1033',
      }),
    ).toEqual([]);
    f.db.exec(
      "ALTER TABLE characters ADD COLUMN slug TEXT; INSERT INTO characters(name,original_name,slug) VALUES('Адлер','Adler','adler')",
    );
    new vm.Script(
      'rateLimit=async()=>{};guideImportSources=()=>[];',
    ).runInContext(f.context);
    const lookup = await f.m.handleGuideImportLookup(
      new Request('https://example.com/api/guide-import/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'Адлер' }),
      }),
      f.env,
    );
    expect(lookup.ok).toBe(true);
    const imported = (await lookup.json()).data;
    expect(imported.found).toBe(true);
    expect(imported.sources).toHaveLength(1);
    expect(imported.sources[0].id).toBe('local-game-guide-1033');
    expect(
      imported.suggestions.map((row: { field: string }) => row.field),
    ).toEqual(['guide.bestArcs', 'guide.mainStats']);
    expect(JSON.parse(imported.fields['guide.bestArcs'])).toHaveLength(2);
    // The public lookup must retain the web source's order/equality while
    // resolving its generic skill labels to this exact native character.
    f.context.priorityFixture =
      '<h1>Adler Guide</h1><h2>Adler Skill Priority</h2><p>Skill = Ultimate &gt; Basic Attack &gt; Support Skill</p>';
    new vm.Script(`
      fetch=async()=>new Response(globalThis.priorityFixture);
      guideImportSources=()=>[{id:'icy-veins-build-guide',name:'Icy Veins',url:'https://www.icy-veins.com/neverness-to-everness/adler-guide-best-builds',raw:true,parser:parseIcyVeinsGuideImport}];
    `).runInContext(f.context);
    const webLookup = await f.m.handleGuideImportLookup(
      new Request('https://example.com/api/guide-import/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'Адлер' }),
      }),
      f.env,
    );
    expect(webLookup.ok).toBe(true);
    const webResult = (await webLookup.json()).data;
    const priority = JSON.parse(
      webResult.suggestions.find(
        (row: { field: string }) => row.field === 'guide.skillPriority',
      ).value,
    );
    const nativeAdler = (
      await f.m.buildLocalGameGuideSources(f.env, {
        name: 'Адлер',
        originalName: 'Adler',
      })
    )[0];
    const nativeSkills = nativeAdler.recommendations.stages[0].skills;
    expect(priority.map((row: GuideVisualItem) => row.equalPriority)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    for (const row of priority) {
      const skill = nativeSkills.find(
        (item: { skillType: string }) => item.skillType === row.skillType,
      )!;
      expect(skill).toBeTruthy();
      expect(row).toMatchObject({
        name: skill.name,
        imageUrl: skill.imageUrl,
        description: '',
      });
    }
    const name = records.find(
      (row) => row.namespace === 'ST_Attribute' && row.gameId === 'Def',
    )!;
    const original = (
      await (await f.api('record?id=' + encodeURIComponent(name.id))).json()
    ).data;
    const changed = await f.api('record', {
      id: name.id,
      revision: original.revision,
      overrides: { values: { ru: 'Защита администратора' } },
    });
    expect(changed.ok).toBe(true);
    const adler = {
      name: 'Адлер',
      originalName: 'Adler',
      gameDataOwnerId: '1033',
    };
    const updated = (await f.m.buildLocalGameGuideSources(f.env, adler))[0];
    expect(
      updated.recommendations.stats.every((row) =>
        row.name.startsWith('Защита администратора'),
      ),
    ).toBe(true);
    const guide = records.find(
      (row) =>
        row.namespace === 'DT_CultivationGuideData' && row.ownerId === '1033',
    )!;
    f.insert([
      {
        ...guide,
        sourceHash: guide.sourceHash + '-unknown',
        details: {
          ...guide.details,
          RecommendForkList: [{ ForkItemId: 'missing' }],
        },
      },
    ]);
    const partial = (await f.m.buildLocalGameGuideSources(f.env, adler))[0];
    expect(partial.recommendations.unresolved).toContain('arc:missing');
    expect(
      partial.suggestions.some((row) => row.field === 'guide.bestArcs'),
    ).toBe(false);
  } finally {
    f.db.close();
  }
});

test('игровой калькулятор: все 25 вариантов имеют один совместимый тип дуг и настоящие иконки опыта', async () => {
  const namespaces = new Set([
    'NTE_ReferenceCharacter',
    'NTE_ReferenceWeapon',
    'DT_CultivationGuideData',
  ]);
  const records = gunzipSync(
    await readFile('scripts/content/game-data/chunks.jsonl.gz'),
  )
    .toString('utf8')
    .trim()
    .split('\n')
    .flatMap((line) =>
      (JSON.parse(line).records as SourceRecord[]).filter((row) =>
        namespaces.has(row.namespace),
      ),
    );
  const f = await contract(records);
  try {
    const data = (await (await f.api('progression')).json())
      .data as ProgressionData;
    const characters = data.costs.filter((row) => row.kind === 'character');
    const arcs = data.costs.filter((row) => row.kind === 'arc');
    expect(characters).toHaveLength(25);
    expect(arcs).toHaveLength(51);
    for (const character of characters) {
      expect(character.arcTypeId, character.name).toBeGreaterThan(0);
      expect(
        arcs.some((arc) => arc.arcTypeId === character.arcTypeId),
        character.name,
      ).toBe(true);
    }
    expect(characters.find((row) => row.id === '1033')).toMatchObject({
      arcTypeId: 5,
      arcType: 'Гибридный',
    });
    expect(characters.find((row) => row.id === '1004')).toMatchObject({
      arcTypeId: 2,
      arcType: 'Жидкий',
    });
    expect(arcs.every((arc) => !!arc.iconUrl?.includes('game-assets/'))).toBe(
      true,
    );
    const guide = records.find(
      (row) =>
        row.namespace === 'DT_CultivationGuideData' && row.gameId === '1033',
    )!;
    f.insert([
      {
        ...guide,
        sourceHash: guide.sourceHash + '-unknown-fork',
        details: {
          ...guide.details,
          RecommendForkList: [{ ForkItemId: 'does-not-exist' }],
        },
      },
    ]);
    const unknown = (await (await f.api('progression')).json())
      .data as ProgressionData;
    expect(
      unknown.costs.find((row) => row.id === '1033')?.arcTypeId,
    ).toBeUndefined();
  } finally {
    f.db.close();
  }
});

test('все 25 вариантов передают полные стоимости боевых, пассивных и городских навыков с названиями и иконками', async () => {
  const records = gunzipSync(
    await readFile('scripts/content/game-data/chunks.jsonl.gz'),
  )
    .toString('utf8')
    .trim()
    .split('\n')
    .flatMap((line) =>
      (JSON.parse(line).records as SourceRecord[]).filter(
        (row) =>
          row.namespace === 'NTE_ReferenceCharacter' ||
          row.namespace === 'NTE_ReferenceItem' ||
          row.namespace === 'NTE_ReferenceCurrency',
      ),
    );
  const f = await contract(records);
  try {
    const data = (await (await f.api('progression')).json())
      .data as ProgressionData;
    const characters = data.costs.filter((row) => row.kind === 'character');
    expect(characters).toHaveLength(25);
    for (const character of characters) {
      expect(
        character.skills?.filter((skill) => skill.kind === 'combat'),
        character.name,
      ).toHaveLength(4);
      expect(
        character.skills?.filter((skill) => skill.kind === 'support'),
        character.name,
      ).toHaveLength(2);
      expect(
        character.skills?.some((skill) => skill.kind === 'city'),
        character.name,
      ).toBe(true);
      for (const skill of character.skills || []) {
        const expected =
          skill.kind === 'combat'
            ? [2, 3, 4, 5, 6, 7, 8, 9, 10]
            : skill.kind === 'city'
              ? Array.from(
                  {
                    length: Math.max(
                      ...skill.stages.map((stage) => Number(stage.level)),
                    ),
                  },
                  (_, i) => i + 1,
                )
              : [1];
        expect(
          skill.stages.map((stage) => Number(stage.level)),
          character.name + skill.id,
        ).toEqual(expected);
        for (const stage of skill.stages)
          for (const id of stage.items_id) {
            expect(data.items[id]?.name, id).toMatch(/[а-яё]/i);
            expect(data.items[id]?.iconUrl, id).toContain('game-assets/');
          }
      }
    }
    const adler = characters.find((row) => row.id === '1033')!;
    const gold = adler
      .skills!.filter((skill) => skill.kind === 'combat')
      .flatMap((skill) => skill.stages)
      .reduce(
        (total, stage) =>
          total + (stage.amount[stage.items_id.indexOf('gold')] || 0),
        0,
      );
    expect(gold).toBe(1748000);
    const record = records.find(
      (row) =>
        row.namespace === 'NTE_ReferenceCharacter' && row.gameId === '1033',
    )!;
    const original = (
      await (await f.api('record?id=' + encodeURIComponent(record.id))).json()
    ).data;
    const menu = structuredClone(record.details.abilityMenu) as Array<{
      materials: Array<{ amount: number[] }>;
    }>;
    menu[0].materials[0].amount[0] = 1234;
    await f.api('record', {
      id: record.id,
      revision: original.revision,
      overrides: { details: { abilityMenu: menu } },
    });
    const changed = (await (await f.api('progression')).json())
      .data as ProgressionData;
    expect(
      changed.costs.find((row) => row.id === '1033')?.skills?.[0].stages[0]
        .amount[0],
    ).toBe(1234);
    f.insert(records);
    const repeated = (await (await f.api('progression')).json())
      .data as ProgressionData;
    expect(
      repeated.costs.find((row) => row.id === '1033')?.skills?.[0].stages[0]
        .amount[0],
    ).toBe(1234);
  } finally {
    f.db.close();
  }
});

test('импорт подарков связывает Food_142, Food_0142_name и игровую текстуру', async () => {
  const records = JSON.parse(
    await readFile('tests/fixtures/game-data-native-hathor.json', 'utf8'),
  ) as SourceRecord[];
  const character = records.find(
    (row) => row.namespace === 'NTE_ReferenceCharacter',
  )!;
  character.details.preferrable_gifts = [{ item_id: 'Food_142', amount: 100 }];
  const base = records.find((row) => row.kind === 'item')!;
  records.push({
    ...base,
    id: 'localization:food-test|ST_food:Food_0142_name',
    kind: 'localization',
    namespace: 'ST_food',
    gameId: 'Food_0142_name',
    values: {
      ru: 'Рисовая лапша с жар-птицей и грудинкой',
      en: 'Firebird noodles',
      ja: '',
      zh: '',
    },
    assets: [],
    details: {},
  });
  records.push({
    ...base,
    id: 'image:food-test|Item:food_0142',
    kind: 'image',
    namespace: 'Item',
    gameId: 'food_0142',
    values: { ru: '', en: '', ja: '', zh: '' },
    assets: [
      {
        url: '/nte-meta/game-assets/ad87d2a73478180243f0.webp',
        width: 256,
        height: 256,
      },
    ],
    details: {},
  });
  const f = await contract(records);
  try {
    const source = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Hathor',
      name: 'Хатор',
    });
    const gifts = JSON.parse(
      source.suggestions.find((row) => row.field === 'profile.gifts')!.value,
    );
    expect(gifts).toContainEqual(
      expect.objectContaining({
        id: 'Food_142',
        name: 'Рисовая лапша с жар-птицей и грудинкой',
        iconUrl: '/nte-meta/game-assets/ad87d2a73478180243f0.webp',
      }),
    );
    f.db
      .prepare(
        'INSERT INTO game_record_overrides(id,chunk_id,overrides_json,search_text,revision) VALUES(?,?,?,?,1)',
      )
      .run(
        'localization:food-test|ST_food:Food_0142_name',
        'localization:food-test',
        JSON.stringify({ values: { ru: 'Название администратора' } }),
        'override',
      );
    const edited = await f.m.buildLocalGameCharacterSource(f.env, {
      originalName: 'Hathor',
      name: 'Хатор',
    });
    const editedGifts = JSON.parse(
      edited.suggestions.find((row) => row.field === 'profile.gifts')!.value,
    );
    expect(editedGifts).toContainEqual(
      expect.objectContaining({
        id: 'Food_142',
        name: 'Название администратора',
        iconUrl: '/nte-meta/game-assets/ad87d2a73478180243f0.webp',
      }),
    );
  } finally {
    f.db.close();
  }
});
