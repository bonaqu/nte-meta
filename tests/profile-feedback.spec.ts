import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import AxeBuilder from '@axe-core/playwright';

test('общий профиль: читаемые сведения, задержка подсказки, родные подарки и варианты гардероба', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const legacy = JSON.parse(
    await readFile('tests/fixtures/adler-legacy-media.json', 'utf8'),
  );
  const adler = characters.find((row: { id: string }) => row.id === 'adler');
  adler.profile = {
    ...adler.profile,
    ...legacy,
    birthday: '25 сентября',
    releaseDate: '2026-04-29',
    faction: 'Антикварный магазин «Эйбон»',
    arcType: 'Гибридный',
    skins: JSON.parse(
      await readFile('tests/fixtures/profile-polish.json', 'utf8'),
    ).skins,
    gifts: ['010', '028', '041', '142'].map((id) => ({
      id: 'Food_' + id,
      name: 'Food_' + id,
      iconUrl: '',
      effect: 'Симпатия +100',
    })),
  };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  const native = JSON.parse(
    await readFile('tests/fixtures/progression-native.json', 'utf8'),
  );
  await page.route('**/api/game-data/progression', (route) =>
    route.fulfill({ json: { data: native } }),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/characters/adler');
    const facts = page.locator('.character-profile-facts');
    await expect(facts.locator('dd')).toHaveCount(8);
    const dimensions = await facts.locator('dd').evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.clientWidth,
        scroll: node.scrollWidth,
        height: node.clientHeight,
      })),
    );
    expect(
      dimensions.every(
        (row) => row.scroll <= row.width + 1 && row.height < 100,
      ),
      JSON.stringify(dimensions),
    ).toBe(true);
    await facts.screenshot({ path: testInfo.outputPath(`facts-${width}.png`) });
    await page.getByRole('button', { name: 'Дружба', exact: true }).click();
    const gifts = page.locator('.gift-grid');
    await expect(gifts).not.toContainText('Food_');
    await expect(
      gifts.getByRole('heading', {
        name: 'Рисовая лапша с жар-птицей и грудинкой',
        exact: true,
      }),
    ).toBeVisible();
    await expect(gifts.locator('img')).toHaveCount(4);
    const trigger = gifts.getByRole('button', {
      name: 'Подробнее: Освежающий ледник',
      exact: true,
    });
    await trigger.hover();
    const detail = page.getByRole('dialog', {
      name: 'Освежающий ледник',
      exact: true,
    });
    await expect(detail).not.toBeVisible();
    await page.waitForTimeout(250);
    await expect(detail).not.toBeVisible();
    await expect(detail).toBeVisible();
    await detail
      .getByRole('button', { name: 'Закрыть описание предмета' })
      .click();
    await page.mouse.move(0, 0);
    await trigger.hover();
    await page.waitForTimeout(150);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(550);
    await expect(detail).not.toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    await page
      .getByRole('button', { name: 'Плитки костюмов', exact: true })
      .click();
    await expect(page.locator('.wardrobe-thumbnails--grid')).toBeVisible();
    await page
      .getByRole('button', { name: 'Лента костюмов', exact: true })
      .click();
    await expect(page.locator('.wardrobe-thumbnails--rail')).toBeVisible();
    await page.getByRole('button', { name: 'Прокачка', exact: true }).click();
    const ascension = page.getByRole('region', {
      name: 'Возвышение персонажа',
    });
    await ascension
      .getByRole('button', { name: '1 → 20', exact: true })
      .click();
    await expect(ascension).toContainText(
      'Первое возвышение — после 20-го уровня',
    );
    await expect(
      ascension.getByRole('heading', {
        name: 'Руководство элитного охотника',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if (width === 360 || width === 1440)
      expect(
        (
          await new AxeBuilder({ page })
            .include('.character-profile-facts')
            .include('#character-progression')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('миграция подарков сохраняет ручные названия, изображения и порядок', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE character_profiles(character_id TEXT,gifts_json TEXT,biography TEXT)',
  );
  const gifts = [
    { id: 'Food_010', name: 'Food_010', iconUrl: '', effect: 'Симпатия +100' },
    {
      id: 'Food_142',
      name: 'Моё название',
      iconUrl: 'https://example.com/custom.png',
      effect: 'Моя правка',
    },
    { id: 'unknown', name: 'Личный предмет', iconUrl: '' },
  ];
  db.prepare('INSERT INTO character_profiles VALUES(?,?,?)').run(
    'test',
    JSON.stringify(gifts),
    'Ручная биография',
  );
  const sql = await readFile(
    'migrations/0046_native_food_identity.sql',
    'utf8',
  );
  db.exec(sql);
  const first = db.prepare('SELECT * FROM character_profiles').get()!;
  const repaired = JSON.parse(String(first.gifts_json));
  expect(repaired[0]).toMatchObject({
    id: 'Food_010',
    name: 'Освежающий ледник',
    effect: 'Симпатия +100',
  });
  expect(repaired[0].iconUrl).toMatch(/game-assets\/[a-f0-9]{20}\.webp$/);
  expect(repaired.slice(1)).toEqual(gifts.slice(1));
  expect(first.biography).toBe('Ручная биография');
  db.exec(sql);
  expect(db.prepare('SELECT * FROM character_profiles').get()).toEqual(first);
  db.close();
});

test('визуальный гайд принимает игровые иконки и отклоняет посторонние локальные пути', async () => {
  const context = vm.createContext({
    URL,
    Request,
    Response,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
  });
  new vm.Script(
    (await readFile('src/worker.js', 'utf8')).replace(
      'export default {',
      'const worker={',
    ) + ';globalThis.validate=validateGuideVisual;',
  ).runInContext(context);
  const validate = context.validate as (value: object) => {
    items: Array<{ imageUrl: string }>;
  };
  for (const url of [
    '/nte-meta/game-assets/ad87d2a73478180243f0.webp',
    '/game-assets/ad87d2a73478180243f0.webp',
    '/api/media/uploads/abc',
    'https://example.com/image.webp',
  ]) {
    const result = validate({
      kind: 'skills',
      items: [{ id: 'test', name: 'Навык', imageUrl: url, stats: [] }],
    });
    expect(result.items[0].imageUrl).toBe(url);
  }
  for (const url of [
    '/nte-meta/game-assets/../../private.png',
    'file:///D:/secret.png',
    'javascript:alert(1)',
    '/private.png',
  ]) {
    expect(() =>
      validate({
        kind: 'skills',
        items: [{ id: 'test', name: 'Навык', imageUrl: url, stats: [] }],
      }),
    ).toThrow('Укажите безопасную ссылку');
  }
});

test('опубликованный общий UI: сведения, подарки Аканэ, гардероб, гайд, тир-лист и футер', async ({
  page,
}, testInfo) => {
  const base = process.env.NTE_PROFILE_FOLLOWUP_URL;
  test.skip(!base, 'Built/production review is opt-in.');
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '#/characters/adler');
    const facts = page.locator('.character-profile-facts');
    await expect(facts.locator('dd')).toHaveCount(8);
    expect(
      await facts
        .locator('dd')
        .evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              node.scrollWidth <= node.clientWidth + 1 &&
              node.clientHeight < 100,
          ),
        ),
    ).toBe(true);
    if (width === 360 || width === 1440)
      await facts.screenshot({
        path: testInfo.outputPath(`live-facts-${width}.png`),
      });
    await page.goto(base + '#/characters/akane');
    await page.getByRole('button', { name: 'Дружба', exact: true }).click();
    const gifts = page.locator('.gift-grid');
    await expect(gifts).not.toContainText('Food_');
    await expect(
      gifts.getByRole('heading', {
        name: 'Рисовая лапша с жар-птицей и грудинкой',
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        gifts
          .locator('img')
          .evaluateAll((nodes) =>
            nodes.every(
              (node) =>
                (node as HTMLImageElement).complete &&
                (node as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    await page
      .getByRole('button', { name: 'Плитки костюмов', exact: true })
      .click();
    await expect(page.locator('.wardrobe-thumbnails--grid button')).toHaveCount(
      6,
    );
    await page
      .getByRole('button', { name: 'Лента костюмов', exact: true })
      .click();
    if (width === 360 || width === 1440)
      await page
        .locator('.wardrobe-gallery')
        .screenshot({
          path: testInfo.outputPath(`live-wardrobe-${width}.png`),
        });
    await page.goto(base + '#/guides/hotori-burst-guide');
    await expect(page.locator('.guide-page .toc')).toBeVisible();
    await page.locator('.guide-page .toc button').last().click();
    await expect(page.locator('#guide-teams')).toBeInViewport();
    if (width === 360 || width === 1440)
      await page.screenshot({
        path: testInfo.outputPath(`live-guide-${width}.png`),
      });
    await page.goto(base + '#/tierlists');
    await expect(page.locator('.tierlists-page .tier-row')).toHaveCount(5);
    if (width === 360 || width === 1440)
      await page
        .locator('.tier-preview')
        .screenshot({
          path: testInfo.outputPath(`live-tierlist-${width}.png`),
        });
    const footer = page.locator('.site-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole('link')).toHaveCount(4);
    if (width === 360 || width === 1440)
      await footer.screenshot({
        path: testInfo.outputPath(`live-footer-${width}.png`),
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
