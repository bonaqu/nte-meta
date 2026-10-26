import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

test('переход из каталога в профиль: время до отрисовки и загрузка справочника', async ({
  page,
}, info) => {
  test.skip(
    !process.env.NTE_NAVIGATION_FIXTURE && !process.env.NTE_NAVIGATION_LIVE,
    'Измерение на полном опубликованном каталоге.',
  );
  if (process.env.NTE_NAVIGATION_FIXTURE) {
    const characters = JSON.parse(
      await readFile(process.env.NTE_NAVIGATION_FIXTURE!, 'utf8'),
    );
    await page.route('**/api/characters', (route) =>
      route.fulfill({ json: { data: characters } }),
    );
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  if (process.env.NTE_NAVIGATION_STAFF) {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          data: {
            id: 'performance-owner',
            username: 'owner',
            role: 'owner',
            status: 'active',
          },
        },
      }),
    );
    await page.route('**/api/auth/warnings', (route) =>
      route.fulfill({ json: { data: [] } }),
    );
    await page.route('**/api/sources', (route) =>
      route.fulfill({ json: { data: [] } }),
    );
    await page.goto((process.env.NTE_NAVIGATION_URL || '/') + '#/profile');
    await expect(
      page.getByRole('heading', { name: 'Профиль', exact: true, level: 1 }),
    ).toBeVisible();
  }
  await page.goto((process.env.NTE_NAVIGATION_URL || '/') + '#/characters');
  await expect(
    page.getByRole('heading', {
      name: 'Персонажи Neverness to Everness',
      exact: true,
    }),
  ).toBeVisible();
  const runs = [];
  for (const slug of ['adler', 'akane', 'iroi']) {
    const start = await page.evaluate((slug) => {
      const start = performance.now();
      location.hash = '/characters/' + slug;
      return start;
    }, slug);
    await expect(page.locator('.character-dossier h1')).toBeVisible();
    const elapsed = await page.evaluate(
      (start) =>
        new Promise<number>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now() - start)),
          ),
        ),
      start,
    );
    runs.push({
      slug,
      elapsed,
      hiddenEditorNodes: await page
        .locator('dialog:not([open]) .editor-shell__body *')
        .count(),
    });
    await page.evaluate(() => {
      location.hash = '/characters';
    });
    await expect(page.locator('.character-dossier h1')).toHaveCount(0);
  }
  const result = {
    runs,
    images: await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter(
          (entry) =>
            entry instanceof PerformanceResourceTiming &&
            entry.initiatorType === 'img',
        )
        .map((entry) => ({ name: entry.name, duration: entry.duration })),
    ),
    dictionaryRequests: requests.filter((url) =>
      /item-descriptions|item-details/.test(url),
    ),
  };
  await writeFile(
    info.outputPath('navigation.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  expect(
    result.dictionaryRequests.filter((url) => /item-descriptions/.test(url)),
  ).toEqual([]);
  expect(Math.max(...runs.map((r) => r.elapsed))).toBeLessThan(2000);
  if (
    process.env.NTE_NAVIGATION_STAFF &&
    process.env.NTE_NAVIGATION_ASSERT_CLOSED
  )
    expect(runs.map((row) => row.hiddenEditorNodes)).toEqual([0, 0, 0]);
});
