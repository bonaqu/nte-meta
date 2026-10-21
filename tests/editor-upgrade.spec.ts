import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
async function contracts(fetcher: typeof fetch) {
  const context = vm.createContext({
    URL,
    Response,
    AbortController,
    TextDecoder,
    TextEncoder,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: fetcher,
  });
  new vm.Script(
    (await readFile('src/worker.js', 'utf8')).replace(
      'export default {',
      'const worker={',
    ) +
      '\nglobalThis.contracts={ classifyDiscoveryContent,mergeDiscoverySources,validateDiscoveryUrl,translateCandidate,resolveNanokaCharacter,parseNanokaCharacter,discoveryFetch,isCleanImportedAbilityName };',
  ).runInContext(context);
  return context.contracts as {
    classifyDiscoveryContent: (source: object, text: string) => string;
    mergeDiscoverySources: (
      rows: object[],
    ) => Array<{ fetchUrl: string; parser: string; language: string }>;
    validateDiscoveryUrl: (url: string, signal?: AbortSignal) => Promise<void>;
    translateCandidate: (
      candidate: object,
      env: object,
    ) => Promise<{ title: string; excerpt: string }>;
    resolveNanokaCharacter: (
      source: object,
      character: object,
      options: object,
    ) => Promise<{ url: string; publicUrl: string }>;
    parseNanokaCharacter: (
      text: string,
      source: object,
    ) => Array<{ field: string; value: string }>;
    discoveryFetch: (
      url: string,
      options: object,
      budget: { remaining: number },
    ) => Promise<Response>;
    isCleanImportedAbilityName: (name: string) => boolean;
  };
}
test('новости отделены от слухов даже внутри канала сливов', async () => {
  const m = await contracts(fetch);
  const channel = { relevance: 'future' };
  expect(
    m.classifyDiscoveryContent(channel, 'Official NTE update now available'),
  ).toBe('news');
  expect(
    m.classifyDiscoveryContent(channel, 'NTE upcoming character datamine'),
  ).toBe('leak');
  expect(m.classifyDiscoveryContent({}, 'NTE secret easter egg tips')).toBe(
    'leak',
  );
  expect(
    m.classifyDiscoveryContent({ official: true }, 'Update: no leaks'),
  ).toBe('news');
  expect(
    m.isCleanImportedAbilityName(
      'Оставшееся время действия Реморы рассчитывается для каждой цели индивидуально. Этот урон может срабатывать на одной цели не чаще одного раза в X сек.',
    ),
  ).toBe(false);
});
test('собственные Telegram/Reddit/RSS подключаются, внутренние адреса и превышение бюджета запрещены', async () => {
  let calls = 0;
  const m = await contracts(async () => {
    calls++;
    return new Response(
      JSON.stringify({ Answer: [{ type: 1, data: '127.0.0.1' }] }),
    );
  });
  const base = {
    auto_import_enabled: 1,
    source_name: 'Own',
    trust_level: 'низкий',
    content_kind: 'leak',
    language: 'ja',
  };
  const sources = m.mergeDiscoverySources([
    { ...base, id: 'tg', source_url: 'https://t.me/my_nte_channel' },
    { ...base, id: 'reddit', source_url: 'https://www.reddit.com/r/NTE_EN/' },
    {
      ...base,
      id: 'rss',
      source_url: 'https://example.com/feed.xml',
      parser: 'feed',
    },
    {
      ...base,
      id: 'off',
      source_url: 'https://example.com/off',
      auto_import_enabled: 0,
    },
  ]);
  expect(sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fetchUrl: 'https://t.me/s/my_nte_channel',
        parser: 'telegram',
        language: 'ja',
      }),
      expect.objectContaining({
        fetchUrl: 'https://www.reddit.com/r/NTE_EN/new.rss',
      }),
      expect.objectContaining({ fetchUrl: 'https://example.com/feed.xml' }),
    ]),
  );
  expect(
    await m.validateDiscoveryUrl('https://private.example/feed').then(
      () => '',
      (error) => String(error.message),
    ),
  ).toContain('Внутренние адреса');
  const before = calls;
  expect(
    await m.validateDiscoveryUrl('http://localhost/feed').then(
      () => '',
      (error) => String(error.message),
    ),
  ).toContain('HTTPS');
  expect(calls).toBe(before);
  const budget = { remaining: 1 };
  await m.discoveryFetch('https://example.com', {}, budget);
  let error = '';
  try {
    await m.discoveryFetch('https://example.com', {}, budget);
  } catch (reason) {
    error = String((reason as Error).message);
  }
  expect(error).toContain('лимит');
  expect(calls).toBe(before + 1);
});
test('перевод остаётся предложением, имена локализуются, сбой переводчика сообщается', async () => {
  const m = await contracts(
    async () =>
      new Response(JSON.stringify([[['Akane Rin получает усиление.']]])),
  );
  const candidate = {
    language: 'en',
    title: 'Akane Rin buff',
    excerpt: 'Original character details',
  };
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind() {
          return this;
        },
        all: async () => ({
          results: sql.includes('game_source_chunks')
            ? []
            : [{ name: 'Аканэ Рин', original_name: 'Akane Rin' }],
        }),
      }),
    },
  };
  expect(await m.translateCandidate(candidate, env)).toMatchObject({
    title: 'Аканэ Рин получает усиление.',
    excerpt: 'Аканэ Рин получает усиление.',
  });
  expect(candidate.excerpt).toBe('Original character details');
  const unavailable = await contracts(
    async () => new Response('', { status: 503 }),
  );
  expect(
    await unavailable.translateCandidate(candidate, env).then(
      () => '',
      (error) => String(error.message),
    ),
  ).toContain('Переводчик временно недоступен');
});
test('Nanoka выбирает опубликованную версию и изображения именно выбранного персонажа', async () => {
  const calls: string[] = [];
  const m = await contracts(async (input) => {
    const url = String(input);
    calls.push(url);
    return new Response(
      url === 'https://nte.nanoka.cc'
        ? '<script data-url="https://static.nanoka.cc/nte/9.8.7/character.json"></script>'
        : JSON.stringify({
            1057: { id: '1057', en: '明音凛' },
            1003: { id: '1003', en: 'Sakiri' },
          }),
    );
  });
  const source = await m.resolveNanokaCharacter(
    { id: 'nanoka', name: 'Nanoka' },
    { slug: 'akane', originalName: 'Akane Rin' },
    {},
  );
  expect(source.url).toBe(
    'https://static.nanoka.cc/nte/9.8.7/en/character/1057.json',
  );
  expect(calls).toContain('https://static.nanoka.cc/nte/9.8.7/character.json');
  const suggestions = m.parseNanokaCharacter(
    JSON.stringify({
      icon: '/Game/UI/Icon',
      icon_gacha: '/Game/UI/Splash',
      fashion: [
        {
          head_icon_big: '/Game/UI/OtherIcon',
          portrait_img: '/Game/UI/OtherSplash',
        },
      ],
    }),
    source,
  );
  expect(suggestions.filter((x) => x.field === 'imageUrl')).toHaveLength(2);
  expect(suggestions.filter((x) => x.field === 'splashUrl')).toHaveLength(2);
  expect(
    suggestions.every((x) =>
      x.value.startsWith('https://static.nanoka.cc/assets/nte/Game/'),
    ),
  ).toBeTruthy();
});
test('миграция визуальных гайдов сохраняет ручные правки, боевой S Аканэ и личные данные', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  try {
    for (const file of (await readdir('migrations'))
      .filter((f) => f.endsWith('.sql') && f < '0035')
      .sort())
      db.exec(await readFile('migrations/' + file, 'utf8'));
    const guide = db
      .prepare("SELECT id FROM guides WHERE character_id='akane'")
      .get()!;
    db.prepare(
      "UPDATE guide_sections SET content_markdown='Ручная правка администратора' WHERE guide_id=? AND section_type='builds'",
    ).run(guide.id as string);
    const tier = db.prepare('SELECT id FROM tierlists LIMIT 1').get()!;
    db.prepare(
      "INSERT OR REPLACE INTO tierlist_items (tierlist_id,character_id,tier,tier_rank,position) VALUES (?,'akane','S',1,1)",
    ).run(tier.id as string);
    const before = JSON.stringify(
      db
        .prepare(
          'SELECT * FROM tierlist_items ORDER BY tierlist_id,character_id',
        )
        .all(),
    );
    db.exec(await readFile('migrations/0035_visual_guides.sql', 'utf8'));
    expect(
      db
        .prepare(
          "SELECT content_markdown FROM guide_sections WHERE guide_id=? AND section_type='builds'",
        )
        .get(guide.id as string)?.content_markdown,
    ).toBe('Ручная правка администратора');
    expect(
      JSON.stringify(
        db
          .prepare(
            'SELECT * FROM tierlist_items ORDER BY tierlist_id,character_id',
          )
          .all(),
      ),
    ).toBe(before);
    const visual = db
      .prepare(
        "SELECT meta_json FROM guide_sections WHERE guide_id=(SELECT id FROM guides WHERE character_id='blackbird') AND section_type='best-arcs'",
      )
      .get()!;
    expect(
      JSON.parse(visual.meta_json as string).visual.items[0],
    ).toMatchObject({ name: 'Crime and Punishment', stats: expect.any(Array) });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});

