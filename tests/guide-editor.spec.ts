import { expect, test } from '@playwright/test';
import type { Guide } from '../src/types';

test('редактор сохраняет несохранённую часть гайда и не дублирует секции после сбоя', async ({
  page,
  request,
}) => {
  const guides = (
    await (await request.get('http://127.0.0.1:8788/api/guides')).json()
  ).data as Guide[];
  const guide = guides.find((guide) => guide.id === 'guide-hotori')!;
  let creates = 0;
  let failReorder = false;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'editor-test',
          username: 'editor-test',
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
  await page.route('**/api/guides', (route) =>
    route.fulfill({ json: { data: guides } }),
  );
  await page.route('**/api/guides/guide-hotori', async (route) => {
    const body = route.request().postDataJSON();
    Object.assign(guide, { ...body, patch: body.patchVersion });
    await route.fulfill({ json: { data: { success: true } } });
  });
  await page.route('**/api/guides/guide-hotori/sections', async (route) => {
    const body = route.request().postDataJSON();
    const id = `persisted-section-${++creates}`;
    guide.sections.push({
      id,
      title: body.title,
      type: body.type,
      content: body.content,
      position: guide.sections.length + 1,
    });
    await route.fulfill({ json: { data: { id } } });
  });
  await page.route('**/api/guide-sections/*', async (route) => {
    const id = route.request().url().split('/').at(-1);
    const section = guide.sections.find((section) => section.id === id);
    if (section) Object.assign(section, route.request().postDataJSON());
    await route.fulfill({ json: { data: { success: true } } });
  });
  await page.route(
    '**/api/guides/guide-hotori/sections/reorder',
    async (route) => {
      if (failReorder) {
        failReorder = false;
        await route.fulfill({
          status: 503,
          json: { error: 'Тестовый сбой порядка' },
        });
      } else await route.fulfill({ json: { data: { success: true } } });
    },
  );
  await page.goto('/#/profile');
  await expect(
    page.getByRole('heading', { name: 'Профиль', level: 1 }),
  ).toBeVisible();
  await page.goto('/#/guides/hotori-burst-guide');
  await page.getByRole('button', { name: 'Редактировать гайд' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog
    .getByRole('navigation', { name: 'Разделы редактора гайда' })
    .getByRole('button', { name: 'Секции', exact: true })
    .click();
  const summary = dialog.locator('.guide-admin-meta textarea').first();
  await summary.fill('Несохранённый вывод редактора');
  await dialog
    .getByRole('button', { name: 'Добавить раздел', exact: true })
    .click();
  await dialog
    .getByLabel('Название секции', { exact: true })
    .fill('Новый раздел редактора');
  failReorder = true;
  await dialog
    .getByRole('button', { name: 'Сохранить секции', exact: true })
    .click();
  await expect(dialog.getByText('Тестовый сбой порядка').first()).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Сохранить секции', exact: true })
    .click();
  await expect(
    dialog.getByText('Секции гайда сохранены в D1.').first(),
  ).toBeVisible();
  expect(creates).toBe(1);
  await expect(summary).toHaveValue('Несохранённый вывод редактора');

  await dialog
    .getByLabel('Название секции', { exact: true })
    .fill('Ещё не сохранённое название');
  await dialog
    .getByRole('button', { name: 'Сохранить параметры гайда', exact: true })
    .click();
  await expect(
    dialog.getByText(/Изменённые секции остаются в черновике/).first(),
  ).toBeVisible();
  await expect(
    dialog.getByLabel('Название секции', { exact: true }),
  ).toHaveValue('Ещё не сохранённое название');
  await expect(summary).toHaveValue('Несохранённый вывод редактора');
  await dialog
    .getByRole('button', { name: 'Сохранить секции', exact: true })
    .click();
  await expect(
    dialog.getByText('Секции гайда сохранены в D1.').first(),
  ).toBeVisible();
  expect(
    guide.sections.filter((section) => section.id === 'persisted-section-1'),
  ).toHaveLength(1);
  expect(
    guide.sections.find((section) => section.id === 'persisted-section-1')
      ?.title,
  ).toBe('Ещё не сохранённое название');
});

test('визуальная дуга: поиск, загрузка файла, сохранение и повторное открытие', async ({
  page,
  request,
}, testInfo) => {
  const { readFile } = await import('node:fs/promises');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const guides = (
    await (await request.get('http://127.0.0.1:8788/api/guides')).json()
  ).data as Guide[];
  const guide = guides.find((g) => g.characterId === 'akane')!;
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const character = characters.find(
    (row: { id: string }) => row.id === guide.characterId,
  );
  character.profile = {
    ...character.profile,
    abilities: [
      {
        id: 'native-test-skill',
        type: 'Навык',
        name: 'Проверочный навык из игры',
        iconUrl: '/nte-meta/game-assets/ad87d2a73478180243f0.webp',
        description: 'Описание',
        attributes: [],
      },
    ],
  };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'visual-owner',
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
  await page.route('**/api/guides', (route) =>
    route.fulfill({ json: { data: guides } }),
  );
  await page.route('**/api/equipment-import/lookup', (route) =>
    route.fulfill({
      json: {
        data: {
          sources: [
            {
              name: 'Проверенный источник',
              status: 'ok',
              items: [
                {
                  name: 'Проверочная дуга',
                  imageUrl: '',
                  description: 'Усиливает базовые атаки.',
                  stats: [{ label: 'Атака (ур. 80)', value: '570' }],
                  sourceUrl: 'https://example.com/arc',
                },
              ],
            },
          ],
        },
      },
    }),
  );
  let uploaded: { dataUrl: string; context: string } | undefined;
  const imageUrl = 'http://127.0.0.1:8788/api/media/uploads/' + 'a'.repeat(64);
  await page.route('**/api/media/uploads', (route) => {
    uploaded = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { data: { url: imageUrl } } });
  });
  await page.route('**/api/media/uploads/*', (route) =>
    route.fulfill({
      path: 'public/assets/characters/akane.webp',
      contentType: 'image/webp',
    }),
  );
  await page.route('**/api/guide-sections/*', (route) => {
    const id = route.request().url().split('/').at(-1);
    const section = guide.sections.find((s) => s.id === id);
    if (section) Object.assign(section, route.request().postDataJSON());
    return route.fulfill({ json: { data: { success: true } } });
  });
  await page.route(`**/api/guides/${guide.id}/sections`, (route) => {
    const body = route.request().postDataJSON();
    const id =
      body.visual?.kind === 'stats'
        ? 'visual-stats-persisted'
        : body.visual?.kind === 'skills'
          ? 'visual-skills-persisted'
          : 'visual-arc-persisted';
    guide.sections.push({
      ...body,
      id,
      position: guide.sections.length + 1,
    });
    return route.fulfill({
      status: 201,
      json: { data: { id } },
    });
  });
  await page.route(`**/api/guides/${guide.id}/sections/reorder`, (route) =>
    route.fulfill({ json: { data: { success: true } } }),
  );
  await page.goto(`/#/guides/${guide.slug}`);
  await page
    .getByRole('button', { name: 'Редактировать гайд', exact: true })
    .click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByText('Добавить визуальный раздел', { exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Лучшие дуги', exact: true })
    .click();
  await dialog
    .getByLabel('Название секции', { exact: true })
    .fill('Дуги для проверки');
  await dialog
    .getByRole('button', { name: 'Добавить элемент', exact: true })
    .click();
  const item = dialog.locator('.visual-item-editor').first();
  await item.locator('.equipment-lookup > summary').click();
  await item
    .getByLabel('Название экипировки', { exact: true })
    .fill('Test arc');
  await item
    .getByRole('button', { name: 'Найти в источниках', exact: true })
    .click();
  await item
    .getByRole('button', { name: 'Использовать данные', exact: true })
    .click();
  await expect(item.getByLabel('Название', { exact: true })).toHaveValue(
    'Проверочная дуга',
  );
  await item.locator('input[type=file]').setInputFiles({
    name: 'guide.webp',
    mimeType: 'image/webp',
    buffer: await readFile('public/assets/characters/akane.webp'),
  });
  await expect(item.getByLabel('Изображение', { exact: true })).toHaveValue(
    imageUrl,
  );
  expect(uploaded?.context).toMatch(/^guides\/akane-build-guide\//);
  expect(uploaded?.dataUrl).toMatch(/^data:image\/webp;base64,/);
  await dialog
    .getByRole('button', { name: 'Приоритет прокачки навыков', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Добавить элемент', exact: true })
    .click();
  const choice = dialog
    .getByRole('group', { name: 'Навыки для секции гайда' })
    .getByRole('button', { name: /Проверочный навык из игры/ });
  await choice.click();
  await dialog
    .getByRole('button', { name: 'Дублировать', exact: true })
    .click();
  const secondSkill = dialog.locator('.visual-item-editor').nth(1);
  await secondSkill.locator('summary').click();
  await secondSkill
    .getByLabel('Одинаковый приоритет с предыдущим навыком')
    .check();
  await expect(
    dialog.locator('.visual-section-preview [data-priority-relation="equal"]'),
  ).toHaveCount(1);
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.visual-section-preview')).toContainText(
    'Проверочный навык из игры',
  );
  await dialog
    .getByRole('button', { name: 'Основные статы', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Добавить элемент', exact: true })
    .click();
  const statItem = dialog.locator('.visual-item-editor').first();
  await statItem
    .getByLabel('Характеристика из игры')
    .selectOption('Бонус урона Лакшаны');
  await expect(
    statItem.getByLabel('Краткое описание', { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.locator('.visual-section-preview .guide-visual--stats p'),
  ).toHaveCount(0);
  await expect(
    dialog.locator('.visual-section-preview .guide-stat-icons img'),
  ).toHaveAttribute('src', /e7404c0c82eef53a2290\.webp$/);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Параметры', 'Секции', 'Отряды', 'Источники'])
      await expect(
        dialog
          .getByRole('navigation', { name: 'Разделы редактора гайда' })
          .getByRole('button', { name, exact: true }),
      ).toBeInViewport();
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      `editor at ${width}`,
    ).toBeTruthy();
    if (width === 360 || width === 1440) {
      await statItem.locator('summary').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`visual-editor-${width}.png`),
      });
    }
  }
  const a11y = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await dialog
    .getByRole('button', { name: 'Сохранить секции', exact: true })
    .click();
  await expect(
    dialog.getByText('Секции гайда сохранены в D1.', { exact: true }),
  ).toBeVisible();
  expect(
    guide.sections.find((s) => s.id === 'visual-arc-persisted')?.visual
      ?.items[0],
  ).toMatchObject({
    name: 'Проверочная дуга',
    imageUrl,
    stats: [{ label: 'Атака (ур. 80)', value: '570' }],
  });
  expect(
    guide.sections.find((s) => s.id === 'visual-skills-persisted')?.visual
      ?.items[0],
  ).toMatchObject({
    name: 'Проверочный навык из игры',
    imageUrl: '/nte-meta/game-assets/ad87d2a73478180243f0.webp',
  });
  expect(
    guide.sections.find((s) => s.id === 'visual-skills-persisted')?.visual
      ?.items[1].equalPriority,
  ).toBe(true);
  expect(
    guide.sections.find((s) => s.id === 'visual-stats-persisted')?.visual
      ?.items[0],
  ).toMatchObject({
    name: 'Бонус урона Лакшаны',
    description: '',
    imageUrl: '',
  });
  await dialog.getByRole('button', { name: 'Закрыть редактор' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Проверочная дуга', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('visual-guide-desktop.png'),
    fullPage: true,
  });
});
