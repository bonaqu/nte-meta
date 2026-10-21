import type { CharacterImportSuggestion, GuideSection } from '../types';

/** Preserve provenance alongside accepted text, including summary/video imports. */
export function recordGuideSources(
  sections: GuideSection[],
  suggestion: CharacterImportSuggestion,
) {
  const sources = suggestion.sources?.length
    ? suggestion.sources
    : [{ name: suggestion.sourceName, url: suggestion.sourceUrl }];
  const existing = sections.find((section) =>
    ['source', 'sources', 'references'].includes(section.type),
  );
  let content = existing?.content || '';
  for (const source of sources) {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      continue;
    }
    if (!['https:', 'http:'].includes(url.protocol)) continue;
    const safeUrl = url
      .toString()
      .replaceAll('(', '%28')
      .replaceAll(')', '%29');
    if (content.includes(`](${safeUrl})`)) continue;
    const label = source.name.replace(/[[\]\r\n]/g, ' ').trim() || url.hostname;
    content += `${content ? '\n' : ''}- [${label}](${safeUrl})`;
  }
  if (!content || content === existing?.content) return sections;
  if (existing)
    return sections.map((section) =>
      section.id === existing.id ? { ...section, content } : section,
    );
  return [
    ...sections,
    {
      id: `custom-sources-${Date.now()}`,
      title: 'Источники и актуальность',
      type: 'sources',
      content,
      position: sections.length + 1,
    },
  ];
}
