import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

test('1.5: профиль, гайд и новость Элимс открываются с опубликованным медиа', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/characters/elyms');
  const hero = page.locator('.character-lore-hero');
  await expect(hero.getByRole('heading', { name: 'Элимс' })).toBeVisible();
  await expect
    .poll(() =>
      hero
        .getByRole('img', { name: 'Элимс' })
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
  await expect(page.locator('#character-wardrobe')).toBeVisible();
  await page.goto('/#/guides/elyms-build-guide');
  const arcs = page.locator('.guide-section-card').filter({
    has: page.getByRole('heading', { name: 'Лучшие дуги', exact: true }),
  });
  await page.getByRole('button', { name: 'Лучшие дуги', exact: true }).click();
  await expect(
    arcs.getByText('Эхо в режиме ожидания', { exact: true }),
  ).toBeVisible();
  await page.goto('/#/news/patch-1-5-elyms');
  await expect(
    page.getByRole('heading', { level: 1, name: /Элимс/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('1.5: опубликованы только выпущенная Элимс, её гайд и заметка о патче', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of (await readdir('migrations'))
      .filter((name) => name.endsWith('.sql') && name < '0056')
      .sort())
      db.exec(await readFile(`migrations/${file}`, 'utf8'));
    const sql = await readFile('migrations/0056_patch_15_elyms.sql', 'utf8');
    db.exec(sql);
    expect(
      db
        .prepare(
          "SELECT name, rarity, attribute, patch_version FROM characters WHERE slug='elyms' AND status='published'",
        )
        .get(),
    ).toEqual({
      name: 'Элимс',
      rarity: 'S',
      attribute: 'Космос',
      patch_version: '1.5',
    });
    expect(
      db.prepare("SELECT id FROM characters WHERE slug='exe'").get(),
    ).toBeUndefined();
    const profile = db
      .prepare("SELECT * FROM character_profiles WHERE character_id='elyms'")
      .get()!;
    for (const [field, count] of Object.entries({
      base_stats_json: 23,
      abilities_json: 9,
      skins_json: 4,
      voice_lines_json: 392,
      awakenings_json: 8,
      friendship_json: 10,
    })) {
      const rows = JSON.parse(String(profile[field]));
      expect(rows).toHaveLength(count);
      expect(
        new Set(
          rows.map(
            (row: { id?: string; level?: number; kind?: string }) =>
              row.id || `${row.kind || ''}:${row.level}`,
          ),
        ).size,
      ).toBe(count);
    }
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM guide_sections WHERE guide_id='guide-elyms-0056'",
        )
        .get()?.n,
    ).toBe(7);
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM team_members WHERE team_id IN ('elyms-hathor','elyms-hotori')",
        )
        .get()?.n,
    ).toBe(8);
    expect(
      db
        .prepare("SELECT character_id FROM tierlist_items WHERE character_id='elyms'")
        .get(),
    ).toBeUndefined();
    expect(
      db
        .prepare(
          "SELECT slug FROM news WHERE id='patch-1-5-20261111' AND status='published'",
        )
        .get()?.slug,
    ).toBe('patch-1-5-elyms');
    db.exec(
      "UPDATE character_profiles SET biography_markdown='Ручная правка' WHERE character_id='elyms';",
    );
    db.exec(sql);
    expect(
      db
        .prepare(
          "SELECT biography_markdown FROM character_profiles WHERE character_id='elyms'",
        )
        .get()?.biography_markdown,
    ).toBe('Ручная правка');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});

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

