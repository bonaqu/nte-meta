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

function stripMarkdown(value, max = 900) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/@youtube\([^)]+\)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`|:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function renderStaticSection(section) {
  const body = stripMarkdown(section.body || section.content || '');
  if (!section.title || !body) return '';
  return `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(body)}</p></section>`;
}

function renderStaticRoot(page) {
  const sections = (page.staticSections || [])
    .map(renderStaticSection)
    .filter(Boolean)
    .join('');
  return `<div id="root"><main><article><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p>${sections}</article></main></div>`;
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
    renderStaticRoot(page),
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
    if (apiBase) {
      throw new Error(
        `Prerender: ${name} не загружен из API ${apiBase} (${error.message}).`,
        { cause: error },
      );
    }
    console.warn(`Prerender: ${name} не загружен (${error.message}).`);
    return [];
  }
}

const [characters, guides, news, leaks, threads] = await Promise.all(
  ['characters', 'guides', 'news', 'leaks', 'threads'].map(loadCollection),
);

const pages = [
  {
    route: '',
    title: 'Русская мета Neverness to Everness',
    description:
      'NTE Meta - русскоязычный meta-hub: тир-листы, глубокие персонажные гайды, новости, сливы и обсуждения под материалами.',
  },
  ...sections.map(([route, title, description]) => ({
    route,
    title,
    description,
  })),
  ...characters.map((item) => ({
    route: `characters/${item.slug}`,
    title: `${item.name} - биография, способности и озвучка`,
    description: item.profile?.biographyShort || item.shortDescription,
    image: item.splashUrl,
    article: true,
    staticSections: [
      {
        title: 'Профиль',
        body: `${item.rarity || ''} · ${item.attribute || ''} · ${item.role || ''} · ${item.profile?.faction || 'Фракция уточняется'}`,
      },
      {
        title: 'Биография',
        body: item.profile?.biography || item.summary || item.shortDescription,
      },
      {
        title: 'Способности',
        body: (item.profile?.abilities || [])
          .slice(0, 5)
          .map((ability) => `${ability.name}: ${ability.description}`)
          .join(' '),
      },
      {
        title: 'Материалы',
        body: (item.profile?.materials || [])
          .slice(0, 8)
          .map((material) => `${material.name}: ${material.amount} (${material.source})`)
          .join(' '),
      },
    ],
  })),
  ...guides.map((item) => ({
    route: `guides/${item.slug}`,
    title: item.title,
    description: item.summary,
    date: item.updatedAt,
    article: true,
    schemaType: 'TechArticle',
    staticSections: [
      { title: 'Краткий вывод', body: item.summary },
      ...(item.sections || [])
        .slice()
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
        .slice(0, 6)
        .map((section) => ({
          title: section.title,
          body: section.content,
        })),
    ],
  })),
  ...news.map((item) => ({
    route: `news/${item.slug}`,
    title: item.title,
    description: item.summary,
    image: item.imageUrl,
    date: item.updatedAt || item.date,
    article: true,
    schemaType: 'NewsArticle',
    staticSections: [{ title: 'Материал', body: item.body || item.bodyMarkdown }],
  })),
  ...leaks.map((item) => ({
    route: `leaks/${item.slug}`,
    title: item.title,
    description: item.summary,
    date: item.updatedAt || item.date,
    article: true,
    schemaType: 'Article',
    staticSections: [
      {
        title: 'Статус и источник',
        body: `${item.status || 'слух'} · доверие: ${item.trustLevel || 'средний'} · источник: ${item.sourceName || 'не указан'}`,
      },
      { title: 'Материал', body: item.body || item.bodyMarkdown },
    ],
  })),
  ...threads.map((item) => ({
    route: `threads/${item.slug}`,
    title: item.title,
    description: item.summary,
    date: item.updatedAt || item.createdAt,
    article: true,
    schemaType: 'DiscussionForumPosting',
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
