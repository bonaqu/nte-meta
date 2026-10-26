import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { mergeNativeCollection } from '../scripts/game-data/seed-profiles.mjs';

test('начальные характеристики сопоставляются по игровым синонимам и сохраняют ручные значения', () => {
  const current = [
    { id: 'manual-hp', label: 'Здоровье', value: '1400' },
    { id: 'manual-atk', label: 'АТК', value: '90' },
    { id: 'manual-def', label: 'ЗАЩ', value: '80' },
  ];
  const incoming = [
    { id: 'HPMaxBase', label: 'ОЗ', value: '1320' },
    { id: 'AtkBase', label: 'Атака', value: '81' },
    { id: 'DefBase', label: 'Защита', value: '73' },
    { id: 'ChargeGetEfficiencyBase', label: 'Скорость зарядки', value: '100%' },
  ];
  const merged = mergeNativeCollection('baseStats', current, incoming);
  expect(merged).toEqual([...current, incoming[3]]);
  expect(mergeNativeCollection('baseStats', merged, incoming)).toEqual(merged);
});

test('один предмет для возвышения, боевых и пассивных навыков сохраняет отдельные суммы и ручную правку', () => {
  const current = [
    {
      id: 'gold',
      name: 'Жук-монета',
      amount: '525000',
      source: 'Уровень возвышения → количество: 20 → 30: 25000',
    },
    {
      id: 'support-gold',
      name: 'Жук-монета',
      amount: '×90 000',
      source: 'Материалы навыков поддержки',
    },
  ];
  const incoming = [
    { ...current[0] },
    {
      id: 'skill-combat-gold',
      name: 'Жук-монета',
      amount: '1748000',
      source: 'Материалы боевых навыков',
    },
    {
      id: 'passive-gold',
      name: 'Жук-монета',
      amount: '70000',
      source: 'Материалы навыков поддержки',
    },
  ];
  const result = mergeNativeCollection('materials', current, incoming);
  expect(result.map((row) => row.amount)).toEqual([
    '525000',
    '1748000',
    '×90 000',
  ]);
  expect(mergeNativeCollection('materials', result, incoming)).toEqual(result);
});

test('исправление иконки городского навыка Минт сохраняет все прочие значения и свои изображения', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE character_profiles(character_id TEXT, abilities_json TEXT)',
    );
    const skill = {
      id: '1bd4a48a-146f-4658-a31d-23ce5e6e51b0',
      name: 'Торнадо Минт',
      description: 'Ручное описание',
      iconUrl:
        'https://i2.wp.com/images.genshin-builds.com/nte/characters/player_019.webp?strip=all&quality=100&w=520',
      attributes: [{ label: 'Бонус', value: '10%' }],
    };
    const other = {
      id: 'another',
      name: 'Другой навык',
      iconUrl: 'https://example.com/custom.webp',
    };
    db.prepare('INSERT INTO character_profiles VALUES(?,?)').run(
      'mint',
      JSON.stringify([other, skill]),
    );
    db.prepare('INSERT INTO character_profiles VALUES(?,?)').run(
      'another-character',
      JSON.stringify([skill]),
    );
    const migration = await readFile(
      'migrations/0041_mint_city_skill_icon.sql',
      'utf8',
    );
    db.exec(migration);
    db.exec(migration);
    const result = JSON.parse(
      db
        .prepare(
          "SELECT abilities_json FROM character_profiles WHERE character_id='mint'",
        )
        .get()!.abilities_json as string,
    );
    expect(result).toEqual([
      other,
      { ...skill, iconUrl: '/nte-meta/game-assets/eb1adcc872b389762965.webp' },
    ]);
    expect(
      JSON.parse(
        db
          .prepare(
            "SELECT abilities_json FROM character_profiles WHERE character_id='another-character'",
          )
          .get()!.abilities_json as string,
      ),
    ).toEqual([skill]);
    const custom = [
      { ...skill, iconUrl: 'https://example.com/my-mint-icon.webp' },
    ];
    db.prepare(
      "UPDATE character_profiles SET abilities_json=? WHERE character_id='mint'",
    ).run(JSON.stringify(custom));
    db.exec(migration);
    expect(
      JSON.parse(
        db
          .prepare(
            "SELECT abilities_json FROM character_profiles WHERE character_id='mint'",
          )
          .get()!.abilities_json as string,
      ),
    ).toEqual(custom);
  } finally {
    db.close();
  }
});

