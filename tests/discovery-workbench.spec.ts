import { expect, test } from '@playwright/test';
test('автоперевод найденного, переход в черновик и повторное открытие сохраняют редакционный путь', async ({
  page,
  request,
}) => {
  const live = process.env.NTE_TRANSLATION_LIVE === '1';
  const leaks = (
    await (await request.get('http://127.0.0.1:8788/api/leaks')).json()
  ).data;
  const draft = {
    ...leaks[0],
    id: 'workbench-draft',
    slug: 'workbench-draft',
    title: 'Редактируемый черновик',
    publishStatus: 'draft',
    status: 'слух',
    approved: false,
  };
  let created = false;
  let listLoads = 0;
  let published: Record<string, unknown> | undefined;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'owner',
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
  await page.route('**/api/leaks', (route) => {
    listLoads++;
    return route.fulfill({
      json: { data: created ? [...leaks, draft] : leaks },
    });
  });
  await page.route('**/api/leaks/workbench-draft', (route) => {
    published = route.request().postDataJSON();
    return route.fulfill({
      json: { data: { id: draft.id, slug: draft.slug } },
    });
  });
  const candidate = {
    id: 'workbench-candidate',
    origin: 'discovery',
    sourceName: 'Community',
    sourceUrl: 'https://example.com/nte',
    sourceType: 'telegram',
    language: 'ja',
    title: '未来のNTEキャラクター',
    excerpt: 'Unconfirmed information',
    contentKind: 'leak',
    trustLevel: 'низкий',
    suggestedStatus: 'слух',
    confidenceScore: 30,
    reviewStatus: 'pending',
    translationStatus: 'нужен перевод',
    evidence: [],
    createdAt: new Date().toISOString(),
  };
  await page.route('**/api/leak-candidates', (route) =>
    route.fulfill({ json: { data: [candidate] } }),
  );
  await page.route('**/api/leak-candidates/discover', (route) =>
    route.fulfill({
      json: {
        data: { discoveredCount: 1, candidates: [candidate], sources: [] },
      },
    }),
  );
  let translations = 0;
  await page.route(
    '**/api/leak-candidates/workbench-candidate/translate',
    (route) => {
      translations++;
      expect(route.request().postDataJSON()).toEqual({ mode: 'browser' });
      return route.fulfill({
        json: {
          data: {
            kind: 'browser-translation',
            sourceLanguage: live ? 'en' : 'ja',
            title: live
              ? '__NTE_TERM_0__ receives a gift.'
              : '未来の__NTE_TERM_0__キャラクター',
            excerpt: 'Unconfirmed information',
            terms: [
              {
                token: '__NTE_TERM_0__',
                from: live ? 'Hathor' : 'NTE',
                to: live ? 'Хатор' : 'NTE',
              },
            ],
            names: [],
          },
        },
      });
    },
  );
  let browserTranslations = 0;
  page.on('request', (request) => {
    if (
      request
        .url()
        .startsWith('https://translate.googleapis.com/translate_a/single')
    )
      browserTranslations++;
  });
  if (!live)
    await page.route(
      'https://translate.googleapis.com/translate_a/single',
      (route) => {
        expect(route.request().headers().authorization).toBeUndefined();
        const q = new URLSearchParams(route.request().postData() || '').get(
          'q',
        )!;
        return route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          json: [
            [
              [
                q.includes('__NTE_TERM_0__')
                  ? 'Будущий персонаж __NTE_TERM_0__'
                  : 'Неподтверждённая информация',
              ],
            ],
          ],
        });
      },
    );
  await page.route('**/api/leak-candidates/workbench-candidate', (route) =>
    route.fulfill({ json: { data: { success: true } } }),
  );
  await page.route(
    '**/api/leak-candidates/workbench-candidate/promote',
    (route) => {
      created = true;
      return route.fulfill({ json: { data: { leakId: draft.id } } });
    },
  );
  await page.goto('/#/');
  await page
    .getByRole('button', { name: 'Добавить слив', exact: true })
    .click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Автоперевод после поиска', { exact: true }).check();
  await dialog
    .getByRole('button', { name: 'Найти новые публикации', exact: true })
    .click();
  const row = dialog.locator('.leak-candidate');
  await expect(
    row.getByRole('heading', {
      name: live ? /Хатор.*подар/ : 'Будущий персонаж NTE',
      exact: !live,
    }),
  ).toBeVisible();
  expect(translations).toBe(1);
  expect(browserTranslations).toBe(2);
  await row.getByRole('button', { name: 'В черновик', exact: true }).click();
  await expect(
    dialog.getByLabel('Редактируемый заголовок', { exact: true }),
  ).toHaveValue(draft.title);
  await dialog
    .locator('[aria-label="Фильтр очереди"]')
    .getByRole('button', { name: 'Все', exact: true })
    .click();
  const loadsBeforeReopen = listLoads;
  await row
    .getByRole('button', { name: 'Открыть черновик', exact: true })
    .click();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(
    listLoads,
    'Уже открытый черновик не требует повторной загрузки списка',
  ).toBe(loadsBeforeReopen);
  await expect(
    dialog.getByLabel('Редактируемый заголовок', { exact: true }),
  ).toHaveValue(draft.title);
  await expect(
    dialog.getByRole('checkbox', { name: /^Одобрено для публичной выдачи/ }),
  ).not.toBeChecked();
  await dialog
    .getByRole('checkbox', { name: /^Одобрено для публичной выдачи/ })
    .check();
  await expect(
    dialog.getByRole('button', {
      name: 'Сохранить и опубликовать',
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole('button', { name: 'Сохранить и опубликовать', exact: true })
    .click();
  await expect.poll(() => published?.approved).toBe(true);
});
