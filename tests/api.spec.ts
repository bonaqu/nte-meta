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
let reporter: APIRequestContext;
let communityCommentId = '';
let ownerId = '';

test.describe('NTE Meta Worker API', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    owner = await createRequestContext.newContext({ baseURL: apiBase });
    guest = await createRequestContext.newContext({ baseURL: apiBase });
    reporter = await createRequestContext.newContext({ baseURL: apiBase });

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
    await Promise.all([owner.dispose(), guest.dispose(), reporter.dispose()]);
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

  test('очередь слухов создаёт только непубличный редакционный черновик', async () => {
    expect((await guest.get('/api/leak-candidates')).status()).toBe(401);

    const submitted = await owner.post('/api/leak-candidates', {
      data: {
        title: `Непроверенная публикация ${runId}`,
        sourceUrl: `https://t.me/example/${encodeURIComponent(runId)}`,
        sourceName: 'Тестовый источник',
        note: 'Нужно проверить оригинал и контекст перед публикацией.',
        status: 'слух',
      },
    });
    expect(submitted.status()).toBe(201);
    const candidateId = (await submitted.json()).data.id;

    const editorialUpdate = await owner.patch(
      `/api/leak-candidates/${candidateId}`,
      {
        data: { suggestedStatus: 'слив', trustLevel: 'средний' },
      },
    );
    expect(editorialUpdate.ok()).toBeTruthy();

    const promoted = await owner.post(
      `/api/leak-candidates/${candidateId}/promote`,
      { data: {} },
    );
    expect(promoted.status()).toBe(201);
    const promotedData = (await promoted.json()).data;
    const draft = await owner.get(`/api/leaks/${promotedData.leakId}`);
    expect(draft.ok()).toBeTruthy();
    expect((await draft.json()).data.status).toBe('слив');

    expect((await guest.get(`/api/leaks/${promotedData.slug}`)).status()).toBe(
      404,
    );
    expect(
      (
        await owner.patch(`/api/leaks/${promotedData.leakId}`, {
          data: { approved: true },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (await guest.get(`/api/leaks/${promotedData.slug}`)).ok(),
    ).toBeTruthy();

    await owner.delete(`/api/leaks/${promotedData.leakId}`);
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

    const reporterUsername = `reporter_${runId}`;
    const reporterRegister = await reporter.post('/api/auth/register', {
      data: {
        username: reporterUsername,
        password: ownerPassword,
        confirmPassword: ownerPassword,
      },
    });
    expect(reporterRegister.status()).toBe(201);
    const report = await reporter.post('/api/comment-reports', {
      data: {
        commentId: communityCommentId,
        reason: 'misinformation',
        details: 'Нужно проверить утверждение по первоисточнику.',
      },
    });
    expect(report.status()).toBe(201);
    const reportId = (await report.json()).data.id;
    const moderationReports = await owner.get('/api/comment-reports');
    expect(moderationReports.ok()).toBeTruthy();
    expect(
      (await moderationReports.json()).data.some(
        (item: { id: string; status: string }) =>
          item.id === reportId && item.status === 'open',
      ),
    ).toBeTruthy();
    expect(
      (
        await owner.patch(`/api/comment-reports/${reportId}`, {
          data: { status: 'resolved' },
        })
      ).ok(),
    ).toBeTruthy();

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

    const thread = await reporter.post('/api/threads', {
      data: {
        title: `Вопрос по механике ${runId}`,
        summary: 'Проверка принятого ответа и закрепления.',
        body: 'Подскажите, как работает эта механика в текущем патче?',
        tags: ['вопрос'],
      },
    });
    expect(thread.status()).toBe(201);
    const threadId = (await thread.json()).data.id;
    const threadAnswer = await owner.post('/api/comments', {
      data: {
        targetType: 'thread',
        targetId: threadId,
        body: 'Проверенный ответ с пояснением для автора треда.',
      },
    });
    expect(threadAnswer.status()).toBe(201);
    const threadAnswerId = (await threadAnswer.json()).data.id;
    expect(
      (
        await reporter.patch(`/api/comments/${threadAnswerId}`, {
          data: { isAnswer: true },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await owner.patch(`/api/comments/${threadAnswerId}`, {
          data: { isPinned: true },
        })
      ).ok(),
    ).toBeTruthy();
    const threadComments = await guest.get(
      `/api/comments?targetType=thread&targetId=${threadId}`,
    );
    expect(threadComments.ok()).toBeTruthy();
    expect((await threadComments.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: threadAnswerId,
          isAnswer: true,
          isPinned: true,
        }),
      ]),
    );
    expect((await reporter.delete(`/api/threads/${threadId}`)).ok()).toBeTruthy();

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
    const longMediaUrl = `https://static.wikia.nocookie.net/neverness-to-everness/images/${'very-long-imported-file-name-'.repeat(8)}.webp/revision/latest`;
    const characterPayload = {
      slug: characterSlug,
      name: 'Тестовый персонаж',
      originalName: 'Test Character',
      rarity: 'S',
      role: 'Главный DPS',
      type: 'DPS',
      attribute: 'Электро',
      imageUrl: '/assets/characters/hotori.webp',
      shortDescription: 'Персонаж для API-регрессии.',
      summary: 'Проверяет создание, публикацию и удаление записи.',
      tagsJson: ['тест'],
      profile: {
        abilities: [
          {
            id: longMediaUrl,
            name: 'Тестовый навык',
            type: 'Навык',
            iconUrl: longMediaUrl,
            description: 'Проверяет безопасную нормализацию длинного имени медиа.',
          },
        ],
      },
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
        title: 'Тестовый единый тир-лист',
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
  expect(
    (
      await member.post('/api/character-import/lookup', {
        data: { query: 'Хотори' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await member.post('/api/guide-import/lookup', {
        data: { query: 'Хотори' },
      })
    ).status(),
  ).toBe(403);

  const ownerLookup = await owner.post('/api/character-import/lookup', {
    data: { query: 'Байканг' },
  });
  expect(ownerLookup.ok()).toBeTruthy();
  const ownerLookupJson = await ownerLookup.json();
  expect(ownerLookupJson.data.sources.length).toBeGreaterThan(0);
  expect(Array.isArray(ownerLookupJson.data.suggestions)).toBeTruthy();
  expect(ownerLookupJson.data.suggestions.length).toBeGreaterThan(0);
  expect(
    ownerLookupJson.data.suggestions.some(
      (suggestion: { field: string }) => suggestion.field === 'profile.voiceActors',
    ),
  ).toBeTruthy();
  expect(
    ownerLookupJson.data.suggestions.some(
      (suggestion: { field: string; value: string }) =>
        suggestion.field === 'profile.arcType' && suggestion.value === 'Гибридный',
    ),
  ).toBeTruthy();
  const roleSuggestion = ownerLookupJson.data.suggestions.find(
    (suggestion: { field: string }) => suggestion.field === 'profile.roleTags',
  ) as { value: string } | undefined;
  expect(roleSuggestion).toBeTruthy();
  expect(JSON.parse(roleSuggestion?.value || '[]')).toEqual([
    'Урон',
    'Основной ДД',
    'Периодический урон',
  ]);
  const voiceActorSuggestion = ownerLookupJson.data.suggestions.find(
    (suggestion: { field: string }) => suggestion.field === 'profile.voiceActors',
  ) as { value: string } | undefined;
  expect(voiceActorSuggestion?.value).not.toContain('[[wp:');
  expect(voiceActorSuggestion?.value).not.toMatch(/"(?:name|language)":"\s*=/);
  const abilitySuggestion = ownerLookupJson.data.suggestions.find(
    (suggestion: { field: string }) => suggestion.field === 'profile.abilities',
  ) as { value: string } | undefined;
  const importedAbilities = JSON.parse(abilitySuggestion?.value || '[]') as Array<{
    name?: string;
    type?: string;
  }>;
  expect(importedAbilities).toHaveLength(8);
  expect(importedAbilities.slice(6)).toMatchObject([
    { name: 'Цветение в зените', type: 'Повседневный навык' },
    { name: 'Не введено', type: 'Повседневный навык' },
  ]);
  const giftSuggestion = ownerLookupJson.data.suggestions.find(
    (suggestion: { field: string }) => suggestion.field === 'profile.gifts',
  ) as { value: string } | undefined;
  const importedGifts = JSON.parse(giftSuggestion?.value || '[]') as Array<{
    name?: string;
    iconUrl?: string;
  }>;
  expect(importedGifts.every((gift) => !/^\d+$/.test(gift.name || ''))).toBeTruthy();
  expect(
    importedGifts.every((gift) => {
      const media = decodeURIComponent(gift.iconUrl || '');
      return !/(?:роль|role|редкость|rarity)[_.\s/-]/i.test(media);
    }),
  ).toBeTruthy();
  const roleIconSuggestion = ownerLookupJson.data.suggestions.find(
    (suggestion: { field: string }) => suggestion.field === 'profile.roleIcons',
  ) as { value: string } | undefined;
  if (roleIconSuggestion) {
    const importedRoleIcons = JSON.parse(roleIconSuggestion.value) as Array<{
      name?: string;
      iconUrl?: string;
    }>;
    expect(
      importedRoleIcons.every((icon) => icon.name && /^https:\/\//.test(icon.iconUrl || '')),
    ).toBeTruthy();
  }
  expect(
    ownerLookupJson.data.suggestions
      .filter((suggestion: { field: string }) =>
        ['profile.biography', 'profile.biographyShort'].includes(suggestion.field),
      )
      .every(
        (suggestion: { value: string }) =>
          !/указан в базе|эта страница предназначена|ищет гайд/i.test(suggestion.value),
      ),
  ).toBeTruthy();
  expect(
    ownerLookupJson.data.suggestions.some(
      (suggestion: { field: string }) => suggestion.field === '__imageMap',
    ),
  ).toBeFalsy();
  const materialsSuggestion = ownerLookupJson.data.suggestions.find(
    (suggestion: { field: string }) => suggestion.field === 'profile.materials',
  ) as { value: string } | undefined;
  if (materialsSuggestion) {
    const importedMaterials = JSON.parse(materialsSuggestion.value) as Array<{
      name?: string;
      amount?: string;
    }>;
    expect(importedMaterials.some((material) => material.name && material.amount)).toBeTruthy();
  }
  const baseStatsSuggestion = ownerLookupJson.data.suggestions.find(
    (suggestion: { field: string }) => suggestion.field === 'profile.baseStats',
  ) as { value: string } | undefined;
  if (baseStatsSuggestion) {
    const importedStats = JSON.parse(baseStatsSuggestion.value) as Array<{ label?: string }>;
    const statLabels = importedStats.map((stat) => stat.label).filter(Boolean);
    expect(new Set(statLabels).size).toBe(statLabels.length);
    expect(statLabels).not.toEqual(
      expect.arrayContaining(['HP', 'ATK', 'DEF', 'Crit', 'CDMG']),
    );
  }

  const guideLookup = await owner.post('/api/guide-import/lookup', {
    data: { query: 'Хотори' },
  });
  expect(guideLookup.ok()).toBeTruthy();
  const guideLookupJson = await guideLookup.json();
  expect(guideLookupJson.data.sources.length).toBeGreaterThan(0);
  expect(Array.isArray(guideLookupJson.data.suggestions)).toBeTruthy();
  const guideFields = guideLookupJson.data.suggestions.map(
    (suggestion: { field: string }) => suggestion.field,
  );
  expect(guideFields).toEqual(
    expect.arrayContaining([
      'guide.strengths',
      'guide.weaknesses',
      'guide.bestArcs',
      'guide.teams',
      'guide.rotations',
    ]),
  );
  expect(
    guideLookupJson.data.suggestions.some((suggestion: { field: string }) =>
      [
        'guide.summary',
        'guide.pullAdvice',
        'guide.bestArcs',
        'guide.alternativeArcs',
        'guide.teams',
        'guide.rotations',
        'guide.tips',
      ].includes(suggestion.field),
    ),
  ).toBeTruthy();
  for (const suggestion of guideLookupJson.data.suggestions) {
    expect(suggestion.field === 'tier' || suggestion.field.startsWith('guide.')).toBeTruthy();
    expect(suggestion.sourceUrl).toContain('https://');
  }

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
      roleTags: ['Поддержка', 'Усиление'],
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
    const deletePermission = await owner.patch(
      `/api/users/${memberId}/editor-permissions`,
      {
        data: {
          grade: 'lead',
          scopes: ['news'],
          canCreate: true,
          canEdit: true,
          canPublish: true,
          canDelete: true,
        },
      },
    );
    expect(deletePermission.status()).toBe(200);
    const deletableNews = await member.post('/api/news', {
      data: {
        slug: `editor-deletable-news-${runId}`,
        title: 'Новость редактора для удаления',
        summary: 'Проверка индивидуального права удаления.',
        bodyMarkdown:
          '## Текст\nМатериал должен удаляться только после выдачи права.',
        category: 'Прочее',
        imageUrl: 'assets/news/patch.webp',
        status: 'draft',
      },
    });
    expect(deletableNews.status()).toBe(201);
    const deletableNewsId = (await deletableNews.json()).data.id;
    expect((await member.delete(`/api/news/${deletableNewsId}`)).status()).toBe(
      200,
    );
    const usersWithPermissions = await owner.get('/api/users');
    const editorSnapshot = (await usersWithPermissions.json()).data.find(
      (user: { id: string }) => user.id === memberId,
    );
    expect(editorSnapshot.editorPermissions).toMatchObject({
      grade: 'lead',
      scopes: ['news'],
      canDelete: true,
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
      page.getByRole('heading', { name: 'Обзор', level: 1 }),
    ).toBeVisible();
    const sidebar = page.getByRole('complementary', {
      name: 'Разделы админки',
    });
    await expect(
      sidebar.getByRole('link', { name: 'Гайды', exact: true }),
    ).toHaveCount(0);
    await expect(
      sidebar.getByRole('link', { name: 'Персонажи', exact: true }),
    ).toHaveCount(0);
    await expect(
      sidebar.getByRole('link', { name: 'Видео-гайды', exact: true }),
    ).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Команды' })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Ротации' })).toHaveCount(0);

  await page.goto('/#/guides/hotori-burst-guide');
  await page.getByRole('button', { name: 'Редактировать гайд' }).click();
  const existingGuideDialog = page.locator('dialog[open]');
  await expect(
    existingGuideDialog.getByRole('heading', {
      name: 'Редактировать гайд: Хотори',
      level: 1,
    }),
  ).toBeVisible();
  const sectionButtons = existingGuideDialog.locator(
    '.section-sorter button[draggable="true"]',
  );
  await expect(sectionButtons.nth(1)).toBeVisible();
  const firstSectionName = (
    await sectionButtons.nth(0).locator('span').textContent()
  )?.trim();
  const secondSectionName = (
    await sectionButtons.nth(1).locator('span').textContent()
  )?.trim();
  expect(firstSectionName).toBeTruthy();
  expect(secondSectionName).toBeTruthy();
  const sectionTransfer = await page.evaluateHandle(() => new DataTransfer());
  await sectionButtons.nth(0).dispatchEvent('dragstart', {
    dataTransfer: sectionTransfer,
  });
  await expect(sectionButtons.nth(0)).toHaveClass(/is-dragging/);
  const sectionTargetBox = await sectionButtons.nth(1).boundingBox();
  if (!sectionTargetBox) {
    throw new Error('Не удалось получить координаты секции гайда.');
  }
  await sectionButtons.nth(1).dispatchEvent('dragover', {
    dataTransfer: sectionTransfer,
    clientX: sectionTargetBox.x + sectionTargetBox.width / 2,
    clientY: sectionTargetBox.y + sectionTargetBox.height - 2,
  });
  await expect(sectionButtons.nth(1)).toHaveAttribute(
    'data-drop-placement',
    'after',
  );
  await sectionButtons.nth(1).dispatchEvent('drop', {
    dataTransfer: sectionTransfer,
    clientX: sectionTargetBox.x + sectionTargetBox.width / 2,
    clientY: sectionTargetBox.y + sectionTargetBox.height - 2,
  });
  await expect(sectionButtons.nth(0).locator('span')).toHaveText(
    secondSectionName || '',
  );
  await expect(sectionButtons.nth(1).locator('span')).toHaveText(
    firstSectionName || '',
  );
  await sectionButtons.nth(1).dispatchEvent('dragend', {
    dataTransfer: sectionTransfer,
  });
  await sectionTransfer.dispose();
  await existingGuideDialog
    .getByRole('button', { name: 'Сохранить секции' })
    .click();
  await expect(
    existingGuideDialog.getByText('Секции гайда сохранены в D1.'),
  ).toBeVisible();
  await existingGuideDialog
    .getByRole('button', { name: 'Закрыть редактор' })
    .click();

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
    await expect(
      guideCreateForm.getByRole('heading', { name: 'Создать гайд' }),
    ).toBeVisible();
    await guideCreateForm
      .getByLabel('Персонаж')
      .selectOption({ label: uiGuideCharacterName });
    await guideCreateForm
      .getByLabel('Заголовок')
      .fill(`Гайд ${uiGuideCharacterName}`);
    await guideCreateForm.getByLabel('Адрес страницы').fill(uiGuideSlug);
    await expect(
      guideCreateForm.getByLabel('Адрес страницы'),
    ).toHaveValue(uiGuideSlug);
    await guideCreateForm
      .getByLabel('Краткое описание')
      .fill(
        'Гайд создан из публичного раздела и должен открыть detail-страницу.',
      );
    await guideCreateForm.getByLabel('Патч').fill('ui-test');
    await expect(
      guideCreateForm.getByLabel('Адрес страницы'),
    ).toHaveValue(uiGuideSlug);
    const guideCreateRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith('/api/guides'),
    );
    await guideCreateForm
      .getByRole('button', { name: 'Создать и опубликовать' })
      .click();
    const guideCreatePayload = JSON.parse(
      (await guideCreateRequest).postData() || '{}',
    ) as {
      slug?: string;
      status?: string;
    };
    expect(guideCreatePayload.slug).toBe(uiGuideSlug);
    expect(guideCreatePayload.status).toBe('published');
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
    await page.getByRole('button', { name: 'Редактировать тир-лист' }).click();
    await expect(
      page.getByRole('heading', { name: 'Редактировать тир-лист', level: 1 }),
    ).toBeVisible();
    const tierRow = page.locator('.tier-drop-row.tier-s');
    const tierCards = tierRow.locator('.tier-drag-card');
    await expect(tierCards.first()).toHaveAttribute('draggable', 'true');
    await expect(tierCards.nth(1)).toBeVisible();
    const firstCardName = (await tierCards.nth(0).getAttribute('aria-label'))
      ?.split(',')
      .at(0);
    const secondCardName = (await tierCards.nth(1).getAttribute('aria-label'))
      ?.split(',')
      .at(0);
    expect(firstCardName).toBeTruthy();
    expect(secondCardName).toBeTruthy();
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await tierCards.nth(0).dispatchEvent('dragstart', {
      dataTransfer,
    });
    await expect(tierCards.nth(0)).toHaveClass(/is-dragging/);
    const dropTargetBox = await tierCards.nth(1).boundingBox();
    if (!dropTargetBox) {
      throw new Error('Не удалось получить координаты карточки тир-листа.');
    }
    await tierCards.nth(1).dispatchEvent('dragover', {
      dataTransfer,
      clientX: dropTargetBox.x + dropTargetBox.width - 2,
      clientY: dropTargetBox.y + dropTargetBox.height / 2,
    });
    await expect(tierCards.nth(1)).toHaveAttribute(
      'data-drop-placement',
      'after',
    );
    await tierCards.nth(1).dispatchEvent('drop', {
      dataTransfer,
      clientX: dropTargetBox.x + dropTargetBox.width - 2,
      clientY: dropTargetBox.y + dropTargetBox.height / 2,
    });
    await expect(tierCards.nth(0)).toContainText(secondCardName || '');
    await expect(tierCards.nth(1)).toContainText(firstCardName || '');
    await tierCards.nth(1).dispatchEvent('dragend', { dataTransfer });
    await dataTransfer.dispose();
    await expect(page.getByText('S+', { exact: true })).toHaveCount(0);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Закрыть редактор');
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Закрыть редактор' }).click();

    const uiNewsSlug = `ui-news-${runId}`;
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
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
    await newsForm.getByLabel('Адрес страницы').fill(uiNewsSlug);
    await newsForm
      .getByLabel('Краткое описание')
      .fill('Проверка inline публикации новости.');
    await newsForm
      .getByLabel('Полный текст Markdown')
      .fill(
        '## Проверка\nНовая страница должна открыться сразу после публикации.',
      );
    await newsForm
      .getByLabel('URL изображения')
      .fill('/assets/news/city-update.webp');
    await newsForm.getByLabel('Теги через запятую').fill('ui, публикация');
    await newsForm.getByRole('button', { name: 'Опубликовать' }).click();
    await expect(page).toHaveURL(new RegExp(`/#/news/${uiNewsSlug}$`));
    await expect(
      page.getByRole('heading', { name: `UI публикация ${runId}` }),
    ).toBeVisible();
    await expect(
      page
        .locator('.editorial-body')
        .getByText('Новая страница должна открыться сразу после публикации.', {
          exact: true,
        }),
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
    await threadForm.getByLabel('Адрес страницы').fill(uiThreadSlug);
    await threadForm
      .getByLabel('Краткое описание')
      .fill('Проверка публикации комьюнити-треда.');
    await threadForm
      .getByLabel('Текст треда')
      .fill(
        '## Обсуждение\nТред должен открыть отдельную страницу после публикации.',
      );
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
  await expect(
    page.getByRole('heading', { name: 'Вход в NTE Meta' }),
  ).toBeVisible();
});

test('owner отменяет предупреждение пользователю без зависшей модалки', async ({
  page,
}) => {
  const moderatedCommentBody = `Комментарий для warning cancel ${runId}`;
  const comment = await owner.post('/api/comments', {
    data: {
      targetType: 'site',
      targetId: 'community',
      body: moderatedCommentBody,
    },
  });
  expect(comment.status()).toBe(201);

  await page.goto('/#/profile');
  await page.getByLabel('Логин').fill(ownerUsername);
  await page.getByLabel('Пароль').fill(ownerPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(
    page.getByRole('heading', { name: 'Профиль', level: 1 }),
  ).toBeVisible();

  await page.goto('/#/admin/comments');
  await expect(
    page.getByRole('heading', { name: 'Модерация комментариев' }),
  ).toBeVisible();
  const commentCard = page
    .locator('.comment-card')
    .filter({ hasText: moderatedCommentBody });
  await expect(commentCard).toBeVisible({ timeout: 15_000 });
  await commentCard.getByRole('button', { name: 'Предупредить' }).click();
  const warningDialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Предупреждение пользователю' }),
  });
  await expect(warningDialog).toBeVisible();
  await warningDialog
    .getByLabel('Причина')
    .fill('Проверяем, что отмена предупреждения закрывает окно.');
  await warningDialog.getByRole('button', { name: 'Отменить' }).click();
  await expect(warningDialog).toBeHidden();

  await commentCard.getByRole('button', { name: 'Предупредить' }).click();
  const reopenedWarningDialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Предупреждение пользователю' }),
  });
  await expect(reopenedWarningDialog.getByLabel('Причина')).toHaveValue('');
  await reopenedWarningDialog.getByRole('button', { name: 'Отменить' }).click();
});

test('owner создаёт персонажа inline и открывает созданную страницу', async ({
  page,
}) => {
    const uiCharacterSlug = `ui-character-${runId}`;
    const uiCharacterName = `UI персонаж ${runId}`;
    const uiCharacterGuideSlug = `ui-character-guide-${runId}`;
    await page.goto('/#/profile');
    await page.getByLabel('Логин').fill(ownerUsername);
    await page.getByLabel('Пароль').fill(ownerPassword);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(
      page.getByRole('heading', { name: 'Профиль', level: 1 }),
    ).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Персонажи', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Персонажи Neverness to Everness' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Добавить персонажа' }).click();
    await expect(
      page.getByRole('heading', { name: 'Добавить персонажа', level: 1 }),
    ).toBeVisible();

    const characterDialog = page.locator('dialog[open]').filter({
      has: page.getByRole('heading', { name: 'Добавить персонажа', level: 1 }),
    });
    await expect(
      characterDialog.getByRole('button', {
        name: 'Найти базовую информацию',
      }),
    ).toBeVisible();
    const mainInfo = characterDialog.locator('details.editor-section').filter({
      hasText: 'Основная информация',
    });
    await mainInfo.getByLabel('Имя на русском').fill(uiCharacterName);
    await mainInfo.getByLabel('Оригинальное имя').fill('UI Character');
    await mainInfo.getByLabel('Адрес страницы').fill(uiCharacterSlug);
    await mainInfo.getByLabel('Фракция').fill('Редакционный тест');
    await mainInfo.getByLabel('Тип дуги').fill('Тестовая дуга');
await mainInfo.getByLabel('Атрибут').fill('Тест');
await mainInfo.getByLabel('Основная роль').fill('DD');
await mainInfo.getByLabel('Роли в отряде, через запятую').fill('DD, тест');
await expect(
  mainInfo.getByText('Тир персонажа редактируется в разделе «Тир-листы».'),
).toBeVisible();
await mainInfo
.getByLabel('URL иконки')
      .fill('/assets/characters/Hotori.webp');
    await mainInfo
      .getByLabel('URL splash art')
      .fill('/assets/characters/Hotori.webp');
    await characterDialog
      .getByRole('textbox', { name: 'Биография', exact: true })
      .fill(
        '## Биография\nПерсонаж создан автотестом без выдуманной игровой меты.',
      );
    await mainInfo.getByLabel('Теги, через запятую').fill('ui, персонаж');
    await characterDialog.getByRole('button', { name: 'Опубликовать' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/#/characters/${uiCharacterSlug}$`),
    );
    await expect(
      page.getByRole('heading', { name: uiCharacterName, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Создать гайд' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Создать гайд' }).click();
    const guideDialog = page.locator('dialog[open]').filter({
      has: page.getByRole('heading', {
        name: `Создать гайд: ${uiCharacterName}`,
        level: 1,
      }),
    });
    const guideCreateForm = guideDialog.locator('form.entity-form');
    await expect(guideCreateForm.getByLabel('Персонаж')).not.toHaveValue('');
    await expect(guideCreateForm.getByLabel('Заголовок')).toHaveValue(
      `Гайд: ${uiCharacterName}`,
    );
    await guideCreateForm
      .getByLabel('Адрес страницы')
      .fill(uiCharacterGuideSlug);
    await guideCreateForm
      .getByLabel('Краткое описание')
      .fill(
        'Гайд создан со страницы персонажа и должен открыть detail-страницу.',
      );
    await guideCreateForm.getByLabel('Патч').fill('ui-test');
    await guideCreateForm
      .getByRole('button', { name: 'Создать черновик' })
      .click();
    await expect(
      guideDialog.getByRole('heading', { name: `Гайд: ${uiCharacterName}` }),
    ).toBeVisible();
    await guideDialog
      .locator('.guide-meta-fields')
      .getByLabel('Статус')
      .selectOption('published');
    await guideDialog
      .getByRole('button', { name: 'Сохранить параметры гайда' })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/#/guides/${uiCharacterGuideSlug}$`),
    );
    await expect(
      page.getByRole('heading', { name: uiCharacterName, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /О персонаже/ })).toBeVisible();
  });

  test('owner публикует новость inline и открывает созданную страницу', async ({
    page,
  }) => {
    const uiNewsSlug = `ui-news-detail-${runId}`;
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
    await page.getByRole('button', { name: 'Добавить новость' }).click();
    await expect(
      page.getByRole('heading', { name: 'Добавить новость', level: 1 }),
    ).toBeVisible();

    const newsDialog = page.locator('dialog[open]').filter({
      has: page.getByRole('heading', { name: 'Добавить новость', level: 1 }),
    });
    const newsForm = newsDialog.locator('.cms-editor');
    await newsForm.getByLabel('Заголовок').fill(`UI новость detail ${runId}`);
    await newsForm.getByLabel('Адрес страницы').fill(uiNewsSlug);
    await newsForm
      .getByLabel('Краткое описание')
      .fill('Проверка inline публикации новости.');
    await newsForm
      .getByLabel('Полный текст Markdown')
      .fill(
        '## Проверка\nНовость должна открыть отдельную страницу после сохранения.',
      );
    await newsForm.getByLabel('Автор').fill('NTE Meta');
    await newsForm.getByLabel('Название источника').fill('Редакционный тест');
    await newsForm
      .getByLabel('Ссылка на источник')
      .fill('https://example.com/news');
    await newsForm
      .getByLabel('URL изображения')
      .fill('/assets/characters/Hotori.webp');
    await newsForm.getByLabel('Теги через запятую').fill('ui, новость');
    await newsForm.getByLabel('Статус').selectOption('published');
    await newsForm.getByRole('button', { name: 'Опубликовать' }).click();

    await expect(page).toHaveURL(new RegExp(`/#/news/${uiNewsSlug}$`));
    await expect(
      page.getByRole('heading', { name: `UI новость detail ${runId}` }),
    ).toBeVisible();
    await expect(
      page
        .locator('.editorial-body')
        .getByText(
          'Новость должна открыть отдельную страницу после сохранения.',
          {
            exact: true,
          },
        ),
    ).toBeVisible();
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
    await leakForm.getByLabel('Адрес страницы').fill(uiLeakSlug);
    await leakForm
      .getByLabel('Краткое описание')
      .fill('Проверка inline публикации слива.');
    await leakForm
      .getByLabel('Полный текст / репост Markdown')
      .fill(
        '## Проверка\nСлив должен открыть отдельную страницу после сохранения.',
      );
    await leakForm
      .getByLabel('Оригинальный источник')
      .fill('Редакционный тест');
    await leakForm
      .getByLabel('Ссылка на источник')
      .fill('https://example.com/source');
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
      page
        .locator('.editorial-body')
        .getByText('Слив должен открыть отдельную страницу после сохранения.', {
          exact: true,
        }),
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
