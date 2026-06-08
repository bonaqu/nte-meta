import {
  expect,
  request as createRequestContext,
  test,
} from '@playwright/test';

const apiBase = 'http://127.0.0.1:8788';

test('auth, comments and reactions work through Worker and D1', async ({
  request,
}) => {
  const username = `pw_${Date.now()}_${Math.round(Math.random() * 10000)}`;
  const password = 'Playwright-Strong-42!';

  const guidesResponse = await request.get(`${apiBase}/api/guides`);
  expect(guidesResponse.ok()).toBeTruthy();
  const guidesPayload = await guidesResponse.json();
  expect(guidesPayload.data.length).toBeGreaterThan(0);

  const registerResponse = await request.post(`${apiBase}/api/auth/register`, {
    data: { username, password, confirmPassword: password },
  });
  expect(registerResponse.status()).toBe(201);
  await expect(registerResponse.json()).resolves.toMatchObject({
    data: { user: { role: 'owner' } },
  });

  const meResponse = await request.get(`${apiBase}/api/auth/me`);
  expect(meResponse.ok()).toBeTruthy();
  await expect(meResponse.json()).resolves.toMatchObject({
    data: { username },
  });

  const profileResponse = await request.patch(`${apiBase}/api/auth/profile`, {
    data: { displayName: 'Playwright Editor' },
  });
  expect(profileResponse.ok()).toBeTruthy();
  await expect(profileResponse.json()).resolves.toMatchObject({
    data: { displayName: 'Playwright Editor' },
  });

  const commentResponse = await request.post(`${apiBase}/api/comments`, {
    data: {
      targetType: 'guide',
      targetId: 'guide-hotori',
      body: `Комментарий Playwright ${username}`,
    },
  });
  expect(commentResponse.status()).toBe(201);
  const commentPayload = await commentResponse.json();
  expect(commentPayload).toMatchObject({
    data: { author: 'Playwright Editor' },
  });
  const commentId = commentPayload.data.id;

  const replyResponse = await request.post(`${apiBase}/api/comments`, {
    data: {
      targetType: 'guide',
      targetId: 'guide-hotori',
      parentId: commentId,
      body: `Ответ Playwright ${username}`,
    },
  });
  expect(replyResponse.status()).toBe(201);
  await expect(replyResponse.json()).resolves.toMatchObject({
    data: { parentId: commentId },
  });

  const editResponse = await request.patch(
    `${apiBase}/api/comments/${commentId}`,
    {
      data: { body: `Обновленный комментарий ${username}` },
    },
  );
  expect(editResponse.ok()).toBeTruthy();

  const commentReactionResponse = await request.post(
    `${apiBase}/api/reactions`,
    {
      data: {
        targetType: 'comment',
        targetId: commentId,
        reactionType: 'useful',
      },
    },
  );
  expect(commentReactionResponse.ok()).toBeTruthy();
  await expect(commentReactionResponse.json()).resolves.toMatchObject({
    data: { useful: 1 },
  });

  const popularComments = await request.get(
    `${apiBase}/api/comments?targetType=guide&targetId=guide-hotori&sort=popular`,
  );
  expect(popularComments.ok()).toBeTruthy();
  const popularPayload = await popularComments.json();
  expect(
    popularPayload.data.some(
      (comment: { id: string; score: number }) =>
        comment.id === commentId && comment.score === 1,
    ),
  ).toBeTruthy();

  const moderationResponse = await request.get(`${apiBase}/api/comments`);
  expect(moderationResponse.ok()).toBeTruthy();
  const moderationPayload = await moderationResponse.json();
  expect(
    moderationPayload.data.some(
      (comment: { id: string }) => comment.id === commentId,
    ),
  ).toBeTruthy();

  const reactionResponse = await request.post(`${apiBase}/api/reactions`, {
    data: {
      targetType: 'guide',
      targetId: 'guide-hotori',
      reactionType: 'useful',
    },
  });
  expect(reactionResponse.ok()).toBeTruthy();
  const reactionPayload = await reactionResponse.json();
  expect(reactionPayload.data.useful).toBeGreaterThanOrEqual(1);

  const guideSlug = `playwright-guide-${Date.now()}`;
  const guideResponse = await request.post(`${apiBase}/api/guides`, {
    data: {
      slug: guideSlug,
      characterId: 'hotori',
      title: 'Тестовый гайд Playwright',
      summary: 'Проверка CRUD гайда и вложенных секций.',
      status: 'draft',
      patchVersion: 'test',
      sections: [
        {
          title: 'Тестовая секция',
          type: 'custom',
          content: 'Контент тестовой секции.',
        },
      ],
    },
  });
  expect(guideResponse.status()).toBe(201);
  const guideId = (await guideResponse.json()).data.id;

  const savedGuideResponse = await request.get(
    `${apiBase}/api/guides/${guideId}`,
  );
  expect(savedGuideResponse.ok()).toBeTruthy();
  await expect(savedGuideResponse.json()).resolves.toMatchObject({
    data: {
      slug: guideSlug,
      status: 'draft',
      sections: [{ title: 'Тестовая секция' }],
    },
  });

  expect(
    (await request.delete(`${apiBase}/api/guides/${guideId}`)).ok(),
  ).toBeTruthy();

  const memberContext = await createRequestContext.newContext();
  const memberUsername = `${username}_member`;
  const memberResponse = await memberContext.post(
    `${apiBase}/api/auth/register`,
    {
      data: {
        username: memberUsername,
        password,
        confirmPassword: password,
      },
    },
  );
  expect(memberResponse.status()).toBe(201);
  const memberId = (await memberResponse.json()).data.user.id;
  await memberContext.dispose();

  const usersResponse = await request.get(`${apiBase}/api/users`);
  expect(usersResponse.ok()).toBeTruthy();
  expect(
    (await usersResponse.json()).data.some(
      (user: { id: string; username: string }) =>
        user.id === memberId && user.username === memberUsername,
    ),
  ).toBeTruthy();

  const roleResponse = await request.patch(
    `${apiBase}/api/users/${memberId}/role`,
    { data: { role: 'editor' } },
  );
  expect(roleResponse.ok()).toBeTruthy();

  const settingsResponse = await request.patch(`${apiBase}/api/settings`, {
    data: {
      site: {
        title: 'NTE Meta',
        language: 'ru',
        registrationEnabled: false,
        leaksRequireApproval: false,
      },
      seo: {
        canonical: 'https://bonaqu.github.io/nte-meta/',
        description:
          'Русскоязычный meta-hub по Neverness to Everness с глубокими гайдами и тир-листами.',
      },
    },
  });
  expect(settingsResponse.ok()).toBeTruthy();

  const savedSettings = await request.get(`${apiBase}/api/settings`);
  expect(savedSettings.ok()).toBeTruthy();
  await expect(savedSettings.json()).resolves.toMatchObject({
    data: {
      site: {
        registrationEnabled: false,
        leaksRequireApproval: true,
      },
    },
  });

  const blockedContext = await createRequestContext.newContext();
  const blockedRegistration = await blockedContext.post(
    `${apiBase}/api/auth/register`,
    {
      data: {
        username: `${username}_blocked`,
        password,
        confirmPassword: password,
      },
    },
  );
  expect(blockedRegistration.status()).toBe(403);
  await blockedContext.dispose();

  expect(
    (
      await request.patch(`${apiBase}/api/settings`, {
        data: {
          site: {
            title: 'NTE Meta',
            language: 'ru',
            registrationEnabled: true,
            leaksRequireApproval: true,
          },
          seo: {
            canonical: 'https://bonaqu.github.io/nte-meta/',
            description:
              'Русскоязычный meta-hub по Neverness to Everness с глубокими гайдами и тир-листами.',
          },
        },
      })
    ).ok(),
  ).toBeTruthy();

  expect(
    (await request.delete(`${apiBase}/api/users/${memberId}`)).ok(),
  ).toBeTruthy();

  const nextPassword = 'Playwright-New-Strong-84!';
  const passwordResponse = await request.post(
    `${apiBase}/api/auth/change-password`,
    {
      data: {
        currentPassword: password,
        nextPassword,
        nextConfirm: nextPassword,
      },
    },
  );
  expect(passwordResponse.ok()).toBeTruthy();
  expect((await request.get(`${apiBase}/api/auth/me`)).status()).toBe(401);

  const loginResponse = await request.post(`${apiBase}/api/auth/login`, {
    data: { username, password: nextPassword },
  });
  expect(loginResponse.ok()).toBeTruthy();

  const logoutResponse = await request.post(`${apiBase}/api/auth/logout`);
  expect(logoutResponse.ok()).toBeTruthy();
  expect((await request.get(`${apiBase}/api/auth/me`)).status()).toBe(401);
});