test('полные гайды добавляются по слагу и сохраняют авторские записи при повторном применении', async () => {
  const db = await database();
  try {
    for (const file of (await readdir('migrations'))
      .filter(
        (file) => file.endsWith('.sql') && file >= '0031' && file < '0051',
      )
      .sort()) {
      db.exec(await readFile(`migrations/${file}`, 'utf8'));
    }
    const sql = await readFile(
      'migrations/0051_complete_character_guides.sql',
      'utf8',
    );
    const seedGuides = db
      .prepare(
        "SELECT id, title FROM guides WHERE id IN ('guide-baicang','guide-sakiri') ORDER BY id",
      )
      .all();
    db.exec(sql);
    expect(
      db
        .prepare(
          "SELECT id, title FROM guides WHERE id IN ('guide-baicang','guide-sakiri') ORDER BY id",
        )
        .all(),
    ).toEqual(seedGuides);
    expect(
      db
        .prepare(
          "SELECT id FROM guides WHERE slug IN ('baicang-build-guide','sakiri-build-guide','shinku-build-guide')",
        )
        .all(),
    ).toEqual([]);
    // Mirror the production catalogue: Shinku was added through the editor
    // and the two old seed guides are not public there.
    db.exec(`
      UPDATE guides SET status='archived' WHERE id IN ('guide-baicang','guide-sakiri');
      INSERT INTO characters (id,slug,name,original_name,role,type,attribute,image_url,short_description,summary)
      VALUES ('fixture-shinku','shinku','Шинку','Shinku','ДД','ДД','Космос','','','');
    `);
    db.exec(sql);
    const incomplete = db
      .prepare(
        `
      SELECT c.slug FROM characters c
      WHERE c.status = 'published' AND NOT EXISTS (
        SELECT 1 FROM guides g WHERE g.character_id = c.id AND g.status = 'published'
      )`,
      )
      .all();
    expect(incomplete).toEqual([]);
    const newGuides = db
      .prepare(
        "SELECT id, character_id FROM guides WHERE id LIKE 'guide-%-0051'",
      )
      .all();
    expect(newGuides).toHaveLength(18);
    for (const guide of newGuides) {
      const sections = db
        .prepare(
          'SELECT section_type, meta_json FROM guide_sections WHERE guide_id = ? ORDER BY position',
        )
        .all(guide.id as string);
      expect(sections.map((s) => s.section_type)).toEqual([
        'overview',
        'skill-priority',
        'best-arcs',
        'cartridges',
        'main-stats',
        'rotations',
        'tips',
      ]);
      const teams = db
        .prepare('SELECT id, rotation_steps_json FROM teams WHERE guide_id = ?')
        .all(guide.id as string);
      expect(teams).toHaveLength(2);
      for (const team of teams) {
        const members = db
          .prepare(
            'SELECT character_id FROM team_members WHERE team_id = ? ORDER BY position',
          )
          .all(team.id as string)
          .map((member) => member.character_id);
        expect(new Set(members).size).toBe(4);
        expect(members).toContain(guide.character_id);
        expect(JSON.parse(team.rotation_steps_json as string)).toHaveLength(4);
      }
    }
    db.exec(
      "UPDATE guides SET title='Авторская сборка' WHERE id='guide-adler-0051'",
    );
    db.exec(sql);
    expect(
      db.prepare("SELECT title FROM guides WHERE id='guide-adler-0051'").get()
        ?.title,
    ).toBe('Авторская сборка');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});

test('Хаос получает атрибут выпущенного персонажа, авторские сведения сохраняются', async () => {
  const db = await database();
  try {
    const sql = await readFile(
      'migrations/0052_chaos_released_identity.sql',
      'utf8',
    );
    db.exec(sql);
    expect(
      db
        .prepare(
          "SELECT attribute, role, type FROM characters WHERE slug='chaos'",
        )
        .get(),
    ).toEqual({
      attribute: 'Лакшана',
      role: 'Основной ДД',
      type: 'Основной ДД',
    });
    db.exec(
      "UPDATE characters SET attribute='Хаос',role='Авторская роль',summary='Текст редактора' WHERE slug='chaos'",
    );
    db.exec(sql);
    expect(
      db
        .prepare(
          "SELECT attribute, role, summary FROM characters WHERE slug='chaos'",
        )
        .get(),
    ).toEqual({
      attribute: 'Хаос',
      role: 'Авторская роль',
      summary: 'Текст редактора',
    });
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
