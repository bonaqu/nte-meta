const viteBase =
  import.meta.env.BASE_URL === './' ? '/' : import.meta.env.BASE_URL;
const publicBase = viteBase.endsWith('/') ? viteBase : `${viteBase}/`;
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function resolveExternalAssetProxy(value: string) {
  if (!apiBase) return value;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'www.neverness.app' &&
      /^\/assets\/codex\/(?:likeability|outfits)\/[A-Za-z0-9_./-]+\.webp$/i.test(
        url.pathname,
      )
    ) {
      return `${apiBase}/api/media?url=${encodeURIComponent(url.toString())}`;
    }
  } catch {
    return value;
  }
  return value;
}

/**
 * D1 хранит локальные медиа как `assets/...`, чтобы данные не зависели от
 * домена. Здесь путь один раз привязывается к Vite base и работает как на
 * GitHub Pages, так и в локальной разработке или на будущем домене.
 */
export function resolveAssetUrl(value?: string | null) {
  const url = normalizeExternalAssetUrl(value);
  if (!url) return '';
  if (/^https?:/i.test(url)) return resolveExternalAssetProxy(url);
  if (/^(?:data:|blob:)/i.test(url)) return url;
  if (url.startsWith(publicBase) || url.startsWith('/nte-meta/')) return url;
  if (url.startsWith('/assets/')) {
    return `${publicBase}${url.slice(1)}`;
  }
  if (url.startsWith('assets/')) {
    return `${publicBase}${url}`;
  }
  return url;
}

export function normalizeExternalAssetUrl(value?: string | null) {
  const url = String(value || '').trim().replace(/&amp;/g, '&');
  if (!url) return '';

  if (/^https:\/\/static\.wikia\.nocookie\.net\//i.test(url)) {
    try {
      const parsed = new URL(url);
      parsed.pathname = parsed.pathname
        .replace(
        /\/revision\/latest(?:\/(?:scale-to-width-down|smart|thumbnail|width)\/[^/?#]+|\/[^/?#]+)?$/i,
        '/revision/latest',
      )
        .replace(/\/revision\/latest\/width\/[^/?#]+$/i, '/revision/latest')
        .replace(/\/revision\/latest\/[^/?#]+$/i, '/revision/latest');
      parsed.searchParams.delete('cb');
      return parsed.toString();
    } catch {
      return url;
    }
  }

  return url;
}
