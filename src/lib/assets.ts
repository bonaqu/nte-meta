const viteBase =
  import.meta.env.BASE_URL === './' ? '/' : import.meta.env.BASE_URL;
const publicBase = viteBase.endsWith('/') ? viteBase : `${viteBase}/`;

/**
 * D1 хранит локальные медиа как `assets/...`, чтобы данные не зависели от
 * домена. Здесь путь один раз привязывается к Vite base и работает как на
 * GitHub Pages, так и в локальной разработке или на будущем домене.
 */
export function resolveAssetUrl(value?: string | null) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith(publicBase) || url.startsWith('/nte-meta/')) return url;
  if (url.startsWith('/assets/')) {
    return `${publicBase}${url.slice(1)}`;
  }
  if (url.startsWith('assets/')) {
    return `${publicBase}${url}`;
  }
  return url;
}
