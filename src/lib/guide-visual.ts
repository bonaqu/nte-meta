import type {
  Character,
  GuideSection,
  GuideVisual,
  GuideVisualItem,
  GuideVisualKind,
} from '../types';

export const visualKinds: Array<[GuideVisualKind, string]> = [
  ['arcs', 'Лучшие дуги'],
  ['cartridges', 'Лучшие картриджи'],
  ['stats', 'Основные статы'],
  ['skills', 'Приоритет прокачки навыков'],
  ['rotation', 'Базовая ротация'],
];
export function visualKind(type: string): GuideVisualKind | undefined {
  return (
    {
      'best-arcs': 'arcs',
      'alternative-arcs': 'arcs',
      arcs: 'arcs',
      modules: 'cartridges',
      cartridges: 'cartridges',
      'main-stats': 'stats',
      'sub-stats': 'stats',
      'skill-priority': 'skills',
      rotation: 'rotation',
      rotations: 'rotation',
    } as Record<string, GuideVisualKind>
  )[type];
}
export function newVisualItem(name = ''): GuideVisualItem {
  return {
    id: crypto.randomUUID(),
    name,
    imageUrl: '',
    description: '',
    stats: [],
  };
}
export function visualFromLegacy(
  section: GuideSection,
  character?: Character,
): GuideVisual | undefined {
  if (section.visual) return section.visual;
  const kind = visualKind(section.type);
  if (!kind) return;
  const text = section.content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*#]/g, '')
    .trim();
  let values = text
    .split(/\n+/)
    .map((x) => x.replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim())
    .filter(Boolean);
  if (kind === 'skills' && values.length === 1 && /→|>/u.test(text))
    values = text
      .split(/→|>/)
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    kind,
    items: values.slice(0, 40).map((name, index) => {
      const ability =
        kind === 'skills'
          ? character?.profile?.abilities?.find(
              (a) =>
                a.name === name || a.type.toLowerCase() === name.toLowerCase(),
            )
          : undefined;
      return {
        id: `${section.id}-visual-${index}`,
        name,
        description: '',
        imageUrl: ability?.iconUrl || '',
        stats: [],
      };
    }),
  };
}
export function visualFromImport(
  kind: GuideVisualKind,
  rows: unknown,
): GuideVisual {
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      rows = [rows];
    }
  }
  let values = Array.isArray(rows) ? rows : [rows];
  if (kind === 'skills')
    values = values.flatMap((row) => {
      const text =
        typeof row === 'object' && row
          ? String((row as Record<string, unknown>).description || '')
          : String(row);
      return /→|>/.test(text)
        ? text
            .split(/→|>/)
            .map((name) => ({ name: name.trim() }))
            .filter((row) => row.name)
        : [row];
    });
  return {
    kind,
    items: values.slice(0, 40).map((row, i) => {
      const item =
        typeof row === 'object' && row
          ? (row as Record<string, unknown>)
          : { name: String(row) };
      return {
        id: crypto.randomUUID(),
        name: String(item.name || item.title || item.label || ''),
        imageUrl: String(item.imageUrl || item.iconUrl || ''),
        description: String(item.description || item.value || ''),
        category:
          (item.category as GuideVisualItem['category']) ||
          (kind === 'arcs' || kind === 'cartridges'
            ? i === 0
              ? 'signature'
              : 'replacement'
            : undefined),
        stats: Array.isArray(item.stats)
          ? (item.stats as GuideVisualItem['stats'])
          : [],
        sourceUrl:
          typeof item.sourceUrl === 'string' ? item.sourceUrl : undefined,
      };
    }),
  };
}
export function isPrivateGuideSection(section: GuideSection) {
  return [
    'source',
    'sources',
    'references',
    'team',
    'teams',
    'f2p-teams',
    'premium-teams',
    'starter-teams',
    'endgame-teams',
  ].includes(section.type);
}

export function stripEditorialText(text: string) {
  return text
    .replace(
      /\s*Награда за уровень в проверенном источнике не указана\.?/giu,
      '',
    )
    .replace(/\s*Источники сверены[^\n]*?для версии \d+(?:\.\d+)*\.?/g, '')
    .replace(/\n\nСверено \d{4}-\d{2}-\d{2}[\s\S]*$/, '')
    .replace(
      /(?:^|\n)(?:Источник состава:|Сверено \d{4}|Версия 1\.4; источники)[^\n]*/g,
      '',
    )
    .replace(
      /\s*Вариант Wotpack; уточняйте порядок навыков под доступные пробуждения\./g,
      '',
    )
    .replace(/\s*Вариант Kaiden, октябрь 2026\./g, '')
    .replace(/\n\n#+\s*(?:Источники|Источники и актуальность)[\s\S]*$/i, '')
    .trim();
}
