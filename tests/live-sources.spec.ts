import { expect, request as createContext, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { LeakDiscoveryResult } from '../src/types';

test('живой сбор источников сохраняет многоязычную очередь и не публикует материалы', async ({
  request,
}, testInfo) => {
  void request;
  test.skip(
    process.env.NTE_LIVE_SOURCES !== '1',
    'Explicit live network audit.',
  );
  test.setTimeout(90000);
  const api = await createContext.newContext({
    baseURL: 'http://127.0.0.1:8788',
  });
  try {
    const run = Date.now();
    const password = 'Playwright-Strong-42!';
    const registration = await api.post('/api/auth/register', {
      data: {
        username: `source_auditor_${run}`,
        password,
        confirmPassword: password,
        bootstrapToken: 'playwright-only-bootstrap-token',
      },
    });
    expect(registration.status()).toBe(201);
    expect((await registration.json()).data.user.role).toBe('owner');
    const publicCounts = async () =>
      Promise.all(
        ['news', 'leaks'].map(
          async (entity) =>
            (
              await (await api.get(`/api/${entity}?status=published`)).json()
            ).data.filter(
              (item: { publishStatus?: string; approved?: boolean }) =>
                item.publishStatus === 'published' || item.approved,
            ).length,
        ),
      );
    const before = await publicCounts();
    const started = performance.now();
    const response = await api.post('/api/leak-candidates/discover', {
      data: { query: '' },
      timeout: 25000,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const result = (await response.json()).data as LeakDiscoveryResult;
    expect(result.sources).toHaveLength(29);
    expect(result.discoveredCount).toBeGreaterThan(10);
    for (const language of ['ru', 'en', 'ja', 'zh'])
      expect(
        result.candidates.some((candidate) => candidate.language === language),
        language,
      ).toBeTruthy();
    expect(await publicCounts()).toEqual(before);
    const filtered = await api.post('/api/leak-candidates/discover', {
      data: { query: 'Аканэ' },
      timeout: 25000,
    });
    expect(filtered.ok(), await filtered.text()).toBeTruthy();
    const searched = (await filtered.json()).data as LeakDiscoveryResult;
    const official = searched.sources.filter((source) =>
      source.id.startsWith('official-news-'),
    );
    expect(
      official.some((source) => source.foundCount > 0),
      'имя внутри официального анонса находится по тексту',
    ).toBeTruthy();
    const tiers = await api.post('/api/tier-import/lookup', {
      data: { query: 'Линко' },
      timeout: 55000,
    });
    expect(tiers.ok(), await tiers.text()).toBeTruthy();
    const tier = (await tiers.json()).data;
    expect(
      tier.suggestions.some(
        (item: { field: string; value: string }) =>
          item.field === 'externalRank' && /^T\d/.test(item.value),
      ),
    ).toBeTruthy();
    const akaneSources = [];
    for (const endpoint of ['character-import', 'guide-import']) {
      const imported = await api.post(`/api/${endpoint}/lookup`, {
        data: { query: 'Аканэ Рин' },
        timeout: 55000,
      });
      expect(imported.ok(), await imported.text()).toBeTruthy();
      const payload = (await imported.json()).data;
      expect(payload.suggestions.length).toBeGreaterThan(0);
      const builds = payload.sources.find((source: { id: string }) =>
        source.id.startsWith('genshin-builds'),
      );
      expect(builds.url).toContain('/akane_rin');
      expect(
        payload.sources.some(
          (source: { status: string }) => source.status === 'failed',
        ),
      ).toBeFalsy();
      akaneSources.push({
        endpoint,
        sources: payload.sources,
        coverage: payload.coverage,
      });
    }
    const report = {
      akaneSources,
      durationMs: Math.round(performance.now() - started),
      discovered: result.discoveredCount,
      sourceStatuses: result.sources.map((source) => ({
        id: source.id,
        status: source.status,
        count: source.foundCount,
      })),
      officialQueryResults: official,
      tierSources: tier.sources,
    };
    await writeFile(
      testInfo.outputPath('live-sources.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(
      '[live-sources]',
      JSON.stringify({
        discovered: report.discovered,
        durationMs: report.durationMs,
        officialQueryMatches: official.reduce(
          (count, source) => count + source.foundCount,
          0,
        ),
      }),
    );
  } finally {
    await api.dispose();
  }
});
