import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

async function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of (await readdir('migrations'))
    .filter((file) => file.endsWith('.sql') && file < '0031')
    .sort())
    db.exec(await readFile(`migrations/${file}`, 'utf8'));
  return db;
}

test('расширение добавляет пять карточек и настоящие секции с источниками, оставляет Аканэ без тира', async () => {
  const db = await database();
  try {
    const sql = await readFile(
      'migrations/0031_expand_character_catalog.sql',
      'utf8',
    );
    db.exec(sql);
    expect(
      db
        .prepare(
          "SELECT count(*) n FROM characters WHERE slug IN ('akane','blackbird','iroi','linko','zankou')",
        )
        .get()?.n,
    ).toBe(5);
    for (const slug of ['akane', 'blackbird', 'iroi', 'linko', 'zankou']) {
      const guide = db
        .prepare('SELECT id FROM guides WHERE character_id = ?')
        .get(slug);
      expect(guide).toBeTruthy();
      const sections = db
        .prepare(
          'SELECT section_type, content_markdown FROM guide_sections WHERE guide_id = ?',
        )
        .all(guide!.id as string);
      expect(sections).toHaveLength(7);
      expect(
        sections.find((x) => x.section_type === 'rotations')?.content_markdown,
      ).toContain('1.');
      expect(
        sections.find((x) => x.section_type === 'sources')?.content_markdown,
      ).toContain('https://');
      const team = db
        .prepare(
          'SELECT id, rotation_steps_json, synergy FROM teams WHERE guide_id = ?',
        )
        .get(guide!.id as string);
      expect(team).toBeTruthy();
      expect(
        JSON.parse(team!.rotation_steps_json as string).length,
      ).toBeGreaterThan(2);
      expect(team!.synergy).toContain('https://');
      expect(
        db
          .prepare('SELECT count(*) n FROM team_members WHERE team_id = ?')
          .get(team!.id as string)?.n,
      ).toBe(4);
    }
    expect(
      db
        .prepare(
          "SELECT count(*) n FROM tierlist_items WHERE character_id='akane'",
        )
        .get()?.n,
    ).toBe(0);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.exec(sql);
    expect(
      db.prepare("SELECT count(*) n FROM guides WHERE id LIKE '%-0031'").get()
        ?.n,
    ).toBe(5);
  } finally {
    db.close();
  }
});

test('миграция не заменяет существующего героя, биографию, гайд и изменённую оценку', async () => {
  const db = await database();
  try {
    const sql = await readFile(
      'migrations/0031_expand_character_catalog.sql',
      'utf8',
    );
    db.exec(sql);
    db.exec(
      "UPDATE characters SET name='Авторская Линко' WHERE slug='linko'; UPDATE character_profiles SET biography_markdown='Авторская биография' WHERE character_id='linko'; UPDATE guide_sections SET content_markdown='Авторская ротация' WHERE guide_id='guide-linko-0031' AND section_type='rotations'; UPDATE tierlist_items SET tier='D',note='Проверено редактором' WHERE character_id='linko';",
    );
    db.exec(sql);
    expect(
      db.prepare("SELECT name FROM characters WHERE slug='linko'").get()?.name,
    ).toBe('Авторская Линко');
    expect(
      db
        .prepare(
          "SELECT biography_markdown FROM character_profiles WHERE character_id='linko'",
        )
        .get()?.biography_markdown,
    ).toBe('Авторская биография');
    expect(
      db
        .prepare(
          "SELECT content_markdown FROM guide_sections WHERE guide_id='guide-linko-0031' AND section_type='rotations'",
        )
        .get()?.content_markdown,
    ).toBe('Авторская ротация');
    expect(
      db
        .prepare("SELECT tier FROM tierlist_items WHERE character_id='linko'")
        .get()?.tier,
    ).toBe('D');
  } finally {
    db.close();
  }
});

test('реестр источников сохраняет выключатели редактора и не создаёт дубликаты адресов', async () => {
  const db = await database();
  try {
    const sql = await readFile(
      'migrations/0032_refresh_discovery_sources.sql',
      'utf8',
    );
    const url = 'https://nte.perfectworld.com/en/article/news/';
    db.prepare(
      "INSERT INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled) VALUES ('editor-source','website','Авторский источник',?,'низкий',0)",
    ).run(url);
    db.exec(sql);
    db.exec(sql);
    expect(
      db.prepare('SELECT count(*) n FROM sources WHERE source_url=?').get(url)
        ?.n,
    ).toBe(1);
    expect(
      db
        .prepare(
          'SELECT source_name, auto_import_enabled FROM sources WHERE source_url=?',
        )
        .get(url),
    ).toMatchObject({
      source_name: 'Авторский источник',
      auto_import_enabled: 0,
    });
    expect(
      db
        .prepare("SELECT count(*) n FROM sources WHERE id LIKE 'discovery-%'")
        .get()?.n,
    ).toBeGreaterThan(10);
  } finally {
    db.close();
  }
});
