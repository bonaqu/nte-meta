import { expect, test } from '@playwright/test';

test('публичный запрос и его повтор не отправляют токен уже вошедшего пользователя', async ({
  page,
}) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      json: {
        data: {
          token: 'test-private-token',
          user: { id: 'test', role: 'admin' },
        },
      },
    }),
  );
  await page.goto('/#/characters/adler');
  await expect(page.locator('.character-dossier h1')).toHaveAccessibleName(
    'Адлер',
  );
  const headers: Record<string, string>[] = [];
  await page.route('**/api/news', async (route) => {
    headers.push(await route.request().allHeaders());
    await route.fulfill(
      headers.length === 1
        ? { status: 503, json: { error: 'temporary' } }
        : { json: { data: [] } },
    );
  });
  await page.evaluate(async () => {
    const api = await import('/src/lib/api.ts');
    await api.login('test', 'test');
    await api.loadPublicCollection('news');
  });
  expect(headers).toHaveLength(2);
  for (const request of headers) {
    expect(request.authorization).toBeUndefined();
    expect(request.cookie).toBeUndefined();
  }
});

test('профиль появляется, пока авторизация и новости ещё ожидают ответа', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/me', async (route) => {
    await pending;
    await route.fulfill({ json: { data: null } });
  });
  await page.route('**/api/news', async (route) => {
    await pending;
    await route.fulfill({ json: { data: [] } });
  });
  try {
    await page.goto('/#/characters/adler');
    await expect(page.locator('.character-dossier h1')).toHaveAccessibleName(
      'Адлер',
    );
  } finally {
    release();
  }
});

test('публичная копия переживает перезагрузку и отказ сервера, без авторизационных cookies', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'snapshot-test-session',
      value: 'private',
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  const headers: Record<string, string>[] = [];
  await page.route('**/api/characters', async (route) => {
    headers.push(await route.request().allHeaders());
    await route.continue();
  });
  await page.goto('/#/characters/adler');
  await expect(page.locator('.character-dossier h1')).toHaveAccessibleName(
    'Адлер',
  );
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('nte-public-snapshot-v1', 1);
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('collections')) {
                db.close();
                resolve(false);
                return;
              }
              const req = db
                .transaction('collections')
                .objectStore('collections')
                .getAll();
              req.onsuccess = () => {
                db.close();
                resolve(
                  req.result.some((row) =>
                    row.data?.some(
                      (item: { id: string }) => item.id === 'adler',
                    ),
                  ),
                );
              };
            };
          }),
      ),
    )
    .toBe(true);
  expect(headers[0].cookie).toBeUndefined();
  expect(headers[0].authorization).toBeUndefined();
  await page.route('**/api/**', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.character-dossier h1')).toHaveAccessibleName(
    'Адлер',
  );
  await expect(
    page.getByText('Не удалось обновить часть данных.', { exact: false }),
  ).toBeVisible();
});

test('редакционные черновики видны редактору, но не попадают в публичную копию', async ({
  page,
  request,
}) => {
  const original = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  let signedIn = true;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: signedIn
          ? { id: 'snapshot-editor', username: 'Editor', role: 'admin' }
          : null,
      },
    }),
  );
  await page.route('**/api/characters', async (route) => {
    const headers = await route.request().allHeaders();
    const rows = structuredClone(original);
    if (headers.cookie)
      rows.push({
        ...rows[0],
        id: 'private-draft',
        slug: 'private-draft',
        name: 'Секретный черновик',
        status: 'draft',
      });
    await route.fulfill({ json: { data: rows } });
  });
  await page.context().addCookies([
    {
      name: 'snapshot-test-session',
      value: 'private',
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  await page.goto('/#/characters');
  await expect(
    page.getByRole('button', { name: 'Добавить персонажа' }),
  ).toBeVisible();
  const snapshots = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve) => {
        const open = indexedDB.open('nte-public-snapshot-v1', 1);
        open.onsuccess = () => {
          const db = open.result;
          const req = db
            .transaction('collections')
            .objectStore('collections')
            .getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
        };
      }),
  );
  expect(JSON.stringify(snapshots)).not.toContain('private-draft');
  expect(JSON.stringify(snapshots)).not.toContain('snapshot-editor');
  await page.route('**/api/auth/logout', (route) => {
    signedIn = false;
    return route.fulfill({ json: { data: { success: true } } });
  });
  await page.route('**/api/characters', (route) => route.abort());
  await page.evaluate(() => {
    location.hash = '#/profile';
  });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Выйти', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = '#/characters/private-draft';
  });
  await expect(
    page.getByRole('heading', { name: 'Секретный черновик', exact: true }),
  ).toHaveCount(0);
});
