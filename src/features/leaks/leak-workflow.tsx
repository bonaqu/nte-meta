import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FilePenLine,
  Languages,
  Radar,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { EmptyState, StatusBanner } from '../../components/ui-state';
import {
  discoverLeakCandidates,
  loadLeakCandidates,
  promoteLeakCandidate,
  reviewLeakCandidate,
  submitLeakCandidate,
} from '../../lib/api';
import type {
  LeakCandidate,
  LeakCandidateReviewStatus,
  LeakDiscoverySource,
  LeakStatus,
} from '../../types';

const languageLabels: Record<LeakCandidate['language'], string> = {
  ru: 'Русский',
  en: 'Английский',
  zh: 'Китайский',
  unknown: 'Язык не определён',
};

const reviewLabels: Record<LeakCandidateReviewStatus, string> = {
  pending: 'На проверке',
  accepted: 'Создан черновик',
  rejected: 'Отклонено',
  duplicate: 'Дубликат',
};

const sourceStatusLabels: Record<LeakDiscoverySource['status'], string> = {
  ok: 'Найдены публикации',
  partial: 'Новых публикаций нет',
  blocked: 'Источник блокирует сбор',
  failed: 'Источник недоступен',
  timeout: 'Источник не ответил',
  manual: 'Ручная проверка',
};

