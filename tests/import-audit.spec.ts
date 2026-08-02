import {
  expect,
  request as createRequestContext,
  test,
  type APIRequestContext,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const localApi = 'http://127.0.0.1:8788';
const productionApi =
  process.env.NTE_PRODUCTION_API || 'https://nte-meta-api.bonaqu.workers.dev';

type ImportSuggestion = {
  field: string;
  label: string;
  value: string;
};

type ImportPayload = {
  found: boolean;
  sources: Array<{ name?: string; status: string }>;
  suggestions: ImportSuggestion[];
  coverage?: {
    readyFields: string[];
    reviewFields: string[];
    missingFields: string[];
  };
};

type AttemptReport = {
  attempt: number;
  durationMs: number;
  elapsedMs: number;
  status: number | null;
  ok: boolean;
  error?: string;
};

type LookupReport = {
  endpoint: 'character-import' | 'guide-import';
  ok: boolean;
  durationMs: number;
  attempts: AttemptReport[];
  payload?: ImportPayload;
  error?: string;
};

// Windows wrangler dev resets a subset of overlapping inbound imports even
// with isolated clients. Keep the bounded scheduler deterministic locally;
// each import still fans out to bounded source fetches inside the Worker.
const auditConcurrency = 1;
const lookupBudgetMs = 60_000;
const maxLookupAttempts = 1;
const lookupCooldownMs = 750;
const allowedSourceStatuses = new Set([
  'ok',
  'partial',
  'blocked',
  'failed',
  'timeout',
  'manual',
  'reference',
]);

const badTextPattern = /(?:Р[ѓџ]|С[ЂЃ]|Ð|Ñ|\uFFFD|�)/u;
const seoBoilerplatePattern =
  /эта страница предназначена|те, кто ищет гайд|материалы персонажа|быстрый способ найти/iu;
const ansiEscapePattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  'g',
);

function compactError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(ansiEscapePattern, '')
    .split(/\r?\n/, 1)[0]
    .trim();
}

