import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const publicRoutes = [
  '/',
  '/#/characters',
  '/#/characters/hotori',
  '/#/guides/hotori-burst-guide',
  '/#/tierlists',
  '/#/news/patch-10-first-meta-notes',
  '/#/profile',
  '/#/admin',
];

test.describe('Качество интерфейса NTE Meta', () => {
  test.describe.configure({ mode: 'serial' });

  for (const route of publicRoutes) {
    test(`WCAG 2.1 AA: ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.locator('main').waitFor();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations,
        results.violations
          .map((item) => `${item.id}: ${item.help} (${item.nodes.length})`)
          .join('\n'),
      ).toEqual([]);
    });
  }

  test('основные экраны не создают горизонтальную прокрутку', async ({
    page,
  }) => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of publicRoutes.slice(0, 5)) {
        await page.goto(route);
        await page.locator('main').waitFor();
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(
          dimensions.content,
          `${route} at ${width}px`,
        ).toBeLessThanOrEqual(dimensions.viewport + 1);
      }
    }
  });

  test('изображения резервируют место и успешно загружаются', async ({
    page,
  }) => {
    // Прямой human-readable URL ловит ошибки относительных путей, которые не
    // заметны при hash-навигации с корневой страницы.
    await page.goto('/characters/hotori/');
    const images = page.locator('main img');
    await expect(images.first()).toBeVisible();
  expect(
    await page
      .locator('main img:not([width]), main img:not([height])')
      .count(),
  ).toBe(0);
  await page.evaluate(async () => {
    const imageNodes = Array.from(
      document.querySelectorAll<HTMLImageElement>('main img'),
    );
    for (const image of imageNodes) {
      image.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          const settle = () => resolve();
          image.addEventListener('load', settle, { once: true });
          image.addEventListener('error', settle, { once: true });
          window.setTimeout(settle, 2_000);
        });
      }
    }
  });
  expect(
    await images.evaluateAll(
      (nodes) =>
          nodes.filter((node) => {
            const image = node as HTMLImageElement;
            return !image.complete || image.naturalWidth === 0;
          }).length,
      ),
    ).toBe(0);
  });
});
