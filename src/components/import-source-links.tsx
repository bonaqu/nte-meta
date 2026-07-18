import { ExternalLink, LibraryBig } from 'lucide-react';
import type { CharacterImportSuggestion } from '../types';

export function ImportSourceLinks({
  suggestion,
}: {
  suggestion: CharacterImportSuggestion;
}) {
  const sources = suggestion.sources?.length
    ? suggestion.sources
    : suggestion.sourceUrl
      ? [{ name: suggestion.sourceName, url: suggestion.sourceUrl }]
      : [];

  if (!sources.length) return null;

  if (sources.length === 1) {
    return (
      <a className="import-source-link" href={sources[0].url} target="_blank" rel="noreferrer">
        <ExternalLink aria-hidden="true" />
        Источник
      </a>
    );
  }

  return (
    <details className="import-source-list">
      <summary>
        <LibraryBig aria-hidden="true" />
        Объединено из {sources.length} источников
      </summary>
      <ul>
        {sources.map((source) => (
          <li key={`${source.name}:${source.url}`}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.name}
              <ExternalLink aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
