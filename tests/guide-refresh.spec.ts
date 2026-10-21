import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

async function legacyDatabase(production = true) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of (await readdir('migrations'))
    .filter((file) => file.endsWith('.sql') && file < '0029')
    .sort()) {
    db.exec(
      (await readFile(`migrations/${file}`, 'utf8')).replaceAll('\r\n', '\n'),
    );
  }
  if (production) {
    const { guide, teams } = JSON.parse(
      await readFile('tests/fixtures/hotori-public-before.json', 'utf8'),
    );
    db.prepare(
      'UPDATE guides SET summary = ?, patch_version = ? WHERE id = ?',
    ).run(guide.summary, guide.patch, guide.id);
    db.prepare('DELETE FROM guide_sections WHERE guide_id = ?').run(guide.id);
    for (const section of guide.sections)
      db.prepare(
        'INSERT INTO guide_sections (id,guide_id,title,section_type,content_markdown,position) VALUES (?,?,?,?,?,?)',
      ).run(
        section.id,
        guide.id,
        section.title,
        section.type,
        section.content,
        section.position,
      );
    for (const team of teams) {
      db.prepare(
        "INSERT INTO teams (id,slug,title,team_type,budget,difficulty,power,good_at,weak_at,synergy,rotation,guide_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'published') ON CONFLICT(id) DO UPDATE SET title=excluded.title,team_type=excluded.team_type,budget=excluded.budget,difficulty=excluded.difficulty,power=excluded.power,good_at=excluded.good_at,weak_at=excluded.weak_at,synergy=excluded.synergy,rotation=excluded.rotation,guide_id=excluded.guide_id,status=excluded.status",
      ).run(
        team.id,
        team.slug,
        team.title,
        team.type,
        team.budget,
        team.difficulty,
        team.power,
        team.goodAt,
        team.weakAt,
        team.synergy,
        team.rotation,
        guide.id,
      );
      db.prepare('DELETE FROM team_members WHERE team_id = ?').run(team.id);
      team.members.forEach(
        (member: { characterId: string; role: string }, index: number) =>
          db
            .prepare(
              'INSERT INTO team_members (team_id,character_id,role,position) VALUES (?,?,?,?)',
            )
            .run(team.id, member.characterId, member.role, index + 1),
      );
    }
  }
  return db;
}

test('обновление гайда исправляет стандартный текст и сохраняет архивные отряды', async () => {
  const db = await legacyDatabase();
  try {
    const sql = await readFile(
      'migrations/0029_refresh_hotori_guide.sql',
      'utf8',
    );
    db.exec(sql.replaceAll('\r\n', '\n'));
    expect(
      db
        .prepare("SELECT patch_version FROM guides WHERE id = 'guide-hotori'")
        .get()?.patch_version,
    ).toBe('1.4');
    const sources = db
      .prepare(
        "SELECT content_markdown FROM guide_sections WHERE id = 'hotori-guide-sources-0022'",
      )
      .get()?.content_markdown;
    expect(sources).toContain('kaiden.gg');
    expect(sources).not.toContain('ntewiki.org');
    expect(
      db
        .prepare(
          "SELECT content_markdown FROM guide_sections WHERE id = 'hotori-guide-rotations-0012'",
        )
        .get()?.content_markdown,
    ).toContain('120 единиц');
    expect(
      db
        .prepare("SELECT status FROM teams WHERE id = 'team-chaos-eclipse'")
        .get()?.status,
    ).toBe('archived');
    expect(
      db
        .prepare("SELECT status FROM teams WHERE id = 'team-hotori-accessible'")
        .get()?.status,
    ).toBe('archived');
    expect(
      db
        .prepare(
          "SELECT count(*) n FROM team_members WHERE team_id IN ('team-hotori-blossom-0029', 'team-hotori-sakiri-0029')",
        )
        .get()?.n,
    ).toBe(8);
    db.exec(sql.replaceAll('\r\n', '\n'));
    expect(
      db
        .prepare(
          "SELECT count(*) n FROM team_members WHERE team_id IN ('team-hotori-blossom-0029', 'team-hotori-sakiri-0029')",
        )
        .get()?.n,
    ).toBe(8);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});

test('обновление также поддерживает исходный демонстрационный каталог', async () => {
  const db = await legacyDatabase(false);
  try {
    db.exec(
      (
        await readFile('migrations/0029_refresh_hotori_guide.sql', 'utf8')
      ).replaceAll('\r\n', '\n'),
    );
    expect(
      db
        .prepare("SELECT patch_version FROM guides WHERE id = 'guide-hotori'")
        .get()?.patch_version,
    ).toBe('1.4');
    expect(
      db
        .prepare(
          "SELECT content_markdown FROM guide_sections WHERE id = 'hotori-rotations'",
        )
        .get()?.content_markdown,
    ).toContain('120 единиц');
  } finally {
    db.close();
  }
});

test('обновление не перезаписывает независимые правки редактора', async () => {
  const db = await legacyDatabase();
  try {
    db.exec(
      "UPDATE guide_sections SET content_markdown = 'Авторский разбор' WHERE id = 'hotori-guide-tldr-0012'; UPDATE guides SET summary = 'Авторский вывод' WHERE id = 'guide-hotori'; UPDATE teams SET title = 'Авторский отряд' WHERE id = 'team-chaos-eclipse';",
    );
    db.exec(
      "UPDATE team_members SET role = 'Авторская роль' WHERE team_id = 'team-hotori-accessible' AND character_id = 'hotori'",
    );
    db.exec(
      (
        await readFile('migrations/0029_refresh_hotori_guide.sql', 'utf8')
      ).replaceAll('\r\n', '\n'),
    );
    expect(
      db
        .prepare(
          "SELECT content_markdown FROM guide_sections WHERE id = 'hotori-guide-tldr-0012'",
        )
        .get()?.content_markdown,
    ).toBe('Авторский разбор');
    expect(
      db.prepare("SELECT summary FROM guides WHERE id = 'guide-hotori'").get()
        ?.summary,
    ).toBe('Авторский вывод');
    expect(
      db
        .prepare("SELECT status FROM teams WHERE id = 'team-chaos-eclipse'")
        .get()?.status,
    ).toBe('published');
    expect(
      db
        .prepare("SELECT status FROM teams WHERE id = 'team-hotori-accessible'")
        .get()?.status,
    ).toBe('published');
  } finally {
    db.close();
  }
});
