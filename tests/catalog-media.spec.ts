import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('опубликованные каталоги, портреты всех персонажей и изображения всех гайдов', async ({
  page,
  request,
}, info) => {
  const base = process.env.NTE_CATALOG_REVIEW_URL;
  test.skip(!base, 'Явная проверка опубликованного каталога.');
  test.setTimeout(180000);
  const characters = (
    await (
      await request.get(
        'https://nte-meta-api.bonaqu.workers.dev/api/characters',
      )
    ).json()
  ).data as { id: string; slug: string; name: string }[];
  const guides = (
    await (
      await request.get('https://nte-meta-api.bonaqu.workers.dev/api/guides')
    ).json()
  ).data as { id: string; slug: string; title: string }[];
  const errors: string[] = [];
  const httpErrors: string[] = [];
  const checked: {
    route: string;
    url: string;
    width: number;
    error?: string;
  }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (
      response.request().resourceType() === 'image' &&
      response.status() >= 400
    )
      httpErrors.push(`${response.status()} ${response.url()}`);
  });
  async function inspect(selector: string) {
    const urls = await page
      .locator(selector)
      .evaluateAll((nodes) => [
        ...new Set(nodes.map((node) => (node as HTMLImageElement).src)),
      ]);
    const results = await page.evaluate(async (urls) => {
      const results = [];
      for (let i = 0; i < urls.length; i += 4) {
        results.push(
          ...(await Promise.all(
            urls.slice(i, i + 4).map(async (url) => {
              const image = new Image();
              image.referrerPolicy = 'no-referrer';
              image.src = url;
              try {
                await image.decode();
                return { url, width: image.naturalWidth };
              } catch (error) {
                return { url, width: 0, error: String(error) };
              }
            }),
          )),
        );
      }
      return results;
    }, urls);
    checked.push(
      ...results.map((result) => ({
        route: new URL(page.url()).hash,
        ...result,
      })),
    );
    expect(urls.length, selector).toBeGreaterThan(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base! + '#/characters');
  await expect(page.locator('.character-card')).toHaveCount(characters.length);
  await inspect('.character-card img');
  for (const character of characters) {
    await page.evaluate((slug) => {
      location.hash = '#/characters/' + slug;
    }, character.slug);
    await expect(
      page.getByRole('heading', {
        name: character.name,
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    await inspect('.character-lore-hero > img');
  }
  await page.evaluate(() => {
    location.hash = '#/guides';
  });
  await expect(page.locator('.guide-card')).toHaveCount(guides.length);
  await inspect('.guide-card img');
  for (const guide of guides) {
    await page.evaluate((slug) => {
      location.hash = '#/guides/' + slug;
    }, guide.slug);
    await expect(page.locator('.guide-hero h1')).toBeVisible();
    await expect(page.locator('.guide-hero h1')).toHaveText(guide.title);
    await inspect('.guide-hero > img, .guide-visual img');
  }
  await writeFile(
    info.outputPath('catalog-media.json'),
    JSON.stringify(
      {
        characters: characters.length,
        guides: guides.length,
        checked,
        errors,
        httpErrors,
      },
      null,
      2,
    ),
  );
  expect(checked.filter((result) => result.width === 0)).toEqual([]);
  expect(errors).toEqual([]);
  expect(httpErrors).toEqual([]);
});
