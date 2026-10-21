import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';

// Opt-in review of the actual dist served by the existing preview command.
test('собранное приложение: новые материалы, изображения и четыре размера экрана', async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.NTE_PREVIEW_URL,
    'Requires an already running production preview.',
  );
  test.setTimeout(120000);
  const base = process.env.NTE_PREVIEW_URL!.replace(/\/$/, '');
  const errors: string[] = [];
  const responses: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/401|Unauthorized/.test(message.text()))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !/\/auth\//.test(response.url()))
      responses.push(`${response.status()} ${response.url()}`);
  });
  const measurements = [];
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith('/api/characters') && response.ok(),
    ),
    page.goto(`${base}/#/`),
  ]);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const path of [
      '/',
      '/characters',
      '/characters/akane',
      '/characters/blackbird',
      '/characters/iroi',
      '/guides',
      '/guides/akane-build-guide',
      '/guides/linko-build-guide',
      '/tierlists',
    ]) {
      await page.goto(`${base}/#${path}`);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(
        page.getByRole('heading', { name: /Синхронизируем данные/ }),
      ).toHaveCount(0);
      const size = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(size.scroll, `${width} ${path}`).toBeLessThanOrEqual(
        size.viewport + 1,
      );
      if (path.includes('characters/') || path.includes('guides/')) {
        await expect
          .poll(() =>
            page
              .locator('main img')
              .evaluateAll((images) =>
                images
                  .filter(
                    (image) =>
                      image.getBoundingClientRect().height > 0 &&
                      image.getBoundingClientRect().top < innerHeight,
                  )
                  .every(
                    (image) =>
                      (image as HTMLImageElement).complete &&
                      (image as HTMLImageElement).naturalWidth > 0,
                  ),
              ),
          )
          .toBeTruthy();
      }
      if (
        (width === 360 || width === 1440) &&
        path === '/guides/akane-build-guide'
      ) {
        await expect(
          page.getByText('Отряды пока не добавлены', { exact: true }),
        ).toHaveCount(0);
        // Render below-the-fold content-visibility sections before the full-page capture.
        for (const section of await page.locator('main section').all())
          await section.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          window.scrollTo(0, 0);
          (document.activeElement as HTMLElement)?.blur();
        });
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        const result = await new AxeBuilder({ page })
          .include('main')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(result.violations).toEqual([]);
        await page.screenshot({
          path: testInfo.outputPath(`akane-guide-${width}.png`),
          fullPage: true,
        });
      }
      measurements.push({
        width,
        path,
        ...(await page.evaluate(() => {
          const navigation = performance.getEntriesByType(
            'navigation',
          )[0] as PerformanceNavigationTiming;
          return {
            domContentLoadedMs: Math.round(
              navigation.domContentLoadedEventEnd - navigation.startTime,
            ),
          };
        })),
      });
    }
  }
  expect(errors).toEqual([]);
  expect(responses).toEqual([]);
  await writeFile(
    testInfo.outputPath('built-audit.json'),
    JSON.stringify({ measurements, errors, responses }, null, 2),
  );
});
