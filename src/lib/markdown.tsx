import React from 'react';
import { getYoutubeEmbedUrl } from './youtube';

function getSafeLink(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderInline(text: string) {
  const parts = text.split(
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g,
  );

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = getSafeLink(link[2]);
      if (!href) {
        return <React.Fragment key={index}>{link[1]}</React.Fragment>;
      }
      return (
        <a key={index} href={href} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function renderTable(lines: string[], key: string) {
  const rows = lines
    .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .map((line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    );

  if (rows.length === 0) {
    return null;
  }

  const [head, ...body] = rows;

  return (
    <div className="table-scroll" key={key}>
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{renderInline(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`${key}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${key}-${rowIndex}-${cellIndex}`}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownPreview({ value }: { value: string }) {
  const lines = value.split('\n');
  const nodes: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith(':::spoiler')) {
      const title = trimmed.replace(':::spoiler', '').trim() || 'Спойлер';
      const content: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ':::') {
        content.push(lines[index]);
        index += 1;
      }
      nodes.push(
        <details key={`spoiler-${index}`} className="spoiler">
          <summary>{title}</summary>
          <MarkdownPreview value={content.join('\n')} />
        </details>,
      );
      index += 1;
      continue;
    }

    const youtubeMatch = trimmed.match(/^@youtube\(([^)]+)\)$/);
    if (youtubeMatch) {
      const embedUrl = getYoutubeEmbedUrl(youtubeMatch[1]);
      if (embedUrl) {
        nodes.push(
          <iframe
            key={`youtube-${index}`}
            className="video-frame"
            src={embedUrl}
            title="YouTube video guide"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />,
        );
      }
      index += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      nodes.push(<h3 key={`h3-${index}`}>{renderInline(trimmed.slice(4))}</h3>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      nodes.push(<h2 key={`h2-${index}`}>{renderInline(trimmed.slice(3))}</h2>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2));
        index += 1;
      }
      nodes.push(
        <blockquote key={`quote-${index}`}>
          {quote.map(renderInline)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${index}`}>
          {items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      nodes.push(
        <ol key={`ol-${index}`}>
          {items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (trimmed.includes('|') && lines[index + 1]?.includes('---')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].includes('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      nodes.push(renderTable(tableLines, `table-${index}`));
      continue;
    }

    const paragraph: string[] = [trimmed];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(##|###|[-*]\s+|\d+\.|> |:::|@youtube)/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '))}</p>);
  }

  return <div className="markdown-preview">{nodes}</div>;
}

export function applyMarkdownAction(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: string,
) {
  const selected = value.slice(selectionStart, selectionEnd) || 'текст';
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);

  const wrappers: Record<string, string> = {
    bold: `**${selected}**`,
    italic: `*${selected}*`,
    h2: `## ${selected}`,
    h3: `### ${selected}`,
    quote: `> ${selected}`,
    list: `- ${selected}`,
    spoiler: `:::spoiler Заголовок\n${selected}\n:::`,
    table: '| Колонка | Значение |\n| --- | --- |\n| Пример | Текст |',
    link: `[${selected}](https://example.com)`,
    youtube: '@youtube(https://www.youtube.com/watch?v=VIDEO_ID)',
  };

  return `${before}${wrappers[action] || selected}${after}`;
}
