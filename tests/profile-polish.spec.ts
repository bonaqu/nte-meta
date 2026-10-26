import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, access } from 'node:fs/promises';

test('иконки статов и ранее пустых материалов соответствуют игровым текстурам', async () => {
  const stats = JSON.parse(
    await readFile('src/data/native-stat-icons.json', 'utf8'),
  );
  const items = JSON.parse(
    await readFile('src/data/native-item-icons.json', 'utf8'),
  );
  expect(stats.icon_attri_baoji).toContain('ad87d2a73478180243f0');
  expect(stats.icon_attri_baojishanghai).toContain('56f87c7e7402bf44ff21');
  expect(stats.DamageUpLakshanaBase).toContain('e7404c0c82eef53a2290');
  for (const name of [
    'Первые ожидания',
    'Известная усталость',
    'Показушное платье с рукавами',
    'Черная шляпа',
  ])
    expect(items[name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')]).toMatch(
      /game-assets\/.+\.webp$/,
    );
  await Promise.all(
    [
      ...new Set([
        ...Object.values(items),
        ...Object.values(stats),
      ] as string[]),
    ].map((url) => access(`public/${url.replace('/nte-meta/', '')}`)),
  );
});

test('биография, уровни навыка, гардероб и страницы реплик работают на четырёх ширинах', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const characters = (
    await (await request.get('http://127.0.0.1:8788/api/characters')).json()
  ).data;
  const fixture = JSON.parse(
    await readFile('tests/fixtures/profile-polish.json', 'utf8'),
  );
  const legacy = JSON.parse(
    await readFile('tests/fixtures/adler-legacy-media.json', 'utf8'),
  );
  const adler = characters.find((c: { id: string }) => c.id === 'adler');
  adler.profile = {
    ...adler.profile,
    ...legacy,
    biography: fixture.biography,
    skins: fixture.skins,
    voiceLines: fixture.voiceLines,
  };
  // These rows exercise correct grouping even while the native request is in flight.
  adler.profile.materials.push({
    id: 'missing-icon',
    name: 'Первые ожидания',
    iconUrl: '',
    amount: '×2',
    source: 'Материалы навыков',
  });
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  await page.route('**/api/game-data/progression', (route) =>
    route.fulfill({
      json: {
        data: {
          costs: [
            {
              id: '1033',
              kind: 'character',
              name: 'Адлер',
              originalName: 'Adler',
              stages: [
                {
                  level: '30',
                  fromLevel: 20,
                  items_id: ['gold'],
                  amount: [25000],
                },
              ],
            },
          ],
          items: {
            gold: {
              name: 'Жук-монета',
              iconUrl: '/nte-meta/game-assets/bf9d740bc6156750e7e0.webp',
            },
          },
          characterExp: [],
          arcExp: [],
          experienceItems: [],
        },
      },
    }),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/characters/adler');
    await page.reload();
    const biography = page.locator('#character-biography');
    const toggle = biography.getByRole('button', {
      name: 'Развернуть историю',
    });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const short = await biography.innerText();
    await toggle.click();
    expect((await biography.innerText()).length).toBeGreaterThan(
      short.length + 500,
    );
    await biography.getByRole('button', { name: 'Свернуть историю' }).click();
    await page
      .getByRole('group', { name: 'Выбор навыка' })
      .getByRole('button')
      .filter({
        has: page.getByText(legacy.abilities[0].name, { exact: true }),
      })
      .click();
    const skill = page.locator('.ability-card').first();
    await skill.getByRole('tab', { name: /Атрибуты/ }).click();
    const level = skill.getByRole('group', { name: /Уровень навыка/ });
    await expect(level.getByRole('button')).toHaveCount(13);
    await expect(
      level.getByRole('button', { name: 'Ур. 1', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(skill.locator('select')).toHaveCount(0);
    await level.getByRole('button', { name: 'Ур. 13', exact: true }).click();
    await expect(
      level.getByRole('button', { name: 'Ур. 13', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(skill.locator('.ability-attribute-grid')).toContainText(
      '176.3',
    );
    await level.getByRole('button', { name: 'Ур. 12', exact: true }).click();
    await expect(skill.locator('.ability-attribute-grid')).toContainText(
      '163.2',
    );
    expect(
      await page
        .locator('.awakening-path')
        .evaluate((node) => getComputedStyle(node, '::before').content),
    ).toBe('none');
    const progression = page.locator('#character-progression');
    await progression.scrollIntoViewIfNeeded();
    await expect(
      page
        .getByRole('navigation', { name: 'Разделы персонажа' })
        .getByRole('button', { name: 'Прокачка', exact: true }),
    ).toHaveAttribute('aria-current', 'location');
    await expect(
      progression.getByRole('heading', { name: 'Возвышение персонажа' }),
    ).toBeVisible();
    await expect(
      progression.getByRole('heading', { name: 'Прокачка боевых навыков' }),
    ).toBeVisible();
    await expect(
      progression.getByText('Любимые подарки', { exact: true }),
    ).toHaveCount(0);
    const friendship = page.locator('#character-friendship');
    await expect(
      friendship.getByRole('heading', { name: 'Любимые подарки' }),
    ).toBeVisible();
    await expect(friendship.locator('.gift-grid article')).toHaveCount(9);
    const wardrobe = page.locator('#character-wardrobe');
    await wardrobe.scrollIntoViewIfNeeded();
    await expect(wardrobe.locator('.page-stepper')).toHaveCount(0);
    const outfits = wardrobe
      .getByRole('group', { name: 'Выбор наряда' })
      .getByRole('button');
    const wardrobeHeight = (await wardrobe
      .locator('.wardrobe-gallery__stage')
      .boundingBox())!.height;
    await outfits.last().click();
    expect(
      (await wardrobe.locator('.wardrobe-gallery__stage').boundingBox())!
        .height,
    ).toBe(wardrobeHeight);
    await expect(wardrobe.getByText('Наряд', { exact: true })).toHaveCount(0);
    await expect(outfits.last()).toHaveAttribute('aria-pressed', 'true');
    await wardrobe.getByRole('button', { name: /Открыть изображение/ }).click();
    await expect(page.locator('.skin-lightbox[open]')).toBeVisible({
      timeout: 1000,
    });
    await expect(page.locator('.skin-lightbox .page-stepper')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Закрыть полноразмерное изображение' })
      .click();
    const voice = page.locator('#character-voice');
    await voice.getByRole('tab', { name: /Японский/ }).click();
    const pages = voice.getByRole('group', { name: 'Страницы реплик' });
    await expect(voice.locator('.voice-line-list article')).toHaveCount(5);
    const firstVoiceHeight = (await voice
      .locator('.voice-line-list')
      .boundingBox())!.height;
    await pages.getByRole('button', { name: /вперёд/ }).click();
    await expect(voice.locator('.voice-line-list article')).toHaveCount(4);
    expect(
      (await voice.locator('.voice-line-list').boundingBox())!.height,
    ).toBe(firstVoiceHeight);
    await expect(pages.getByRole('button', { name: /вперёд/ })).toBeDisabled();
    await voice.getByRole('tab', { name: /Английский/ }).click();
    await expect(voice.locator('.voice-line-list article')).toHaveCount(5);
    await expect(pages.getByRole('button', { name: /назад/ })).toBeDisabled();
    const upload = page.locator('.comment-form .image-upload__button');
    expect((await upload.boundingBox())!.height).toBe(width >= 900 ? 34 : 44);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBeTruthy();
    if (width === 360 || width === 1440) {
      await wardrobe.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`wardrobe-${width}.png`),
      });
    }
  }
  const a11y = await new AxeBuilder({ page })
    .include('#main-content')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('переход к основным статам не перескакивает к отрядам', async ({
  page,
}) => {
  test.setTimeout(90000);
  const origin = (process.env.NTE_REVIEW_ORIGIN || '').replace(/\/$/, '');
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      reducedMotion: width === 360 ? 'reduce' : 'no-preference',
    });
    await page.goto(`${origin}/#/guides/akane-build-guide`);
    await page.reload();
    const target = page.locator('.guide-section-card').filter({
      has: page.getByRole('heading', { name: 'Основные статы', exact: true }),
    });
    await page.getByRole('button', { name: /^Основные статы/ }).click();
    await page.waitForLoadState('networkidle');
    await expect
      .poll(async () => Math.round((await target.boundingBox())!.y))
      .toBe(width < 1024 ? 144 : 112);
    const header = await page.locator('.site-header').boundingBox();
    expect((await target.boundingBox())!.y).toBeGreaterThan(
      header!.y + header!.height,
    );
    await expect(
      page.getByRole('button', { name: /^Основные статы/ }),
    ).toHaveAttribute('aria-current', 'location');
    const iconGaps = await target
      .locator('.guide-visual--stats > li')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const title = row.querySelector('h3')!.getBoundingClientRect();
          const icons = Array.from(
            row.querySelectorAll('.guide-stat-icons img'),
          );
          return (
            title.left -
            Math.max(...icons.map((icon) => icon.getBoundingClientRect().right))
          );
        }),
      );
    expect(iconGaps.length).toBeGreaterThan(0);
    iconGaps.forEach((gap) => expect(gap).toBeGreaterThanOrEqual(8));
  }
});