test('редактор подключает свой канал, скрывает факты в слухах и предлагает русский перевод', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'source-owner',
          username: 'owner',
          displayName: 'Editor',
          role: 'owner',
          status: 'active',
        },
      },
    }),
  );
  await page.route('**/api/auth/warnings', (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  let added: Record<string, unknown> | undefined;
  await page.route('**/api/sources', (route) => {
    if (route.request().method() === 'POST') {
      added = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: { data: { id: 'own-source' } },
      });
    }
    return route.fulfill({ json: { data: [] } });
  });
  const base = {
    origin: 'discovery',
    sourceName: 'Community',
    sourceUrl: 'https://example.com/post',
    sourceType: 'telegram',
    language: 'en',
    excerpt: 'An unconfirmed character leak.',
    trustLevel: 'низкий',
    suggestedStatus: 'слух',
    confidenceScore: 30,
    reviewStatus: 'pending',
    createdAt: new Date().toISOString(),
    translationStatus: 'нужен перевод',
    evidence: [],
  };
  const candidates = [
    { ...base, id: 'rumor-one', title: 'Akane rumor', contentKind: 'leak' },
    {
      ...base,
      id: 'fact-one',
      title: 'Official maintenance announcement',
      contentKind: 'news',
    },
  ];
  await page.route('**/api/leak-candidates', (route) =>
    route.fulfill({ json: { data: candidates } }),
  );
  let kind = '';
  await page.route('**/api/leak-candidates/discover', (route) => {
    kind = route.request().postDataJSON().kind;
    return route.fulfill({
      json: { data: { discoveredCount: 1, candidates, sources: [] } },
    });
  });
  await page.route('**/api/leak-candidates/rumor-one/translate', (route) =>
    route.fulfill({
      json: {
        data: {
          title: 'Слух об Аканэ',
          excerpt: 'Неподтверждённые сведения о персонаже.',
          provider: 'Google Translate',
        },
      },
    }),
  );
  let translation: Record<string, unknown> | undefined;
  await page.route('**/api/leak-candidates/rumor-one', (route) => {
    translation = route.request().postDataJSON();
    return route.fulfill({ json: { data: { success: true } } });
  });
  await page.goto('/#/');
  await page
    .getByRole('button', { name: 'Добавить слив', exact: true })
    .click();
  const dialog = page.locator('dialog[open]');
  await dialog
    .getByRole('button', { name: 'Найти новые публикации', exact: true })
    .click();
  await expect(
    dialog.getByRole('heading', { name: 'Akane rumor', exact: true }),
  ).toBeVisible();
  expect(kind).toBe('leak');
  await expect(
    dialog.getByText('Official maintenance announcement', { exact: true }),
  ).toHaveCount(0);
  await dialog.locator('.discovery-source-editor > summary').click();
  const form = dialog.locator('.discovery-source-editor form');
  await form
    .getByLabel('Название источника', { exact: true })
    .fill('Мой NTE-канал');
  await form
    .getByLabel('Ссылка на Telegram, Reddit или RSS/Atom', { exact: true })
    .fill('https://t.me/my_nte_channel');
  await form.getByRole('combobox', { name: /^Язык/ }).selectOption('ja');
  await form
    .getByRole('button', { name: 'Подключить источник', exact: true })
    .click();
  await expect(form.getByRole('status')).toContainText('Источник добавлен');
  expect(added).toMatchObject({
    sourceUrl: 'https://t.me/my_nte_channel',
    language: 'ja',
    autoImportEnabled: true,
    contentKind: 'leak',
  });
  const row = dialog.locator('.leak-candidate').filter({
    has: page.getByRole('heading', { name: 'Akane rumor', exact: true }),
  });
  await row
    .getByRole('button', { name: 'Предложить перевод на русский', exact: true })
    .click();
  await expect(
    row.getByLabel('Заголовок на русском', { exact: true }),
  ).toHaveValue('Слух об Аканэ');
  await row
    .getByRole('button', { name: 'Использовать перевод', exact: true })
    .click();
  await expect(row.getByText('Слух об Аканэ', { exact: true })).toBeAttached();
  expect(translation).toMatchObject({
    translatedTitle: 'Слух об Аканэ',
    translationStatus: 'переведено',
  });
});

