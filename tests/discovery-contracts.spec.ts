import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import vm from 'node:vm';

type Candidate = {
  title: string;
  excerpt: string;
  language: string;
  publishedAt: string;
  suggestedStatus: string;
  sourceUrl: string;
  metadata: { contentKind: string };
};
type Source = {
  id: string;
  name: string;
  url: string;
  parser?: string;
  language?: string;
  trustLevel?: string;
  official?: boolean;
  type?: string;
};
async function contracts(fetcher: typeof fetch = fetch) {
  const code = await readFile('src/worker.js', 'utf8');
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
    code.replace('export default {', 'const worker = {') +
      '\nglobalThis.contracts = { parseFeedCandidates, parseArticleCandidates, detectLeakLanguage, fetchLeakDiscoverySource, parseOfficialRuBiography, extractNativeTier, characterImportSources, guideImportSources, parseKaidenGuideImport, upsertLeakCandidates, LEAK_DISCOVERY_SOURCES };',
  ).runInContext(context);
  return context.contracts as {
    parseFeedCandidates: (text: string, source: Source) => Candidate[];
    parseArticleCandidates: (text: string, source: Source) => Candidate[];
    fetchLeakDiscoverySource: (
      source: Source,
      query: string,
      deadline?: number,
    ) => Promise<{ status: string; stale: boolean; candidates: Candidate[] }>;
    parseOfficialRuBiography: (
      text: string,
      source: Source,
      character: object,
    ) => Array<{ value: string }>;
    extractNativeTier: (
      html: string,
      character: object,
    ) => { tier: string; role: string; awakening: string } | null;
    guideImportSources: (
      slug: string,
      character: object,
    ) => Array<{ id: string; url: string }>;
    characterImportSources: (
      slug: string,
      character: object,
    ) => Array<{ id: string; url: string }>;
    parseKaidenGuideImport: (
      html: string,
      source: Source,
      character: object,
    ) => Array<{ field: string; value: string }>;
    LEAK_DISCOVERY_SOURCES: Source[];
    upsertLeakCandidates: (
      env: unknown,
      candidates: Candidate[],
    ) => Promise<void>;
  };
}
const source = {
  id: 'test',
  name: 'Community',
  url: 'https://example.com/feed',
  type: 'website',
  language: 'en',
  trustLevel: 'низкий',
};

test('RSS/Atom сохраняют японский язык, даты и ссылку; слово official не подтверждает слух', async () => {
  const m = await contracts();
  const rss =
    '<rss><channel><item><title><![CDATA[Official NTE character rumor]]></title><link>https://example.com/post</link><description><![CDATA[<p>Not confirmed</p>]]></description><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  expect(m.parseFeedCandidates(rss, source)[0]).toMatchObject({
    title: 'Official NTE character rumor',
    suggestedStatus: 'слух',
    sourceUrl: 'https://example.com/post',
    publishedAt: '2026-10-19T10:00:00.000Z',
  });
  const atom =
    '<feed><entry><title>異環の新しいキャラクター</title><link rel="alternate" href="https://example.com/jp"/><content type="html">&lt;p&gt;更新のお知らせ&lt;/p&gt;</content><updated>2026-10-19T11:00:00Z</updated></entry></feed>';
  expect(m.parseFeedCandidates(atom, source)[0]).toMatchObject({
    language: 'ja',
    publishedAt: '2026-10-19T11:00:00.000Z',
    sourceUrl: 'https://example.com/jp',
  });
});

test('официальная лента исключает навигацию и внешние ссылки', async () => {
  const m = await contracts();
  const official = {
    ...source,
    url: 'https://nte.perfectworld.com/ru/article/news/',
    parser: 'official',
    official: true,
  };
  const items = m.parseArticleCandidates(
    '<a href="/ru/article/news/gamenews/20261019/264680.html"><h2>Технические работы 21 октября</h2><p>2026-10-19</p></a><a href="/ru/article/news/">Все новости</a><a href="https://elsewhere.test/ru/article/news/gamenews/20261019/1.html">External announcement</a>',
    official,
  );
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    title: 'Технические работы 21 октября',
    suggestedStatus: 'подтверждено',
    metadata: { contentKind: 'news' },
  });
});

test('неактивная лента не выдаёт старые записи как новые; истёкший бюджет не начинает запрос', async () => {
  let calls = 0;
  const m = await contracts(async () => {
    calls++;
    return new Response(
      '<rss><channel><item><title>Old NTE character leak</title><link>https://example.com/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>',
    );
  });
  const result = await m.fetchLeakDiscoverySource(
    { ...source, parser: 'feed' },
    '',
  );
  expect(result).toMatchObject({
    status: 'partial',
    stale: true,
    candidates: [],
  });
  expect(
    (await m.fetchLeakDiscoverySource(source, '', Date.now() - 1)).status,
  ).toBe('timeout');
  expect(calls).toBe(1);
});

test('официальная биография ограничена слайдом нужного персонажа', async () => {
  const m = await contracts();
  const html =
    '<div class="swiper-slide"><video poster="role-poster-lingke.png"></video><dd class="role_text"><p>Линко служит в ТОИ и исследует частоты людей и аномалий вместе со своей спутницей.</p></dd></div><div class="swiper-slide"><video poster="role-poster-yi.png"></video><dd class="role_text"><p>Ирой кажется обычной девушкой, но тщательно следит за каждым своим поступком.</p></dd></div>';
  const values = m.parseOfficialRuBiography(html, source, { slug: 'iroi' });
  expect(values).toHaveLength(1);
  expect(values[0].value).toContain('Ирой');
  expect(values[0].value).not.toContain('Линко');
  expect(m.parseOfficialRuBiography(html, source, { slug: 'akane' })).toEqual(
    [],
  );
});

