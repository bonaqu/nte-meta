import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  calculateProgression,
  findProfileProgression,
  type ProgressionData,
} from '../src/lib/progression';

const data: ProgressionData = {
  costs: [
    {
      id: '1025',
      kind: 'character',
      name: 'Хатор',
      originalName: 'Hathor',
      arcTypeId: 3,
      arcType: 'Плазменный',
      stages: [
        {
          level: '30',
          fromLevel: 20,
          items_id: ['mat', 'gold'],
          amount: [5, 25000],
        },
      ],
    },
    {
      id: 'arc',
      kind: 'arc',
      rarity: 5,
      name: 'Дуга',
      originalName: 'Arc',
      arcTypeId: 3,
      arcType: 'Плазменный',
      iconUrl: '/assets/characters/Adler.webp',
      stages: [],
    },
  ],
  items: {
    mat: { name: 'Материал', iconUrl: '' },
    gold: { name: 'Жук-монета', iconUrl: '' },
    exp: { name: 'Опыт персонажа', iconUrl: '' },
    dye: { name: 'Краска', iconUrl: '' },
  },
  characterExp: [
    { level: 20, exp: 2500 },
    { level: 21, exp: 3000 },
  ],
  arcExp: [{ key: 'upgrade_pack_Fork_rank5_1_21', exp: 1200 }],
  experienceItems: [
    { id: 'exp', kind: 'character', experience: 1000, currencyCost: 250 },
    { id: 'dye', kind: 'arc', experience: 500 },
  ],
};
test('границы возвышения, опыт персонажа/дуги, запас и инвентарь считаются раздельно', () => {
  expect(findProfileProgression(data, 'Хатор', 'Hathor')?.id).toBe('1025');
  expect(
    findProfileProgression(data, 'Лакримоза', 'Lacrimosa'),
  ).toBeUndefined();
  const r = calculateProgression(
    data,
    data.costs[0],
    20,
    22,
    false,
    { mat: 2, exp: 4 },
    'exp',
  );
  expect(r.experience).toBe(5500);
  expect(r.missingLevels).toEqual([]);
  expect(r.materials).toContainEqual(
    expect.objectContaining({ id: 'mat', amount: 5, needed: 3 }),
  );
  expect(r.experienceMaterial).toMatchObject({
    amount: 6,
    needed: 2,
    excess: 500,
  });
  expect(r.materials).toContainEqual(
    expect.objectContaining({ id: 'gold', amount: 26500 }),
  );
  expect(r.experienceCurrencyKnown).toBe(true);
  expect(
    calculateProgression(data, data.costs[0], 20, 21, true).materials,
  ).toEqual([]);
  expect(
    calculateProgression(data, data.costs[0], 30, 30, false).experience,
  ).toBe(0);
  expect(
    calculateProgression(data, data.costs[1], 20, 21, false, {}, 'dye')
      .experienceMaterial,
  ).toMatchObject({ amount: 3, excess: 300 });
  expect(
    calculateProgression(data, data.costs[1], 20, 22, false).missingLevels,
  ).toEqual([21]);
  expect(() =>
    calculateProgression(data, data.costs[0], 32, 30, false),
  ).toThrow('целевой');
});
test('калькулятор в профиле: выбор диапазона, предмета и остатка на четырёх ширинах', async ({
  page,
}, testInfo) => {
  await page.route('**/api/game-data/progression', (route) =>
    route.fulfill({ json: { data } }),
  );
  await page.goto('/#/characters/hathor');
  const calculator = page.locator('.progression-calculator');
  await calculator
    .getByText('Калькулятор прокачки персонажа и дуги', { exact: true })
    .click();
  await calculator.getByLabel('С уровня', { exact: true }).dblclick();
  await calculator.getByLabel('С уровня', { exact: true }).fill('20');
  await calculator.getByLabel('С уровня', { exact: true }).press('Enter');
  await calculator.getByLabel('До уровня', { exact: true }).dblclick();
  await calculator.getByLabel('До уровня', { exact: true }).fill('22');
  await calculator.getByLabel('До уровня', { exact: true }).press('Enter');
  await expect(
    calculator.getByRole('button', { name: 'Персонаж Хатор', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(calculator.getByRole('combobox')).toHaveCount(0);
  await calculator.getByLabel('Учесть мой инвентарь', { exact: true }).check();
  await expect(
    calculator.locator('.progression-calculator__experience'),
  ).toContainText('5');
  await calculator.getByLabel('Уже есть: Материал', { exact: true }).dblclick();
  await calculator.getByLabel('Уже есть: Материал', { exact: true }).fill('2');
  await calculator
    .getByLabel('Уже есть: Материал', { exact: true })
    .press('Enter');
  await expect(
    calculator
      .locator('article')
      .filter({ has: page.getByText('Материал', { exact: true }) })
      .getByRole('status'),
  ).toContainText('3');
  await calculator
    .getByLabel('Учесть мой инвентарь', { exact: true })
    .uncheck();
  await expect(
    calculator
      .locator('article')
      .filter({ has: page.getByText('Материал', { exact: true }) })
      .getByRole('status'),
  ).toContainText('5');
  await calculator.getByLabel('Учесть мой инвентарь', { exact: true }).check();
  await expect(
    calculator
      .locator('article')
      .filter({ has: page.getByText('Материал', { exact: true }) })
      .getByRole('status'),
  ).toContainText('3');
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      String(width),
    ).toBeTruthy();
    if (width === 360 || width === 1440) {
      await calculator.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`calculator-${width}.png`),
      });
    }
  }
  await calculator
    .getByRole('button', { name: 'Дуга · Плазменный Дуга', exact: true })
    .click();
  await calculator.getByLabel('До уровня', { exact: true }).dblclick();
  await calculator.getByLabel('До уровня', { exact: true }).fill('21');
  await calculator.getByLabel('До уровня', { exact: true }).press('Enter');
  await expect(
    calculator
      .locator('.experience-picker')
      .getByRole('button', { name: /^Краска/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    calculator.locator('.progression-calculator__experience'),
  ).toContainText('1');
});

