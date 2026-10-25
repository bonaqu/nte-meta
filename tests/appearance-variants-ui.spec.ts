import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile } from 'node:fs/promises';
import type { Character, CharacterAppearanceVariant } from '../src/types';

// Chromium root scrolling rounds to device pixels. A fractional section edge
// can land exactly half a CSS pixel from the requested 150px margin.
function expectHeadingAligned(top: number) {
  expect(Math.abs(top - 150)).toBeLessThanOrEqual(0.5);
}

async function owner(page: Page) {
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
}

test('варианты гардероба и озвучки переключаются отдельно от общих механик, реплики по шесть', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data as Character[];
  const variants = JSON.parse(
    await readFile('tests/fixtures/appearance-variants.json', 'utf8'),
  ) as CharacterAppearanceVariant[];
  const zero = characters.find((row) => row.id === 'esper-zero')!;
  zero.profile = {
    ...zero.profile!,
    skins: [],
    voiceLines: [],
    appearanceVariants: variants,
    friendship: [
      {
        level: 1,
        rewardName: '',
        rewardIconUrl: '',
        rewards: [],
        description:
          'Для достижения уровня 1 требуется 100 очков симпатии. Награда за уровень в проверенном источнике не указана.',
      },
    ],
  };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cpu = await page.context().newCDPSession(page);
  await cpu.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/characters/esper-zero');
    await page.reload();
    await expect(
      page
        .locator('#character-friendship')
        .getByRole('heading', { name: 'Уровни дружбы', exact: true }),
    ).toBeAttached();
    await expect(page.locator('#character-friendship')).toContainText(
      '100 очков симпатии',
    );
    await expect(page.locator('#character-friendship')).not.toContainText(
      'в проверенном источнике',
    );
    const navigation = page.getByRole('navigation', {
      name: 'Разделы персонажа',
    });
    await navigation
      .getByRole('button', { name: 'Способности', exact: true })
      .click();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expectHeadingAligned(
      (await page.locator('#character-abilities').boundingBox())!.y,
    );
    const skills = page.locator('#character-abilities');
    const skillVariant = skills.getByRole('group', {
      name: 'Вариант способностей',
    });
    for (const [name, damage] of [
      ['Женский вариант', '19.2 %'],
      ['Мужской вариант', '23 %'],
    ]) {
      await skillVariant.getByRole('button', { name, exact: true }).click();
      await skills
        .getByRole('group', { name: 'Выбор навыка' })
        .getByRole('button', { name: 'Базовая атака Оценка', exact: true })
        .click();
      const melee = skills.locator('.ability-card').filter({
        has: page.getByText('Оценка', { exact: true }),
      });
      if ((await melee.getAttribute('open')) === null)
        await melee.locator('summary').click();
      await melee.getByRole('tab', { name: /^Атрибуты/ }).click();
      await expect(melee.locator('.ability-attribute-grid')).toContainText(
        damage,
      );
    }
    await navigation
      .getByRole('button', { name: 'Гардероб', exact: true })
      .click();
    const wardrobe = page.locator('#character-wardrobe');
    // Verify the painted position after two frames, not the end of a smooth animation.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expectHeadingAligned((await wardrobe.boundingBox())!.y);
    const picker = wardrobe.getByRole('group', { name: 'Вариант гардероба' });
    await expect(
      picker.getByRole('button', { name: 'Мужской вариант', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      (await wardrobe.locator('.skin-media').boundingBox())!.height,
    ).toBeGreaterThanOrEqual(350);
    await picker
      .getByRole('button', { name: 'Женский вариант', exact: true })
      .click();
    await expect(wardrobe.locator('.skin-media img')).toHaveAttribute(
      'src',
      new RegExp(variants[1].skins[0].imageUrl.split('/').at(-1)!),
    );
    await navigation
      .getByRole('button', { name: 'Озвучка', exact: true })
      .click();
    const voices = page.locator('#character-voice');
    await expect(
      voices.getByText(
        'В текущем снимке нет привязанных реплик для этого варианта.',
        { exact: true },
      ),
    ).toBeVisible();
    const voicePicker = voices.getByRole('group', { name: 'Вариант озвучки' });
    await voicePicker
      .getByRole('button', { name: 'Мужской вариант', exact: true })
      .click();
    await expect(
      picker.getByRole('button', { name: 'Мужской вариант', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(voices.locator('.voice-line-list article')).toHaveCount(6);
    await voices
      .getByRole('group', { name: 'Страницы реплик' })
      .getByRole('button', { name: /вперёд/ })
      .click();
    await expect(voices.locator('.voice-line-list article')).toHaveCount(1);
    await navigation
      .getByRole('button', { name: 'Способности', exact: true })
      .click();
    await navigation
      .getByRole('button', { name: 'Озвучка', exact: true })
      .click();
    await expect(voices.locator('.voice-line-list article')).toHaveCount(1);
    await voices.getByRole('tab', { name: /Английский/ }).click();
    await expect(voices.locator('.voice-line-list article')).toHaveCount(6);
    const upload = page.locator('.comment-form .image-upload');
    await upload.scrollIntoViewIfNeeded();
    expect((await upload.boundingBox())!.height).toBeLessThanOrEqual(46);
    expect(
      (await upload.locator('.image-upload__button').boundingBox())!.height,
    ).toBe(width >= 900 ? 34 : 44);
    if (width === 360 || width === 1440) {
      const a11y = await new AxeBuilder({ page })
        .include('#main-content')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(a11y.violations).toEqual([]);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBeTruthy();
    await page.goto('/#/characters');
    await expect(page.locator('.character-grid .character-card')).toHaveCount(
      characters.length,
    );
    const columns = await page
      .locator('.character-grid .character-card')
      .evaluateAll((cards) => {
        const top = cards[0].getBoundingClientRect().top;
        return cards.filter(
          (card) => Math.abs(card.getBoundingClientRect().top - top) < 2,
        ).length;
      });
    expect(columns).toBe(
      width === 360 ? 1 : width === 768 ? 2 : width === 1024 ? 3 : 4,
    );
  }
  await cpu.detach();
  expect(errors).toEqual([]);
});

test('редактор сохраняет вариант, изображение и относительный адрес игрового аудио', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await owner(page);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data as Character[];
  const variants = JSON.parse(
    await readFile('tests/fixtures/appearance-variants.json', 'utf8'),
  ) as CharacterAppearanceVariant[];
  const zero = characters.find((row) => row.id === 'esper-zero')!;
  zero.profile = {
    ...zero.profile!,
    skins: [],
    voiceLines: [variants[0].voiceLines[0]],
    appearanceVariants: variants,
  };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  let saved: Character | undefined;
  await page.route('**/api/characters/esper-zero', (route) => {
    const body = route.request().postDataJSON();
    saved = { ...zero, ...body };
    Object.assign(zero, saved);
    return route.fulfill({
      json: { data: { id: zero.id, slug: zero.slug, status: 'published' } },
    });
  });
  let uploaded: { context: string } | undefined;
  const imageUrl = 'http://127.0.0.1:8788/api/media/uploads/' + 'b'.repeat(64);
  await page.route('**/api/media/uploads', (route) => {
    uploaded = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { data: { url: imageUrl } } });
  });
  await page.route('**/api/media/uploads/*', (route) =>
    route.fulfill({
      path: 'public/assets/characters/akane.webp',
      contentType: 'image/webp',
    }),
  );
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/#/characters/esper-zero');
  await page
    .getByRole('button', { name: 'Редактировать персонажа', exact: true })
    .click();
  const dialog = page.locator('dialog[open]');
  await dialog
    .locator('summary')
    .filter({ hasText: /^Варианты персонажа$/ })
    .click();
  const editor = dialog.getByRole('region', {
    name: 'Варианты персонажа',
  });
  await editor
    .getByRole('group', { name: 'Редактируемый вариант' })
    .getByRole('button', { name: 'Женский вариант', exact: true })
    .click();
  await editor
    .getByLabel('Название варианта', { exact: true })
    .fill('Женский вариант — правка');
  const attributes = editor.getByLabel('Атрибуты способности варианта', {
    exact: true,
  });
  await attributes.fill('Параметр — 10');
  await attributes.press('End');
  await attributes.press('Enter');
  await attributes.pressSequentially('Второй параметр — 20');
  await expect(attributes).toHaveValue('Параметр — 10\nВторой параметр — 20');
  await editor
    .getByLabel('Название образа', { exact: true })
    .fill('Проверочный образ');
  await editor
    .getByRole('region', { name: 'Образы выбранного варианта' })
    .locator('input[type=file]')
    .setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('broken image'),
    });
  await expect(
    editor.getByText(
      'Не удалось прочитать изображение. Выберите другой PNG, JPEG или WebP.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(uploaded).toBeUndefined();
  await editor
    .getByRole('region', { name: 'Образы выбранного варианта' })
    .locator('input[type=file]')
    .setInputFiles({
      name: 'skin.webp',
      mimeType: 'image/webp',
      buffer: await readFile('public/assets/characters/akane.webp'),
    });
  await expect
    .poll(() => uploaded?.context)
    .toContain('esper-zero/variants/1051/skins');
  await expect(
    editor.getByLabel('Изображение образа', { exact: true }),
  ).toHaveValue(imageUrl);
  await dialog
    .locator('summary')
    .filter({ hasText: /^Озвучка персонажа$/ })
    .click();
  const audio = dialog.getByLabel(/^URL аудио-файла/);
  await expect(audio).toHaveValue(variants[0].voiceLines[0].audioUrl);
  expect(
    await audio.evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBeTruthy();
  await dialog
    .getByRole('button', { name: 'Опубликовать', exact: true })
    .click();
  await expect
    .poll(() => saved?.profile?.appearanceVariants?.[1].skins[0].name)
    .toBe('Проверочный образ');
  expect(
    saved!.profile!.appearanceVariants![1].abilities![0].attributes?.map(
      (row) => [row.label, row.value],
    ),
  ).toEqual([
    ['Параметр', '10'],
    ['Второй параметр', '20'],
  ]);
  expect(saved!.profile!.appearanceVariants![1].skins[0].imageUrl).toBe(
    imageUrl,
  );
  expect(saved!.profile!.voiceLines[0].audioUrl).toBe(
    variants[0].voiceLines[0].audioUrl,
  );
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Редактировать персонажа', exact: true })
    .click();
  const variantSummary = page
    .locator('dialog[open] summary')
    .filter({ hasText: /^Варианты персонажа$/ });
  if ((await variantSummary.locator('..').getAttribute('open')) === null)
    await variantSummary.click();
  const reopened = page
    .locator('dialog[open]')
    .getByRole('region', { name: 'Варианты персонажа' });
  await reopened
    .getByRole('group', { name: 'Редактируемый вариант' })
    .getByRole('button', { name: 'Женский вариант — правка', exact: true })
    .click();
  await expect(
    reopened.getByLabel('Название образа', { exact: true }),
  ).toHaveValue('Проверочный образ');
  await expect(
    reopened.getByLabel('Изображение образа', { exact: true }),
  ).toHaveValue(imageUrl);
  await expect(
    reopened.getByLabel('Атрибуты способности варианта', { exact: true }),
  ).toHaveValue('Параметр — 10\nВторой параметр — 20');
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await reopened.scrollIntoViewIfNeeded();
    expect(
      await page
        .locator('dialog[open]')
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBeTruthy();
  }
  const a11y = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
});

test('опубликованные профили: калькулятор, быстрые переходы, гардероб Зеро и шесть реплик', async ({
  page,
  request,
}, testInfo) => {
  const base = process.env.NTE_PROFILE_FOLLOWUP_URL;
  test.skip(
    !base,
    'Live verification is opt-in after Worker and Pages deployment.',
  );
  test.setTimeout(180000);
  const api = 'https://nte-meta-api.bonaqu.workers.dev/api/';
  const characters = (
    await (
      await request.get(api + 'characters', {
        headers: { Origin: 'https://bonaqu.github.io' },
      })
    ).json()
  ).data as Character[];
  const zero = characters.find((row) => row.id === 'esper-zero')!;
  expect(
    zero.profile?.appearanceVariants?.map((row) => [
      row.id,
      row.skins.length,
      row.voiceLines.length,
    ]),
  ).toEqual([
    ['1046', 11, 109],
    ['1051', 11, 0],
  ]);
  const errors: string[] = [];
  const networkErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      /(?:game-assets|game-audio|api\/)/.test(response.url())
    )
      networkErrors.push(`${response.status()} ${response.url()}`);
  });
  const positions: Array<{ width: number; section: string; top: number }> = [];
  const review = process.env.NTE_FOLLOWUP_REVIEW_DIR;
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '#/characters/adler');
    for (const [name, id] of [
      ['Способности', 'character-abilities'],
      ['Дружба', 'character-friendship'],
      ['Гардероб', 'character-wardrobe'],
    ]) {
      await page
        .getByRole('navigation', { name: 'Разделы персонажа' })
        .getByRole('button', { name, exact: true })
        .click();
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const top = (await page.locator('#' + id).boundingBox())!.y;
      positions.push({ width, section: id, top });
      expectHeadingAligned(top);
    }
    expect(
      (await page.locator('.skin-media').boundingBox())!.height,
    ).toBeGreaterThanOrEqual(350);
    if (review && (width === 360 || width === 1440))
      await page
        .locator('.wardrobe-gallery')
        .screenshot({ path: `${review}/wardrobe-live-${width}.png` });
    await page.locator('.skin-media').click();
    await expect(page.locator('.skin-lightbox[open]')).toBeVisible({
      timeout: 1000,
    });
    await page
      .getByRole('button', { name: 'Закрыть полноразмерное изображение' })
      .click();
    await page.getByRole('button', { name: 'Прокачка', exact: true }).click();
    const calculator = page.locator('.progression-calculator');
    await calculator.locator('summary').first().click();
    await expect(
      calculator.getByRole('button', { name: 'Персонаж Адлер', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      calculator.getByRole('button', { name: /^Дуга · Гибридный/ }),
    ).toBeEnabled();
    await expect(calculator.locator('.experience-picker img')).toHaveCount(3);
    const targetLevel = calculator.getByRole('spinbutton', {
      name: 'До уровня',
      exact: true,
    });
    await calculator
      .getByRole('button', { name: 'Уменьшить: До уровня', exact: true })
      .click();
    await expect(targetLevel).toHaveValue('79');
    await calculator
      .getByRole('button', { name: 'Максимум: До уровня', exact: true })
      .click();
    await expect(targetLevel).toHaveValue('80');
    if (review && (width === 360 || width === 1440))
      await page.screenshot({ path: `${review}/calculator-live-${width}.png` });
    await calculator.locator('summary').first().click();
    await page.getByRole('button', { name: 'Дружба', exact: true }).click();
    const rewards = page.locator('.friendship-browser');
    await expect(rewards.locator('.friendship-levels button')).toHaveCount(10);
    await rewards.getByRole('button', { name: /^Ур\.\s*10$/ }).click();
    await expect(
      rewards.getByRole('heading', { name: 'Уровень симпатии 10' }),
    ).toBeVisible();
    await expect(rewards.locator('.page-stepper')).toHaveCount(0);
    if (review && width === 1440)
      await rewards.screenshot({ path: `${review}/friendship-live.png` });
    await rewards
      .getByRole('button', {
        name: 'Подробнее: Проигрыватель «Лотус C198»',
        exact: true,
      })
      .hover();
    const lotus = page.getByRole('dialog', {
      name: 'Проигрыватель «Лотус C198»',
      exact: true,
    });
    await expect(lotus).toContainText('повысить уровень комфорта');
    if (review && (width === 360 || width === 1440))
      await page.screenshot({ path: `${review}/lotus-live-${width}.png` });
    await lotus
      .getByRole('button', { name: 'Закрыть описание предмета' })
      .click();
    const voice = page.locator('#character-voice');
    for (const name of [/Английский/, /Японский/]) {
      await voice.getByRole('tab', { name }).click();
      await expect(voice.locator('.voice-line-list article')).toHaveCount(6);
    }
    const upload = page.locator('.comment-form .image-upload__button');
    expect((await upload.boundingBox())!.height).toBe(width >= 900 ? 34 : 44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.goto(base + '#/characters/esper-zero');
  await expect(page.locator('#character-friendship')).not.toContainText(
    'в проверенном источнике',
  );
  if (
    zero.profile!.friendship.every(
      (row) => !row.rewards?.length && !row.rewardName && !row.rewardIconUrl,
    )
  )
    await expect(
      page
        .locator('#character-friendship')
        .getByRole('heading', { name: 'Уровни дружбы', exact: true }),
    ).toBeAttached();
  await page.getByRole('button', { name: 'Способности', exact: true }).click();
  const skills = page.locator('#character-abilities');
  for (const [name, damage] of [
    ['Мужской вариант', '23 %'],
    ['Женский вариант', '19.2 %'],
  ]) {
    await skills
      .getByRole('group', { name: 'Вариант способностей' })
      .getByRole('button', { name, exact: true })
      .click();
    await skills
      .getByRole('group', { name: 'Выбор навыка' })
      .getByRole('button', { name: 'Базовая атака Оценка', exact: true })
      .click();
    const melee = skills
      .locator('.ability-card')
      .filter({ has: page.getByText('Оценка', { exact: true }) });
    if ((await melee.getAttribute('open')) === null)
      await melee.locator('summary').click();
    await melee.getByRole('tab', { name: /^Атрибуты/ }).click();
    await expect(melee.locator('.ability-attribute-grid')).toContainText(
      damage,
    );
  }
  await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
  const wardrobe = page.locator('#character-wardrobe');
  let images = 0;
  for (const name of ['Мужской вариант', 'Женский вариант']) {
    await wardrobe
      .getByRole('group', { name: 'Вариант гардероба' })
      .getByRole('button', { name, exact: true })
      .click();
    const thumbnails = wardrobe
      .getByRole('group', { name: 'Выбор наряда' })
      .getByRole('button');
    await expect(thumbnails).toHaveCount(11);
    for (let index = 0; index < 11; index++) {
      await thumbnails.nth(index).click();
      await expect
        .poll(
          () =>
            wardrobe
              .locator('.skin-media img')
              .evaluate(
                (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
              ),
          { timeout: 15000 },
        )
        .toBe(true);
      images++;
    }
  }
  await page.getByRole('button', { name: 'Озвучка', exact: true }).click();
  const voices = page.locator('#character-voice');
  await expect(voices.locator('audio')).toHaveCount(0);
  await expect(
    voices.getByText(
      'В текущем снимке нет привязанных реплик для этого варианта.',
      { exact: true },
    ),
  ).toBeVisible();
  await voices
    .getByRole('group', { name: 'Вариант озвучки' })
    .getByRole('button', { name: 'Мужской вариант', exact: true })
    .click();
  await expect(voices.locator('audio')).toHaveCount(6);
  const duration = await voices
    .locator('audio')
    .first()
    .evaluate(async (audio: HTMLAudioElement) => {
      audio.muted = true;
      await audio.play();
      audio.pause();
      return audio.duration;
    });
  expect(duration).toBeGreaterThan(0);
  await page.goto(base + '#/characters');
  await expect(page.locator('.character-grid')).toBeVisible();
  const columns = await page
    .locator('.character-grid')
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length,
    );
  expect(columns).toBe(4);
  const report = {
    positions,
    zeroImages: images,
    zeroAudioDuration: duration,
    columns,
    errors,
    networkErrors,
  };
  await writeFile(
    process.env.NTE_FOLLOWUP_REVIEW_REPORT ||
      testInfo.outputPath('followup-live.json'),
    JSON.stringify(report, null, 2),
  );
  expect(errors).toEqual([]);
  expect(networkErrors).toEqual([]);
});

test('переход к гардеробу держит заголовок при поздней загрузке материалов и отпускает прокрутку пользователю', async ({
  page,
  request,
}) => {
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data as Character[];
  const variants = JSON.parse(
    await readFile('tests/fixtures/appearance-variants.json', 'utf8'),
  ) as CharacterAppearanceVariant[];
  const zero = characters.find((row) => row.id === 'esper-zero')!;
  zero.profile = {
    ...zero.profile!,
    skins: [],
    voiceLines: [],
    appearanceVariants: variants,
  };
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  const native = JSON.parse(
    await readFile('tests/fixtures/progression-native.json', 'utf8'),
  );
  native.costs.push({
    ...native.costs.find((row: { id: string }) => row.id === '1033'),
    id: '1046',
    name: 'Зеро',
    originalName: 'Zero',
  });
  let release = () => {};
  let requested = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/game-data/progression', async (route) => {
    requested = true;
    await gate;
    await route.fulfill({ json: { data: native } });
  });
  const cpu = await page.context().newCDPSession(page);
  await cpu.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/#/characters/esper-zero');
    await page
      .getByRole('navigation', { name: 'Разделы персонажа' })
      .getByRole('button', { name: 'Гардероб', exact: true })
      .click();
    const wardrobe = page.locator('#character-wardrobe');
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expectHeadingAligned((await wardrobe.boundingBox())!.y);
    await expect.poll(() => requested).toBe(true);
    release();
    await expect(
      page.getByRole('button', { name: 'Всего · 1–80', exact: true }),
    ).toBeAttached();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expectHeadingAligned((await wardrobe.boundingBox())!.y);
    await page.mouse.wheel(0, 200);
    await expect
      .poll(async () => Math.abs((await wardrobe.boundingBox())!.y - 150))
      .toBeGreaterThan(10);
  } finally {
    release();
    await cpu.detach();
  }
});
