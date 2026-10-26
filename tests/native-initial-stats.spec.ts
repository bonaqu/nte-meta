import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { mergeNativeCollection } from '../scripts/game-data/seed-profiles.mjs';
import type { Character } from '../src/types';

test('миграция 23 профилей сохраняет ручные значения, выдерживает повтор и пропускает позднюю правку', async () => {
  const observed = JSON.parse(
    await readFile('tests/fixtures/native-stats-observed.json', 'utf8'),
  ) as Character[];
  const sql = await readFile(
    'migrations/0049_native_visible_initial_stats.sql',
    'utf8',
  );
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE characters(id TEXT,updated_at TEXT); CREATE TABLE character_profiles(character_id TEXT,updated_at TEXT,base_stats_json TEXT,biography_markdown TEXT)',
    );
    for (const c of observed) {
      db.prepare('INSERT INTO characters VALUES(?,?)').run(c.id, c.updatedAt);
      db.prepare('INSERT INTO character_profiles VALUES(?,?,?,?)').run(
        c.id,
        '2026-01-01',
        JSON.stringify(c.profile.baseStats),
        'Ручная биография',
      );
    }
    db.exec(sql);
    const rows = () =>
      db
        .prepare('SELECT * FROM character_profiles ORDER BY character_id')
        .all();
    const first = rows();
    for (const c of observed) {
      const row = first.find((r) => r.character_id === c.id)!;
      const stats = JSON.parse(row.base_stats_json as string);
      expect(stats).toHaveLength(
        c.id === 'esper-zero' ? c.profile.baseStats.length : 23,
      );
      for (const old of c.profile.baseStats) expect(stats).toContainEqual(old);
      expect(row.biography_markdown).toBe('Ручная биография');
    }
    db.exec(sql);
    expect(rows()).toEqual(first);
    db.exec(
      'UPDATE character_profiles SET base_stats_json=\'[{"id":"manual","label":"Моя правка","value":"123"}]\',updated_at=\'2099-01-01\' WHERE character_id=\'hathor\'',
    );
    db.exec(sql);
    expect(
      JSON.parse(
        db
          .prepare(
            "SELECT base_stats_json FROM character_profiles WHERE character_id='hathor'",
          )
          .get()!.base_stats_json as string,
      ),
    ).toEqual([{ id: 'manual', label: 'Моя правка', value: '123' }]);
  } finally {
    db.close();
  }
});

test('начальные показатели: игровые иконки, группировка, раскрытие и четыре ширины', async ({
  page,
  request,
}, info) => {
  const live = process.env.NTE_INITIAL_STATS_URL;
  if (!live) {
    const characters = (
      await (await request.get('http://127.0.0.1:8788/api/characters')).json()
    ).data as Character[];
    const native = JSON.parse(
      await readFile('tests/fixtures/native-initial-stats.json', 'utf8'),
    );
    const current = JSON.parse(
      await readFile('tests/fixtures/native-stats-observed.json', 'utf8'),
    ) as Character[];
    const hathor = characters.find((c) => c.id === 'hathor')!;
    hathor.profile.baseStats = mergeNativeCollection(
      'baseStats',
      current.find((c) => c.id === 'hathor')!.profile.baseStats,
      native,
    );
    await page.route('**/api/characters', (route) =>
      route.fulfill({ json: { data: characters } }),
    );
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      (live || process.env.NTE_INITIAL_STATS_BUILT_URL || '/') +
        '#/characters/hathor',
    );
    const stats = page.getByRole('region', {
      name: 'Начальные показатели · уровень 1',
      exact: true,
    });
    await stats.scrollIntoViewIfNeeded();
    await expect(
      stats.getByRole('heading', { name: 'Начальные показатели Ур. 1' }),
    ).toBeVisible();
    const initial = stats.locator(':scope > dl > div');
    await expect(initial).toHaveCount(8);
    await expect(initial.nth(0).locator('dt')).toHaveText('ОЗ');
    await expect(initial.nth(1).locator('dt')).toHaveText('Атака');
    await expect(initial.nth(2).locator('dt')).toHaveText('Защита');
    await expect(initial.filter({ hasText: 'Скорость зарядки' })).toContainText(
      '100%',
    );
    const details = stats.locator('details');
    await expect(details).not.toHaveAttribute('open', '');
    await stats
      .getByText('Бонусы урона и сопротивления', { exact: true })
      .click();
    await expect(
      stats
        .getByRole('region', { name: 'Бонусы урона', exact: true })
        .locator('dl > div'),
    ).toHaveCount(8);
    await expect(
      stats
        .getByRole('region', { name: 'Сопротивления', exact: true })
        .locator('dl > div'),
    ).toHaveCount(7);
    await expect
      .poll(() =>
        stats
          .locator('img')
          .evaluateAll((nodes) =>
            nodes.every(
              (n) =>
                n instanceof HTMLImageElement &&
                n.complete &&
                n.naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.character-initial-stats')
          .analyze()
      ).violations,
    ).toEqual([]);
    if (width === 360 || width === 1440)
      await stats.screenshot({
        path: info.outputPath(`initial-stats-${width}.png`),
      });
    await stats
      .getByText('Бонусы урона и сопротивления', { exact: true })
      .click();
    await expect(details).not.toHaveAttribute('open', '');
  }
  expect(errors).toEqual([]);
});
