import { expect, test } from '@playwright/test';

test.describe('Публичный портал NTE Meta', () => {
  test('главная показывает живой meta-dashboard без ошибок', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
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
      page.getByRole('heading', { name: 'Последние обсуждения игроков' }),
    ).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('id', 'main-content');
    expect(consoleErrors).toEqual([]);
  });

  test('поиск и фильтры персонажей ведут в подробный гайд', async ({
    page,
  }) => {
    await page.goto('/#/characters');
    await expect(
      page.getByRole('heading', { name: 'Персонажи Neverness to Everness' }),
    ).toBeVisible();

    await page.getByPlaceholder('Имя, роль, тег...').fill('Хотори');
    await expect(page.getByText(/Найдено: 1 из/)).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Открыть гайд Хотори' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Открыть гайд Хотори' }).click();
    await expect(
      page.getByRole('heading', { name: 'Хотори', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Базовая, оптимальная/ }),
    ).toBeVisible();
    await expect(page.getByText('Комментарии и обсуждения')).toBeVisible();
  });

  test('новости и сливы разделены и имеют отдельные detail-страницы', async ({
    page,
  }) => {
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

  test('команды, ротации и тир-листы работают как связанные инструменты', async ({
    page,
  }) => {
    await page.goto('/#/teams');
    await expect(
      page.getByRole('heading', { name: 'Команды NTE Meta' }),
    ).toBeVisible();
    await page.getByLabel('Бюджет').selectOption('F2P');
    await expect(
      page.getByRole('heading', { name: 'Starter Core' }),
    ).toBeVisible();
    await page
      .getByRole('article')
      .filter({ hasText: 'Starter Core' })
      .getByRole('link', { name: /Разобрать команду/ })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Starter Core' }),
    ).toBeVisible();
    await expect(page.getByText('Рекомендуемая ротация')).toBeVisible();

    await page.goto('/#/rotations');
    await expect(page.getByRole('heading', { name: 'Ротации' })).toBeVisible();
    await page.getByLabel('Персонаж').selectOption('hotori');
    await expect(
      page.getByRole('heading', { name: 'Простая ротация Хотори' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Boss rotation' }),
    ).toBeVisible();

    await page.goto('/#/tierlists');
    await expect(page.getByText('Base C0 тир-лист')).toBeVisible();
    await page.getByRole('button', { name: 'Premium C6' }).click();
    await expect(page.getByText('Premium C6 тир-лист')).toBeVisible();
  });

  test('комьюнити и авторизация имеют понятные пустые и гостевые состояния', async ({
    page,
  }) => {
    await page.goto('/#/community');
    await expect(
      page.getByRole('heading', { name: 'Комьюнити-хаб' }),
    ).toBeVisible();
    await expect(
      page.getByText(/комментирование, оценки и профиль/i),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Войти или зарегистрироваться' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Вход в NTE Meta' }),
    ).toBeVisible();
    await expect(page.getByLabel('Логин')).toBeVisible();
    await expect(page.getByLabel('Пароль')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
  });

  test('видео-раздел показывает явный редакционный плейсхолдер', async ({
    page,
  }) => {
    await page.goto('/#/videos');
    await expect(
      page.getByRole('heading', { name: 'Видео-гайды', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Видео-гайды готовятся' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Открыть текстовые гайды' }),
    ).toBeVisible();
    await expect(
      page.getByTitle('Редакционный плейсхолдер NTE Meta'),
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
