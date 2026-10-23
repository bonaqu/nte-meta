import { expect, test } from '@playwright/test';
import {
  readFile,
  access,
  mkdtemp,
  writeFile,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
const aliases = JSON.parse(
  await readFile('src/data/native-media-aliases.json', 'utf8'),
) as Record<string, string>;

test('повторная подготовка сопоставлений без каталога не меняет правильные иконки', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nte-asset-refresh-'));
  const path = join(directory, 'aliases.json');
  try {
    await writeFile(path, JSON.stringify(aliases));
    await promisify(execFile)(process.execPath, [
      'scripts/game-data/build-asset-aliases.mjs',
      '--output',
      path,
    ]);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(aliases);
  } finally {
    await unlink(path);
    await rmdir(directory);
  }
});

test('старые иконки сопоставлены существующим изображениям установленного клиента', async () => {
  const images = new Set<string>();
  for (const line of gunzipSync(
    await readFile('scripts/content/game-data/chunks.jsonl.gz'),
  )
    .toString('utf8')
    .trim()
    .split('\n')) {
    const chunk = JSON.parse(line);
    if (chunk.kind === 'image')
      for (const row of chunk.records)
        for (const asset of row.assets) images.add(asset.url);
  }
  expect(Object.keys(aliases).length).toBeGreaterThan(150);
  for (const [source, target] of Object.entries(aliases)) {
    expect(new URL(source).protocol).toBe('https:');
    expect(images.has(target), source).toBeTruthy();
    await access(`public/${target.replace('/nte-meta/', '')}`);
  }
  const skill =
    'https://interactivemap.app/neverness-to-everness/database/assets/skills/Adler_Skill.png';
  expect(aliases[skill]).toBe(
    '/nte-meta/game-assets/468c785575065ad51b31.webp',
  );
  for (const [character, names] of [
    [
      'Daffodill',
      [
        'Daffodill_Melee',
        'Daffodill_UltraSkill',
        'Daffodill_QTE',
        'Daffodill_Skill1',
      ],
    ],
    ['Mint', ['Mint_Melee', 'Mint_UltraSkill', 'Mint_QTE', 'Mint_Skill']],
  ] as const) {
    for (const name of names)
      expect(
        aliases[
          `https://ntewiki.org/images/characters/source/${character}/${name}.png`
        ],
      ).toMatch(/^\/nte-meta\/game-assets\//);
  }
  // The third-party Food_128 identifier and native Food_0128 refer to the same
  // localized gift; its native 256px icon must win over a similarly named dish.
  expect(
    aliases['https://www.neverness.app/assets/codex/likeability/Food_128.webp'],
  ).toBe('/nte-meta/game-assets/f79631e0db88b5cd494f.webp');
});

test('Адлер: старые навыки, пробуждения и материалы загружают локальные иконки на четырёх ширинах', async ({
  page,
  request,
}) => {
  const origin = process.env.NTE_MEDIA_REVIEW_ORIGIN || '';
  if (!origin) {
    const characters = (
      await (await request.get('http://127.0.0.1:8788/api/characters')).json()
    ).data;
    const profile = JSON.parse(
      await readFile('tests/fixtures/adler-legacy-media.json', 'utf8'),
    );
    const adler = characters.find((c: { id: string }) => c.id === 'adler');
    adler.profile = { ...adler.profile, ...profile };
    await page.route('**/api/characters', (route) =>
      route.fulfill({ json: { data: characters } }),
    );
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(r.url()));
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/#/characters/adler`);
    await expect(page.locator('.ability-card__icon img')).toHaveCount(7);
    const icons = page.locator(
      '.ability-card__icon img, #character-awakenings img, #character-progression img',
    );
    expect(await icons.count()).toBeGreaterThan(30);
    for (const image of await icons.all()) {
      await expect(image).toHaveAttribute('src', /\/game-assets\/[^/]+\.webp$/);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBeTruthy();
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test('опубликованный сайт: все изображения профилей действительно декодируются в браузере', async ({
  page,
  request,
}, testInfo) => {
  const origin = process.env.NTE_MEDIA_REVIEW_ORIGIN;
  test.skip(!origin, 'Explicit published profile-media review.');
  test.setTimeout(300000);
  const characters = (
    await (
      await request.get(
        'https://nte-meta-api.bonaqu.workers.dev/api/characters',
      )
    ).json()
  ).data as Array<{ id: string; name: string; slug: string }>;
  const failures: Array<{ character: string; source: string; error: string }> =
    [];
  const pageErrors: string[] = [];
  const networkErrors: Array<{ source: string; error: string }> = [];
  const recovered: Array<{ character: string; source: string }> = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('requestfailed', (r) => {
    if (r.resourceType() === 'image')
      networkErrors.push({
        source: r.url(),
        error: r.failure()?.errorText || 'request failed',
      });
  });
  page.on('response', (r) => {
    if (r.request().resourceType() === 'image' && r.status() >= 400)
      networkErrors.push({ source: r.url(), error: `HTTP ${r.status()}` });
  });
  let checked = 0;
  let profiles = 0;
  const save = () =>
    writeFile(
      process.env.NTE_MEDIA_REVIEW_REPORT ||
        testInfo.outputPath('media-review.json'),
      JSON.stringify(
        {
          profiles,
          expectedProfiles: characters.length,
          images: checked,
          failures,
          pageErrors,
          networkErrors,
          recovered,
        },
        null,
        2,
      ),
    );
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const character of characters) {
    await page.goto(`${origin}/#/characters/${character.slug}`);
    await expect(
      page.getByRole('heading', {
        name: character.name,
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    const images = await page
      .locator(
        '.character-lore-hero img, #character-abilities img, #character-awakenings img, #character-progression img, #character-wardrobe img',
      )
      .evaluateAll((images) =>
        Array.from(
          new Map(
            images.map((image) => [
              image.getAttribute('src') || '',
              {
                source: image.getAttribute('src') || '',
                alt: image.getAttribute('alt') || '',
              },
            ]),
          ).values(),
        ),
      );
    for (const { source, alt } of images) {
      // A failed wardrobe request replaces its IMG with a retry panel. Resolve
      // by source rather than a live nth(index), which then points at a different
      // image and can wait forever after the list shrinks.
      const image = page.locator(`img[src=${JSON.stringify(source)}]`).first();
      try {
        const skin = page.locator('#character-wardrobe article').filter({
          has: page.getByRole('heading', {
            name: alt,
            exact: true,
            level: 3,
          }),
        });
        const retry = skin.getByRole('button', {
          name: 'Повторить загрузку',
          exact: true,
        });
        if (alt && (await retry.count())) {
          await retry.click();
          recovered.push({ character: character.id, source });
        }
        await expect(image).toBeAttached({ timeout: 3000 });
        if (!(await image.isVisible())) {
          // A responsive hidden image has no scroll target; check its bytes in
          // the same browser instead of treating CSS visibility as an error.
          expect(
            await page.evaluate(async (src) => {
              const image = new Image();
              image.referrerPolicy = 'no-referrer';
              image.src = src;
              await image.decode();
              return image.naturalWidth > 0;
            }, source),
          ).toBeTruthy();
          checked++;
          continue;
        }
        await image.scrollIntoViewIfNeeded({ timeout: 5000 });
        await expect
          .poll(() =>
            image.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
          )
          .toBeTruthy();
      } catch (error) {
        failures.push({
          character: character.id,
          source,
          error: String(error).slice(0, 300),
        });
      }
      checked++;
    }
    profiles++;
    await save();
    console.log(
      '[profile-media-progress]',
      character.id,
      profiles,
      checked,
      failures.length,
    );
  }
  const report = {
    profiles: characters.length,
    images: checked,
    failures,
    pageErrors,
    networkErrors,
    recovered,
  };
  await writeFile(
    process.env.NTE_MEDIA_REVIEW_REPORT ||
      testInfo.outputPath('media-review.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('[profile-media-review]', JSON.stringify(report));
  expect(checked).toBeGreaterThan(500);
  expect(failures).toEqual([]);
  expect(pageErrors).toEqual([]);
});
