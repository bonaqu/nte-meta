export type TranslationProposal = {
  title: string;
  excerpt: string;
  provider: string;
  requiresReview?: boolean;
};
export type BrowserTranslationPlan = {
  kind: 'browser-translation';
  sourceLanguage: string;
  title: string;
  excerpt: string;
  terms: Array<{ token: string; from: string; to: string }>;
  names: Array<{ name: string; original_name: string }>;
};

export function translationParts(text: string) {
  const parts: string[] = [];
  let current = '';
  // Keep both Unicode characters and protected game names intact at a boundary.
  for (const unit of text.match(/__NTE_TERM_\d+__|[\s\S]/gu) || []) {
    if (current.length + unit.length > 1400) {
      parts.push(current);
      current = '';
    }
    current += unit;
  }
  if (current) parts.push(current);
  return parts;
}

export async function translateInBrowser(
  plan: BrowserTranslationPlan,
): Promise<TranslationProposal> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  function restore(text: string) {
    for (const term of plan.terms) {
      const token = term.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(token, 'gi'), () => term.to);
    }
    if (/__NTE_TERM_/i.test(text))
      throw new Error(
        'Не удалось восстановить игровые названия в переводе. Повторите запрос.',
      );
    for (const character of plan.names) {
      if (character.original_name.length < 3) continue;
      text = text.replace(
        new RegExp(
          `(?<![\\p{L}\\p{N}])${character.original_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
          'giu',
        ),
        () => character.name,
      );
    }
    return text;
  }
  try {
    const parts = [plan.title, ...translationParts(plan.excerpt)];
    const values = new Array<string>(parts.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(2, parts.length) }, async () => {
        while (next < parts.length) {
          const index = next++;
          if (!parts[index]) {
            values[index] = '';
            continue;
          }
          // The public endpoint explicitly allows cross-origin requests. Never use
          // the site's authenticated request() helper for this third-party call.
          const response = await fetch(
            'https://translate.googleapis.com/translate_a/single',
            {
              method: 'POST',
              credentials: 'omit',
              referrerPolicy: 'no-referrer',
              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded;charset=UTF-8',
              },
              body: new URLSearchParams({
                client: 'gtx',
                sl: plan.sourceLanguage,
                tl: 'ru',
                dt: 't',
                q: parts[index],
              }),
              signal: controller.signal,
            },
          );
          if (!response.ok)
            throw new Error(
              response.status === 429
                ? 'Google Translate ограничил частоту запросов. Повторите перевод позднее.'
                : `Google Translate недоступен из браузера (HTTP ${response.status}).`,
            );
          const payload: unknown = await response.json();
          const segments =
            Array.isArray(payload) && Array.isArray(payload[0])
              ? payload[0]
              : [];
          const translated = segments
            .map((segment) =>
              Array.isArray(segment) && typeof segment[0] === 'string'
                ? segment[0]
                : '',
            )
            .join('');
          if (!translated.trim())
            throw new Error(
              'Сервис перевода не вернул текст. Оригинал сохранён.',
            );
          values[index] = restore(translated);
        }
      }),
    );
    return {
      title: values[0].slice(0, 180),
      excerpt: values.slice(1).join('').slice(0, 4000),
      provider: 'Google Translate',
      requiresReview: true,
    };
  } catch (error) {
    controller.abort();
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error(
        'Перевод занял слишком много времени. Повторите запрос.',
        { cause: error },
      );
    if (error instanceof TypeError)
      throw new Error(
        'Браузер не смог подключиться к Google Translate. Проверьте доступ к сервису.',
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
