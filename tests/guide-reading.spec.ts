import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('гайд: навигация, экипировка и мобильная компоновка', async ({
  page,
}, info) => {
  const base = process.env.NTE_GUIDE_REVIEW_URL || '/';
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '#/guides/iroi-build-guide');
    const navigation = page.getByLabel('Навигация по гайду', { exact: true });
    await expect(navigation).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    if (width < 1024) {
      expect(
        (await page.locator('.guide-hero').boundingBox())!.height,
      ).toBeLessThan(650);
      expect((await navigation.boundingBox())!.height).toBeLessThan(80);
    }
    if (width === 360 || width === 1440)
      await page.screenshot({
        path: info.outputPath(`guide-top-${width}.png`),
      });
    await navigation
      .getByRole('button', { name: 'Лучшие дуги', exact: true })
      .click();
    const arcs = page.locator('.guide-section-card').filter({
      has: page.getByRole('heading', { name: 'Лучшие дуги', exact: true }),
    });
    await expect(arcs).toBeInViewport();
    expect(await arcs.locator('img').count()).toBeGreaterThan(0);
    await arcs.locator('img').evaluateAll((nodes) =>
      nodes.forEach((node) => {
        (node as HTMLImageElement).loading = 'eager';
      }),
    );
    await expect
      .poll(() =>
        arcs
          .locator('img')
          .evaluateAll((nodes) =>
            nodes.every(
              (n) =>
                (n as HTMLImageElement).complete &&
                (n as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    if (width === 360 || width === 1440)
      await arcs.screenshot({
        path: info.outputPath(`guide-arcs-${width}.png`),
      });
    await navigation
      .getByRole('button', { name: 'Базовая ротация', exact: true })
      .click();
    const rotation = page.locator('.guide-visual--rotation');
    await expect(rotation).toBeInViewport();
    const lefts = await rotation
      .locator(':scope > li')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().left));
    expect(new Set(lefts).size).toBe(1);
    const offsets = await rotation.locator(':scope > li').evaluateAll((nodes) =>
      nodes.map((node) => {
        const number = node
          .querySelector('.guide-visual__position')!
          .getBoundingClientRect();
        const body = node
          .querySelector('.guide-visual__body')!
          .getBoundingClientRect();
        return Math.abs(
          number.top + number.height / 2 - body.top - body.height / 2,
        );
      }),
    );
    expect(Math.max(...offsets)).toBeLessThan(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if (width === 360 || width === 1440)
      expect(
        (await new AxeBuilder({ page }).include('.guide-layout').analyze())
          .violations,
      ).toEqual([]);
  }
  expect(errors).toEqual([]);
});
