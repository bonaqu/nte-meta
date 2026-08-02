import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const reviewedPortalRoutes = [
  '/',
  '/#/characters',
  '/#/characters/hotori',
  '/#/guides',
  '/#/guides/hotori-burst-guide',
  '/#/tierlists',
];

const publicRoutes = [
  ...reviewedPortalRoutes,
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

  test('mobile: ключевые маршруты не имеют serious/critical нарушений', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of reviewedPortalRoutes) {
      await page.goto(route);
      await page.locator('main').waitFor();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact || ''),
      );
      expect(
        blocking,
        blocking
          .map((item) => `${route}: ${item.id} (${item.nodes.length})`)
          .join('\n'),
      ).toEqual([]);
    }
  });

  test('основные экраны не создают горизонтальную прокрутку', async ({
    page,
  }) => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of reviewedPortalRoutes) {
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

  test('mobile: меню и профиль доступны с клавиатуры', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'NTE Meta' })).toBeVisible();

    const profileLink = page.getByRole('link', { name: 'Войти в профиль' });
    await expect(profileLink).toBeVisible();
    const menuButton = page.getByRole('button', { name: 'Открыть меню' });
    await menuButton.focus();
    await expect(menuButton).toBeFocused();
    await page.keyboard.press('Enter');

    const navigation = page.getByRole('navigation', {
      name: 'Основная навигация',
    });
    await expect(navigation).toBeVisible();
    const charactersLink = navigation.getByRole('link', {
      name: 'Персонажи',
    });
    await charactersLink.focus();
    await expect(charactersLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Персонажи Neverness to Everness' }),
    ).toBeVisible();
  });

  test('каталоги сохраняют иерархию заголовков, формы — мобильный размер текста', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/characters');
    await expect(
      page.getByRole('heading', { name: 'Список персонажей', level: 2 }),
    ).toBeAttached();
    await page.goto('/#/guides');
    await expect(
      page.getByRole('heading', { name: 'Список гайдов', level: 2 }),
    ).toBeAttached();
    await page.goto('/#/profile');
    const controlSizes = await page
      .locator('main input, main select, main textarea')
      .evaluateAll((nodes) =>
        nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      );
    expect(Math.min(...controlSizes)).toBeGreaterThanOrEqual(16);
  });

  test('review evidence: desktop и mobile screenshots', async ({
    page,
  }, testInfo) => {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'NTE Meta' }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator('.hero-media img')
            .evaluateAll(
              (nodes) =>
                nodes.filter(
                  (node) =>
                    (node as HTMLImageElement).complete &&
                    (node as HTMLImageElement).naturalWidth > 0,
                ).length,
            ),
        )
        .toBe(3);
      await page.locator('.hero-media img').evaluateAll(async (nodes) => {
        await Promise.all(
          nodes.map((node) => (node as HTMLImageElement).decode()),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      const heroLayout = await page.locator('.hero-media').evaluate((node) => ({
        innerWidth: window.innerWidth,
        columns: getComputedStyle(node).gridTemplateColumns,
        narrowViewport: matchMedia('(max-width: 640px)').matches,
      }));
      process.stdout.write(
        `[interface-layout:${viewport.name}] ${JSON.stringify(heroLayout)}\n`,
      );
      const screenshotPath = testInfo.outputPath(`portal-${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await testInfo.attach(`portal-${viewport.name}`, {
        path: screenshotPath,
        contentType: 'image/png',
      });
      process.stdout.write(`[interface-screenshot] ${screenshotPath}\n`);
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

  test('встроенные видео резервируют место до загрузки', async ({ page }) => {
    await page.route('**/api/guides', async (route) => {
      const response = await route.fetch();
      const payload = (await response.json()) as {
        data: Array<Record<string, unknown>>;
      };
      payload.data = payload.data.map((guide) =>
        guide.slug === 'hotori-burst-guide'
          ? {
              ...guide,
              videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
            }
          : guide,
      );
      await route.fulfill({ response, json: payload });
    });
    await page.goto('/#/guides/hotori-burst-guide');
    await page.locator('main').waitFor();
    const frames = page.locator('main iframe');
    await expect(frames.first()).toBeVisible();
    expect(
      await page
        .locator('main iframe:not([width]), main iframe:not([height])')
        .count(),
    ).toBe(0);
  });
});