test('производственная сборка: визуальные гайды, ширины, изображения и доступность', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    !process.env.NTE_REVIEW_ORIGIN,
    'Explicit built/live browser review.',
  );
  test.setTimeout(90000);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const origin = process.env.NTE_REVIEW_ORIGIN!.replace(/\/$/, '');
  const api = process.env.NTE_REVIEW_API || 'http://127.0.0.1:8788';
  const guides = (await (await request.get(`${api}/api/guides`)).json())
    .data as Array<{ slug: string; characterId: string }>;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(`${request.failure()?.errorText} ${request.url()}`),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slug of [
      'hotori',
      'akane',
      'blackbird',
      'iroi',
      'linko',
      'zankou',
    ]) {
      const guide = guides.find((g) => g.characterId === slug)!;
      await page.goto(`${origin}/#/guides/${guide.slug}`);
      for (const kind of ['arcs', 'cartridges', 'stats', 'skills', 'rotation'])
        await expect(
          page.locator(`.guide-visual--${kind}`).first(),
        ).toBeAttached();
      await expect(
        page.getByText('Источники и актуальность', { exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
        `${slug} ${width}`,
      ).toBeTruthy();
      await page
        .locator('.guide-visual--arcs')
        .first()
        .scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page
            .locator('.guide-visual--arcs img')
            .first()
            .evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
        )
        .toBeTruthy();
      if (slug === 'akane' && (width === 360 || width === 1440)) {
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(results.violations).toEqual([]);
        const path = process.env.NTE_REVIEW_ARTIFACT_DIR
          ? `${process.env.NTE_REVIEW_ARTIFACT_DIR}/guide-${width}.png`
          : testInfo.outputPath(`guide-${width}.png`);
        await page.screenshot({ path });
      }
    }
  }
  expect(errors).toEqual([]);
  const timing = await page.evaluate(() => {
    const n = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;
    return {
      domContentLoadedMs: Math.round(n.domContentLoadedEventEnd),
      transferBytes: n.transferSize,
    };
  });
  console.log(
    '[built-guide-review]',
    JSON.stringify({ routes: 24, consoleNetworkErrors: errors.length, timing }),
  );
});
