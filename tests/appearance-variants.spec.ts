import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import type {
  CharacterAppearanceVariant,
  CharacterProfile,
} from '../src/types';

test('добавление игровых вариантов Зеро не переписывает ручные поля и пропускает изменённую запись', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE characters(id TEXT PRIMARY KEY, updated_at TEXT, summary TEXT);
      INSERT INTO characters VALUES ('esper-zero','2026-07-28 14:58:37','Ручная биография'),('hathor','2026-07-28 14:58:37','Другая биография');`);
    db.exec(
      await readFile(
        'migrations/0042_character_appearance_variants.sql',
        'utf8',
      ),
    );
    const seed = await readFile(
      'migrations/0043_zero_appearance_variants.sql',
      'utf8',
    );
    db.exec(seed);
    const rows = db
      .prepare(
        'SELECT variant_id, json_array_length(skins_json) AS skins, json_array_length(voice_lines_json) AS voices FROM character_appearance_variants ORDER BY variant_id',
      )
      .all();
    expect(rows).toEqual([
      { variant_id: '1046', skins: 11, voices: 109 },
      { variant_id: '1051', skins: 11, voices: 0 },
    ]);
    expect(
      db.prepare('SELECT summary FROM characters WHERE id=?').get('esper-zero')!
        .summary,
    ).toBe('Ручная биография');
    expect(
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM character_appearance_variants WHERE character_id=?',
        )
        .get('hathor')!.n,
    ).toBe(0);
    db.exec(
      "UPDATE character_appearance_variants SET name='Моя подпись', skins_json='[]' WHERE variant_id='1046'",
    );
    db.exec(seed);
    expect(
      db
        .prepare(
          "SELECT name,skins_json FROM character_appearance_variants WHERE variant_id='1046'",
        )
        .get(),
    ).toEqual({ name: 'Моя подпись', skins_json: '[]' });
    db.exec(
      "DELETE FROM character_appearance_variants; UPDATE characters SET updated_at='2030-01-01 00:00:00' WHERE id='esper-zero'",
    );
    db.exec(seed);
    expect(
      db
        .prepare('SELECT COUNT(*) AS n FROM character_appearance_variants')
        .get()!.n,
    ).toBe(0);
  } finally {
    db.close();
  }
});

test('варианты внешности читаются и сохраняются отдельно, старый клиент не удаляет их', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE characters(id TEXT PRIMARY KEY); INSERT INTO characters VALUES ('zero'), ('another');",
    );
    const base = await readFile(
      'migrations/0006_editorial_architecture.sql',
      'utf8',
    );
    db.exec(
      base.match(
        /CREATE TABLE IF NOT EXISTS character_profiles \([\s\S]*?\n\);/,
      )![0],
    );
    for (const migration of [
      '0013_character_arc_type',
      '0016_character_release_date',
      '0018_character_role_icons',
      '0028_character_release_version',
    ]) {
      const sql = await readFile(`migrations/${migration}.sql`, 'utf8');
      for (const alter of sql.match(
        /ALTER TABLE character_profiles[\s\S]*?;/g,
      ) || [])
        db.exec(alter);
    }
    db.exec(
      await readFile(
        'migrations/0042_character_appearance_variants.sql',
        'utf8',
      ),
    );
    db.exec(await readFile('migrations/0044_variant_abilities.sql', 'utf8'));
    const context = vm.createContext({
      crypto: webcrypto,
      TextEncoder,
      URL,
      Response,
    });
    new vm.Script(
      (await readFile('src/worker.js', 'utf8')).replace(
        'export default {',
        'const worker = {',
      ) +
        '\nglobalThis.contracts = {normalizeCharacterProfile, buildRelationStatements, characterProfileSelect};',
    ).runInContext(context);
    const api = context.contracts as {
      normalizeCharacterProfile(value: object): CharacterProfile;
      buildRelationStatements(
        env: object,
        entity: string,
        id: string,
        body: object,
        replace: boolean,
      ): Array<{ run(): void }>;
      characterProfileSelect(): string;
    };
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: (...args: SQLInputValue[]) => ({
            run: () => {
              db.prepare(sql).run(...args);
            },
          }),
        }),
      },
    };
    const save = (id: string, profile: object) => {
      const statements = api.buildRelationStatements(
        env,
        'characters',
        id,
        { profile },
        true,
      );
      db.exec('BEGIN');
      try {
        statements.forEach((statement) => statement.run());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    };
    const read = (id: string) => {
      const row = db
        .prepare(api.characterProfileSelect() + ' WHERE characters.id=?')
        .get(id)!;
      return JSON.parse(
        String(row.profile_appearance_variants_json),
      ) as CharacterAppearanceVariant[];
    };
    const variants: CharacterAppearanceVariant[] = [
      {
        id: '1046',
        name: 'Мужской вариант',
        abilities: [
          {
            id: 'male-melee',
            name: 'Оценка',
            type: 'Базовая атака',
            iconUrl: '',
            description: 'Мужской вариант',
            attributes: [
              { id: 'hit', label: 'Множитель 1-го удара', value: '1: 23 %' },
            ],
          },
        ],
        skins: [
          {
            id: 'male-skin',
            name: 'Мужской костюм',
            imageUrl: '/nte-meta/game-assets/male.webp',
            description: 'Описание костюма',
          },
        ],
        voiceLines: [
          {
            id: 'male-voice',
            title: 'Первая встреча',
            language: 'Японский',
            audioUrl: '/nte-meta/game-audio/male.ogg',
            sourceUrl: '',
            description: 'Текст реплики',
          },
        ],
      },
      {
        id: '1051',
        name: 'Женский вариант',
        abilities: [],
        skins: [
          {
            id: 'female-skin',
            name: 'Женский костюм',
            imageUrl: '/nte-meta/game-assets/female.webp',
            description: 'Другое описание',
          },
        ],
        voiceLines: [],
      },
    ];
    save('zero', {
      biography: 'Ручная биография',
      appearanceVariants: variants,
    });
    expect(read('zero')).toEqual(variants);
    const normalized = api.normalizeCharacterProfile({
      appearanceVariants: variants,
    });
    expect(
      api.normalizeCharacterProfile(JSON.parse(JSON.stringify(normalized)))
        .appearanceVariants,
    ).toEqual(variants);
    save('zero', {
      appearanceVariants: variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        skins: variant.skins,
        voiceLines: variant.voiceLines,
      })),
    });
    expect(read('zero')).toEqual(variants);
    save('zero', { biography: 'Правка из предыдущей версии редактора' });
    expect(read('zero')).toEqual(variants);
    expect(
      db
        .prepare(
          'SELECT biography_markdown FROM character_profiles WHERE character_id=?',
        )
        .get('zero')!.biography_markdown,
    ).toBe('Правка из предыдущей версии редактора');
    expect(() =>
      save('zero', { appearanceVariants: [variants[0], variants[0]] }),
    ).toThrow(/ID вариантов/);
    expect(() =>
      save('zero', {
        appearanceVariants: [
          {
            ...variants[0],
            skins: [
              { ...variants[0].skins[0], imageUrl: 'javascript:alert(1)' },
            ],
          },
        ],
      }),
    ).toThrow(/http/);
    expect(read('zero')).toEqual(variants);
    save('another', { appearanceVariants: variants });
    save('zero', { appearanceVariants: [] });
    expect(read('zero')).toEqual([]);
    expect(read('another')).toEqual(variants);
    db.prepare('DELETE FROM characters WHERE id=?').run('another');
    expect(
      db
        .prepare('SELECT COUNT(*) AS n FROM character_appearance_variants')
        .get()!.n,
    ).toBe(0);
  } finally {
    db.close();
  }
});

test('коэффициенты вариантов Зеро добавляются раздельно и не перезаписывают ручные правки', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE characters(id TEXT PRIMARY KEY, updated_at TEXT);INSERT INTO characters VALUES ('esper-zero','2026-07-28 14:58:37')",
    );
    for (const name of [
      '0042_character_appearance_variants',
      '0043_zero_appearance_variants',
      '0044_variant_abilities',
    ])
      db.exec(await readFile(`migrations/${name}.sql`, 'utf8'));
    const before = db
      .prepare(
        'SELECT variant_id,name,skins_json,voice_lines_json FROM character_appearance_variants ORDER BY variant_id',
      )
      .all();
    const seed = await readFile(
      'migrations/0045_zero_variant_abilities.sql',
      'utf8',
    );
    db.exec(seed);
    expect(
      db
        .prepare(
          'SELECT variant_id,name,skins_json,voice_lines_json FROM character_appearance_variants ORDER BY variant_id',
        )
        .all(),
    ).toEqual(before);
    const read = (id: string) =>
      JSON.parse(
        String(
          db
            .prepare(
              'SELECT abilities_json FROM character_appearance_variants WHERE variant_id=?',
            )
            .get(id)!.abilities_json,
        ),
      ) as CharacterProfile['abilities'];
    for (const id of ['1046', '1051']) expect(read(id)).toHaveLength(7);
    expect(
      read('1046').find((row) => row.name === 'Оценка')!.attributes![0].value,
    ).toContain('1: 23 %');
    expect(
      read('1051').find((row) => row.name === 'Оценка')!.attributes![0].value,
    ).toContain('1: 19.2 %');
    expect(
      read('1046').find((row) => row.name === 'Цветение разлома')!
        .attributes![0].value,
    ).toContain('1: 75.3 %+124.7 %');
    expect(
      read('1051').find((row) => row.name === 'Цветение разлома')!
        .attributes![0].value,
    ).toContain('1: 83.7 %+116.3 %');
    db.exec(
      `UPDATE character_appearance_variants SET abilities_json='[{"id":"manual","name":"Ручной навык"}]' WHERE variant_id='1046'`,
    );
    db.exec(seed);
    expect(read('1046')[0].name).toBe('Ручной навык');
    db.exec(
      "UPDATE character_appearance_variants SET abilities_json='[]' WHERE variant_id='1046';UPDATE characters SET updated_at='2030-01-01' WHERE id='esper-zero'",
    );
    db.exec(seed);
    expect(read('1046')).toEqual([]);
    db.exec(
      "UPDATE characters SET updated_at='2026-07-28 14:58:37';UPDATE character_appearance_variants SET name='Моя подпись',abilities_json='[]' WHERE variant_id='1051'",
    );
    db.exec(seed);
    expect(read('1051')).toEqual([]);
  } finally {
    db.close();
  }
});
