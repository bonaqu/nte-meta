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
      .getByRole('button', { name: 'Приоритет прокачки навыков', exact: true })
      .click();
    const priorities = page.locator('.guide-visual--skills');
    await expect(priorities).toBeInViewport();
    await expect(priorities.locator('.guide-visual__position')).toHaveCount(0);
    const priority = priorities.locator(':scope > li').first();
    const icon = (await priority.locator(':scope > img').boundingBox())!;
    const label = (await priority.locator('h3').boundingBox())!;
    expect(label.x).toBeGreaterThan(icon.x + icon.width);
    expect(
      Math.abs(label.y + label.height / 2 - icon.y - icon.height / 2),
    ).toBeLessThan(1);
    await expect(priority.locator('.guide-skill-type')).toHaveText(
      'Навык перенаправления',
    );
    const arrows = await priorities
      .locator(':scope > li[data-priority-relation]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const arrow = getComputedStyle(node, '::before');
          return {
            top: parseFloat(arrow.top),
            height: node.getBoundingClientRect().height,
          };
        }),
      );
    for (const arrow of arrows)
      expect(Math.abs(arrow.top - arrow.height / 2)).toBeLessThan(2);
    if (width === 360 || width === 1440)
      await priorities.screenshot({
        path: info.outputPath(`guide-priorities-${width}.png`),
      });
    await navigation
      .getByRole('button', { name: 'Базовая ротация', exact: true })
      .click();
    const chain = page.locator('.guide-basic-rotation');
    await expect(chain).not.toHaveClass(/team-rotation-sequence/);
    await expect(
      chain.locator('.rotation-sequence-heading, .rotation-cycle-end'),
    ).toHaveCount(0);
    const rotation = chain;
    await expect(rotation).toBeInViewport();
    const lefts = await rotation
      .locator(':scope > li')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().left));
    expect(new Set(lefts).size).toBe(1);
    const offsets = await rotation.locator(':scope > li').evaluateAll((nodes) =>
      nodes.map((node) => {
        const number = node
          .querySelector('.guide-rotation-index')!
          .getBoundingClientRect();
        const heading = node
          .querySelector('.guide-rotation-heading')!
          .getBoundingClientRect();
        const content = node
          .querySelector('.guide-rotation-content')!
          .getBoundingClientRect();
        if (content.top < heading.bottom)
          throw new Error('Текст перекрывает заголовок этапа');
        return Math.abs(
          number.top + number.height / 2 - heading.top - heading.height / 2,
        );
      }),
    );
    expect(Math.max(...offsets)).toBeLessThan(1);
    expect(
      await rotation
        .locator(':scope > li')
        .evaluateAll((nodes) =>
          nodes
            .slice(0, -1)
            .every(
              (node) =>
                !['none', 'normal'].includes(
                  getComputedStyle(node, '::after').content,
                ),
            ),
        ),
    ).toBe(true);
    await expect(rotation.locator('.guide-rotation-index')).toHaveText([
      '01',
      '02',
      '03',
      '04',
      '05',
    ]);
    expect(
      await rotation
        .locator(':scope > li')
        .evaluateAll((nodes) =>
          nodes.every((node) =>
            ['none', 'normal'].includes(
              getComputedStyle(node, '::before').content,
            ),
          ),
        ),
    ).toBe(true);
    if (width === 360 || width === 1440)
      await chain.screenshot({
        path: info.outputPath(`guide-rotation-${width}.png`),
      });
    await expect(page.locator('.guide-visual--stats > li p')).toHaveCount(0);
    for (const stat of await page.locator('.guide-visual--stats > li').all()) {
      const icon = (await stat
        .locator(':scope > .guide-stat-icons')
        .boundingBox())!;
      const text = (await stat.locator('h3').boundingBox())!;
      expect(
        Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
      ).toBeLessThan(1);
    }
    const cartridges = page.locator('.guide-visual--cartridges');
    await cartridges.scrollIntoViewIfNeeded();
    if (width === 360 || width === 1440)
      await cartridges.screenshot({
        path: info.outputPath(`guide-cartridges-${width}.png`),
      });
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
