import { expect, test, type Page } from '@playwright/test';
import type { Guide, TierList } from '../src/types';

async function editor(page: Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'fixture-editor',
          username: 'editor',
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

test('новые персонажи имеют читаемые гайды, биографии и загружаемые изображения на четырёх ширинах', async ({
  page,
  request,
}) => {
  const guides = (
    await (await request.get('http://127.0.0.1:8788/api/guides')).json()
  ).data as Guide[];
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of ['akane', 'blackbird', 'iroi', 'linko', 'zankou']) {
      const guide = guides.find((item) => item.characterId === slug)!;
      expect(guide).toBeTruthy();
      await page.goto(`/#/guides/${guide.slug}`);
      await expect(
        page.getByRole('heading', { name: guide.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Источники и актуальность', { exact: true }).first(),
      ).toHaveCount(0);
      await expect(page.locator('.guide-visual--arcs')).toBeVisible();
      await expect(page.locator('.guide-visual--cartridges')).toBeVisible();
      await expect(page.locator('.guide-basic-rotation')).toBeVisible();
      const size = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(size.scroll, `${slug} at ${width}`).toBeLessThanOrEqual(
        size.width + 1,
      );
    }
  }
  await page.goto('/#/characters/akane');
  await expect(
    page.getByRole('heading', { name: 'Аканэ Рин', exact: true }).first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('main img')
        .evaluateAll((images) =>
          images
            .filter((image) => image.getAttribute('src')?.includes('akane'))
            .every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBeTruthy();
  await page.goto('/#/tierlists');
  await expect(page.getByRole('heading', { name: 'Без оценки' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Аканэ Рин', exact: true }).first(),
  ).toBeVisible();
});

test('внешний тир принимается только в черновик, шкала T0 не пересчитывается', async ({
  page,
  request,
}) => {
  await editor(page);
  const tiers = (
    await (await request.get('http://127.0.0.1:8788/api/tierlists')).json()
  ).data as TierList[];
  await page.route('**/api/tierlists', (route) =>
    route.fulfill({ json: { data: tiers } }),
  );
  const source = {
    id: 'tier-source',
    name: 'Проверяемый источник',
    url: 'https://example.com/tier',
    trust: 'high',
    status: 'ok',
  };
  await page.route('**/api/tier-import/lookup', (route) =>
    route.fulfill({
      json: {
        data: {
          found: true,
          message: 'Результаты требуют выбора',
          checkedAt: '2026-10-21T10:00:00Z',
          sources: [source],
          fields: {},
          suggestions: [
            {
              id: 'native',
              field: 'tier',
              label: 'Тир',
              value: 'B',
              sourceName: source.name,
              sourceUrl: source.url,
              confidence: 'medium',
              note: 'Саб-ДД; A0',
            },
            {
              id: 'external',
              field: 'externalRank',
              label: 'Шкала',
              value: 'T0',
              sourceName: 'Kaiden',
              sourceUrl: 'https://example.com/kaiden',
              confidence: 'medium',
            },
          ],
        },
      },
    }),
  );
  let saved:
    | { items: Array<{ characterId: string; tier: string; note: string }> }
    | undefined;
  await page.route('**/api/tierlists/*', async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { data: { success: true } } });
  });
  await page.goto('/#/tierlists');
  await page
    .getByRole('button', { name: 'Редактировать тир-лист', exact: true })
    .click();
  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', {
      name: 'Редактор тир-листа',
      exact: true,
    }),
  });
  await dialog.getByLabel('Персонаж для сверки').selectOption('linko');
  await dialog
    .getByRole('button', { name: 'Найти источники тир-листа' })
    .click();
  await expect(dialog.getByText('Kaiden: T0', { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Применить в черновик' }),
  ).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Применить в черновик' }).click();
  expect(saved).toBeUndefined();
  await dialog.getByRole('button', { name: 'Сохранить тир-лист' }).click();
  await expect
    .poll(() => saved?.items.find((item) => item.characterId === 'linko')?.tier)
    .toBe('B');
  expect(
    saved?.items.find((item) => item.characterId === 'linko')?.note,
  ).toContain('A0');
});

test('поиск новостей доступен на главной и отправляет материал в отдельный черновик', async ({
  page,
}) => {
  await editor(page);
  const candidate = {
    id: 'candidate-news',
    origin: 'discovery',
    sourceName: 'NTE JP',
    sourceUrl: 'https://example.com/jp',
    sourceType: 'website',
    language: 'ja',
    title: 'メンテナンスのお知らせ',
    excerpt: '公式ニュースの更新です',
    trustLevel: 'высокий',
    suggestedStatus: 'подтверждено',
    confidenceScore: 75,
    reviewStatus: 'pending',
    translationStatus: 'нужен перевод',
    contentKind: 'news',
    createdAt: '2026-10-21T10:00:00Z',
  };
  await page.route('**/api/leak-candidates', (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route('**/api/leak-candidates/discover', (route) =>
    route.fulfill({
      json: {
        data: {
          discoveredCount: 1,
          candidates: [candidate],
          sources: [
            {
              id: 'jp',
              name: 'NTE JP',
              url: 'https://example.com/jp',
              type: 'website',
              language: 'ja',
              trustLevel: 'высокий',
              status: 'ok',
              message: 'Найдена публикация',
              foundCount: 1,
              mode: 'automatic',
              lastPublishedAt: '2026-10-20T10:00:00Z',
            },
          ],
        },
      },
    }),
  );
  let destination = '';
  await page.route(
    '**/api/leak-candidates/candidate-news/promote',
    async (route) => {
      destination = route.request().postDataJSON().destination;
      await route.fulfill({
        json: { data: { newsId: 'new-news', slug: 'new-news' } },
      });
    },
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Добавить новость', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Найти новые публикации', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: candidate.title, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.leak-candidate-meta span')
      .filter({ hasText: 'Японский' })
      .first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'В черновик новости', exact: true })
    .click();
  await expect.poll(() => destination).toBe('news');
});
