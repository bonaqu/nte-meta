import { expect, test } from '@playwright/test';
import {
  orderedAbilities,
  totalMaterialAmount,
  nativeEquipmentImage,
} from '../src/lib/profile-presentation';
import {
  cleanGuideText,
  keepGuideImportMarkers,
  visualFromLegacy,
  visualFromImport,
} from '../src/lib/guide-visual';
import type { CharacterAbility, GuideSection } from '../src/types';
import { mergeNativeCollection } from '../scripts/game-data/seed-profiles.mjs';
import { validProposal } from '../src/lib/local-character-proposal';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

test('озвучка женского Зеро: четыре пакета, повтор миграции и защита поздних правок', async () => {
  const sql = await readFile(
    'migrations/0048_native_voice_row_owners.sql',
    'utf8',
  );
  const observed = sql.match(
    /FROM characters WHERE id=character_id AND updated_at='([^']+)'/,
  )![1];
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE characters(id TEXT, updated_at TEXT); CREATE TABLE character_profiles(character_id TEXT, updated_at TEXT); CREATE TABLE character_appearance_variants(character_id TEXT, variant_id TEXT, voice_lines_json TEXT);',
    );
    db.prepare('INSERT INTO characters VALUES(?,?)').run(
      'esper-zero',
      observed,
    );
    db.exec(
      "INSERT INTO character_profiles VALUES('esper-zero','2026-01-01'); INSERT INTO character_appearance_variants VALUES('esper-zero','1046','[]'),('esper-zero','1051','[]');",
    );
    db.exec(sql);
    const get = () =>
      db
        .prepare(
          "SELECT voice_lines_json FROM character_appearance_variants WHERE variant_id='1051'",
        )
        .get()!.voice_lines_json as string;
    const first = get();
    const voices = JSON.parse(first) as {
      language: string;
      audioUrl: string;
      title: string;
    }[];
    expect(voices).toHaveLength(244);
    for (const language of ['Японский', 'Английский', 'Китайский', 'Корейский'])
      expect(voices.filter((v) => v.language === language)).toHaveLength(61);
    expect(
      voices.every(
        (v) =>
          v.title &&
          /^\/nte-meta\/game-audio\/[a-f0-9]{20}\.ogg$/.test(v.audioUrl),
      ),
    ).toBe(true);
    db.exec(sql);
    expect(get()).toBe(first);
    db.exec(
      "UPDATE character_profiles SET updated_at='2099-01-01'; UPDATE character_appearance_variants SET voice_lines_json='[{\"title\":\"Ручная правка\"}]' WHERE variant_id='1051';",
    );
    db.exec(sql);
    expect(JSON.parse(get())).toEqual([{ title: 'Ручная правка' }]);
  } finally {
    db.close();
  }
});

test('повторный импорт актёра по языку сохраняет ручное полное имя без дубля', () => {
  const current = [
    { language: 'Японский', name: 'Toshiyuki Morikawa (森川 智之)' },
  ];
  const incoming = [{ language: 'Японский', name: '森川智之' }];
  expect(mergeNativeCollection('voiceActors', current, incoming)).toEqual(
    current,
  );
  expect(
    mergeNativeCollection(
      'voiceActors',
      mergeNativeCollection('voiceActors', current, incoming),
      incoming,
    ),
  ).toEqual(current);
});

test('обновление голосовых пакетов сохраняет ручную озвучку и убирает старую импортированную заглушку', () => {
  const incoming = [
    {
      id: 'native',
      title: 'Об Эдгаре',
      language: 'Английский',
      description: 'Текст реплики',
      audioUrl: '/nte-meta/game-audio/11111111111111111111.ogg',
    },
  ];
  const old = [
    {
      ...incoming[0],
      audioUrl: '/nte-meta/game-audio/00000000000000000000.ogg',
    },
    {
      id: 'wiki',
      title: 'О Эдгаре',
      language: 'Английский',
      description:
        'Прямая запись английской озвучки. Расшифровку и соответствие реплики проверьте в источнике перед публикацией.',
      audioUrl:
        'https://static.wikia.nocookie.net/neverness-to-everness/images/7/70/VO_Adler_About_Edgar.ogg/revision/latest',
    },
  ];
  const next = mergeNativeCollection('voiceLines', old, incoming);
  expect(next).toHaveLength(1);
  expect(next[0].audioUrl).toBe(incoming[0].audioUrl);
  expect(
    mergeNativeCollection(
      'voiceLines',
      [
        {
          ...incoming[0],
          audioUrl: 'https://example.com/custom.mp3',
          description: 'Моя правка',
        },
      ],
      incoming,
    )[0],
  ).toMatchObject({
    audioUrl: 'https://example.com/custom.mp3',
    description: 'Моя правка',
  });
});

