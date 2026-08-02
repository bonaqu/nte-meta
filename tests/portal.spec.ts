import { expect, test } from '@playwright/test';

test.describe('Публичный портал NTE Meta', () => {
  test('главная показывает живой meta-dashboard без ошибок', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'NTE Meta' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Последние гайды' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Свежие новости' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Текущий тир-лист' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Треды и обсуждения игроков' }),
    ).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('id', 'main-content');
    expect(
      consoleErrors,
      `HTTP failures: ${failedResponses.join(', ')}`,
    ).toEqual([]);
  });

  test('персонажи не показывают устаревшие seed-карточки до ответа API', async ({
    page,
  }) => {
    let releaseCharacters: () => void = () => undefined;
    const charactersGate = new Promise<void>((resolve) => {
      releaseCharacters = resolve;
    });

    await page.route('**/api/characters', async (route) => {
      await charactersGate;
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: [
            {
              id: 'actual-character-a',
              slug: 'actual-character-a',
              name: 'Актуальная карточка А',
              originalName: 'Actual A',
              rarity: 'S',
              role: 'Основной ДД',
              type: 'Урон',
              attribute: 'Атрибут тест',
              imageUrl: '/assets/characters/Hotori.webp',
              splashUrl: '/assets/characters/Hotori.webp',
              shortDescription: 'Карточка пришла из API, а не из seedData.',
              summary: 'Тестовая карточка для проверки первого рендера.',
              tags: ['api'],
              updatedAt: '2026-06-30',
            },
          ],
        },
      });
    });

    await page.goto('/#/characters', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: /Синхронизируем данные персонажей/ }),
    ).toBeVisible();
    await expect(page.getByText('Хотори')).toHaveCount(0);
    await expect(page.getByText('Лакримоза')).toHaveCount(0);

    releaseCharacters();

    await expect(
      page.getByRole('heading', { name: 'Персонажи Neverness to Everness' }),
    ).toBeVisible();
    await expect(page.getByText('Актуальная карточка А')).toBeVisible();
  });

  test('сбой API завершает синхронизацию и показывает видимую ошибку', async ({
    page,
  }) => {
    let characterRequests = 0;
    await page.route('**/api/characters', async (route) => {
      characterRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (characterRequests > 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { data: [] },
        });
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        json: { error: 'Тестовая недоступность каталога' },
      });
    });

    await page.goto('/#/characters', { waitUntil: 'domcontentloaded' });
    const loadingHeading = page.getByRole('heading', {
      name: /Синхронизируем данные персонажей/,
    });
    await expect(loadingHeading).toBeVisible();
    await expect(page.getByText('Хотори')).toHaveCount(0);
    await expect(page.getByText('Лакримоза')).toHaveCount(0);

    await expect(loadingHeading).toHaveCount(0);
    await expect(
      page.getByText(
        'Не удалось загрузить данные портала. Тестовая недоступность каталога. Повторите загрузку.',
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Повторить загрузку' }).click();
    await expect(
      page.getByRole('heading', { name: 'Персонажи Neverness to Everness' }),
    ).toBeVisible();
    await expect(page.getByText('Персонажи не найдены')).toBeVisible();
    expect(characterRequests).toBe(2);
  });

  test('поиск персонажей ведёт в lore-профиль, а мета остаётся в гайдах', async ({
    page,
  }) => {
    await page.goto('/#/characters');
    await expect(
      page.getByRole('heading', { name: 'Персонажи Neverness to Everness' }),
    ).toBeVisible();

    const resultsSummary = page.locator('#character-results-count');
    const initialSummary = await resultsSummary.textContent();
    const totalCharacters = Number(initialSummary?.match(/из\s+(\d+)/)?.[1]);
    expect(totalCharacters).toBeGreaterThan(0);

    await page.getByPlaceholder('Имя, атрибут, тег...').fill('Хотори');
    await expect(resultsSummary).toHaveText(
      new RegExp(`Найдено: [1-9]\\d* из ${totalCharacters}`),
    );
    await expect(
      page.getByRole('link', { name: 'Открыть страницу персонажа Хотори' }),
    ).toBeVisible();

    await page
      .getByRole('link', { name: 'Открыть страницу персонажа Хотори' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Хотори', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Биография' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Пробуждения 0-6' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Гайд на персонажа' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Актёры озвучки', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Актёры озвучки' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Прокачка и симпатия' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Озвучка' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Реплики персонажа' }),
    ).toBeVisible();
    await expect(page.locator('.guide-section-card')).toHaveCount(0);
    await expect(page.getByText('Комментарии и обсуждения')).toBeVisible();
  });

  test('новости и сливы разделены и имеют отдельные detail-страницы', async ({
    page,
  }) => {
    await page.goto('/#/news');
    await expect(page.getByRole('heading', { name: 'NTE Meta' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Свежие новости' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('link', { name: 'Новости', exact: true }),
    ).toHaveCount(0);

    await page.goto('/#/leaks');
    await expect(page.getByRole('heading', { name: 'NTE Meta' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Сливы / слухи' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('link', { name: 'Сливы', exact: true }),
    ).toHaveCount(0);

    await page.goto('/#/news/patch-10-first-meta-notes');
    await expect(
      page.getByRole('heading', { name: 'Патч 1.0: первые заметки по мете' }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/Патч 1\.0: первые заметки по мете/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/news\/patch-10-first-meta-notes\/$/,
    );

    await page.goto('/#/leaks/new-arc-rumor');
    await expect(
      page.getByRole('heading', { name: 'Слух: новая Дуга для burst-команд' }),
    ).toBeVisible();
    await expect(
      page.getByText('Информация не подтверждена и может измениться'),
    ).toBeVisible();
    await expect(page.getByText(/доверие: средний/i)).toBeVisible();
  });

  test('отряды и ротации находятся внутри гайда, тир-лист единый', async ({
    page,
  }) => {
    await page.goto('/#/teams');
    await expect(
      page.getByRole('heading', { name: 'Гайды NTE Meta', exact: true }),
    ).toBeVisible();

    await page.goto('/#/rotations');
    await expect(
      page.getByRole('heading', { name: 'Гайды NTE Meta', exact: true }),
    ).toBeVisible();

    await page.goto('/#/guides/hotori-burst-guide');
    await expect(
      page.getByRole('heading', {
        name: 'Лучшие отряды и ротации для Хотори',
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Состав, роли и последовательность действий собраны в одном месте.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Командная ротация', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('a[href="#/teams"]')).toHaveCount(0);
    await expect(page.locator('a[href="#/rotations"]')).toHaveCount(0);

    await page.goto('/#/tierlists');
    await expect(
      page.getByRole('heading', { name: 'Тир-листы', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Единый редакционный список')).toBeVisible();
    await expect(page.getByText('S+', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Premium C6' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Base C0' })).toHaveCount(0);
  });

  test('авторизация отделена от CMS, отдельного пустого комьюнити-раздела нет', async ({
    page,
  }) => {
    await page.goto('/#/profile');
    await expect(
      page.getByRole('heading', { name: 'Вход в NTE Meta' }),
    ).toBeVisible();
    await expect(page.getByLabel('Логин')).toBeVisible();
    await expect(page.getByLabel('Пароль')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    await expect(
      page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('link', { name: 'Комьюнити-хаб' }),
    ).toHaveCount(0);
  });

  test('Главная открывается из prerender-профиля и не остаётся профилем', async ({
    page,
  }) => {
    await page.goto('/profile/');
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Главная', exact: true })
      .click();
    await expect(page).toHaveURL(/\/profile\/#\/$/);
    await expect(
      page.getByRole('heading', { name: 'NTE Meta', exact: true }),
    ).toBeVisible();
  });
  test('видео-route мягко ведёт к гайдам без отдельного публичного раздела', async ({
    page,
  }) => {
    await page.goto('/#/videos');
    await expect(
      page.getByRole('heading', { name: 'Гайды NTE Meta', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('link', { name: 'Видео-гайды', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        'Только персонажные гайды. Билды, лучшие отряды и пошаговые командные ротации собраны внутри каждого материала.',
      ),
    ).toBeVisible();
  });
  test('мобильное меню доступно с клавиатуры и layout не уезжает', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const menu = page.locator('[aria-controls="primary-navigation"]');
    await expect(menu).toBeVisible();
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('navigation', { name: 'Основная навигация' }),
    ).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
