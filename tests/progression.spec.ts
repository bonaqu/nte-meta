import { expect, test } from '@playwright/test';
import {
  calculateProgression,
  type ProgressionData,
} from '../src/lib/progression';

const data: ProgressionData = {
  costs: [
    {
      id: '1025',
      kind: 'character',
      name: 'Хатор',
      originalName: 'Hathor',
      stages: [{ level: '30', items_id: ['mat', 'gold'], amount: [5, 25000] }],
    },
    {
      id: 'arc',
      kind: 'arc',
      rarity: 5,
      name: 'Дуга',
      originalName: 'Arc',
      stages: [],
    },
  ],
  items: {
    mat: { name: 'Материал', iconUrl: '' },
    gold: { name: 'Фонсы', iconUrl: '' },
    exp: { name: 'Опыт персонажа', iconUrl: '' },
    dye: { name: 'Краска', iconUrl: '' },
  },
  characterExp: [
    { level: 30, exp: 2500 },
    { level: 31, exp: 3000 },
  ],
  arcExp: [{ key: 'upgrade_pack_Fork_rank5_1_31', exp: 1200 }],
  experienceItems: [
    { id: 'exp', kind: 'character', experience: 1000 },
    { id: 'dye', kind: 'arc', experience: 500 },
  ],
};
test('границы возвышения, опыт персонажа/дуги, запас и инвентарь считаются раздельно', () => {
  const r = calculateProgression(
    data,
    data.costs[0],
    30,
    32,
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
  expect(
    calculateProgression(data, data.costs[0], 30, 31, true).materials,
  ).toEqual([]);
  expect(
    calculateProgression(data, data.costs[0], 30, 30, false).experience,
  ).toBe(0);
  expect(
    calculateProgression(data, data.costs[1], 30, 31, false, {}, 'dye')
      .experienceMaterial,
  ).toMatchObject({ amount: 3, excess: 300 });
  expect(
    calculateProgression(data, data.costs[1], 30, 32, false).missingLevels,
  ).toEqual([31]);
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
  await calculator.getByLabel('С уровня', { exact: true }).fill('30');
  await calculator.getByLabel('До уровня', { exact: true }).fill('32');
  await expect(calculator.getByLabel('Персонаж или дуга')).toHaveValue('1025');
  await expect(
    calculator.locator('.progression-calculator__experience'),
  ).toContainText('5');
  await calculator.getByLabel('Уже есть: Материал', { exact: true }).fill('2');
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
  await calculator.getByLabel('Что прокачиваем').selectOption('arc');
  await calculator.getByLabel('До уровня', { exact: true }).fill('31');
  await expect(calculator.getByLabel('Предмет опыта')).toContainText('Краска');
  await expect(
    calculator.locator('.progression-calculator__experience'),
  ).toContainText('1');
});
