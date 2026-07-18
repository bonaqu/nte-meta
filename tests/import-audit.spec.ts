import {
  expect,
  request as createRequestContext,
  test,
  type APIRequestContext,
} from '@playwright/test';

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
  sources: Array<{ status: string }>;
  suggestions: ImportSuggestion[];
  coverage?: {
    readyFields: string[];
    reviewFields: string[];
    missingFields: string[];
  };
};

const badTextPattern = /(?:Р[ѓџ]|С[ЂЃ]|Ð|Ñ|\uFFFD|�)/u;
const seoBoilerplatePattern =
  /эта страница предназначена|те, кто ищет гайд|материалы персонажа|быстрый способ найти/iu;

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
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await api.post(`/api/${endpoint}/lookup`, {
        headers: {
          'X-Forwarded-For': `198.51.100.${(index % 240) + 1}`,
        },
        data: { query: character },
        timeout: 60_000,
      });
      expect(
        response.ok(),
        `${character}: ${endpoint} HTTP ${response.status()}`,
      ).toBeTruthy();
      return (await response.json()).data as ImportPayload;
    } catch (error) {
      lastError = error;
      if (attempt === 0)
        await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  throw lastError;
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
    const characters = (await catalogResponse.json()).data as Array<{
      name: string;
      status?: string;
    }>;
    expect(characters.length).toBeGreaterThan(0);

    const report: Array<Record<string, unknown>> = [];
    for (const [index, character] of characters.entries()) {
      const profileImport = await lookup(
        local,
        'character-import',
        character.name,
        index * 2,
      );
      inspectSuggestions(
        profileImport.suggestions,
        'character',
        character.name,
      );

      const guideImport = await lookup(
        local,
        'guide-import',
        character.name,
        index * 2 + 1,
      );
      inspectSuggestions(guideImport.suggestions, 'guide', character.name);

      report.push({
        character: character.name,
        profileSuggestions: profileImport.suggestions.length,
        guideSuggestions: guideImport.suggestions.length,
        profileCoverage: profileImport.coverage,
        guideCoverage: guideImport.coverage,
        profileSourcesOk: profileImport.sources.filter(
          (source) => source.status === 'ok',
        ).length,
        guideSourcesOk: guideImport.sources.filter(
          (source) => source.status === 'ok',
        ).length,
      });
    }

    await testInfo.attach('import-catalog-audit.json', {
      body: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
      contentType: 'application/json',
    });
  } finally {
    await Promise.all([local.dispose(), production.dispose()]);
  }
});
