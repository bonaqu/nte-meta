import { useState } from 'react';
import {
  saveEntity,
  translateLeakCandidate,
  updateLeakCandidateEditorial,
} from '../../lib/api';
import type { LeakCandidate } from '../../types';

export function AddDiscoverySource() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <details className="discovery-source-editor">
      <summary>Добавить свой источник</summary>
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setPending(true);
          setMessage('');
          const url = String(data.get('url') || '').trim();
          let sourceType = 'website';
          try {
            if (new URL(url).hostname === 't.me') sourceType = 'telegram';
          } catch {
            setMessage('Укажите полный HTTPS-адрес.');
            setPending(false);
            return;
          }
          const result = await saveEntity('/api/sources', {
            sourceName: data.get('name'),
            sourceUrl: url,
            sourceType,
            trustLevel: 'низкий',
            autoImportEnabled: true,
            language: data.get('language'),
            contentKind: data.get('kind'),
            parser: 'feed',
          });
          setPending(false);
          setMessage(
            result.ok
              ? 'Источник добавлен. Он будет проверен при следующем поиске.'
              : result.error,
          );
          if (result.ok) form.reset();
        }}
      >
        <label>
          Название источника
          <input name="name" required maxLength={120} />
        </label>
        <label>
          Ссылка на Telegram, Reddit или RSS/Atom
          <input
            name="url"
            type="url"
            required
            placeholder="https://t.me/имя_канала"
          />
        </label>
        <label>
          Язык
          <select name="language">
            <option value="unknown">Определить автоматически</option>
            <option value="ru">RU</option>
            <option value="en">EN</option>
            <option value="ja">JP</option>
            <option value="zh">CN</option>
          </select>
        </label>
        <label>
          Содержание
          <select name="kind">
            <option value="leak">Сливы, слухи, пасхалки и советы</option>
            <option value="news">Новости и официальные анонсы</option>
          </select>
        </label>
        <p>
          Для сайта укажите адрес RSS/Atom. Публичные Telegram-каналы и разделы
          Reddit определяются по ссылке.
        </p>
        <button type="submit" className="primary-button" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Подключить источник'}
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}

export function CandidateTranslation({
  candidate,
  onAccepted,
}: {
  candidate: LeakCandidate;
  onAccepted: (title: string, excerpt: string) => void;
}) {
  const [proposal, setProposal] = useState<{
    title: string;
    excerpt: string;
    provider: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (candidate.language === 'ru') return null;
  return (
    <div className="candidate-translation">
      {candidate.translatedTitle ? (
        <details>
          <summary>Сохранённый перевод</summary>
          <strong>{candidate.translatedTitle}</strong>
          <p>{candidate.translatedExcerpt}</p>
        </details>
      ) : null}
      <button
        type="button"
        className="ghost-button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError('');
          const result = await translateLeakCandidate(candidate.id);
          setPending(false);
          if (result.ok) setProposal(result.data);
          else setError(result.error);
        }}
      >
        {pending ? 'Готовим перевод…' : 'Предложить перевод на русский'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {proposal ? (
        <fieldset>
          <legend>Предложение перевода — {proposal.provider}</legend>
          <label>
            Заголовок на русском
            <input
              value={proposal.title}
              maxLength={180}
              onChange={(event) =>
                setProposal({ ...proposal, title: event.target.value })
              }
            />
          </label>
          <label>
            Текст на русском
            <textarea
              value={proposal.excerpt}
              rows={6}
              maxLength={4000}
              onChange={(event) =>
                setProposal({ ...proposal, excerpt: event.target.value })
              }
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              disabled={pending || !proposal.title.trim()}
              onClick={async () => {
                setPending(true);
                const result = await updateLeakCandidateEditorial(
                  candidate.id,
                  {
                    translatedTitle: proposal.title,
                    translatedExcerpt: proposal.excerpt,
                    translationStatus: 'переведено',
                  },
                );
                setPending(false);
                if (result.ok) {
                  onAccepted(proposal.title, proposal.excerpt);
                  setProposal(null);
                } else setError(result.error);
              }}
            >
              Использовать перевод
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setProposal(null)}
            >
              Отменить перевод
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