test('русские названия экипировки сохраняют порядок, характеристики и ручные тексты', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE guide_sections(id TEXT,meta_json TEXT)');
    const items = [
      {
        name: 'Far Side of the Moon',
        description: 'Ручное описание',
        stats: [{ label: 'АТК', value: '570' }],
      },
      { name: 'Мой вариант дуги', description: 'Не менять' },
    ];
    db.prepare('INSERT INTO guide_sections VALUES(?,?)').run(
      'manual',
      JSON.stringify({
        visual: { kind: 'arcs', items },
        note: 'Ручная заметка',
      }),
    );
    const migration = await readFile(
      'migrations/0040_official_guide_equipment_names.sql',
      'utf8',
    );
    db.exec(migration);
    db.exec(migration);
    const meta = JSON.parse(
      db.prepare('SELECT meta_json FROM guide_sections').get()!
        .meta_json as string,
    );
    expect(meta).toEqual({
      visual: {
        kind: 'arcs',
        items: [{ ...items[0], name: 'Обратная сторона Луны' }, items[1]],
      },
      note: 'Ручная заметка',
    });
  } finally {
    db.close();
  }
});
test('обогащение сохраняет ручной текст и удаляет старые эвристические дубли', () => {
  const native = [
    {
      id: 'GA_Akane_Melee',
      name: 'Базовая атака: Струнный клинок',
      type: 'Базовая атака',
      iconUrl: '/native.webp',
      description: 'Родное описание',
      attributes: [{ id: 'p', label: 'Урон', value: '24%' }],
    },
  ];
  const manual = [
    {
      id: 'manual',
      name: 'Струнный клинок',
      type: 'Базовая атака',
      iconUrl: '',
      description: 'Ручное пояснение администратора',
    },
    { id: 'GA_Akane_Melee1_name', name: 'Базовая атака: Струнный клинок' },
    { id: 'custom', name: 'Моя заметка', description: 'Не удалять' },
  ];
  const result = mergeNativeCollection('abilities', manual, native);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({
    id: 'manual',
    description: 'Ручное пояснение администратора',
    iconUrl: '/native.webp',
    attributes: native[0].attributes,
  });
  expect(result[1]).toEqual(manual[2]);
  expect(
    mergeNativeCollection(
      'friendship',
      [
        {
          level: 1,
          description: 'Награда за уровень в источнике не указана.',
          rewards: [],
        },
      ],
      [
        {
          level: 1,
          description: 'Опыт симпатии для уровня: 100',
          rewards: [{ name: 'Аннулит', quantity: '10' }],
        },
      ],
    )[0].description,
  ).toBe('Опыт симпатии для уровня: 100');
});
test('реальная миграция дополняет профиль Хатор и пропускает более позднюю правку', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of (await readdir('migrations'))
      .filter((f) => f.endsWith('.sql') && f < '0039')
      .sort())
      db.exec(await readFile('migrations/' + file, 'utf8'));
    const current = JSON.parse(
      await readFile(
        'tests/fixtures/game-profile-observed-hathor.json',
        'utf8',
      ),
    );
    db.prepare('UPDATE characters SET updated_at=? WHERE id=?').run(
      current.updatedAt,
      current.id,
    );
    for (const [field, column] of Object.entries({
      abilities: 'abilities_json',
      awakenings: 'awakenings_json',
      friendship: 'friendship_json',
      gifts: 'gifts_json',
      skins: 'skins_json',
      voiceLines: 'voice_lines_json',
      materials: 'materials_json',
      baseStats: 'base_stats_json',
    }))
      db.prepare(
        `UPDATE character_profiles SET ${column}=? WHERE character_id=?`,
      ).run(JSON.stringify(current.profile[field]), current.id);
    db.prepare(
      "UPDATE character_profiles SET biography_markdown='Ручная биография',updated_at='2026-10-20 00:00:00' WHERE character_id='hathor'",
    ).run();
    const migration = await readFile(
      'migrations/0039_native_profile_enrichment.sql',
      'utf8',
    );
    db.exec(migration);
    const after = db
      .prepare("SELECT * FROM character_profiles WHERE character_id='hathor'")
      .get()!;
    expect(after.biography_markdown).toBe('Ручная биография');
    expect(JSON.parse(after.awakenings_json as string)).toHaveLength(8);
    expect(JSON.parse(after.abilities_json as string)).toHaveLength(8);
    expect(
      JSON.parse(after.voice_lines_json as string).filter(
        (r: { audioUrl: string }) => r.audioUrl,
      ).length,
    ).toBeGreaterThanOrEqual(160);
    expect(JSON.parse(after.friendship_json as string)).toHaveLength(10);
    expect(
      JSON.parse(after.base_stats_json as string).find(
        (r: { label: string }) => r.label === 'АТК',
      ).value,
    ).toBe('81');
    db.prepare(
      "UPDATE character_profiles SET abilities_json='[]',updated_at='2099-01-01 00:00:00' WHERE character_id='hathor'",
    ).run();
    db.exec(migration);
    expect(
      db
        .prepare(
          "SELECT abilities_json FROM character_profiles WHERE character_id='hathor'",
        )
        .get()!.abilities_json,
    ).toBe('[]');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});
