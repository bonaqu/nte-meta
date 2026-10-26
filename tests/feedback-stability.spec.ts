import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import AxeBuilder from '@axe-core/playwright';
import { visualFromImport } from '../src/lib/guide-visual';
import { localizeGuideSkills } from '../src/lib/profile-presentation';

test('равный приоритет проходит импорт, валидацию API и повторное чтение', async () => {
  const value = visualFromImport('skills', [
    { name: 'Первый' },
    { name: 'Второй', equalPriority: true },
  ]);
  const context = vm.createContext({ crypto, URL, Response });
  new vm.Script(
    (await readFile('src/worker.js', 'utf8')).replace(
      'export default {',
      'const worker = {',
    ) + ';globalThis.validate=validateGuideVisual;',
  ).runInContext(context);
  const validated = context.validate(value);
  expect(validated.items[1].equalPriority).toBe(true);
  expect(
    visualFromImport('skills', JSON.stringify(validated.items)).items[1]
      .equalPriority,
  ).toBe(true);
  expect(
    context.validate({ ...value, kind: 'rotation' }).items[1].equalPriority,
  ).toBeUndefined();
  expect(
    localizeGuideSkills(
      "World's Tide / Present Replay / Misty Moon Style / Shopkeeper's Authority",
    ),
  ).toBe(
    'Мировой прилив / Настоящее воспроизведение / Лунный стиль Мисти / Авторитет лавочника',
  );
});

test('дуга: отложенная подсказка, игровые характеристики, Escape и клавиатура', async ({
  page,
}, info) => {
  await page.goto('/#/guides/iroi-build-guide');
  const arcs = page.locator('.guide-visual--arcs');
  await arcs.scrollIntoViewIfNeeded();
  const item = arcs.locator(':scope > li').first();
  await item.getByRole('button', { name: /^Подробнее:/ }).hover();
  await page.waitForTimeout(200);
  await expect(page.locator('.item-detail-popover:popover-open')).toHaveCount(
    0,
  );
  // Moving from the info control to the same card must not cancel its hover.
  await item.hover({ position: { x: 30, y: 60 } });
  const sheet = page.locator('.item-detail-popover:popover-open');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.item-detail-popover__stats')).toBeVisible();
  await expect(sheet).not.toContainText(/\{\d+\}/);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.item-detail-popover:popover-open')
        .analyze()
    ).violations,
  ).toEqual([]);
  await sheet.screenshot({ path: info.outputPath('arc-sheet.png') });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await item.getByRole('button', { name: /^Подробнее:/ }).focus();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('Адлер: одиночный костюм без пустой строки, превью сверху и целиком', async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const adler = characters.find((row: { id: string }) => row.id === 'adler');
  const legacy = JSON.parse(
    await readFile('tests/fixtures/adler-legacy-media.json', 'utf8'),
  );
  adler.profile = {
    ...adler.profile,
    ...legacy,
    skins: JSON.parse(
      await readFile('tests/fixtures/profile-polish.json', 'utf8'),
    ).skins.slice(0, 1),
  };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/characters/adler');
    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    const stage = page.locator('.wardrobe-gallery__stage');
    await expect(stage).toBeVisible();
    await expect(stage.getByText('Наряд', { exact: true })).toHaveCount(0);
    const preview = stage.locator('.skin-media');
    const bounds = (await preview.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(440);
    expect(Math.abs(bounds.y - (await stage.boundingBox())!.y)).toBeLessThan(
      25,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if (width === 360 || width === 1440)
      await stage.screenshot({
        path: info.outputPath(`adler-wardrobe-${width}.png`),
      });
    await preview.click();
    await expect(page.locator('.skin-lightbox[open]')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});
