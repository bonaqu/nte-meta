import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const template = await readFile(path.join(distDir, 'index.html'), 'utf8');
const siteUrl = 'https://bonaqu.github.io/nte-meta';
const apiBase = String(process.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const sections = [
  [
    'characters',
    'Персонажи',
    'Персонажи Neverness to Everness: роли, атрибуты, тиры и подробные гайды.',
  ],
  [
    'guides',
    'Гайды',
    'Практические гайды NTE Meta: ротации, билды, команды и ошибки.',
  ],
  ['tierlists', 'Тир-листы', 'Base C0 и Premium C6 тир-листы NTE Meta.'],
  ['news', 'Новости', 'Новости Neverness to Everness и редакционные разборы.'],
  [
    'leaks',
    'Сливы и слухи',
    'Слухи и сливы NTE с источниками, статусами и уровнем доверия.',
  ],
  ['teams', 'Команды', 'F2P и Premium команды NTE с ролями и ротациями.'],
  [
    'rotations',
    'Ротации',
    'Простые, advanced, boss и AoE-ротации персонажей NTE.',
  ],
  [
    'videos',
    'Видео-гайды',
    'Видео-гайды NTE Meta с текстовыми версиями и таймкодами.',
  ],
  [
    'community',
    'Комьюнити-хаб',
    'Обсуждения, комментарии и оценки материалов NTE Meta.',
  ],
  ['admin', 'Админка', 'Защищённая редакционная CMS NTE Meta.'],
  [
    'profile',
    'Профиль',
    'Настройки аккаунта и безопасность пользователя NTE Meta.',
  ],
];

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function replaceMeta(html, selector, value) {
  const escaped = escapeHtml(value);
  const expression = new RegExp(
    `(<meta[^>]+${selector}[^>]+content=")[^"]*(")`,
    'i',
  );
  return html.replace(expression, `$1${escaped}$2`);
}

function renderDocument(page) {
  const canonical = `${siteUrl}/${page.route ? `${page.route}/` : ''}`;
  const title = `${page.title} | NTE Meta`;
  const description = page.description.slice(0, 180);
  const image = page.image
    ? new URL(page.image, `${siteUrl}/`).toString()
    : `${siteUrl}/assets/logo.svg`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': page.schemaType || 'WebPage',
    name: page.title,
    headline: page.title,
    description,
    inLanguage: 'ru-RU',
    url: canonical,
    ...(page.date ? { dateModified: page.date } : {}),
  };

  let html = template.replace(
    /<title>.*?<\/title>/s,
    `<title>${escapeHtml(title)}</title>`,
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${canonical}" />`,
  );
  html = replaceMeta(html, 'name="description"', description);
  html = replaceMeta(html, 'property="og:title"', page.title);
  html = replaceMeta(html, 'property="og:description"', description);
  html = replaceMeta(html, 'property="og:image"', image);
  html = replaceMeta(
    html,
    'property="og:type"',
    page.article ? 'article' : 'website',
  );
  html = replaceMeta(html, 'name="twitter:title"', page.title);
  html = replaceMeta(html, 'name="twitter:description"', description);
  html = html.replace(
    /<script type="application\/ld\+json">.*?<\/script>/s,
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`,
  );
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><main><article><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(description)}</p></article></main></div>`,
  );
  return html;
}

async function loadCollection(name) {
  if (!apiBase) return [];
  try {
    const response = await fetch(`${apiBase}/api/${name}`);
    if (!response.ok) throw new Error(`${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    console.warn(`Prerender: ${name} не загружен из API (${error.message}).`);
    return [];
  }
}

const [characters, guides, news, leaks, teams] = await Promise.all(
  ['characters', 'guides', 'news', 'leaks', 'teams'].map(loadCollection),
);

const pages = [
  {
    route: '',
    title: 'Русская мета Neverness to Everness',
    description:
      'NTE Meta - русскоязычный meta-hub: тир-листы, глубокие гайды, ротации, команды, новости, сливы и комьюнити.',
  },
  ...sections.map(([route, title, description]) => ({
    route,
    title,
    description,
  })),
  ...characters.map((item) => ({
    route: `characters/${item.slug}`,
    title: `${item.name} - гайд, билд и команды`,
    description: item.shortDescription,
    image: item.splashUrl,
    article: true,
  })),
  ...guides.map((item) => ({
    route: `guides/${item.slug}`,
    title: item.title,
    description: item.summary,
    date: item.updatedAt,
    article: true,
    schemaType: 'TechArticle',
  })),
  ...news.map((item) => ({
    route: `news/${item.slug}`,
    title: item.title,
    description: item.summary,
    image: item.imageUrl,
    date: item.updatedAt || item.date,
    article: true,
    schemaType: 'NewsArticle',
  })),
  ...leaks.map((item) => ({
    route: `leaks/${item.slug}`,
    title: item.title,
    description: item.summary,
    date: item.updatedAt || item.date,
    article: true,
    schemaType: 'Article',
  })),
  ...teams.map((item) => ({
    route: `teams/${item.slug || item.id}`,
    title: `${item.title} - состав и ротация`,
    description: item.synergy,
    date: item.updatedAt,
  })),
];

for (const page of pages) {
  const target = page.route ? path.join(distDir, page.route) : distDir;
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'index.html'), renderDocument(page));
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map(
    (page) =>
      `  <url><loc>${siteUrl}/${page.route ? `${page.route}/` : ''}</loc>${page.date ? `<lastmod>${String(page.date).slice(0, 10)}</lastmod>` : ''}</url>`,
  ),
  '</urlset>',
].join('\n');

await writeFile(path.join(distDir, 'sitemap.xml'), sitemap);
await writeFile(path.join(distDir, '404.html'), renderDocument(pages[0]));
console.log(`Prerender: создано ${pages.length} индексируемых страниц.`);