test('профиль: совместимые дуги, настоящие предметы опыта, этапы возвышения и награды дружбы', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const adler = characters.find((row: { id: string }) => row.id === 'adler');
  adler.profile = {
    ...adler.profile,
    ...JSON.parse(
      await readFile('tests/fixtures/progression-profile.json', 'utf8'),
    ),
  };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  const native = JSON.parse(
    await readFile('tests/fixtures/progression-native.json', 'utf8'),
  ) as ProgressionData;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/game-data/progression', (route) =>
    route.fulfill({ json: { data: native } }),
  );
  await page.goto('/#/characters/adler');
  await page.getByRole('button', { name: 'Прокачка', exact: true }).click();
  const calculator = page.locator('.progression-calculator');
  await calculator.locator('summary').click();
  await expect(
    calculator.getByRole('button', { name: 'Персонаж Адлер', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(calculator.locator('.experience-picker button')).toHaveCount(3);
  for (const image of await calculator
    .locator('.experience-picker img')
    .all()) {
    await expect(image).toHaveAttribute('src', /game-assets\//);
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  await calculator
    .getByRole('button', { name: /Руководство восходящего охотника/ })
    .click();
  await expect(
    calculator.locator('.experience-picker').getByRole('button', {
      name: /Руководство восходящего охотника/,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await calculator.getByRole('button', { name: /^Дуга · Гибридный/ }).click();
  await calculator.locator('.arc-picker > summary').click();
  const arcButtons = calculator.locator('.arc-picker__options button');
  const compatible = native.costs.filter(
    (row) => row.kind === 'arc' && row.arcTypeId === 5,
  );
  await expect(arcButtons).toHaveCount(compatible.length);
  expect(await arcButtons.allTextContents()).toEqual(
    compatible.map((row) => row.name),
  );
  await arcButtons.last().click();
  await expect(arcButtons.last()).toHaveAttribute('aria-pressed', 'true');
  await calculator
    .getByLabel('Поиск совместимой дуги')
    .fill('несуществующая дуга');
  await expect(
    calculator
      .getByRole('status')
      .filter({ hasText: 'Дуга с таким названием не найдена.' }),
  ).toBeVisible();
  await calculator.getByLabel('Поиск совместимой дуги').fill('');
  await expect(calculator.locator('.experience-picker button')).toHaveCount(3);
  await expect(
    calculator.locator('.experience-picker button').first(),
  ).toContainText('Светлая краска');
  await calculator
    .getByRole('button', { name: 'Персонаж Адлер', exact: true })
    .click();
  await calculator.locator('summary').first().click();
  const ascension = page.getByRole('region', { name: 'Возвышение персонажа' });
  // Sections named by aria-label are exposed as regions.
  await expect(ascension).toBeVisible();
  const gold = ascension.locator('article').filter({
    has: page.getByRole('heading', { name: 'Жук-монета', exact: true }),
  });
  await expect(gold).toContainText('525');
  await ascension.getByRole('button', { name: '20 → 30', exact: true }).click();
  await expect(gold).toContainText('25');
  await expect(ascension.locator('article')).toHaveCount(2);
  await ascension
    .getByRole('button', { name: 'Всего · 1–80', exact: true })
    .click();
  await expect(ascension.locator('article')).toHaveCount(5);
  await page.getByRole('button', { name: 'Дружба', exact: true }).click();
  const friendship = page.locator('#character-friendship');
  await expect(friendship.locator('.friendship-levels button')).toHaveCount(10);
  await friendship.getByRole('button', { name: /^Ур\.\s*10$/ }).click();
  await expect(
    friendship.getByRole('heading', { name: 'Уровень симпатии 10' }),
  ).toBeVisible();
  await expect(
    friendship.getByRole('button', { name: 'Награды дружбы: вперёд' }),
  ).toHaveCount(0);
  await friendship.getByRole('button', { name: /^Ур\.\s*9$/ }).click();
  await expect(
    friendship.getByRole('heading', { name: 'Уровень симпатии 9' }),
  ).toBeVisible();
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await calculator.locator('summary').first().click();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('button', { name: 'Прокачка', exact: true }).click();
    if (width === 360 || width === 1440)
      await page.screenshot({
        path: testInfo.outputPath(`calculator-native-${width}.png`),
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      String(width),
    ).toBe(true);
    for (const target of ['#character-progression', '#character-friendship']) {
      await page.locator(target).scrollIntoViewIfNeeded();
      if (width === 360 || width === 1440)
        await page.screenshot({
          path: testInfo.outputPath(`${target.slice(1)}-${width}.png`),
        });
    }
    if (width === 360 || width === 1440)
      expect(
        (
          await new AxeBuilder({ page })
            .include('#character-progression')
            .include('#character-friendship')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
  }
  await page.goto('/#/characters/lacrimosa');
  await page.locator('.progression-calculator > summary').click();
  await expect(
    page
      .locator('.progression-calculator')
      .getByRole('button', { name: 'Персонаж Лакримоза', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page
      .locator('.progression-calculator')
      .getByRole('button', { name: /^Дуга · Жидкий/ }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
