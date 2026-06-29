import {
  expect,
  request as createRequestContext,
  test,
  type APIRequestContext,
} from '@playwright/test';

const apiBase = 'http://127.0.0.1:8788';
const runId = `${Date.now()}-${Math.round(Math.random() * 10000)}`;
const ownerUsername = `owner_${runId}`;
const ownerPassword = 'Playwright-Strong-42!';

let owner: APIRequestContext;
let guest: APIRequestContext;
let communityCommentId = '';
let ownerId = '';

test.describe('NTE Meta Worker API', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    owner = await createRequestContext.newContext({ baseURL: apiBase });
    guest = await createRequestContext.newContext({ baseURL: apiBase });

    const register = await owner.post('/api/auth/register', {
      data: {
        username: ownerUsername,
        password: ownerPassword,
        confirmPassword: ownerPassword,
        bootstrapToken: 'playwright-only-bootstrap-token',
      },
    });
    expect(register.status()).toBe(201);
    const registeredOwner = await register.json();
    ownerId = registeredOwner.data.user.id;
    expect(registeredOwner).toMatchObject({
      data: { user: { role: 'owner' } },
    });
  });

  test.afterAll(async () => {
    await Promise.all([owner.dispose(), guest.dispose()]);
  });

  test('публичные коллекции доступны с безопасными заголовками', async () => {
    const authConfig = await guest.get('/api/auth/config');
    expect(authConfig.ok()).toBeTruthy();
    await expect(authConfig.json()).resolves.toMatchObject({
      data: { registrationEnabled: true, needsBootstrap: false },
    });

    for (const collection of [
      'characters',
      'guides',
      'rotations',
      'teams',
      'tierlists',
      'news',
      'leaks',
      'threads',
    ]) {
    const response = await guest.get(`/api/${collection}`);
    expect(response.ok(), collection).toBeTruthy();
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['cache-control']).toContain('public');
    const payload = await response.json();
    expect(Array.isArray(payload.data)).toBeTruthy();
    if (collection === 'characters' || collection === 'guides') {
      expect(payload.data.length, collection).toBeGreaterThan(0);
    }
  }

    const rejectedOrigin = await guest.post('/api/auth/login', {
      headers: { Origin: 'https://attacker.example' },
      data: { username: 'nobody', password: 'invalid-password' },
    });
    expect(rejectedOrigin.status()).toBe(403);

    const wrongContentType = await guest.post('/api/auth/login', {
      headers: { 'Content-Type': 'text/plain' },
      data: 'not-json',
    });
    expect(wrongContentType.status()).toBe(415);
  });

  test('профиль, комьюнити, ответы и реакции работают через D1', async () => {
    const profile = await owner.patch('/api/auth/profile', {
      data: { displayName: 'Playwright Owner' },
    });
    expect(profile.ok()).toBeTruthy();

    const comment = await owner.post('/api/comments', {
      data: {
        targetType: 'site',
        targetId: 'community',
        body: `Проверка комьюнити ${runId}`,
      },
    });
    expect(comment.status()).toBe(201);
    communityCommentId = (await comment.json()).data.id;

    const reply = await owner.post('/api/comments', {
      data: {
        targetType: 'site',
        targetId: 'community',
        parentId: communityCommentId,
        body: `Ответ в обсуждении ${runId}`,
      },
    });
    expect(reply.status()).toBe(201);
    await expect(reply.json()).resolves.toMatchObject({
      data: { parentId: communityCommentId },
    });

    const orphan = await owner.post('/api/comments', {
      data: {
        targetType: 'guide',
        targetId: 'missing-guide',
        body: 'Этот комментарий не должен сохраниться',
      },
    });
    expect(orphan.status()).toBe(404);

    const edited = await owner.patch(`/api/comments/${communityCommentId}`, {
      data: { body: `Обновлённое обсуждение ${runId}` },
    });
    expect(edited.ok()).toBeTruthy();

    const useful = await owner.post('/api/reactions', {
      data: {
        targetType: 'comment',
        targetId: communityCommentId,
        reactionType: 'useful',
      },
    });
    expect(useful.ok()).toBeTruthy();
    await expect(useful.json()).resolves.toMatchObject({
      data: { useful: 1 },
    });

    const idempotentUseful = await owner.post('/api/reactions', {
      data: {
        targetType: 'comment',
        targetId: communityCommentId,
        reactionType: 'useful',
      },
    });
    await expect(idempotentUseful.json()).resolves.toMatchObject({
      data: { useful: 1 },
    });

    const removeUseful = await owner.delete(
      `/api/reactions?targetType=comment&targetId=${communityCommentId}&reactionType=useful`,
    );
    expect(removeUseful.ok()).toBeTruthy();
    const summary = await guest.get(
      `/api/reactions?targetType=comment&targetId=${communityCommentId}`,
    );
    await expect(summary.json()).resolves.toMatchObject({
      data: { useful: 0 },
    });

    const comments = await guest.get(
      '/api/comments?targetType=site&targetId=community&sort=popular',
    );
    expect(comments.ok()).toBeTruthy();
    expect(
      (await comments.json()).data.some(
        (item: { id: string }) => item.id === communityCommentId,
      ),
    ).toBeTruthy();
  });

  test('все редакционные сущности проходят CRUD и связи', async () => {
    const characterSlug = `test-character-${runId}`;
    const characterPayload = {
      slug: characterSlug,
      name: 'Тестовый персонаж',
      originalName: 'Test Character',
      rarity: 'S',
      role: 'Главный DPS',
      type: 'DPS',
      attribute: 'Электро',
    tier: 'D',
    premiumTier: 'D',
      tierRank: 20,
      imageUrl: '/assets/characters/hotori.webp',
      shortDescription: 'Персонаж для API-регрессии.',
      summary: 'Проверяет создание, публикацию и удаление записи.',
      tagsJson: ['тест'],
      status: 'draft',
      patchVersion: 'test',
    };
    const character = await owner.post('/api/characters', {
      data: characterPayload,
    });
    expect(character.status()).toBe(201);
    const characterId = (await character.json()).data.id;
    expect((await guest.get(`/api/characters/${characterSlug}`)).status()).toBe(
      404,
    );
    expect((await owner.get(`/api/characters/${characterSlug}`)).ok()).toBe(
      true,
    );
    expect(
      (
        await owner.patch(`/api/characters/${characterId}`, {
          data: { status: 'published' },
        })
      ).ok(),
    ).toBeTruthy();
    expect((await guest.get(`/api/characters/${characterSlug}`)).ok()).toBe(
      true,
    );

    const guide = await owner.post('/api/guides', {
      data: {
        slug: `test-guide-${runId}`,
        characterId,
        title: 'Глубокий тестовый гайд',
        summary: 'Проверка гибких разделов и их порядка.',
        status: 'published',
        patchVersion: 'test',
        sections: [
          { title: 'Обзор', type: 'overview', content: 'Первый раздел.' },
          { title: 'Ротация', type: 'rotation', content: 'Второй раздел.' },
        ],
      },
    });
    expect(guide.status()).toBe(201);
    const guideId = (await guide.json()).data.id;
    const savedGuide = await owner.get(`/api/guides/${guideId}`);
    const sections = (await savedGuide.json()).data.sections as Array<{
      id: string;
      title: string;
    }>;
    expect(sections).toHaveLength(2);

    const reorder = await owner.patch(
      `/api/guides/${guideId}/sections/reorder`,
      {
        data: { sectionIds: sections.map((item) => item.id).reverse() },
      },
    );
    expect(reorder.ok()).toBeTruthy();
    const reorderedGuide = await owner.get(`/api/guides/${guideId}`);
    expect((await reorderedGuide.json()).data.sections[0].title).toBe(
      'Ротация',
    );

    const extraSection = await owner.post(`/api/guides/${guideId}/sections`, {
      data: {
        title: 'Секретные фишки',
        type: 'custom',
        content: 'Третий раздел.',
      },
    });
    expect(extraSection.status()).toBe(201);
    const extraSectionId = (await extraSection.json()).data.id;
    expect(
      (
        await owner.patch(`/api/guide-sections/${extraSectionId}`, {
          data: { title: 'Тонкости механики' },
        })
      ).ok(),
    ).toBeTruthy();

    const rotation = await owner.post('/api/rotations', {
      data: {
        guideId,
        characterId,
        title: 'Boss rotation',
        rotationType: 'Boss rotation',
        purpose: 'Проверка последовательности.',
        stepsJson: ['Навык', 'Ульта', 'Переключение'],
        logic: 'Сначала накладываем эффект, затем реализуем окно урона.',
        status: 'published',
      },
    });
    expect(rotation.status()).toBe(201);
    const rotationId = (await rotation.json()).data.id;

    const duplicateTeam = await owner.post('/api/teams', {
      data: {
        slug: `duplicate-team-${runId}`,
        title: 'Команда с дублем',
        teamType: 'Bossing',
        budget: 'F2P',
        difficulty: 'Средняя',
        power: 70,
        goodAt: 'Боссы',
        weakAt: 'Фарм',
        synergy: 'Тест',
        rotation: 'Тест',
        members: [
          { characterId, role: 'DPS' },
          { characterId, role: 'Support' },
        ],
      },
    });
    expect(duplicateTeam.status()).toBe(400);

    const team = await owner.post('/api/teams', {
      data: {
        slug: `test-team-${runId}`,
        guideId,
        title: 'Тестовая команда',
        teamType: 'Bossing',
        budget: 'F2P',
        difficulty: 'Средняя',
        power: 76,
        goodAt: 'Одиночные цели',
        weakAt: 'Разрозненные волны',
        synergy: 'Окна усиления совпадают с основной ротацией.',
        rotation: 'Поддержка → главный DPS → добивание.',
        rotationStepsJson: [
          'Support: усиление команды',
          'Главный DPS: навык и ульта',
          'Support: возврат к подготовке',
        ],
        status: 'published',
        members: [{ characterId, role: 'Главный DPS' }],
      },
    });
    expect(team.status()).toBe(201);
    const teamId = (await team.json()).data.id;
    const teamRead = await owner.get(`/api/teams/${teamId}`);
    expect((await teamRead.json()).data).toMatchObject({
      guideId,
      rotationSteps: [
        'Support: усиление команды',
        'Главный DPS: навык и ульта',
        'Support: возврат к подготовке',
      ],
    });

  const duplicateTier = await owner.post('/api/tierlists', {
    data: {
      slug: `duplicate-tier-${runId}`,
      title: 'Тир-лист с дублем',
        tierlistType: 'base',
        patchVersion: 'test',
        items: [
          { characterId, tier: 'A' },
          { characterId, tier: 'B' },
        ],
      },
  });
  expect(duplicateTier.status()).toBe(400);

  const legacyTier = await owner.post('/api/tierlists', {
    data: {
      slug: `legacy-tier-${runId}`,
      title: 'Тир-лист с legacy-рангом',
      tierlistType: 'base',
      patchVersion: 'test',
      items: [{ characterId, tier: 'S+' }],
    },
  });
  expect(legacyTier.status()).toBe(400);

  const tierlist = await owner.post('/api/tierlists', {
      data: {
        slug: `test-tier-${runId}`,
        title: 'Тестовый C0 тир-лист',
        tierlistType: 'base',
        patchVersion: 'test',
        status: 'published',
        changelogJson: ['Создан автотестом'],
      items: [{ characterId, tier: 'D', note: 'Контрольная позиция' }],
      },
    });
    expect(tierlist.status()).toBe(201);
    const tierlistId = (await tierlist.json()).data.id;

    const newsSlug = `test-news-${runId}`;
    const news = await owner.post('/api/news', {
      data: {
        slug: newsSlug,
        title: 'Тестовая новость',
        summary: 'Черновик не должен быть виден гостю.',
        bodyMarkdown: '## Проверка\n\nПолный текст новости.',
        category: 'Обновления',
        imageUrl: '/assets/news/city-update.webp',
        tagsJson: ['тест'],
        status: 'draft',
      },
    });
    expect(news.status()).toBe(201);
    const newsId = (await news.json()).data.id;
    expect((await guest.get(`/api/news/${newsSlug}`)).status()).toBe(404);
    await owner.patch(`/api/news/${newsId}`, {
      data: { status: 'published' },
    });
    expect((await guest.get(`/api/news/${newsSlug}`)).ok()).toBeTruthy();

    const leakSlug = `test-leak-${runId}`;
    const leak = await owner.post('/api/leaks', {
      data: {
        slug: leakSlug,
        title: 'Тестовый неподтверждённый слив',
        summary: 'Проверка очереди одобрения.',
        bodyMarkdown: 'Информация может измениться.',
        sourceName: 'Тестовый источник',
        sourceUrl: 'https://t.me/example',
        trustLevel: 'низкий',
        leakStatus: 'слух',
        approved: false,
      },
    });
    expect(leak.status()).toBe(201);
    const leakId = (await leak.json()).data.id;
    expect((await guest.get(`/api/leaks/${leakSlug}`)).status()).toBe(404);
    await owner.patch(`/api/leaks/${leakId}`, {
      data: { approved: true },
    });
    expect((await guest.get(`/api/leaks/${leakSlug}`)).ok()).toBeTruthy();

    const source = await owner.post('/api/sources', {
      data: {
        sourceType: 'telegram',
        sourceUrl: 'https://t.me/example',
        sourceName: `Тестовый источник ${runId}`,
        trustLevel: 'средний',
        autoImportEnabled: false,
      },
    });
    expect(source.status()).toBe(201);
    const sourceId = (await source.json()).data.id;

    const audit = await owner.get('/api/audit-log');
    expect(audit.ok()).toBeTruthy();
    const actions = (await audit.json()).data.map(
      (entry: { action: string }) => entry.action,
    );
    expect(actions).toContain('guides.create');
    expect(actions).toContain('leaks.update');

    for (const [collection, id] of [
      ['sources', sourceId],
      ['leaks', leakId],
      ['news', newsId],
      ['tierlists', tierlistId],
      ['teams', teamId],
      ['rotations', rotationId],
      ['guides', guideId],
      ['characters', characterId],
    ]) {
      expect(
        (await owner.delete(`/api/${collection}/${id}`)).ok(),
      ).toBeTruthy();
    }
    expect(
      (await owner.delete('/api/characters/does-not-exist')).status(),
    ).toBe(404);
  });

  test('роли ограничивают редакционные и административные действия', async () => {
    const member = await createRequestContext.newContext({ baseURL: apiBase });
    const username = `member_${runId}`;
    const registration = await member.post('/api/auth/register', {
      data: {
        username,
        password: ownerPassword,
        confirmPassword: ownerPassword,
      },
    });
    expect(registration.status()).toBe(201);
    const memberId = (await registration.json()).data.user.id;

    expect(
      (
        await member.post('/api/characters', {
          data: { name: 'Недоступная запись' },
        })
      ).status(),
    ).toBe(403);

    await owner.patch(`/api/users/${memberId}/role`, {
      data: { role: 'editor' },
    });
    const editorCharacter = await member.post('/api/characters', {
      data: {
        slug: `editor-character-${runId}`,
        name: 'Редакторский персонаж',
        originalName: 'Editor Character',
        role: 'Support',
        type: 'Buffer',
        attribute: 'Эфир',
        imageUrl: '/assets/characters/hotori.webp',
        shortDescription: 'Создан редактором.',
        summary: 'Проверка серверной роли editor.',
        status: 'draft',
        profile: {
          faction: 'Тестовая фракция',
          birthday: '21 июня',
          biographyShort: 'Краткая биография.',
          biography: 'Подробная биография персонажа.',
          trivia: 'Проверенный интересный факт.',
          roleTags: ['Support', 'Buffer'],
          abilities: [
            {
              id: 'editor-ability',
              name: 'Тестовый навык',
              type: 'Активный',
              iconUrl: 'assets/characters/Hotori.webp',
              description: 'Описание навыка.',
            },
          ],
        },
      },
    });
    expect(editorCharacter.status()).toBe(201);
    const editorCharacterId = (await editorCharacter.json()).data.id;
    const editorCharacterRead = await member.get(
      `/api/characters/${editorCharacterId}`,
    );
    expect((await editorCharacterRead.json()).data.profile).toMatchObject({
      faction: 'Тестовая фракция',
      roleTags: ['Support', 'Buffer'],
    });
    expect(
      (
        await member.post('/api/news', {
          data: { title: 'Редактор не должен публиковать новость' },
        })
      ).status(),
    ).toBe(403);
    expect((await member.get('/api/audit-log')).status()).toBe(403);

    const invalidVideoScope = await owner.patch(
      `/api/users/${memberId}/editor-permissions`,
      {
        data: {
          grade: 'senior',
          scopes: ['videos'],
          canCreate: true,
          canEdit: true,
          canPublish: true,
          canDelete: false,
        },
      },
    );
    expect(invalidVideoScope.status()).toBe(400);

    const permissions = await owner.patch(
      `/api/users/${memberId}/editor-permissions`,
      {
        data: {
          grade: 'senior',
          scopes: ['news'],
          canCreate: true,
          canEdit: true,
          canPublish: true,
          canDelete: false,
        },
      },
    );
    expect(permissions.status()).toBe(200);
    const editorNews = await member.post('/api/news', {
      data: {
        slug: `editor-news-${runId}`,
        title: 'Новость редактора с точечным доступом',
        summary: 'Проверка индивидуального scope для редактора.',
        bodyMarkdown: '## Текст\nПроверка доступа.',
        category: 'Прочее',
        imageUrl: 'assets/news/patch.webp',
        status: 'draft',
      },
    });
    expect(editorNews.status()).toBe(201);
    const editorNewsId = (await editorNews.json()).data.id;
    expect((await member.delete(`/api/news/${editorNewsId}`)).status()).toBe(
      403,
    );
    const usersWithPermissions = await owner.get('/api/users');
    const editorSnapshot = (await usersWithPermissions.json()).data.find(
      (user: { id: string }) => user.id === memberId,
    );
    expect(editorSnapshot.editorPermissions).toMatchObject({
      grade: 'senior',
      scopes: ['news'],
      canDelete: false,
    });

    await owner.patch(`/api/users/${memberId}/role`, {
      data: { role: 'moderator' },
    });
    expect((await member.get('/api/comments')).ok()).toBeTruthy();
    expect(
      (
        await member.post('/api/guides', {
          data: { title: 'Модератор не редактор' },
        })
      ).status(),
    ).toBe(403);

    const moderatedUser = await createRequestContext.newContext({
      baseURL: apiBase,
    });
    const moderatedUsername = `moderated_${runId}`;
    const moderatedRegistration = await moderatedUser.post(
      '/api/auth/register',
      {
        data: {
          username: moderatedUsername,
          password: ownerPassword,
          confirmPassword: ownerPassword,
        },
      },
    );
    const moderatedId = (await moderatedRegistration.json()).data.user.id;
    const warning = await member.post(`/api/users/${moderatedId}/warnings`, {
      data: {
        reason: 'Повторная публикация непомеченного сюжетного спойлера.',
      },
  });
  expect(warning.status()).toBe(201);
  const warningId = (await warning.json()).data.id;
  const warnings = await moderatedUser.get('/api/auth/warnings');
  expect((await warnings.json()).data).toHaveLength(1);
  const adminWarnings = await member.get('/api/warnings');
  expect(adminWarnings.ok()).toBeTruthy();
  expect(
    (await adminWarnings.json()).data.some(
      (item: { id: string }) => item.id === warningId,
    ),
  ).toBeTruthy();
  const dismissedWarning = await member.patch(`/api/warnings/${warningId}`, {
    data: { status: 'dismissed' },
  });
  expect(dismissedWarning.ok()).toBeTruthy();
  expect(
      (
        await member.post(`/api/users/${ownerId}/warnings`, {
          data: { reason: 'Недопустимая попытка.' },
        })
      ).status(),
    ).toBe(403);

    expect(
      (
        await owner.patch(`/api/users/${moderatedId}/status`, {
          data: { status: 'disabled' },
        })
      ).ok(),
    ).toBeTruthy();
    await expect(
      (await moderatedUser.get('/api/auth/me')).json(),
    ).resolves.toEqual({
      data: null,
    });
    expect(
      (
        await owner.patch(`/api/users/${moderatedId}/status`, {
          data: { status: 'active' },
        })
      ).ok(),
    ).toBeTruthy();

    await owner.delete(`/api/characters/${editorCharacterId}`);
    await owner.delete(`/api/news/${editorNewsId}`);
    await owner.delete(`/api/users/${moderatedId}`);
    await owner.delete(`/api/users/${memberId}`);
    await moderatedUser.dispose();
    await member.dispose();
  });

  test('валидация отклоняет опасные и некорректные данные', async () => {
    const invalidUrl = await owner.post('/api/news', {
      data: {
        slug: `invalid-url-${runId}`,
        title: 'Некорректный URL',
        summary: 'Проверка серверной валидации.',
        bodyMarkdown: 'Контент',
        category: 'Прочее',
        imageUrl: 'javascript:alert(1)',
      },
    });
    expect(invalidUrl.status()).toBe(400);

    const invalidBudget = await owner.post('/api/teams', {
      data: {
        slug: `invalid-budget-${runId}`,
        title: 'Некорректный бюджет',
        teamType: 'Bossing',
        budget: 'Whale',
        difficulty: 'Высокая',
        goodAt: 'Боссы',
        weakAt: 'Фарм',
        synergy: 'Тест',
        rotation: 'Тест',
      },
    });
    expect(invalidBudget.status()).toBe(400);

    const oversized = await owner.post('/api/news', {
      data: {
        slug: `oversized-${runId}`,
        title: 'Слишком большой материал',
        summary: 'Проверка лимита.',
        bodyMarkdown: 'x'.repeat(60_001),
        category: 'Прочее',
        imageUrl: '/assets/news/city-update.webp',
      },
    });
    expect(oversized.status()).toBe(400);
  });

  test('owner проходит UI-вход и открывает inline-редактор гайда', async ({
    page,
  }) => {
    const uiGuideCharacterSlug = `ui-guide-character-${runId}`;
    const uiGuideCharacterName = `UI персонаж ${runId}`;
    const uiGuideSlug = `ui-guide-${runId}`;
    const uiCharacter = await owner.post('/api/characters', {
      data: {
        slug: uiGuideCharacterSlug,
        name: uiGuideCharacterName,
        originalName: 'UI Guide Character',
        rarity: 'S',
        role: 'DPS',
        type: 'DPS',
        attribute: 'Тест',
        tier: 'D',
        premiumTier: 'D',
        imageUrl: '/assets/characters/Hotori.webp',
        splashUrl: '/assets/characters/Hotori.webp',
        shortDescription: 'Персонаж для UI-публикации гайда.',
        summary: 'Проверяет создание и публикацию гайда из публичного раздела.',
        tagsJson: ['ui', 'guide'],
        status: 'published',
        patchVersion: 'test',
      },
    });
    expect(uiCharacter.status()).toBe(201);

    await page.goto('/#/admin');
    await page.getByLabel('Логин').fill(ownerUsername);
    await page.getByLabel('Пароль').fill(ownerPassword);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Dashboard', level: 1 }),
    ).toBeVisible();
    const sidebar = page.getByRole('complementary', {
      name: 'Разделы админки',
    });
    await expect(sidebar.getByRole('link', { name: 'Гайды', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Персонажи', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Видео-гайды', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Команды' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Ротации' })).toHaveCount(0);

    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Гайды', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Гайды NTE Meta', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Создать гайд' }).click();
  await expect(
    page.getByRole('heading', { name: 'Добавить гайд', level: 1 }),
  ).toBeVisible();
  const guideDialog = page.locator('dialog[open]');
  const guideCreateForm = guideDialog.locator('form.entity-form');
  await expect(guideCreateForm.getByRole('heading', { name: 'Создать гайд' })).toBeVisible();
  await guideCreateForm.getByLabel('Персонаж').selectOption({ label: uiGuideCharacterName });
  await guideCreateForm.getByLabel('Заголовок').fill(`Гайд ${uiGuideCharacterName}`);
  await guideCreateForm.getByLabel('Slug').fill(uiGuideSlug);
  await expect(guideCreateForm.getByLabel('Slug')).toHaveValue(uiGuideSlug);
  await guideCreateForm
    .getByLabel('Краткое описание')
    .fill('Гайд создан из публичного раздела и должен открыть detail-страницу.');
  await guideCreateForm.getByLabel('Патч').fill('ui-test');
  await expect(guideCreateForm.getByLabel('Slug')).toHaveValue(uiGuideSlug);
  const guideCreateRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/guides'),
  );
  await guideCreateForm.getByRole('button', { name: 'Создать черновик' }).click();
  const guideCreatePayload = JSON.parse((await guideCreateRequest).postData() || '{}') as {
    slug?: string;
  };
  expect(guideCreatePayload.slug).toBe(uiGuideSlug);
  await expect(
    guideDialog.getByRole('heading', { name: `Гайд ${uiGuideCharacterName}` }),
  ).toBeVisible();
  await guideDialog
    .locator('.guide-meta-fields')
    .getByLabel('Статус')
    .selectOption('published');
  await guideDialog
    .getByRole('button', { name: 'Сохранить параметры гайда' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/#/guides/${uiGuideSlug}$`));
  await expect(
    page.getByRole('heading', { name: uiGuideCharacterName, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /О персонаже/ })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Гайды', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Тир-листы', exact: true })
      .click();
    await page.getByRole('button', { name: 'Редактировать тир-листы' }).click();
    await expect(
      page.getByRole('heading', { name: 'Редактировать тир-лист', level: 1 }),
    ).toBeVisible();
  await expect(page.locator('.tier-drag-card').first()).toHaveAttribute(
    'draggable',
    'true',
  );
  await expect(page.locator('.tier-drag-card').nth(1)).toBeVisible();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.locator('.tier-drag-card').first().dispatchEvent('dragstart', {
    dataTransfer,
  });
  await expect(page.locator('.tier-drag-card').first()).toHaveClass(
    /is-dragging/,
  );
  const dropTargetBox = await page.locator('.tier-drag-card').nth(1).boundingBox();
  if (!dropTargetBox) {
    throw new Error('Не удалось получить координаты карточки тир-листа.');
  }
  await page.locator('.tier-drag-card').nth(1).dispatchEvent('dragover', {
    dataTransfer,
    clientX: dropTargetBox.x + dropTargetBox.width - 2,
    clientY: dropTargetBox.y + dropTargetBox.height / 2,
  });
  await expect(page.locator('.tier-drag-card').nth(1)).toHaveAttribute(
    'data-drop-placement',
    'after',
  );
  await page.locator('.tier-drag-card').first().dispatchEvent('dragend', {
    dataTransfer,
  });
  await dataTransfer.dispose();
  await expect(page.getByText('S+', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть редактор' }).click();

  const uiNewsSlug = `ui-news-${runId}`;
  await page.getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Главная', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'NTE Meta' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить новость' }).click();
  await expect(
    page.getByRole('heading', { name: 'Добавить новость', level: 1 }),
  ).toBeVisible();
  const newsDialog = page.locator('dialog[open]');
  const newsForm = newsDialog.locator('.cms-editor');
  await newsForm.getByLabel('Заголовок').fill(`UI публикация ${runId}`);
  await newsForm.getByLabel('Slug URL').fill(uiNewsSlug);
  await newsForm
    .getByLabel('Краткое описание')
    .fill('Проверка inline публикации новости.');
  await newsForm
    .getByLabel('Полный текст Markdown')
    .fill('## Проверка\nНовая страница должна открыться сразу после публикации.');
  await newsForm.getByLabel('URL изображения').fill('/assets/news/city-update.webp');
  await newsForm.getByLabel('Теги через запятую').fill('ui, публикация');
  await newsForm.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page).toHaveURL(new RegExp(`/#/news/${uiNewsSlug}$`));
  await expect(
    page.getByRole('heading', { name: `UI публикация ${runId}` }),
  ).toBeVisible();
  await expect(
    page.locator('.editorial-body').getByText(
      'Новая страница должна открыться сразу после публикации.',
      { exact: true },
    ),
  ).toBeVisible();

  const uiThreadSlug = `ui-thread-${runId}`;
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: 'Главная', exact: true })
    .click();
  await page.getByRole('button', { name: 'Создать тред' }).click();
  await expect(
    page.getByRole('heading', { name: 'Создать тред', level: 1 }),
  ).toBeVisible();
  const threadDialog = page.locator('dialog[open]');
  const threadForm = threadDialog.locator('form.thread-editor');
  await threadForm.getByLabel('Заголовок').fill(`UI тред ${runId}`);
  await threadForm.getByLabel('Slug').fill(uiThreadSlug);
  await threadForm
    .getByLabel('Краткое описание')
    .fill('Проверка публикации комьюнити-треда.');
  await threadForm
    .getByLabel('Текст треда')
    .fill('## Обсуждение\nТред должен открыть отдельную страницу после публикации.');
  await threadForm.getByLabel('Теги').fill('ui, тред');
  await threadForm.getByRole('button', { name: 'Опубликовать тред' }).click();
  await expect(page).toHaveURL(new RegExp(`/#/threads/${uiThreadSlug}$`));
  await expect(
    page.getByRole('heading', { name: `UI тред ${runId}` }),
  ).toBeVisible();
  await expect(page.getByText('Комментарии и обсуждения')).toBeVisible();

  await page.locator('a.profile-chip').click();
  await expect(
    page.getByRole('heading', { name: 'Профиль', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Открыть админку' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'Вход в NTE Meta' })).toBeVisible();
});

  test('owner публикует слив inline и открывает созданную страницу', async ({
    page,
  }) => {
    const uiLeakSlug = `ui-leak-${runId}`;
    await page.goto('/#/profile');
    await page.getByLabel('Логин').fill(ownerUsername);
    await page.getByLabel('Пароль').fill(ownerPassword);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(
      page.getByRole('heading', { name: 'Профиль', level: 1 }),
    ).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Главная', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'NTE Meta' })).toBeVisible();
    await page.getByRole('button', { name: 'Добавить слив' }).click();
    await expect(
      page.getByRole('heading', { name: 'Добавить слив', level: 1 }),
    ).toBeVisible();

    const leakDialog = page.locator('dialog[open]').filter({
      has: page.getByRole('heading', { name: 'Добавить слив', level: 1 }),
    });
    const leakForm = leakDialog.locator('.cms-editor');
    await leakForm
      .getByLabel('Редактируемый заголовок')
      .fill(`UI слив ${runId}`);
    await leakForm.getByLabel('Slug URL').fill(uiLeakSlug);
    await leakForm
      .getByLabel('Краткое описание')
      .fill('Проверка inline публикации слива.');
    await leakForm
      .getByLabel('Полный текст / репост Markdown')
      .fill('## Проверка\nСлив должен открыть отдельную страницу после сохранения.');
    await leakForm.getByLabel('Оригинальный источник').fill('Редакционный тест');
    await leakForm.getByLabel('Ссылка на источник').fill('https://example.com/source');
    await leakForm.getByLabel('Уровень доверия').selectOption('средний');
    await leakForm.getByLabel('Статус информации').selectOption('слив');
    await leakForm.getByLabel('Одобрено для публичной выдачи').check();
    await leakForm.getByLabel('Теги через запятую').fill('ui, слив');
    await leakForm.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page).toHaveURL(new RegExp(`/#/leaks/${uiLeakSlug}$`));
    await expect(
      page.getByRole('heading', { name: `UI слив ${runId}` }),
    ).toBeVisible();
    await expect(
      page.locator('.editorial-body').getByText(
        'Слив должен открыть отдельную страницу после сохранения.',
        { exact: true },
      ),
    ).toBeVisible();
  });

  test('смена пароля отзывает сессии, login и logout работают', async () => {
    const nextPassword = 'Playwright-New-Strong-84!';
    const changed = await owner.post('/api/auth/change-password', {
      data: {
        currentPassword: ownerPassword,
        nextPassword,
        nextConfirm: nextPassword,
      },
    });
    expect(changed.ok()).toBeTruthy();
    await expect((await owner.get('/api/auth/me')).json()).resolves.toEqual({
      data: null,
    });

    const login = await owner.post('/api/auth/login', {
      data: { username: ownerUsername, password: nextPassword },
    });
    expect(login.ok()).toBeTruthy();
    expect((await owner.get('/api/auth/me')).ok()).toBeTruthy();

    expect((await owner.post('/api/auth/logout')).ok()).toBeTruthy();
    await expect((await owner.get('/api/auth/me')).json()).resolves.toEqual({
      data: null,
    });
  });
});
