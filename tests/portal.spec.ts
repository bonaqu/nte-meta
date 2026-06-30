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
      page.getByRole('heading', { name: 'Треды и обсуждения игроков' }),
    ).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('id', 'main-content');
    expect(consoleErrors).toEqual([]);
  });

  test('поиск персонажей ведёт в lore-профиль, а мета остаётся в гайдах', async ({
    page,
  }) => {
    await page.goto('/#/characters');
    await expect(
      page.getByRole('heading', { name: 'Персонажи Neverness to Everness' }),
    ).toBeVisible();

    await page.getByPlaceholder('Имя, роль, тег...').fill('Хотори');
    await expect(page.getByText(/Найдено: 1 из/)).toBeVisible();
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
      page.getByRole('heading', { name: 'Пробуждения C0-C6' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Гайд на персонажа' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Актёры озвучки', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Актёры озвучки не указаны')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Прокачка и симпатия' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Консоль и модули' }),
    ).toBeVisible();
    await expect(page.getByText('Консоль пока не выбрана')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Озвучка' })).toBeVisible();
    await expect(page.getByText('Аудио пока не загружено')).toBeVisible();
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
        'У каждого состава своя последовательность переключений персонажей и навыков.',
      ),
    ).toBeVisible();
    await expect(page.locator('a[href="#/teams"]')).toHaveCount(0);
    await expect(page.locator('a[href="#/rotations"]')).toHaveCount(0);

  await page.goto('/#/tierlists');
  await expect(
    page.getByRole('heading', { name: 'Тир-листы', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Единый редакционный список')).toBeVisible();
  await expect(page.getByText('S+', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Premium C6' })).toHaveCount(0);
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
