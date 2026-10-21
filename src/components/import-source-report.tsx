import type { CharacterImportSource } from '../types';

const statusLabels: Record<CharacterImportSource['status'], string> = {
  ok: 'Данные найдены',
  partial: 'Нет подходящих данных',
  blocked: 'Автодоступ ограничен',
  failed: 'Недоступен',
  reference: 'Для ручной сверки',
  timeout: 'Не ответил вовремя',
};

export function ImportSourceReport({
  sources,
  checkedAt,
}: {
  sources: CharacterImportSource[];
  checkedAt?: string;
}) {
  if (!sources.length) return null;
  return (
    <details className="import-source-report">
      <summary>Источники и доступность ({sources.length})</summary>
      {checkedAt ? (
        <p>
          Поиск выполнен:{' '}
          <time dateTime={checkedAt}>
            {new Date(checkedAt).toLocaleString('ru-RU')}
          </time>
          . Доступность страницы не подтверждает актуальность билда для
          выбранного патча.
        </p>
      ) : null}
      <ul>
        {sources.map((source) => (
          <li key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.name}
            </a>
            <span className={`source-check source-check--${source.status}`}>
              {statusLabels[source.status]}
            </span>
            {source.updatedAt ? (
              <span>
                Обновлён источником:{' '}
                {new Date(source.updatedAt).toLocaleDateString('ru-RU')}
              </span>
            ) : null}
            {source.message ? <p>{source.message}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