function inspectText(value: unknown, context: string) {
  if (typeof value === 'string') {
    expect(value, `${context}: пробелы по краям`).toBe(value.trim());
    expect(value, `${context}: повреждённая кодировка`).not.toMatch(
      badTextPattern,
    );
    expect(value, `${context}: SEO-текст вместо факта`).not.toMatch(
      seoBoilerplatePattern,
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectText(item, `${context}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) =>
      inspectText(item, `${context}.${key}`),
    );
  }
}

function inspectSuggestions(
  suggestions: ImportSuggestion[],
  kind: 'character' | 'guide',
  character: string,
) {
  suggestions.forEach((suggestion, index) => {
    if (kind === 'guide') {
      expect(suggestion.field, `${character}: поле гайда`).toMatch(/^guide\./);
    } else {
      expect(
        suggestion.field,
        `${character}: данные гайда в профиле`,
      ).not.toMatch(/^guide\./);
    }
    expect(suggestion.label, `${character}: техническая подпись`).not.toMatch(
      /^(?:profile|guide)\./,
    );
    const value = suggestion.value.trim();
    expect(value, `${character}: пустое предложение ${index}`).not.toBe('');
    try {
      inspectText(JSON.parse(value), `${character}.${suggestion.field}`);
    } catch {
      inspectText(value, `${character}.${suggestion.field}`);
    }
  });
}

async function lookup(
  api: APIRequestContext,
  endpoint: 'character-import' | 'guide-import',
  character: string,
  index: number,
): Promise<LookupReport> {
  const startedAt = performance.now();
  const attempts: AttemptReport[] = [];

  for (let attempt = 1; attempt <= maxLookupAttempts; attempt += 1) {
    const elapsedBeforeAttempt = performance.now() - startedAt;
    const remainingMs = lookupBudgetMs - elapsedBeforeAttempt;
    if (remainingMs <= 1_000) break;

    const attemptStartedAt = performance.now();
    let status: number | null = null;
    try {
      const response = await api.post(`/api/${endpoint}/lookup`, {
        headers: {
          'X-Forwarded-For': `198.51.100.${(index % 240) + 1}`,
        },
        data: { query: character },
        timeout: Math.floor(remainingMs),
      });
      status = response.status();
      const attemptDurationMs = Math.round(
        performance.now() - attemptStartedAt,
      );
      if (!response.ok()) {
        attempts.push({
          attempt,
          durationMs: attemptDurationMs,
          elapsedMs: Math.round(performance.now() - startedAt),
          status,
          ok: false,
          error: `${character}: ${endpoint} attempt ${attempt} HTTP ${status} after ${attemptDurationMs} ms`,
        });
      } else {
        const payload = (await response.json()).data as ImportPayload;
        attempts.push({
          attempt,
          durationMs: attemptDurationMs,
          elapsedMs: Math.round(performance.now() - startedAt),
          status,
          ok: true,
        });
        return {
          endpoint,
          ok: true,
          payload,
          durationMs: Math.round(performance.now() - startedAt),
          attempts,
        };
      }
    } catch (error) {
      const attemptDurationMs = Math.round(
        performance.now() - attemptStartedAt,
      );
      attempts.push({
        attempt,
        durationMs: attemptDurationMs,
        elapsedMs: Math.round(performance.now() - startedAt),
        status,
        ok: false,
        error: `${character}: ${endpoint} attempt ${attempt} failed after ${attemptDurationMs} ms: ${compactError(error)}`,
      });
    }
  }

  const durationMs = Math.round(performance.now() - startedAt);
  return {
    endpoint,
    ok: false,
    durationMs,
    attempts,
    error: `${character}: ${endpoint} exhausted ${attempts.length} attempt(s) in ${durationMs} ms — ${attempts.map((item) => item.error).join(' | ')}`,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function validateLookup(
  lookupReport: LookupReport,
  kind: 'character' | 'guide',
  character: string,
) {
  if (!lookupReport.ok || !lookupReport.payload) {
    return (
      lookupReport.error || `${character}: ${lookupReport.endpoint} failed`
    );
  }
  try {
    expect(
      lookupReport.durationMs,
      `${character}: ${lookupReport.endpoint} exceeded logical lookup budget`,
    ).toBeLessThanOrEqual(lookupBudgetMs);
    expect(Array.isArray(lookupReport.payload.sources)).toBeTruthy();
    expect(Array.isArray(lookupReport.payload.suggestions)).toBeTruthy();
    lookupReport.payload.sources.forEach((source) => {
      expect(
        allowedSourceStatuses.has(source.status),
        `${character}: unexpected source status ${source.status}`,
      ).toBeTruthy();
    });
    inspectSuggestions(lookupReport.payload.suggestions, kind, character);
    return '';
  } catch (error) {
    return `${character}: ${lookupReport.endpoint} validation failed after ${lookupReport.durationMs} ms — ${compactError(error)}`;
  }
}

test('ручной аудит автоимпорта всего опубликованного каталога', async ({
  request,
}, testInfo) => {
  void request;
  test.setTimeout(15 * 60_000);
  const local = await createRequestContext.newContext({ baseURL: localApi });
  const production = await createRequestContext.newContext({
    baseURL: productionApi,
  });
  try {
    const runId = Date.now();
    const registration = await local.post('/api/auth/register', {
      data: {
        username: `import_auditor_${runId}`,
        password: 'Playwright-Strong-42!',
        confirmPassword: 'Playwright-Strong-42!',
        bootstrapToken: 'playwright-only-bootstrap-token',
      },
    });
    expect(registration.status()).toBe(201);

    const catalogResponse = await production.get('/api/characters');
    expect(catalogResponse.ok()).toBeTruthy();
    const catalog = (await catalogResponse.json()).data as Array<{
      name: string;
      status?: string;
    }>;
    const characters = catalog.filter(
      (character) =>
        !character.status || character.status.toLowerCase() === 'published',
    );
    expect(characters.length).toBeGreaterThan(0);

    const auditStartedAt = performance.now();
    const report = await mapWithConcurrency(
      characters,
      auditConcurrency,
      async (character, index) => {
        const characterStartedAt = performance.now();
        const profileLookup = await lookup(
          local,
          'character-import',
          character.name,
          index * 2,
        );
        const profileError = validateLookup(
          profileLookup,
          'character',
          character.name,
        );
        await new Promise((resolve) => setTimeout(resolve, lookupCooldownMs));

        const guideLookup = await lookup(
          local,
          'guide-import',
          character.name,
          index * 2 + 1,
        );
        const guideError = validateLookup(guideLookup, 'guide', character.name);
        await new Promise((resolve) => setTimeout(resolve, lookupCooldownMs));

        return {
          character: character.name,
          profile: {
            ...profileLookup,
            validationError: profileError || undefined,
          },
          guide: {
            ...guideLookup,
            validationError: guideError || undefined,
          },
          totalDurationMs: Math.round(performance.now() - characterStartedAt),
        };
      },
    );

    const imports = report.flatMap((item) => [
      { character: item.character, kind: 'profile', ...item.profile },
      { character: item.character, kind: 'guide', ...item.guide },
    ]);
    const failedImports = imports.filter(
      (item) => !item.ok || Boolean(item.validationError),
    );
    const durations = imports.map((item) => item.durationMs);
    const sourceStatusTotals = imports.reduce<Record<string, number>>(
      (totals, item) => {
        item.payload?.sources.forEach((source) => {
          totals[source.status] = (totals[source.status] || 0) + 1;
        });
        return totals;
      },
      {},
    );
    const totalDurationMs = Math.round(performance.now() - auditStartedAt);
    const fiveSlowest = imports
      .map((item) => ({
        character: item.character,
        kind: item.kind,
        durationMs: item.durationMs,
        attempts: item.attempts.length,
      }))
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 5);
    const summary = {
      generatedAt: new Date().toISOString(),
      productionCatalogUrl: `${productionApi}/api/characters`,
      catalogSize: characters.length,
      concurrency: auditConcurrency,
      schedulingMode: 'bounded-worker-pool',
      logicalLookupCount: imports.length,
      requestAttemptCount: imports.reduce(
        (total, item) => total + item.attempts.length,
        0,
      ),
      passedLookupCount: imports.length - failedImports.length,
      failedLookupCount: failedImports.length,
      unsuccessfulAttemptCount: imports.reduce(
        (total, item) =>
          total + item.attempts.filter((attempt) => !attempt.ok).length,
        0,
      ),
      rateLimitResponseCount: imports.reduce(
        (total, item) =>
          total +
          item.attempts.filter((attempt) => attempt.status === 429).length,
        0,
      ),
      sourceStatusTotals,
      totalDurationMs,
      latencyMs: {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: Math.max(...durations),
      },
      fiveSlowest,
    };

    const attachmentPath = testInfo.outputPath('import-catalog-audit.json');
    await writeFile(
      attachmentPath,
      JSON.stringify({ summary, characters: report }, null, 2),
      'utf8',
    );

    await testInfo.attach('import-catalog-audit.json', {
      path: attachmentPath,
      contentType: 'application/json',
    });
    process.stdout.write(
      `[import-catalog-audit] ${attachmentPath}\n${JSON.stringify(summary)}\n`,
    );

    expect(summary.logicalLookupCount).toBe(characters.length * 2);
    expect(summary.requestAttemptCount).toBe(summary.logicalLookupCount);
    expect(
      summary.unsuccessfulAttemptCount,
      'Bounded catalog scheduling must not rely on hidden transport or HTTP retries',
    ).toBe(0);
    expect(summary.rateLimitResponseCount).toBe(0);
    expect(
      failedImports.map((item) => ({
        character: item.character,
        endpoint: item.endpoint,
        durationMs: item.durationMs,
        attempts: item.attempts,
        error: item.validationError || item.error,
      })),
      'Every catalog lookup must satisfy timeout, schema, encoding, and field-isolation guarantees',
    ).toEqual([]);
  } finally {
    await Promise.all([local.dispose(), production.dispose()]);
  }
});
