import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FilePenLine,
  Languages,
  Radar,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { EmptyState, StatusBanner } from '../../components/ui-state';
import {
  discoverLeakCandidates,
  loadLeakCandidates,
  promoteLeakCandidate,
  reviewLeakCandidate,
  submitLeakCandidate,
  updateLeakCandidateEditorial,
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

const sourceTypeLabels: Record<LeakCandidate['sourceType'], string> = {
  telegram: 'Telegram',
  reddit: 'Reddit',
  website: 'Сайты',
  bilibili: 'Bilibili',
  weibo: 'Weibo',
  'twitter/x': 'X',
  manual: 'Ручные',
};

type LeakBulkAction =
  | 'review:pending'
  | 'review:rejected'
  | 'review:duplicate'
  | 'status:слух'
  | 'status:слив'
  | 'status:подтверждено'
  | 'status:опровергнуто'
  | 'translation:нужен перевод'
  | 'translation:переведено'
  | 'translation:проверено';

const bulkActionLabels: Record<LeakBulkAction, string> = {
  'review:pending': 'Вернуть на проверку',
  'review:rejected': 'Отклонить публикации',
  'review:duplicate': 'Отметить дубликатами',
  'status:слух': 'Указать тип: слух',
  'status:слив': 'Указать тип: слив',
  'status:подтверждено': 'Указать тип: подтверждено',
  'status:опровергнуто': 'Указать тип: опровергнуто',
  'translation:нужен перевод': 'Нужен перевод на русский',
  'translation:переведено': 'Отметить переведёнными',
  'translation:проверено': 'Отметить перевод проверенным',
};

const bulkSuccessLabels: Record<LeakBulkAction, string> = {
  'review:pending': 'Возвращено на проверку',
  'review:rejected': 'Отклонено публикаций',
  'review:duplicate': 'Отмечено дубликатами',
  'status:слух': 'Отмечено как слух',
  'status:слив': 'Отмечено как слив',
  'status:подтверждено': 'Отмечено как подтверждённое',
  'status:опровергнуто': 'Отмечено как опровергнутое',
  'translation:нужен перевод': 'Отправлено на перевод',
  'translation:переведено': 'Отмечено переведёнными',
  'translation:проверено': 'Перевод отмечен проверенным',
};

function candidateTimestamp(candidate: LeakCandidate) {
  return new Date(candidate.publishedAt || candidate.createdAt).getTime();
}

function candidateFreshness(candidate: LeakCandidate) {
  const ageDays = Math.max(
    0,
    (Date.now() - candidateTimestamp(candidate)) / 86_400_000,
  );
  if (ageDays <= 2) return 'Сегодня';
  if (ageDays <= 7) return 'За неделю';
  if (ageDays <= 30) return 'За месяц';
  return 'Архив';
}

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
  const [languageFilter, setLanguageFilter] = useState<
    LeakCandidate['language'] | 'all'
  >('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<
    LeakCandidate['sourceType'] | 'all'
  >('all');
  const [translationFilter, setTranslationFilter] = useState<
    LeakCandidate['translationStatus'] | 'all'
  >('all');
  const [freshnessFilter, setFreshnessFilter] = useState<
    'all' | 'week' | 'month'
  >('all');
  const [queueSort, setQueueSort] = useState<'new' | 'confidence'>('new');
  const [pending, setPending] = useState(false);
  const [actionId, setActionId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkChoice, setBulkChoice] =
    useState<LeakBulkAction>('review:rejected');
  const [bulkAction, setBulkAction] = useState<LeakBulkAction | null>(null);
  const [editorNotes, setEditorNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'danger' | 'success'>('info');
  const bulkDialogRef = useRef<HTMLDialogElement>(null);

  const visibleCandidates = useMemo(() => {
    const now = Date.now();
    return candidates
      .filter(
        (candidate) => filter === 'all' || candidate.reviewStatus === filter,
      )
      .filter(
        (candidate) =>
          languageFilter === 'all' || candidate.language === languageFilter,
      )
      .filter(
        (candidate) =>
          sourceTypeFilter === 'all' ||
          candidate.sourceType === sourceTypeFilter,
      )
      .filter(
        (candidate) =>
          translationFilter === 'all' ||
          candidate.translationStatus === translationFilter,
      )
      .filter((candidate) => {
        if (freshnessFilter === 'all') return true;
        const age = now - candidateTimestamp(candidate);
        return age <= (freshnessFilter === 'week' ? 7 : 30) * 86_400_000;
      })
      .sort((left, right) =>
        queueSort === 'confidence'
          ? right.confidenceScore - left.confidenceScore ||
            candidateTimestamp(right) - candidateTimestamp(left)
          : candidateTimestamp(right) - candidateTimestamp(left),
      );
  }, [
    candidates,
    filter,
    freshnessFilter,
    languageFilter,
    queueSort,
    sourceTypeFilter,
    translationFilter,
  ]);
  const selectableCandidates = visibleCandidates;
  const selectedCandidates = candidates.filter((candidate) =>
    selectedIds.has(candidate.id),
  );
  const allVisibleSelected =
    selectableCandidates.length > 0 &&
    selectableCandidates.every((candidate) => selectedIds.has(candidate.id));
  const sourceSummary = useMemo(
    () => ({
      total: sources.length,
      automatic: sources.filter((source) => source.mode === 'automatic').length,
      manual: sources.filter((source) => source.mode === 'manual').length,
      ru: sources.filter((source) => source.language === 'ru').length,
      en: sources.filter((source) => source.language === 'en').length,
      zh: sources.filter((source) => source.language === 'zh').length,
    }),
    [sources],
  );

  useEffect(() => {
    let mounted = true;
    loadLeakCandidates().then((result) => {
      if (!mounted) return;
      if (result.ok) {
        setCandidates(result.data);
        setSelectedIds(new Set());
        setEditorNotes(
          Object.fromEntries(
            result.data.map((item) => [item.id, item.editorNote || '']),
          ),
        );
      } else {
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
      setSelectedIds(new Set());
      setEditorNotes(
        Object.fromEntries(
          result.data.candidates.map((item) => [
            item.id,
            item.editorNote || '',
          ]),
        ),
      );
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
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(candidate.id);
        return next;
      });
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

  function toggleCandidate(candidateId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleVisibleCandidates() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        selectableCandidates.forEach((candidate) => next.delete(candidate.id));
      } else {
        selectableCandidates.forEach((candidate) => next.add(candidate.id));
      }
      return next;
    });
  }

  function requestBulkAction(action: LeakBulkAction) {
    if (!selectedCandidates.length) return;
    setBulkAction(action);
    bulkDialogRef.current?.showModal();
  }

  async function applyBulkAction() {
    if (!bulkAction || !selectedCandidates.length) return;
    bulkDialogRef.current?.close();
    setActionId('bulk');
    setMessage('');
    const successfulIds = new Set<string>();
    let failedCount = 0;

    for (let index = 0; index < selectedCandidates.length; index += 4) {
      const batch = selectedCandidates.slice(index, index + 4);
      const results = await Promise.all(
        batch.map(async (candidate) => ({
          id: candidate.id,
          result: bulkAction.startsWith('review:')
            ? await reviewLeakCandidate(
                candidate.id,
                bulkAction.slice('review:'.length) as
                  | 'pending'
                  | 'rejected'
                  | 'duplicate',
              )
            : bulkAction.startsWith('status:')
              ? await updateLeakCandidateEditorial(candidate.id, {
                  suggestedStatus: bulkAction.slice(
                    'status:'.length,
                  ) as LeakStatus,
                })
              : await updateLeakCandidateEditorial(candidate.id, {
                  translationStatus: bulkAction.slice(
                    'translation:'.length,
                  ) as LeakCandidate['translationStatus'],
                }),
        })),
      );
      results.forEach(({ id, result }) => {
        if (result.ok) successfulIds.add(id);
        else failedCount += 1;
      });
    }

    setCandidates((current) =>
      current.map((candidate) => {
        if (!successfulIds.has(candidate.id)) return candidate;
        if (bulkAction.startsWith('review:')) {
          return {
            ...candidate,
            reviewStatus: bulkAction.slice(
              'review:'.length,
            ) as LeakCandidateReviewStatus,
          };
        }
        if (bulkAction.startsWith('status:')) {
          return {
            ...candidate,
            suggestedStatus: bulkAction.slice('status:'.length) as LeakStatus,
          };
        }
        return {
          ...candidate,
          translationStatus: bulkAction.slice(
            'translation:'.length,
          ) as LeakCandidate['translationStatus'],
        };
      }),
    );
    setSelectedIds((current) => {
      const next = new Set(current);
      successfulIds.forEach((id) => next.delete(id));
      return next;
    });
    setTone(failedCount ? 'danger' : 'success');
    setMessage(
      failedCount
        ? `Обработано: ${successfulIds.size}. Не удалось обработать: ${failedCount}.`
        : `${bulkSuccessLabels[bulkAction]}: ${successfulIds.size}.`,
    );
    setBulkAction(null);
    setActionId('');
  }

  async function updateEditorial(
    candidate: LeakCandidate,
    patch: Partial<
      Pick<
        LeakCandidate,
        'suggestedStatus' | 'trustLevel' | 'translationStatus' | 'editorNote'
      >
    >,
  ) {
    setActionId(candidate.id);
    const result = await updateLeakCandidateEditorial(candidate.id, patch);
    if (result.ok) {
      setCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id ? { ...item, ...patch } : item,
        ),
      );
      setTone('success');
      setMessage('Редакционная оценка сохранена.');
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setActionId('');
  }

  function renderBulkToolbar() {
    if (!selectedCandidates.length) return null;
    return (
      <div className="leak-bulk-toolbar" aria-label="Групповые действия">
        <div className="leak-bulk-count">
          <CheckCircle2 aria-hidden="true" />
          <span>
            <strong>{selectedCandidates.length}</strong> выбрано
          </span>
        </div>
        <label>
          Действие
          <select
            value={bulkChoice}
            disabled={actionId === 'bulk'}
            onChange={(event) =>
              setBulkChoice(event.target.value as LeakBulkAction)
            }
          >
            <optgroup label="Решение очереди">
              <option value="review:pending">Вернуть на проверку</option>
              <option value="review:rejected">Отклонить</option>
              <option value="review:duplicate">Дубликат</option>
            </optgroup>
            <optgroup label="Тип публикации">
              <option value="status:слух">Слух</option>
              <option value="status:слив">Слив</option>
              <option value="status:подтверждено">Подтверждено</option>
              <option value="status:опровергнуто">Опровергнуто</option>
            </optgroup>
            <optgroup label="Перевод">
              <option value="translation:нужен перевод">Нужен перевод</option>
              <option value="translation:переведено">Переведено</option>
              <option value="translation:проверено">Перевод проверен</option>
            </optgroup>
          </select>
        </label>
        <div className="leak-bulk-actions">
          <button
            className="primary-button"
            type="button"
            disabled={actionId === 'bulk'}
            onClick={() => requestBulkAction(bulkChoice)}
          >
            Применить к выбранным
          </button>
          <button
            className="icon-button"
            type="button"
            title="Снять выбор"
            aria-label="Снять выбор со всех публикаций"
            disabled={actionId === 'bulk'}
            onClick={() => setSelectedIds(new Set())}
          >
            <XCircle aria-hidden="true" />
          </button>
        </div>
      </div>
    );
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
        <section
          className="leak-source-report"
          aria-label="Состояние источников"
        >
          <div className="leak-source-overview">
            <div>
              <strong>{sourceSummary.total}</strong>
              <span>источников</span>
            </div>
            <div>
              <strong>{sourceSummary.automatic}</strong>
              <span>проверяются автоматически</span>
            </div>
            <div>
              <strong>{sourceSummary.manual}</strong>
              <span>открываются для ручной сверки</span>
            </div>
            <div>
              <strong>
                {sourceSummary.ru} RU · {sourceSummary.en} EN ·{' '}
                {sourceSummary.zh} CN
              </strong>
              <span>языковой охват</span>
            </div>
          </div>
          <div className="leak-source-grid">
            {sources.map((source) => (
              <article
                className={`leak-source-status status-${source.status}`}
                key={source.id}
              >
                <span>{sourceStatusLabels[source.status]}</span>
                <strong>{source.name}</strong>
                <small>
                  {source.mode === 'automatic'
                    ? 'Автопроверка'
                    : 'Ручная сверка'}{' '}
                  · {languageLabels[source.language]}
                </small>
                <small>{source.message}</small>
                <a href={source.url} target="_blank" rel="noreferrer">
                  Открыть <ExternalLink aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </section>
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

      {selectableCandidates.length ? (
        <div className="leak-selection-row">
          <label className="leak-select-all">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleVisibleCandidates}
            />
            {allVisibleSelected
              ? 'Снять выбор со всех на экране'
              : 'Выбрать все на экране'}
          </label>
          <span>После выбора появится панель групповых действий.</span>
        </div>
      ) : null}

      {renderBulkToolbar()}

      <div
        className="leak-queue-filters"
        aria-label="Фильтры редакционной очереди"
      >
        <SlidersHorizontal aria-hidden="true" />
        <label>
          Язык
          <select
            value={languageFilter}
            onChange={(event) =>
              setLanguageFilter(
                event.target.value as LeakCandidate['language'] | 'all',
              )
            }
          >
            <option value="all">Все языки</option>
            {Object.entries(languageLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Источник
          <select
            value={sourceTypeFilter}
            onChange={(event) =>
              setSourceTypeFilter(
                event.target.value as LeakCandidate['sourceType'] | 'all',
              )
            }
          >
            <option value="all">Все источники</option>
            {Object.entries(sourceTypeLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Перевод
          <select
            value={translationFilter}
            onChange={(event) =>
              setTranslationFilter(
                event.target.value as
                  | LeakCandidate['translationStatus']
                  | 'all',
              )
            }
          >
            <option value="all">Любой статус</option>
            <option value="не требуется">Не требуется</option>
            <option value="нужен перевод">Нужен перевод</option>
            <option value="переведено">Переведено</option>
            <option value="проверено">Проверено</option>
          </select>
        </label>
        <label>
          Свежесть
          <select
            value={freshnessFilter}
            onChange={(event) =>
              setFreshnessFilter(event.target.value as 'all' | 'week' | 'month')
            }
          >
            <option value="all">За всё время</option>
            <option value="week">За 7 дней</option>
            <option value="month">За 30 дней</option>
          </select>
        </label>
        <label>
          Сортировка
          <select
            value={queueSort}
            onChange={(event) =>
              setQueueSort(event.target.value as 'new' | 'confidence')
            }
          >
            <option value="new">Сначала свежие</option>
            <option value="confidence">По уверенности</option>
          </select>
        </label>
      </div>

      <div className="leak-candidate-list">
        {visibleCandidates.length ? (
          visibleCandidates.map((candidate) => (
            <article
              className={`leak-candidate ${selectedIds.has(candidate.id) ? 'is-selected' : ''}`}
              key={candidate.id}
            >
              <label className="leak-candidate-select">
                <input
                  type="checkbox"
                  checked={selectedIds.has(candidate.id)}
                  disabled={actionId === 'bulk'}
                  onChange={() => toggleCandidate(candidate.id)}
                />
                <span>Выбрать публикацию</span>
              </label>
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
                <span>Перевод: {candidate.translationStatus}</span>
                <span>
                  <CalendarDays aria-hidden="true" />{' '}
                  {candidateFreshness(candidate)}
                </span>
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
              {(candidate.evidence?.length || 0) > 1 ? (
                <details className="leak-evidence">
                  <summary>
                    <ShieldCheck aria-hidden="true" />
                    Источники события: {candidate.evidence?.length}
                  </summary>
                  <ul>
                    {candidate.evidence?.map((evidence) => (
                      <li key={evidence.sourceUrl}>
                        <span>
                          <strong>{evidence.sourceName}</strong>
                          <small>
                            {sourceTypeLabels[evidence.sourceType]} ·{' '}
                            {languageLabels[evidence.language]} · доверие{' '}
                            {evidence.trustLevel}
                          </small>
                        </span>
                        <a
                          href={evidence.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть <ExternalLink aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p>
                    Совпадение повышает приоритет проверки, но не подтверждает
                    публикацию автоматически.
                  </p>
                </details>
              ) : null}
              {candidate.translationStatus === 'нужен перевод' ? (
                <p className="translation-notice">
                  <Languages aria-hidden="true" /> Нужен редакционный перевод на
                  русский.
                </p>
              ) : null}
              {candidate.reviewStatus === 'pending' ? (
                <fieldset className="leak-editor-controls">
                  <legend>Редакционная оценка</legend>
                  <label>
                    Тип публикации
                    <select
                      value={candidate.suggestedStatus}
                      disabled={
                        actionId === candidate.id || actionId === 'bulk'
                      }
                      onChange={(event) =>
                        void updateEditorial(candidate, {
                          suggestedStatus: event.target.value as LeakStatus,
                        })
                      }
                    >
                      <option value="слух">Слух</option>
                      <option value="слив">Слив</option>
                      <option value="подтверждено">Подтверждено</option>
                      <option value="опровергнуто">Опровергнуто</option>
                    </select>
                  </label>
                  <label>
                    Доверие к источнику
                    <select
                      value={candidate.trustLevel}
                      disabled={
                        actionId === candidate.id || actionId === 'bulk'
                      }
                      onChange={(event) =>
                        void updateEditorial(candidate, {
                          trustLevel: event.target
                            .value as LeakCandidate['trustLevel'],
                        })
                      }
                    >
                      <option value="низкий">Низкое</option>
                      <option value="средний">Среднее</option>
                      <option value="высокий">Высокое</option>
                    </select>
                  </label>
                  <label>
                    Статус перевода
                    <select
                      value={candidate.translationStatus}
                      disabled={
                        actionId === candidate.id || actionId === 'bulk'
                      }
                      onChange={(event) =>
                        void updateEditorial(candidate, {
                          translationStatus: event.target
                            .value as LeakCandidate['translationStatus'],
                        })
                      }
                    >
                      <option value="не требуется">Не требуется</option>
                      <option value="нужен перевод">Нужен перевод</option>
                      <option value="переведено">Переведено</option>
                      <option value="проверено">Перевод проверен</option>
                    </select>
                  </label>
                  <label className="leak-editor-note">
                    Заметка редактора
                    <textarea
                      value={editorNotes[candidate.id] || ''}
                      rows={3}
                      maxLength={2000}
                      placeholder="Что сверить, перевести или уточнить перед публикацией"
                      onChange={(event) =>
                        setEditorNotes((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={actionId === candidate.id || actionId === 'bulk'}
                    onClick={() =>
                      void updateEditorial(candidate, {
                        editorNote: editorNotes[candidate.id] || '',
                      })
                    }
                  >
                    <FilePenLine aria-hidden="true" /> Сохранить заметку
                  </button>
                </fieldset>
              ) : null}
              <div className="comment-actions">
                {candidate.reviewStatus === 'pending' ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={
                        actionId === candidate.id || actionId === 'bulk'
                      }
                      onClick={() => void promote(candidate)}
                    >
                      <FilePenLine aria-hidden="true" /> В черновик
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={
                        actionId === candidate.id || actionId === 'bulk'
                      }
                      onClick={() => void review(candidate, 'duplicate')}
                    >
                      Дубликат
                    </button>
                    <button
                      className="text-button danger"
                      type="button"
                      disabled={
                        actionId === candidate.id || actionId === 'bulk'
                      }
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
      <dialog className="confirm-dialog" ref={bulkDialogRef}>
        <form method="dialog">
          <h2>
            {bulkAction ? bulkActionLabels[bulkAction] : 'Групповое действие'}?
          </h2>
          <p>
            Будет обработано публикаций: {selectedCandidates.length}. Это
            решение можно позже изменить в общей очереди.
          </p>
          <div className="button-row">
            <button
              className={
                bulkAction === 'review:rejected'
                  ? 'danger-button'
                  : 'primary-button'
              }
              type="button"
              onClick={() => void applyBulkAction()}
            >
              Подтвердить
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setBulkAction(null);
                bulkDialogRef.current?.close();
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
