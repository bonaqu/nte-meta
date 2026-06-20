type StructuredData = Record<string, unknown>;

type PageMetadata = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: 'website' | 'article';
  structuredData?: StructuredData;
};

const SITE_URL = 'https://bonaqu.github.io/nte-meta';
const DEFAULT_IMAGE = `${SITE_URL}/assets/logo.svg`;

function ensureMeta(selector: string, attribute: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    const [name, key] = attribute.split(':');
    element.setAttribute(name, key);
    document.head.append(element);
  }
  element.content = value;
}

export function setPageMetadata({
  title,
  description,
  path = '/',
  image = DEFAULT_IMAGE,
  type = 'website',
  structuredData,
}: PageMetadata) {
  const canonicalUrl = `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const socialImage = new URL(image, `${SITE_URL}/`).toString();
  document.title = `${title} | NTE Meta`;

  ensureMeta('meta[name="description"]', 'name:description', description);
  ensureMeta('meta[property="og:title"]', 'property:og:title', title);
  ensureMeta(
    'meta[property="og:description"]',
    'property:og:description',
    description,
  );
  ensureMeta('meta[property="og:type"]', 'property:og:type', type);
  ensureMeta('meta[property="og:url"]', 'property:og:url', canonicalUrl);
  ensureMeta('meta[property="og:image"]', 'property:og:image', socialImage);
  ensureMeta(
    'meta[name="twitter:card"]',
    'name:twitter:card',
    'summary_large_image',
  );
  ensureMeta('meta[name="twitter:title"]', 'name:twitter:title', title);
  ensureMeta(
    'meta[name="twitter:description"]',
    'name:twitter:description',
    description,
  );
  ensureMeta('meta[name="twitter:image"]', 'name:twitter:image', socialImage);

  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = canonicalUrl;

  const existingSchema = document.head.querySelector(
    'script[data-nte-structured-data]',
  );
  existingSchema?.remove();
  if (structuredData) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.nteStructuredData = 'true';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      ...structuredData,
      url: canonicalUrl,
    });
    document.head.append(script);
  }
}