test('поиск имени проверяет текст официальной статьи за общим заголовком', async () => {
  const official = {
    ...source,
    url: 'https://example.com/en/article/news/',
    parser: 'official',
    official: true,
  };
  const m = await contracts(
    async (url) =>
      new Response(
        String(url) === official.url
          ? '<a href="/en/article/news/gamenews/20261019/123.html"><h2>Server maintenance notice</h2></a>'
          : '<h1>Server maintenance notice</h1><p>The update adds Akane Rin and her new story.</p>',
      ),
  );
  const result = await m.fetchLeakDiscoverySource(official, 'Аканэ');
  expect(result.status).toBe('ok');
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].excerpt).toContain('Akane Rin');
});

test('тир берётся из строки таблицы и сохраняет пробуждение, чужая история изменений исключена', async () => {
  const m = await contracts();
  const html =
    '<nav>S <a>Linko</a></nav><table><tr><th></th><th>Main DPS</th><th>Sub DPS</th><th>Support</th></tr><tr><td>A</td><td></td><td><a href="/linko">Linko</a> A0</td><td></td></tr></table><h2>Changelog</h2>S Linko';
  expect(
    m.extractNativeTier(html, { slug: 'linko', originalName: 'Linko' }),
  ).toMatchObject({ tier: 'A', awakening: 'A0', role: 'Саб-ДД' });
  expect(
    m.extractNativeTier(html, { slug: 'akane', originalName: 'Akane Rin' }),
  ).toBeNull();
});

test('каталоги источников не дублируются, Ирой использует oneiroi, все новые герои имеют гайды', async () => {
  const m = await contracts();
  const ids = m.LEAK_DISCOVERY_SOURCES.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(
    m.LEAK_DISCOVERY_SOURCES.some((item) => item.language === 'ja'),
  ).toBeTruthy();
  expect(
    m.LEAK_DISCOVERY_SOURCES.some((item) =>
      item.url.includes('NevernessLeaks'),
    ),
  ).toBeFalsy();
  expect(
    m
      .characterImportSources('iroi', {
        slug: 'iroi',
        originalName: 'Iroi',
        name: 'Ирой',
      })
      .find((item) => item.id === 'neverness-app-profile')?.url,
  ).toContain('/oneiroi');
  for (const slug of ['akane', 'blackbird', 'iroi', 'linko', 'zankou'])
    expect(
      m
        .guideImportSources(slug, { slug, originalName: slug })
        .some((item) => item.id === 'neverness-gg-guide'),
    ).toBeTruthy();
});

test('Kaiden извлекает экипировку и приоритеты без подмены совместимых предметов на лучшие', async () => {
  const m = await contracts();
  const html =
    '<h1>Linko</h1><h2>Equipment</h2><details><summary>Best<img src="/Fork/arc.webp" alt="Signature Arc"></summary></details><details><summary>Best<img src="/Cartridge/set.webp" alt="Chosen Set"></summary></details><h2>Skill Priority</h2><img src="/skill.webp" alt="Full-Frequency Pulse"><h2>Compatible Arcs</h2><img src="/Fork/other.webp" alt="Unranked Arc">';
  const values = m.parseKaidenGuideImport(html, source, {
    slug: 'linko',
    originalName: 'Linko',
  });
  expect(
    values.find((item) => item.field === 'guide.bestArcs')?.value,
  ).toContain('Signature Arc');
  expect(
    values.find((item) => item.field === 'guide.modules')?.value,
  ).toContain('Chosen Set');
  expect(
    values.find((item) => item.field === 'guide.skillPriority')?.value,
  ).toContain('Full-Frequency Pulse');
  expect(
    values.some((item) => item.value.includes('Unranked Arc')),
  ).toBeFalsy();
});

test('повторный сбор сохраняет проверенный перевод, изменение оригинала требует новой проверки', async () => {
  const m = await contracts();
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of (await readdir('migrations'))
      .filter((file) => file.endsWith('.sql'))
      .sort())
      db.exec(await readFile(`migrations/${file}`, 'utf8'));
    const env = {
      DB: {
        prepare: (query: string) => ({
          bind: (...parameters: SQLInputValue[]) => ({
            run: () => db.prepare(query).run(...parameters),
          }),
        }),
      },
    };
    const candidates = m.parseFeedCandidates(
      '<rss><item><title>New NTE character rumor</title><link>https://example.com/new</link><description>Original post content</description></item></rss>',
      source,
    );
    await m.upsertLeakCandidates(env, candidates);
    db.exec(
      "UPDATE leak_candidates SET metadata_json=json_set(metadata_json,'$.translationStatus','проверено','$.editorNote','Авторская заметка')",
    );
    await m.upsertLeakCandidates(env, candidates);
    let row = db
      .prepare(
        "SELECT json_extract(metadata_json,'$.translationStatus') translation, json_extract(metadata_json,'$.editorNote') note FROM leak_candidates",
      )
      .get();
    expect(row).toMatchObject({
      translation: 'проверено',
      note: 'Авторская заметка',
    });
    await m.upsertLeakCandidates(
      env,
      candidates.map((candidate) => ({
        ...candidate,
        title: 'Changed source post',
      })),
    );
    row = db
      .prepare(
        "SELECT json_extract(metadata_json,'$.translationStatus') translation, json_extract(metadata_json,'$.editorNote') note FROM leak_candidates",
      )
      .get();
    expect(row).toMatchObject({
      translation: 'нужен перевод',
      note: 'Авторская заметка',
    });
  } finally {
    db.close();
  }
});