export function LeakSubmissionButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<LeakStatus>('слух');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'danger' | 'success'>('info');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const result = await submitLeakCandidate({
      title,
      sourceUrl,
      sourceName: sourceName || undefined,
      note,
      status,
    });
    if (result.ok) {
      setTone('success');
      setMessage('Спасибо. Ссылка добавлена в закрытую редакционную очередь.');
      setTitle('');
      setSourceUrl('');
      setSourceName('');
      setNote('');
      setStatus('слух');
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <>
      <button
        className="ghost-button"
        type="button"
        onClick={() => {
          setMessage('');
          dialogRef.current?.showModal();
        }}
      >
        <Send aria-hidden="true" /> Предложить слух
      </button>
      <dialog className="confirm-dialog leak-submit-dialog" ref={dialogRef}>
        <form className="leak-submit-form" onSubmit={submit}>
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Предложение редакции</p>
              <h2>Отправить слух или слив</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Закрыть"
              title="Закрыть"
              onClick={() => dialogRef.current?.close()}
            >
              <XCircle aria-hidden="true" />
            </button>
          </div>
          <p>
            Публикация не появится на сайте автоматически. Редактор проверит
            первоисточник, перевод и контекст.
          </p>
          <label>
            Что произошло
            <input
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={5}
              maxLength={180}
              required
            />
          </label>
          <label>
            Ссылка на первоисточник
            <input
              name="sourceUrl"
              type="url"
              inputMode="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://..."
              required
            />
          </label>
          <div className="leak-submit-grid">
            <label>
              Название источника
              <input
                name="sourceName"
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                maxLength={120}
                placeholder="Необязательно"
              />
            </label>
            <label>
              Как это обозначено
              <select
                name="status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as LeakStatus)
                }
              >
                <option value="слух">Слух</option>
                <option value="слив">Слив</option>
                <option value="подтверждено">Подтверждено</option>
                <option value="опровергнуто">Опровергнуто</option>
              </select>
            </label>
          </div>
          <label>
            Контекст для редактора
            <textarea
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="Что важно проверить или перевести"
            />
          </label>
          {message ? <StatusBanner tone={tone} text={message} /> : null}
          <div className="button-row">
            <button className="primary-button" type="submit" disabled={pending}>
              <Send aria-hidden="true" />
              {pending ? 'Отправляем...' : 'Отправить редакции'}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              Закрыть
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function LeakDiscoveryPanel({
  onPromoted,
}: {
  onPromoted: (leakId: string) => void | Promise<void>;
}) {
  const [candidates, setCandidates] = useState<LeakCandidate[]>([]);
  const [sources, setSources] = useState<LeakDiscoverySource[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LeakCandidateReviewStatus | 'all'>(
    'pending',
  );
  const [pending, setPending] = useState(false);
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'danger' | 'success'>('info');

  const visibleCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) => filter === 'all' || candidate.reviewStatus === filter,
      ),
    [candidates, filter],
  );

  useEffect(() => {
    let mounted = true;
    loadLeakCandidates().then((result) => {
      if (!mounted) return;
      if (result.ok) setCandidates(result.data);
      else {
        setTone('danger');
        setMessage(result.error);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function discover(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const result = await discoverLeakCandidates(query);
    if (result.ok) {
      setCandidates(result.data.candidates);
      setSources(result.data.sources);
      setTone('success');
      setMessage(
        result.data.discoveredCount
          ? `Найдено и обновлено публикаций: ${result.data.discoveredCount}.`
          : 'Новых публикаций не найдено. Доступность источников показана ниже.',
      );
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  async function review(
    candidate: LeakCandidate,
    reviewStatus: 'pending' | 'rejected' | 'duplicate',
  ) {
    setActionId(candidate.id);
    const result = await reviewLeakCandidate(candidate.id, reviewStatus);
    if (result.ok) {
      setCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id ? { ...item, reviewStatus } : item,
        ),
      );
      setTone('success');
      setMessage(
        reviewStatus === 'duplicate'
          ? 'Отмечено как дубликат.'
          : 'Решение сохранено.',
      );
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setActionId('');
  }

  async function promote(candidate: LeakCandidate) {
    setActionId(candidate.id);
    const result = await promoteLeakCandidate(candidate.id);
    if (result.ok) {
      setCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id
            ? {
                ...item,
                reviewStatus: 'accepted',
                createdLeakId: result.data.leakId,
              }
            : item,
        ),
      );
      setTone('success');
      setMessage(
        'Создан непубличный черновик. Проверьте перевод и факты справа.',
      );
      await onPromoted(result.data.leakId);
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setActionId('');
  }

  return (
    <section className="leak-discovery" aria-labelledby="leak-discovery-title">
      <div className="leak-discovery-heading">
        <div>
          <p className="eyebrow">Редакционный радар</p>
          <h2 id="leak-discovery-title">Поиск и очередь источников</h2>
          <p>
            Автопоиск собирает только кандидатов. Перевод, фактчек и публикация
            остаются отдельными ручными решениями.
          </p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </div>

      <form className="leak-discovery-search" onSubmit={discover}>
        <label>
          Фильтр поиска
          <input
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Персонаж, версия, баннер..."
          />
        </label>
        <button className="primary-button" type="submit" disabled={pending}>
          <Radar aria-hidden="true" />
          {pending ? 'Проверяем источники...' : 'Найти новые публикации'}
        </button>
      </form>

      {sources.length ? (
        <div className="leak-source-grid" aria-label="Состояние источников">
          {sources.map((source) => (
            <article
              className={`leak-source-status status-${source.status}`}
              key={source.id}
            >
              <span>{sourceStatusLabels[source.status]}</span>
              <strong>{source.name}</strong>
              <small>{source.message}</small>
              <a href={source.url} target="_blank" rel="noreferrer">
                Открыть <ExternalLink aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      ) : null}

      {message ? <StatusBanner tone={tone} text={message} /> : null}

      <div className="leak-queue-toolbar">
        <div className="segmented-control" aria-label="Фильтр очереди">
          {(
            ['pending', 'accepted', 'rejected', 'duplicate', 'all'] as const
          ).map((value) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'active' : ''}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'Все' : reviewLabels[value]}
            </button>
          ))}
        </div>
        <span>{visibleCandidates.length} публикаций</span>
      </div>

      <div className="leak-candidate-list">
        {visibleCandidates.length ? (
          visibleCandidates.map((candidate) => (
            <article className="leak-candidate" key={candidate.id}>
              <div className="leak-candidate-meta">
                <span className={`leak-status ${candidate.suggestedStatus}`}>
                  {candidate.suggestedStatus}
                </span>
                <span>
                  <Languages aria-hidden="true" />{' '}
                  {languageLabels[candidate.language]}
                </span>
                <span>Доверие: {candidate.trustLevel}</span>
                <span>Уверенность: {candidate.confidenceScore}%</span>
                {candidate.origin === 'user' ? (
                  <span>Предложено игроком</span>
                ) : null}
              </div>
              <h3>{candidate.title}</h3>
              <p>
                {candidate.excerpt ||
                  'Описание не извлечено: откройте источник.'}
              </p>
              <div className="leak-candidate-source">
                <strong>{candidate.sourceName}</strong>
                <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                  Первоисточник <ExternalLink aria-hidden="true" />
                </a>
              </div>
              {candidate.language !== 'ru' ? (
                <p className="translation-notice">
                  <Languages aria-hidden="true" /> Нужен редакционный перевод на
                  русский.
                </p>
              ) : null}
              <div className="comment-actions">
                {candidate.reviewStatus === 'pending' ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={actionId === candidate.id}
                      onClick={() => void promote(candidate)}
                    >
                      <FilePenLine aria-hidden="true" /> В черновик
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={actionId === candidate.id}
                      onClick={() => void review(candidate, 'duplicate')}
                    >
                      Дубликат
                    </button>
                    <button
                      className="text-button danger"
                      type="button"
                      disabled={actionId === candidate.id}
                      onClick={() => void review(candidate, 'rejected')}
                    >
                      <XCircle aria-hidden="true" /> Отклонить
                    </button>
                  </>
                ) : (
                  <span className="review-result">
                    <CheckCircle2 aria-hidden="true" />
                    {reviewLabels[candidate.reviewStatus]}
                  </span>
                )}
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="В этой части очереди пусто"
            text="Запустите поиск или переключите фильтр состояния."
          />
        )}
      </div>
    </section>
  );
}
