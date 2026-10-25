import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import type { Character } from '../src/types';

test('опубликованные пакеты: Аканэ и оба варианта Зеро воспроизводят четыре языка', async ({
  page,
}) => {
  test.skip(
    !process.env.NTE_PUBLIC_VOICES_URL,
    'Опциональная проверка опубликованного аудио.',
  );
  test.setTimeout(120000);
  if (process.env.NTE_VOICE_CHARACTER_FIXTURE) {
    const characters = JSON.parse(
      await readFile(process.env.NTE_VOICE_CHARACTER_FIXTURE, 'utf8'),
    );
    await page.route('**/api/characters', (route) =>
      route.fulfill({ json: { data: characters } }),
    );
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [slug, variants] of [
    ['akane', []],
    ['esper-zero', ['Мужской вариант', 'Женский вариант']],
  ] as const) {
    await page.goto(
      process.env.NTE_PUBLIC_VOICES_URL! + '#/characters/' + slug,
    );
    const voices = page.locator('#character-voice');
    await page
      .getByRole('navigation', { name: 'Разделы персонажа' })
      .getByRole('button', { name: 'Озвучка', exact: true })
      .click();
    for (const variant of variants.length ? variants : ['']) {
      if (variant)
        await voices
          .getByRole('group', { name: 'Вариант озвучки' })
          .getByRole('button', { name: variant, exact: true })
          .click();
      for (const language of [
        'Японский',
        'Английский',
        'Китайский',
        'Корейский',
      ]) {
        await voices.getByRole('tab', { name: new RegExp(language) }).click();
        await expect(voices.locator('audio')).toHaveCount(6);
        const audio = voices.locator('audio').first();
        await audio.evaluate(async (element: HTMLAudioElement) => {
          await element.play();
        });
        await expect
          .poll(() =>
            audio.evaluate((element: HTMLAudioElement) => element.currentTime),
          )
          .toBeGreaterThan(0);
        expect(
          await audio.evaluate((element: HTMLAudioElement) =>
            Boolean(element.error),
          ),
        ).toBe(false);
        await audio.evaluate((element: HTMLAudioElement) => element.pause());
      }
    }
  }
  expect(errors).toEqual([]);
});

test('готовая сборка: досье, стабильный гардероб, четыре языка и локальный черновик', async ({
  page,
}, info) => {
  test.skip(
    !process.env.NTE_PROFILE_URL || !process.env.NTE_CHARACTER_FIXTURE,
    'Отдельная проверка готовой сборки с проверенным снимком профилей.',
  );
  test.setTimeout(120000);
  const base = process.env.NTE_PROFILE_URL!;
  const characters = JSON.parse(
    await readFile(process.env.NTE_CHARACTER_FIXTURE!, 'utf8'),
  ) as Character[];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/characters', (route) =>
    route.fulfill({ json: { data: characters } }),
  );
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '#/characters/adler');
    await expect(page.locator('.character-dossier h1')).toHaveAccessibleName(
      'Адлер',
    );
    await page
      .locator('.character-lore-hero > img')
      .evaluate((img: HTMLImageElement) => img.decode());
    await expect(page.locator('.character-profile-facts dd')).toHaveCount(8);
    expect(
      await page
        .locator('footer')
        .evaluate(
          (e) => Math.abs(e.getBoundingClientRect().width - innerWidth) < 2,
        ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: info.outputPath(`hero-${width}.png`) });
    await page.goto(
      base + '#/characters/' + characters.find((c) => c.id === 'zankou')!.slug,
    );
    await expect(page.locator('.character-dossier h1')).toHaveAccessibleName(
      'Занку',
    );
    await page.getByRole('button', { name: 'Гардероб', exact: true }).click();
    const stage = page.locator('.wardrobe-gallery__stage').first();
    const sizes: number[] = [];
    const choices = page.locator('.wardrobe-thumbnails button');
    expect(await choices.count()).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < Math.min(3, await choices.count()); i++) {
      await choices.nth(i).click();
      await expect(choices.nth(i)).toHaveAttribute('aria-pressed', 'true');
      await stage
        .locator('.skin-media img')
        .evaluate((img: HTMLImageElement) => {
          img.loading = 'eager';
        });
      await expect
        .poll(() =>
          stage
            .locator('.skin-media img')
            .evaluate((img: HTMLImageElement) => ({
              src: img.src,
              loaded: img.complete && img.naturalWidth > 0,
            })),
        )
        .toMatchObject({ loaded: true });
      sizes.push((await stage.boundingBox())!.height);
    }
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(2);
    await stage.screenshot({ path: info.outputPath(`wardrobe-${width}.png`) });
    if (width === 360 || width === 1440)
      expect(
        (
          await new AxeBuilder({ page })
            .include('.character-dossier')
            .include('.wardrobe-gallery')
            .analyze()
        ).violations,
      ).toEqual([]);
  }
  await page.goto(
    base + '#/characters/' + characters.find((c) => c.id === 'akane')!.slug,
  );
  const library = page.locator('.voice-library');
  await expect(library).toBeVisible();
  for (const language of ['Японский', 'Английский', 'Китайский', 'Корейский']) {
    await library.getByRole('tab', { name: new RegExp(language) }).click();
    await expect(library.locator('audio')).toHaveCount(6);
    const playback = await library
      .locator('audio')
      .first()
      .evaluate(async (element: HTMLAudioElement) => {
        await element.play();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error('Audio did not advance')),
            8000,
          );
          element.addEventListener('timeupdate', () => {
            if (element.currentTime > 0) {
              clearTimeout(timer);
              element.pause();
              resolve();
            }
          });
        });
        return { duration: element.duration, error: element.error?.message };
      });
    expect(playback.duration).toBeGreaterThan(0);
    expect(playback.error).toBeUndefined();
  }
  const akane = characters.find((c) => c.id === 'akane')!;
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'release-owner',
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
  let draft: Record<string, unknown> | undefined;
  await page.unroute('**/api/characters');
  await page.route('**/api/characters', async (route) => {
    if (route.request().method() === 'POST') {
      draft = route.request().postDataJSON();
      await route.fulfill({ json: { data: { id: 'test-draft' } } });
    } else
      await route.fulfill({
        json: { data: characters.filter((c) => c.id !== 'akane') },
      });
  });
  await page.goto(base + '#/admin/game-data');
  await page.reload();
  const importer = page.locator('.local-character-import');
  await importer.locator('summary').click();
  await importer.locator('input[type=file]').setInputFiles({
    name: 'characters.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'nte-character-proposals',
        version: 1,
        characters: [
          {
            ownerId: '1057',
            name: akane.name,
            originalName: akane.originalName,
            slug: akane.slug,
            imageUrl: akane.imageUrl,
            splashUrl: akane.splashUrl,
            profile: akane.profile,
          },
        ],
      }),
    ),
  });
  await importer.getByLabel('Редкость', { exact: true }).selectOption('S');
  await importer.getByLabel('Атрибут', { exact: true }).selectOption('Лакшана');
  await importer.getByLabel('Роль', { exact: true }).fill('Урон');
  await importer
    .getByRole('button', { name: 'Создать черновик персонажа', exact: true })
    .click();
  await expect(importer.getByRole('status')).toContainText('Черновик создан');
  expect(draft?.status).toBe('draft');
  expect(draft?.name).toBe(akane.name);
  expect(errors).toEqual([]);
});
