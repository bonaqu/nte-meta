const viteBase =
  import.meta.env.BASE_URL === './' ? '/' : import.meta.env.BASE_URL;
const publicBase = viteBase.endsWith('/') ? viteBase : `${viteBase}/`;
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// These exact legacy CDN portraits are already bundled with the site. Keeping
// their resolution here covers cards, heroes, teams and editorial previews.
const bundledPortraits: Record<string, string> = {
  Адлер: 'Adler.webp',
  Аурелия: 'Aurelia.png',
  Даффодил: 'Daffodill.webp',
  Минт: 'Mint.webp',
  Наналли: 'Nanally.webp',
  Сакири: 'Sakiri.webp',
  Хотори: 'Hotori.webp',
  Шинку: 'Shinku.webp',
};

const currentPortraits: Record<string, string> = {
  'https://neverness.gg/wp-content/uploads/sites/88/2026/06/Akane-Rin-Character-NTE.webp':
    'assets/characters/akane.webp',
  'https://www.kaiden.gg/img/nte/UI/UI_Icon/AvatarImage/200/player_heiyu.webp':
    'assets/characters/blackbird.webp',
  'https://www.kaiden.gg/img/nte/UI/UI_Icon/AvatarImage/200/player_yiluoyi.webp':
    'assets/characters/iroi.webp',
  'https://www.kaiden.gg/img/nte/UI/UI_Icon/AvatarImage/200/player_lingke.webp':
    'assets/characters/linko.webp',
  'https://www.kaiden.gg/img/nte/UI/UI_Icon/AvatarImage/200/player_canhong.webp':
    'assets/characters/zankou.webp',
  'https://www.neverness.app/assets/codex/outfits/YH_UI_shizhuang_big_heiyu/splash.webp':
    'assets/characters/splashes/blackbird.webp',
  'https://www.neverness.app/assets/codex/outfits/YH_UI_shizhuang_big_yiluoyi/splash.webp':
    'assets/characters/splashes/iroi.webp',
  'https://www.neverness.app/assets/codex/outfits/YH_UI_shizhuang_big_lingke/splash.webp':
    'assets/characters/splashes/linko.webp',
  'https://www.neverness.app/assets/codex/outfits/YH_UI_shizhuang_big_canhong/splash.webp':
    'assets/characters/splashes/zankou.webp',
};
function resolveBundledPortrait(value: string) {
  if (currentPortraits[value]) return currentPortraits[value];
  try {
    const url = new URL(value);
    if (
      url.hostname === 'static.wikia.nocookie.net' &&
      url.pathname.startsWith('/neverness-to-everness/images/')
    ) {
      const file = decodeURIComponent(url.pathname.split('/')[5] || '');
      for (const [name, asset] of Object.entries(bundledPortraits)) {
        if (
          [
            `${name}_Иконка.png`,
            `СплэшАрт_${name}.webp`,
            `${name}_Представление.jpg`,
          ].includes(file)
        ) {
          return `assets/characters/${asset}`;
        }
      }
    }
    if (url.hostname === 'ntewiki.org') {
      if (
        url.pathname ===
        '/images/characters/avatars/YH_lihui_character_baizhang.png'
      )
        return 'assets/characters/Baicang.webp';
      if (
        url.pathname ===
        '/images/characters/avatars/YH_lihui_fashionshop_haiyue1.png'
      )
        return 'assets/characters/Aurelia.png';
    }
  } catch {
    /* Relative and embedded assets are handled below. */
  }
  return value;
}

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
export function resolveAssetUrl(
  value?: string | null,
  size: 'default' | 'large' = 'default',
) {
  let url = resolveBundledPortrait(normalizeExternalAssetUrl(value));
  if (size === 'large') {
    const portrait = url.match(
      /^(?:\/nte-meta\/|\/)?assets\/characters\/(Adler|Aurelia|Baicang|Daffodill|Mint|Nanally|Sakiri|Hotori|blackbird|iroi|linko|zankou)\.(?:webp|png)$/,
    );
    if (portrait) url = `assets/characters/splashes/${portrait[1]}.webp`;
  }
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
  const url = String(value || '')
    .trim()
    .replace(/&amp;/g, '&');
  if (!url) return '';

  if (/^https:\/\/static\.wikia\.nocookie\.net\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const pathPrefix = [...parsed.searchParams.entries()].find(
        ([key]) => key.trim().replace(/^\++/, '') === 'path-prefix',
      )?.[1];
      parsed.pathname = parsed.pathname
        .replace(
          /\/revision\/latest(?:\/(?:scale-to-width-down|smart|thumbnail|width)\/[^/?#]+|\/[^/?#]+)?$/i,
          '/revision/latest',
        )
        .replace(/\/revision\/latest\/width\/[^/?#]+$/i, '/revision/latest')
        .replace(/\/revision\/latest\/[^/?#]+$/i, '/revision/latest');
      parsed.search = '';
      if (pathPrefix) parsed.searchParams.set('path-prefix', pathPrefix.trim());
      return parsed.toString();
    } catch {
      return url;
    }
  }

  return url;
}
