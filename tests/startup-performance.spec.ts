import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

test('холодная загрузка профиля не ждёт вторичные данные и авторизацию', async ({
  browser,
  request,
}, info) => {
  const base = process.env.NTE_STARTUP_REVIEW_URL;
  test.skip(!base, 'Измерение готовой сборки с контролируемой задержкой.');
  test.setTimeout(120000);
  const characters = JSON.parse(
    await readFile(process.env.NTE_STARTUP_CHARACTERS!, 'utf8'),
  );
  const payloads = new Map<string, unknown>([['/api/characters', characters]]);
  for (const key of [
    'guides',
    'rotations',
    'tierlists',
    'teams',
    'news',
    'leaks',
    'threads',
    'game-data/progression',
  ]) {
    payloads.set(
      '/api/' + key,
      (await (await request.get('http://127.0.0.1:8788/api/' + key)).json())
        .data,
    );
  }
  const runs = [];
  const width = Number(process.env.NTE_STARTUP_WIDTH || 360);
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      const metrics = { lcp: 0, cls: 0, shifts: [] as unknown[] };
      (window as unknown as { nteMetrics: typeof metrics }).nteMetrics =
        metrics;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) metrics.lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{
            node?: Element;
            previousRect: DOMRectReadOnly;
            currentRect: DOMRectReadOnly;
          }>;
        })[])
          if (!e.hadRecentInput) {
            metrics.cls += e.value;
            metrics.shifts.push({
              value: e.value,
              sources: e.sources?.map((source) => ({
                node: source.node?.className || source.node?.tagName,
                previous: source.previousRect.toJSON(),
                current: source.currentRect.toJSON(),
              })),
            });
          }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname === '/api/auth/me' ||
        (url.pathname === '/api/comments' &&
          url.searchParams.get('targetType') === 'site')
      ) {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        if (!page.isClosed())
          await route.fulfill({
            json: { data: url.pathname === '/api/auth/me' ? null : [] },
          });
      } else if (payloads.has(url.pathname))
        await route.fulfill({ json: { data: payloads.get(url.pathname) } });
      else await route.continue();
    });
    const start = Date.now();
    await page.goto(base! + '#/characters/adler');
    await expect(page.locator('.character-dossier h1')).toHaveAccessibleName(
      'Адлер',
      { timeout: 30000 },
    );
    const readyMs = Date.now() - start;
    await page
      .locator('.character-lore-hero > img')
      .evaluate((img: HTMLImageElement) => img.decode());
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    runs.push({
      readyMs,
      ...(await page.evaluate(
        () =>
          (window as unknown as { nteMetrics: { lcp: number; cls: number } })
            .nteMetrics,
      )),
    });
    await context.close();
  }
  await writeFile(
    info.outputPath('startup-metrics.json'),
    JSON.stringify(
      { viewport: width, cpuRate: 4, secondaryDelayMs: 8000, runs },
      null,
      2,
    ),
  );
  if (!process.env.NTE_STARTUP_BASELINE)
    for (const run of runs) {
      expect(run.readyMs).toBeLessThan(4000);
      expect(run.cls).toBeLessThan(0.1);
    }
});