test('все шаги ротации выровнены, статы показывают иконки, публичный тир-лист скрывает логи', async ({
  page,
  request,
}) => {
  const fixture = JSON.parse(
    await readFile('tests/fixtures/profile-polish.json', 'utf8'),
  );
  const guides = (
    await (await request.get('http://127.0.0.1:8788/api/guides')).json()
  ).data;
  const guide = guides.find(
    (row: { slug: string }) => row.slug === 'akane-build-guide',
  );
  fixture.stats.visual.items.push(
    {
      id: 'psyche-alias',
      name: 'Бонус урона Психеи',
      description: '',
      imageUrl: '',
      stats: [],
    },
    {
      id: 'incantation-alias',
      name: 'Бонус урона Инкантации',
      description: '',
      imageUrl: '',
      stats: [],
    },
  );
  guide.sections = [fixture.rotation, fixture.stats];
  await page.route('**/api/guides', (route) =>
    route.fulfill({ json: { data: guides } }),
  );
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/guides/akane-build-guide');
    const steps = page.locator('.guide-visual--rotation > li');
    await expect(steps).toHaveCount(5);
    const offsets = await steps.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().left),
    );
    expect(new Set(offsets).size).toBe(1);
    await expect(
      page.locator('.guide-visual--stats .guide-stat-icons img'),
    ).toHaveCount(6);
    await expect(
      page.locator(
        '.guide-visual--stats .guide-stat-icons img[src*="75a01c3718f57e576b08"]',
      ),
    ).toHaveCount(1);
    await expect(
      page.locator(
        '.guide-visual--stats .guide-stat-icons img[src*="b5507cb8cea8e48c0d5d"]',
      ),
    ).toHaveCount(1);
    await expect(
      page.locator('.guide-visual--stats .guide-visual__position'),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.goto('/#/tierlists');
  await expect(
    page
      .locator('.change-log')
      .filter({ hasText: /каталог расширен|история обновлений/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Комментарии и история обновлений хранятся отдельно', {
      exact: false,
    }),
  ).toHaveCount(0);
});
