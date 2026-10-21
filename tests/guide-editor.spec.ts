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