test('неверный файл новых персонажей не приводит к ошибке отрисовки', () => {
  const row = {
    ownerId: '1057',
    name: 'Аканэ Рин',
    originalName: 'Akane Rin',
    slug: 'akane-rin',
    imageUrl: '',
    splashUrl: '',
    profile: {
      biography: 'История',
      roleTags: [],
      abilities: [],
      skins: [],
      voiceLines: [],
      awakenings: [],
    },
  };
  expect(validProposal(row)).toBe(true);
  for (const profile of [
    [],
    null,
    { biography: 42 },
    { roleTags: {} },
    { voiceLines: 'broken' },
    { skins: [null] },
  ])
    expect(validProposal({ ...row, profile })).toBe(false);
});

test('нативный порядок переживает старые ID, расходы суммируются без номеров уровней', () => {
  const abilities = [
    ['a', 'Проклятие зла', 'Навык'],
    ['b', 'Праведное сердце', 'Пассивный навык'],
    ['c', 'Умеренность', 'Пассивный навык'],
    ['d', 'Спокойствие', 'Сверхспособность'],
    ['e', 'Избавление', 'Базовая атака'],
  ].map(([id, name, type]) => ({
    id,
    name,
    type,
    iconUrl: '',
    description: '',
  })) as CharacterAbility[];
  expect(orderedAbilities(abilities, 'Adler').map((r) => r.name)).toEqual([
    'Избавление',
    'Проклятие зла',
    'Спокойствие',
    'Умеренность',
    'Праведное сердце',
  ]);
  expect(abilities[0].name).toBe('Проклятие зла');
  expect(totalMaterialAmount('Ур. 2: ×2; Ур. 3: ×3')).toBe('×5');
  expect(
    totalMaterialAmount(
      'Материалы навыков поддержки: ×30 000; Материалы навыков поддержки: ×60 000',
    ),
  ).toBe('×90 000');
  expect(
    totalMaterialAmount(
      'Материалы навыков поддержки: ×1; Материалы навыков поддержки: ×2',
    ),
  ).toBe('×3');
  for (const value of [
    'Ур. 2–3',
    '×2–5',
    '2%',
    'Около 30',
    '×9007199254740999',
  ])
    expect(totalMaterialAmount(value)).toBe(value);
});

test('редактор скрывает import-маркеры, сохраняет идемпотентность и локальные картинки экипировки', () => {
  const marker = '<!-- import:merged:guide.skillPriority:18y8922 -->';
  const section: GuideSection = {
    id: 's',
    title: 'Навыки',
    type: 'skill-priority',
    position: 1,
    content: marker + '\nНавык → Сверхспособность',
  };
  expect(visualFromLegacy(section)?.items.map((r) => r.name)).toEqual([
    'Навык',
    'Сверхспособность',
  ]);
  expect(
    visualFromImport('skills', marker + '\nНавык → Сверхспособность').items,
  ).toHaveLength(2);
  expect(keepGuideImportMarkers(section.content, 'Моя правка')).toBe(
    marker + '\n\nМоя правка',
  );
  expect(
    cleanGuideText(keepGuideImportMarkers(section.content, 'Моя правка')),
  ).toBe('Моя правка');
  for (const [name, kind] of [
    ['Неверные врата', 'arcs'],
    ['Чистое небо', 'arcs'],
    ['Скоростной ёж', 'cartridges'],
    ['Светлячки и лес', 'cartridges'],
  ])
    expect(nativeEquipmentImage(name, kind)).toMatch(
      /^\/nte-meta\/game-assets\/[a-f0-9]{20}\.webp$/,
    );
  expect(
    nativeEquipmentImage('Чистое небо', 'arcs', '/uploads/my-image.webp'),
  ).toBe('/uploads/my-image.webp');
  expect(
    visualFromLegacy({
      ...section,
      visual: {
        kind: 'skills',
        items: [
          { id: 'new', name: '', description: '', imageUrl: '', stats: [] },
        ],
      },
    })?.items,
  ).toHaveLength(1);
});
