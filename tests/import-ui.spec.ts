import { expect, test, type Page, type Route } from '@playwright/test';

type ImportSuggestionFixture = {
  id: string;
  field: string;
  label: string;
  value: string;
};

function importResponse(message: string, suggestion?: ImportSuggestionFixture) {
  return {
    data: {
      found: Boolean(suggestion),
      message,
      sources: [
        {
          id: 'fixture-source',
          name: 'Тестовый источник',
          url: 'https://example.com/source',
          trust: 'high',
          status: suggestion ? 'ok' : 'partial',
          message,
        },
      ],
      suggestions: suggestion
        ? [
            {
              ...suggestion,
              sourceName: 'Тестовый источник',
              sourceUrl: 'https://example.com/source',
              confidence: 'high',
              note: 'Детерминированная UI-проверка.',
              qualityFlags: [],
            },
          ]
        : [],
      fields: {},
      coverage: {
        readyFields: suggestion ? [suggestion.label] : [],
        reviewFields: [],
        missingFields: suggestion ? [] : ['Нет данных'],
      },
      timing: {
        budgetMs: 45_000,
        elapsedMs: 25,
        deadlineReached: false,
      },
    },
  };
}

async function openAuthenticatedProfile(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'import-ui-owner',
          username: 'import-ui-owner',
          displayName: 'Import UI Owner',
          role: 'owner',
          status: 'active',
        },
      }),
    });
  });
  await page.route('**/api/auth/warnings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
  await page.route('**/api/sources', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
  await page.goto('/#/profile');
  await expect(
    page.getByRole('heading', { name: 'Профиль', level: 1 }),
  ).toBeVisible();
}

async function fulfillAfterDelay(
  route: Route,
  body: ReturnType<typeof importResponse>,
) {
  await new Promise((resolve) => setTimeout(resolve, 900));
  try {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  } catch {
    // A canceled browser fetch may close its intercepted route before fulfillment.
  }
}

test.describe('Cancelable import interactions', () => {
  test.describe.configure({ mode: 'serial' });

  test('персонаж: cancel сохраняет черновик и предложения, retry обрабатывает только свежий ответ', async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      const isExpectedNegativeResponse =
        message.type() === 'error' &&
        message.text().startsWith('Failed to load resource:') &&
        message.location().url.includes('/api/character-import/lookup');
      if (message.type() === 'error' && !isExpectedNegativeResponse) {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    let call = 0;
    await page.route('**/api/character-import/lookup', async (route) => {
      call += 1;
      if (call === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            importResponse('Найдена исходная биография.', {
              id: 'character-original',
              field: 'profile.biography',
              label: 'Исходная биография',
              value: 'Проверенная исходная биография.',
            }),
          ),
        });
        return;
      }
      if (call === 2) {
        await fulfillAfterDelay(
          route,
          importResponse('Этот отменённый ответ нельзя применять.', {
            id: 'character-canceled',
            field: 'profile.biography',
            label: 'ОТМЕНЕННЫЙ ОТВЕТ',
            value: 'Эта строка не должна появиться.',
          }),
        );
        return;
      }
      if (call === 3) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            importResponse('Повторный поиск завершён.', {
              id: 'character-retry',
              field: 'profile.biography',
              label: 'Свежая биография',
              value: 'Новый ответ после повтора.',
            }),
          ),
        });
        return;
      }
      if (call === 4) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            importResponse(
              'Данные не найдены. Измените имя и повторите поиск.',
            ),
          ),
        });
        return;
      }
      if (call === 5) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Запрос слишком длинный. Сократите имя персонажа.',
          }),
        });
        return;
      }
      const timeout = call === 7;
      await route.fulfill({
        status: timeout ? 504 : 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: timeout
            ? 'Сервер слишком долго отвечает. Повторите поиск.'
            : 'Источники временно недоступны. Повторите поиск.',
        }),
      });
    });

    await openAuthenticatedProfile(page);
    await page.goto('/#/characters');
    await page.getByRole('button', { name: 'Добавить персонажа' }).click();
    const dialog = page.locator('dialog[open]').filter({
      has: page.getByRole('heading', { name: 'Добавить персонажа', level: 1 }),
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Имя на русском').fill('Хотори');
    const draftText = dialog.getByLabel(/^Подпись под именем/);
    await draftText.fill('Несохранённый текст должен пережить отмену.');

    const importButton = dialog.getByRole('button', {
      name: 'Найти базовую информацию',
    });
    const saveDraftButton = dialog.getByRole('button', {
      name: 'Сохранить черновик',
    });
    const importStatus = dialog.locator('#character-import-status');

    await importButton.focus();
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByText('Проверенная исходная биография.', { exact: true }),
    ).toBeVisible();
    await expect(importButton).toBeFocused();

    await importButton.focus();
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByRole('button', { name: 'Ищем базовую информацию…' }),
    ).toBeDisabled();
    await expect(importStatus).toHaveAttribute('aria-busy', 'true');
    await expect(importStatus).toContainText('Поиск можно отменить');
    await expect(saveDraftButton).toBeEnabled();
    await expect(
      dialog.getByText('Проверенная исходная биография.', { exact: true }),
    ).toBeVisible();
    const cancelButton = dialog.getByRole('button', {
      name: 'Отменить поиск',
    });
    await cancelButton.focus();
    await page.keyboard.press('Enter');
    await expect(importButton).toBeFocused();
    await expect(importStatus).toContainText('Поиск отменён');
    await expect(draftText).toHaveValue(
      'Несохранённый текст должен пережить отмену.',
    );
    await expect(
      dialog.getByText('Проверенная исходная биография.', { exact: true }),
    ).toBeVisible();

    await importButton.focus();
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByText('Новый ответ после повтора.', { exact: true }),
    ).toBeVisible();
    await expect(importButton).toBeFocused();
    await page.waitForTimeout(1_000);
    await expect(dialog.getByText('ОТМЕНЕННЫЙ ОТВЕТ')).toHaveCount(0);

    const screenshotPath = testInfo.outputPath('character-import-review.png');
    await dialog.screenshot({ path: screenshotPath });
    await testInfo.attach('character-import-review', {
      path: screenshotPath,
      contentType: 'image/png',
    });
    process.stdout.write(`[import-ui-screenshot] ${screenshotPath}\n`);

    await importButton.focus();
    await page.keyboard.press('Enter');
    await expect(importStatus).toContainText('Данные не найдены');
    await expect(importButton).toBeFocused();

    const characterName = dialog.getByLabel('Имя на русском');
    await characterName.fill('');
    await expect(characterName).toHaveValue('');
    await page.waitForTimeout(0);
    await importButton.click();
    await expect(importStatus).toContainText(
      'Укажите имя персонажа перед поиском базовой информации',
    );
    expect(call).toBe(4);

    await characterName.fill('Ж'.repeat(121));
    await importButton.click();
    await expect(importStatus).toContainText('Запрос слишком длинный');
    await expect(draftText).toHaveValue(
      'Несохранённый текст должен пережить отмену.',
    );
    await expect(importButton).toBeFocused();

    await characterName.fill('Хотори <>&"?');
    await importButton.click();
    await expect(importStatus).toContainText('Источники временно недоступны');
    await expect(draftText).toHaveValue(
      'Несохранённый текст должен пережить отмену.',
    );
    await expect(importButton).toBeFocused();

    await characterName.fill('Хотори');
    await importButton.click();
    await expect(importStatus).toContainText('Сервер слишком долго отвечает');
    await expect(draftText).toHaveValue(
      'Несохранённый текст должен пережить отмену.',
    );
    await expect(importButton).toBeFocused();
    await expect(importButton).toBeEnabled();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('гайд: pending не блокирует сохранение, cancel и retry сохраняют редактор', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      const isExpectedNegativeResponse =
        message.type() === 'error' &&
        message.text().startsWith('Failed to load resource:') &&
        message.location().url.includes('/api/guide-import/lookup');
      if (message.type() === 'error' && !isExpectedNegativeResponse) {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    let call = 0;
    await page.route('**/api/guide-import/lookup', async (route) => {
      call += 1;
      const suggestion = {
        id: `guide-${call}`,
        field: 'guide.summary',
        label: call === 3 ? 'Свежий вывод гайда' : 'Исходный вывод гайда',
        value:
          call === 3
            ? 'Свежий вывод после повтора.'
            : 'Исходный проверенный вывод.',
      };
      if (call === 2) {
        await fulfillAfterDelay(
          route,
          importResponse('Отменённый guide-ответ.', {
            ...suggestion,
            label: 'ОТМЕНЕННЫЙ GUIDE-ОТВЕТ',
          }),
        );
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          importResponse('Источники гайда найдены.', suggestion),
        ),
      });
    });

    await openAuthenticatedProfile(page);
    await page.goto('/#/guides/hotori-burst-guide');
    await page.getByRole('button', { name: 'Редактировать гайд' }).click();
    const dialog = page.locator('dialog[open]').filter({
      has: page.getByRole('heading', {
        name: 'Редактировать гайд: Хотори',
        level: 1,
      }),
    });
    await expect(dialog).toBeVisible();
    const summary = dialog.locator('.guide-admin-meta textarea').first();
    await summary.fill('Несохранённый вывод гайда сохраняется при отмене.');
    const importButton = dialog.getByRole('button', {
      name: 'Найти источники гайда',
    });
    const saveButton = dialog.getByRole('button', {
      name: 'Сохранить параметры гайда',
    });
    const importStatus = dialog.locator('#guide-import-status');

    await importButton.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByText('Исходный проверенный вывод.')).toBeVisible();
    await expect(importButton).toBeFocused();

    await importButton.focus();
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByRole('button', { name: 'Ищем источники гайда…' }),
    ).toBeDisabled();
    await expect(importStatus).toHaveAttribute('aria-busy', 'true');
    await expect(saveButton).toBeEnabled();
    const cancelButton = dialog.getByRole('button', {
      name: 'Отменить поиск',
    });
    await cancelButton.focus();
    await page.keyboard.press('Enter');
    await expect(importStatus).toContainText('Поиск отменён');
    await expect(importButton).toBeFocused();
    await expect(summary).toHaveValue(
      'Несохранённый вывод гайда сохраняется при отмене.',
    );
    await expect(dialog.getByText('Исходный проверенный вывод.')).toBeVisible();

    await importButton.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByText('Свежий вывод после повтора.')).toBeVisible();
    await expect(importButton).toBeFocused();
    await page.waitForTimeout(1_000);
    await expect(dialog.getByText('ОТМЕНЕННЫЙ GUIDE-ОТВЕТ')).toHaveCount(0);
    await expect(importButton).toBeEnabled();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
