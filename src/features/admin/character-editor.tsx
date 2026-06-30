import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  FilePlus2,
  Headphones,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { EmptyState, StatusBanner } from '../../components/ui-state';
import {
  deleteEntity,
  hasApiBase,
  lookupCharacterInfo,
  saveEntity,
} from '../../lib/api';
import { applyMarkdownAction, MarkdownPreview } from '../../lib/markdown';
import { resolveAssetUrl } from '../../lib/assets';
import type {
  Character,
  CharacterAbility,
  CharacterAwakening,
  CharacterConsole,
  CharacterFriendshipLevel,
  CharacterGift,
  CharacterImportSuggestion,
  CharacterMaterial,
  CharacterProfile,
  CharacterSkin,
  CharacterStat,
  CharacterVoiceActor,
  CharacterVoiceLine,
  PublishStatus,
  Tier,
} from '../../types';

type CharacterDraft = Omit<Character, 'id' | 'updatedAt'> & {
  id?: string;
  profile: CharacterProfile;
};

type EditorAccess = {
  canCreate: boolean;
  canPublish: boolean;
  canDelete: boolean;
};

const voiceLanguages = [
  'Английский',
  'Японский',
  'Корейский',
  'Китайский',
] as const;
const tiers: Tier[] = ['S', 'A', 'B', 'C', 'D'];

function readCharacterDraft(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CharacterDraft) : null;
  } catch {
    return null;
  }
}

function rowId() {
  return crypto.randomUUID();
}

function emptyProfile(): CharacterProfile {
  return {
    faction: '',
    arcType: '',
    birthday: '',
    biographyShort: '',
    biography: '',
    trivia: '',
    roleTags: ['DPS'],
    voiceActors: [],
    materials: [],
    baseStats: [],
    abilities: [],
    skins: [],
    friendship: Array.from({ length: 10 }, (_, index) => ({
      level: index + 1,
      rewardName: '',
      rewardIconUrl: '',
      description: '',
    })),
    gifts: [],
    voiceLines: [],
    awakenings: [],
    consoles: [],
  };
}

function emptyDraft(): CharacterDraft {
  return {
    slug: '',
    name: '',
    originalName: '',
    rarity: 'S',
    role: 'DPS',
    type: 'DPS',
    attribute: '',
    tier: 'A',
    premiumTier: 'A',
    imageUrl: '',
    splashUrl: '',
    shortDescription: '',
    summary: '',
    tags: [],
    status: 'draft',
    patch: '1.0',
    profile: emptyProfile(),
  };
}

function toDraft(character: Character): CharacterDraft {
  const profile = character.profile || emptyProfile();
  return {
    ...character,
    profile: {
      ...emptyProfile(),
      ...profile,
      roleTags: profile.roleTags?.length ? profile.roleTags : [character.role],
    },
  };
}

function MarkdownField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function format(action: string) {
    const textarea = ref.current;
    if (!textarea) return;
    onChange(
      applyMarkdownAction(
        value,
        textarea.selectionStart,
        textarea.selectionEnd,
        action,
      ),
    );
  }

  return (
    <div className="character-markdown-field">
      <label htmlFor={id}>{label}</label>
      <div className="toolbar" aria-label={`Форматирование: ${label}`}>
        {[
          ['h2', 'H2'],
          ['h3', 'H3'],
          ['bold', 'Жирный'],
          ['italic', 'Курсив'],
          ['list', 'Список'],
          ['quote', 'Цитата'],
          ['link', 'Ссылка'],
        ].map(([action, text]) => (
          <button key={action} type="button" onClick={() => format(action)}>
            {text}
          </button>
        ))}
      </div>
      <textarea
        id={id}
        ref={ref}
        rows={10}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <details className="inline-preview">
          <summary>Предпросмотр</summary>
          <MarkdownPreview value={value} />
        </details>
      ) : null}
    </div>
  );
}

function ImportSuggestionList({
  suggestions,
  decisions,
  onAccept,
  onReject,
}: {
  suggestions: CharacterImportSuggestion[];
  decisions: Record<string, 'accepted' | 'rejected'>;
  onAccept: (suggestion: CharacterImportSuggestion) => void;
  onReject: (suggestion: CharacterImportSuggestion) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <section className="import-review-panel" aria-label="Предложения автоимпорта">
      <div>
        <p className="eyebrow">Автоимпорт</p>
        <h3>Подтвердите найденные строки</h3>
        <p>
          Данные не сохраняются автоматически. Примите только те поля, которые
          сверены с источником.
        </p>
      </div>
      <div className="import-suggestion-list">
        {suggestions.map((suggestion) => {
          const decision = decisions[suggestion.id];
          return (
            <article
              className={`import-suggestion ${decision ? `is-${decision}` : ''}`}
              key={suggestion.id}
            >
              <div>
                <strong>{suggestion.label}</strong>
                <span>{suggestion.field}</span>
              </div>
              <p>{summarizeSuggestionValue(suggestion.value)}</p>
              <small>
                {suggestion.sourceName} · уверенность: {suggestion.confidence}
                {suggestion.note ? ` · ${suggestion.note}` : ''}
              </small>
              <div className="import-suggestion-actions">
                <a href={suggestion.sourceUrl} target="_blank" rel="noreferrer">
                  Источник
                </a>
                <button
                  className="icon-button success"
                  type="button"
                  aria-label={`Принять: ${suggestion.label}`}
                  disabled={decision === 'accepted'}
                  onClick={() => onAccept(suggestion)}
                >
                  <CheckCircle2 aria-hidden="true" />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label={`Отклонить: ${suggestion.label}`}
                  disabled={decision === 'rejected'}
                  onClick={() => onReject(suggestion)}
                >
                  <XCircle aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function summarizeSuggestionValue(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return `${parsed.length} записей`;
  } catch {
    // plain text suggestion
  }
  return value.length > 260 ? `${value.slice(0, 260)}...` : value;
}

function parseImportValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function mergeText(current: string, addition: string) {
  const cleanAddition = addition.trim();
  if (!cleanAddition) return current;
  if (!current.trim()) return cleanAddition;
  if (current.includes(cleanAddition)) return current;
  return `${current.trim()}\n\n${cleanAddition}`;
}

function Collection<T>({
  title,
  description,
  items,
  addLabel,
  createItem,
  onChange,
  render,
}: {
  title: string;
  description: string;
  items: T[];
  addLabel: string;
  createItem: () => T;
  onChange: (items: T[]) => void;
  render: (item: T, index: number, update: (item: T) => void) => ReactNode;
}) {
  return (
    <section className="character-collection">
      <div className="panel-title-row">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={() => onChange([...items, createItem()])}
        >
          <Plus aria-hidden="true" /> {addLabel}
        </button>
      </div>
      <div className="character-collection-list">
        {items.map((item, index) => (
          <article key={(item as { id?: string }).id || index}>
            <div className="collection-row-fields">
              {render(item, index, (next) => {
                const copy = [...items];
                copy[index] = next;
                onChange(copy);
              })}
            </div>
            <button
              className="icon-button danger"
              type="button"
              aria-label={`Удалить запись ${index + 1} из раздела ${title}`}
              title="Удалить запись"
              onClick={() =>
                onChange(items.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <Trash2 aria-hidden="true" />
            </button>
          </article>
        ))}
        {items.length === 0 ? (
          <EmptyState
            title="Пока пусто"
            text={`Нажмите «${addLabel}», когда данные будут готовы.`}
          />
        ) : null}
      </div>
    </section>
  );
}

export function AdminCharacterEditor({
  items,
  initialSelectedId,
  access,
  onRefresh,
  onSaved,
  onDirtyChange,
}: {
  items: Character[];
  initialSelectedId?: string;
  access: EditorAccess;
  onRefresh: () => Promise<void>;
  onSaved?: (context: {
    id?: string;
    slug?: string;
    status: 'draft' | 'published';
  }) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initialId =
    initialSelectedId === 'new'
      ? 'new'
      : items.some((item) => item.id === initialSelectedId)
        ? initialSelectedId || 'new'
        : items[0]?.id || 'new';
  const [selectedId, setSelectedId] = useState(initialId);
  const [draft, setDraft] = useState<CharacterDraft>(() => {
    const selected = items.find((item) => item.id === initialId);
    return selected ? toDraft(selected) : emptyDraft();
  });
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'danger' | 'success'>('info');
  const [pending, setPending] = useState(false);
  const [importSuggestions, setImportSuggestions] = useState<
    CharacterImportSuggestion[]
  >([]);
  const [importDecisions, setImportDecisions] = useState<
    Record<string, 'accepted' | 'rejected'>
  >({});
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const skipNextDraftSaveRef = useRef(false);
  const selected = items.find((item) => item.id === selectedId);
  const draftKey = `nte-character-draft:${selectedId}`;
  const baselineDraft = useMemo(
    () => (selected ? toDraft(selected) : emptyDraft()),
    [selected],
  );
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baselineDraft);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    if (!needle) return items;
    return items.filter((item) =>
      `${item.name} ${item.originalName} ${item.profile?.faction || ''} ${item.profile?.roleTags.join(' ') || ''}`
        .toLocaleLowerCase('ru-RU')
        .includes(needle),
    );
  }, [items, query]);

  useEffect(() => {
    if (!initialSelectedId) return;
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  useEffect(() => {
    const character = items.find((item) => item.id === selectedId);
    const nextDraft = character ? toDraft(character) : emptyDraft();
    skipNextDraftSaveRef.current = true;
    setDraft(readCharacterDraft(draftKey) || nextDraft);
  }, [draftKey, items, selectedId]);

  useEffect(() => {
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    if (isDirty) {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [draft, draftKey, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    setMessage('');
    setImportSuggestions([]);
    setImportDecisions({});
  }, [selectedId]);

  function patch(patchValue: Partial<CharacterDraft>) {
    setDraft((current) => ({ ...current, ...patchValue }));
  }

  function patchProfile(patchValue: Partial<CharacterProfile>) {
    setDraft((current) => ({
      ...current,
      profile: { ...current.profile, ...patchValue },
    }));
  }

  async function lookupBaseInfo() {
    const lookupQuery = draft.name || draft.originalName;
    if (!lookupQuery.trim()) {
      setTone('danger');
      setMessage('Укажите имя персонажа перед поиском базовой информации.');
      return;
    }

    setPending(true);
    setMessage('');
    const result = await lookupCharacterInfo(lookupQuery);
    if (result.ok) {
      setTone(result.data.found ? 'success' : 'info');
      setMessage(result.data.message || 'Источники не настроены. Заполните поля вручную.');
      setImportSuggestions(result.data.suggestions || []);
      setImportDecisions({});
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  function applyImportSuggestion(suggestion: CharacterImportSuggestion) {
    const parsed = parseImportValue(suggestion.value);
    setDraft((current) => {
      const next: CharacterDraft = {
        ...current,
        profile: { ...current.profile },
      };
      if (suggestion.field === 'name') next.name = String(parsed);
      else if (suggestion.field === 'originalName') next.originalName = String(parsed);
      else if (suggestion.field === 'rarity' && ['S', 'A', 'Нулевой'].includes(String(parsed))) {
        next.rarity = String(parsed) as Character['rarity'];
      } else if (suggestion.field === 'attribute') next.attribute = String(parsed);
      else if (suggestion.field === 'tier' && tiers.includes(String(parsed) as Tier)) {
        next.tier = String(parsed) as Tier;
        next.premiumTier = String(parsed) as Tier;
      } else if (suggestion.field === 'profile.faction') {
        next.profile.faction = String(parsed);
      } else if (suggestion.field === 'profile.arcType') {
        next.profile.arcType = String(parsed);
      } else if (suggestion.field === 'profile.birthday') {
        next.profile.birthday = String(parsed);
      } else if (suggestion.field === 'profile.biographyShort') {
        next.profile.biographyShort = String(parsed);
      } else if (suggestion.field === 'profile.biography') {
        next.profile.biography = String(parsed);
      } else if (suggestion.field === 'profile.trivia') {
        next.profile.trivia = mergeText(next.profile.trivia, String(parsed));
      } else if (suggestion.field === 'profile.roleTags' && Array.isArray(parsed)) {
        next.profile.roleTags = parsed.map(String).filter(Boolean);
    } else if (suggestion.field === 'profile.voiceActors' && Array.isArray(parsed)) {
      next.profile.voiceActors = parsed as CharacterVoiceActor[];
    } else if (suggestion.field === 'profile.voiceLines' && Array.isArray(parsed)) {
      next.profile.voiceLines = parsed as CharacterVoiceLine[];
    } else if (suggestion.field === 'profile.materials' && Array.isArray(parsed)) {
        next.profile.materials = parsed as CharacterMaterial[];
      } else if (suggestion.field === 'profile.baseStats' && Array.isArray(parsed)) {
        next.profile.baseStats = parsed as CharacterStat[];
      } else if (suggestion.field === 'profile.abilities' && Array.isArray(parsed)) {
        next.profile.abilities = parsed as CharacterAbility[];
      } else if (suggestion.field === 'profile.awakenings' && Array.isArray(parsed)) {
        next.profile.awakenings = parsed as CharacterAwakening[];
      } else if (suggestion.field.startsWith('guide.')) {
        next.profile.trivia = mergeText(
          next.profile.trivia,
          `Импорт для гайда (${suggestion.label}): ${String(parsed)}`,
        );
      }
      return next;
    });
    setImportDecisions((current) => ({
      ...current,
      [suggestion.id]: 'accepted',
    }));
    setTone('success');
    setMessage(`Поле «${suggestion.label}» добавлено в черновик. Проверьте и сохраните персонажа.`);
  }

  async function persist(status: 'draft' | 'published') {
    if (!hasApiBase()) {
      setTone('info');
      setMessage('Сохранение доступно после подключения Worker API.');
      return;
    }
    setPending(true);
    setMessage('');
    const payload = {
      ...draft,
      shortDescription: draft.profile.biographyShort,
      summary: draft.profile.biography || draft.profile.biographyShort,
      status,
      patchVersion: draft.patch,
      tagsJson: draft.tags,
      profile: draft.profile,
    };
    const result = await saveEntity<{ id?: string; success?: boolean }>(
      selected ? `/api/characters/${selected.id}` : '/api/characters',
      payload,
      selected ? 'PATCH' : 'POST',
    );
    if (result.ok) {
      const savedId = result.data.id || selected?.id;
      if (savedId) setSelectedId(savedId);
      localStorage.removeItem(draftKey);
      await onRefresh();
      await onSaved?.({
        id: savedId,
        slug: draft.slug.trim(),
        status,
      });
      setTone('success');
      setMessage(
        status === 'published'
          ? 'Страница опубликована.'
          : 'Черновик сохранён.',
      );
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  async function confirmDelete() {
    if (!selected) return;
    deleteDialogRef.current?.close();
    setPending(true);
    const result = await deleteEntity(`/api/characters/${selected.id}`);
    if (result.ok) {
      setSelectedId('new');
      localStorage.removeItem(draftKey);
      await onRefresh();
      setTone('success');
      setMessage('Страница персонажа удалена.');
    } else {
      setTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  const profile = draft.profile;

  return (
    <div className="character-editor-workspace">
      <aside className="cms-list" aria-label="Страницы персонажей">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">{items.length} персонажей</p>
            <h2>База персонажей</h2>
          </div>
        </div>
        {access.canCreate ? (
          <button
            className="primary-button wide-action"
            type="button"
            onClick={() => setSelectedId('new')}
          >
            <FilePlus2 aria-hidden="true" /> Добавить персонажа
          </button>
        ) : null}
        <label className="cms-search">
          <span>Поиск</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Имя, фракция, роль..."
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="cms-records">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={selectedId === item.id ? 'active' : ''}
              aria-pressed={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <img
                src={resolveAssetUrl(item.imageUrl)}
                alt=""
                width="44"
                height="44"
                loading="lazy"
              />
              <span>
                <strong>{item.name}</strong>
                <small>{item.profile?.faction || item.attribute}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <form
        className="character-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void persist('published');
        }}
      >
        <header className="character-editor-header">
          <div>
            <p className="eyebrow">
              {selected ? 'Редактирование страницы' : 'Новый персонаж'}
            </p>
            <h2>{draft.name || 'Новая страница персонажа'}</h2>
            <p>
              Здесь хранится lore и игровая база. Мета, билды и ротации
              находятся в отдельном гайде.
            </p>
          </div>
          <div className="button-row">
            <button
              className="ghost-button"
              type="button"
              disabled={pending}
              onClick={() => void lookupBaseInfo()}
            >
              Найти базовую информацию
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={pending}
              onClick={() => void persist('draft')}
            >
              Сохранить черновик
            </button>
            {access.canPublish ? (
              <button
                className="primary-button"
                type="submit"
                disabled={pending}
              >
                <CheckCircle2 aria-hidden="true" /> Опубликовать
              </button>
            ) : null}
            {selected && access.canDelete ? (
              <button
                className="icon-button danger"
                type="button"
                title="Удалить персонажа"
                aria-label="Удалить персонажа"
                onClick={() => deleteDialogRef.current?.showModal()}
              >
                <Trash2 aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>

      {message ? <StatusBanner tone={tone} text={message} /> : null}
      <ImportSuggestionList
        suggestions={importSuggestions}
        decisions={importDecisions}
        onAccept={applyImportSuggestion}
        onReject={(suggestion) =>
          setImportDecisions((current) => ({
            ...current,
            [suggestion.id]: 'rejected',
          }))
        }
      />

      <details className="editor-section" open>
          <summary>Основная информация</summary>
          <div className="editor-field-grid">
            <label>
              Имя на русском
              <input
                required
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            <label>
              Оригинальное имя
              <input
                required
                value={draft.originalName}
                onChange={(event) =>
                  patch({ originalName: event.target.value })
                }
              />
            </label>
            <label>
              Адрес страницы (slug)
              <input
                required
                value={draft.slug}
                onChange={(event) => patch({ slug: event.target.value })}
              />
            </label>
        <label>
          Фракция
          <input
            value={profile.faction}
            onChange={(event) =>
              patchProfile({ faction: event.target.value })
            }
          />
        </label>
        <label>
          Тип дуги
          <input
            value={profile.arcType}
            placeholder="Твёрдое, Газ, Жидкость..."
            onChange={(event) =>
              patchProfile({ arcType: event.target.value })
            }
          />
        </label>
        <label>
          День рождения
              <input
                value={profile.birthday}
                placeholder="Например, 21 июня"
                onChange={(event) =>
                  patchProfile({ birthday: event.target.value })
                }
              />
            </label>
            <label>
              Атрибут
              <input
                required
                value={draft.attribute}
                onChange={(event) => patch({ attribute: event.target.value })}
              />
            </label>
            <label>
              Редкость
              <select
                value={draft.rarity}
                onChange={(event) =>
                  patch({ rarity: event.target.value as Character['rarity'] })
                }
              >
                <option value="S">S</option>
                <option value="A">A</option>
                <option value="Нулевой">Нулевой</option>
              </select>
            </label>
            <label>
              Основная роль
              <input
                required
                value={draft.role}
                placeholder="DD, Support, Healer..."
                onChange={(event) =>
                  patch({ role: event.target.value, type: event.target.value })
                }
              />
            </label>
            <label className="wide-field">
              Роли в отряде, через запятую
              <input
                value={profile.roleTags.join(', ')}
                placeholder="DD, Sub DD, Buffer"
                onChange={(event) =>
                  patchProfile({
                    roleTags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              Тир
          <select
            value={draft.tier}
            onChange={(event) =>
              patch({
                tier: event.target.value as Tier,
                premiumTier: event.target.value as Tier,
              })
            }
          >
                {tiers.map((tier) => (
                  <option key={tier}>{tier}</option>
                ))}
              </select>
            </label>
            <label>
              Патч
              <input
                required
                value={draft.patch || '1.0'}
                onChange={(event) => patch({ patch: event.target.value })}
              />
            </label>
            <label>
              Статус
              <select
                value={draft.status || 'draft'}
                onChange={(event) =>
                  patch({
                    status: event.target.value as Exclude<
                      PublishStatus,
                      'pending_review'
                    >,
                  })
                }
              >
                <option value="draft">Черновик</option>
                <option value="published">Опубликован</option>
                <option value="archived">Архив</option>
              </select>
            </label>
            <label className="wide-field">
              Теги, через запятую
              <input
                value={draft.tags.join(', ')}
                onChange={(event) =>
                  patch({
                    tags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              URL иконки
              <input
                type="text"
                inputMode="url"
                required
                value={draft.imageUrl}
                onChange={(event) => patch({ imageUrl: event.target.value })}
              />
            </label>
            <label>
              URL splash art
              <input
                type="text"
                inputMode="url"
                value={draft.splashUrl}
                onChange={(event) => patch({ splashUrl: event.target.value })}
              />
            </label>
            <label className="wide-field">
              Краткая биография
              <textarea
                rows={4}
                required
                value={profile.biographyShort || draft.shortDescription}
                onChange={(event) =>
                  patchProfile({ biographyShort: event.target.value })
                }
              />
            </label>
          </div>
        </details>

        <details className="editor-section" open>
          <summary>Биография и интересные факты</summary>
          <MarkdownField
            id="character-biography"
            label="Подробная биография"
            value={profile.biography}
            onChange={(biography) => patchProfile({ biography })}
          />
          <MarkdownField
            id="character-trivia"
            label="Пасхалки и интересные факты"
            value={profile.trivia}
            onChange={(trivia) => patchProfile({ trivia })}
          />
          <Collection<CharacterVoiceActor>
            title="Актёры озвучки"
            description="Укажите сэйю или актёра для каждого доступного языка."
            items={profile.voiceActors}
            addLabel="Добавить актёра"
            createItem={() => ({ language: 'Японский', name: '' })}
            onChange={(voiceActors) => patchProfile({ voiceActors })}
            render={(item, _index, update) => (
              <>
                <label>
                  Язык
                  <select
                    value={item.language}
                    onChange={(event) =>
                      update({
                        ...item,
                        language: event.target
                          .value as CharacterVoiceActor['language'],
                      })
                    }
                  >
                    <option>Русский</option>
                    {voiceLanguages.map((language) => (
                      <option key={language}>{language}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Имя актёра
                  <input
                    value={item.name}
                    onChange={(event) =>
                      update({ ...item, name: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
        </details>

        <details className="editor-section" open>
          <summary>Способности и показатели</summary>
          <Collection<CharacterStat>
            title="Начальные показатели"
            description="Например: здоровье, атака, защита и специальные параметры."
            items={profile.baseStats}
            addLabel="Добавить показатель"
            createItem={() => ({ id: rowId(), label: '', value: '' })}
            onChange={(baseStats) => patchProfile({ baseStats })}
            render={(item, _index, update) => (
              <>
                <label>
                  Показатель
                  <input
                    value={item.label}
                    onChange={(event) =>
                      update({ ...item, label: event.target.value })
                    }
                  />
                </label>
                <label>
                  Значение
                  <input
                    value={item.value}
                    onChange={(event) =>
                      update({ ...item, value: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
          <Collection<CharacterAbility>
            title="Способности"
            description="Точные названия, типы, иконки и полное описание навыков."
            items={profile.abilities}
            addLabel="Добавить способность"
            createItem={() => ({
              id: rowId(),
              name: '',
              type: 'Активный навык',
              iconUrl: '',
              description: '',
            })}
            onChange={(abilities) => patchProfile({ abilities })}
            render={(item, _index, update) => (
              <>
                <label>
                  Название
                  <input
                    value={item.name}
                    onChange={(event) =>
                      update({ ...item, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Тип
                  <input
                    value={item.type}
                    onChange={(event) =>
                      update({ ...item, type: event.target.value })
                    }
                  />
                </label>
                <label>
                  URL иконки
                  <input
                    type="text"
                    inputMode="url"
                    value={item.iconUrl}
                    onChange={(event) =>
                      update({ ...item, iconUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Описание
                  <textarea
                    rows={5}
                    value={item.description}
                    onChange={(event) =>
                      update({ ...item, description: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
          <Collection<CharacterAwakening>
            title="Пробуждения C0-C6"
            description="Каждое пробуждение можно добавить, изменить или удалить отдельно."
            items={profile.awakenings}
            addLabel="Добавить пробуждение"
            createItem={() => ({
              level: Math.min(profile.awakenings.length, 6),
              name: '',
              iconUrl: '',
              description: '',
            })}
            onChange={(awakenings) => patchProfile({ awakenings })}
            render={(item, _index, update) => (
              <>
                <label>
                  Уровень
                  <select
                    value={item.level}
                    onChange={(event) =>
                      update({ ...item, level: Number(event.target.value) })
                    }
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((level) => (
                      <option key={level} value={level}>
                        C{level}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Название
                  <input
                    value={item.name}
                    onChange={(event) =>
                      update({ ...item, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  URL иконки
                  <input
                    type="text"
                    inputMode="url"
                    value={item.iconUrl}
                    onChange={(event) =>
                      update({ ...item, iconUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Описание
                  <textarea
                    rows={5}
                    value={item.description}
                    onChange={(event) =>
                      update({ ...item, description: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
        </details>

        <details className="editor-section">
          <summary>Прокачка, симпатия и гардероб</summary>
          <Collection<CharacterMaterial>
            title="Материалы прокачки"
            description="Количество и понятный источник получения каждого ресурса."
            items={profile.materials}
            addLabel="Добавить материал"
            createItem={() => ({
              id: rowId(),
              name: '',
              iconUrl: '',
              amount: '',
              source: '',
            })}
            onChange={(materials) => patchProfile({ materials })}
            render={(item, _index, update) => (
              <>
                <label>
                  Материал
                  <input
                    value={item.name}
                    onChange={(event) =>
                      update({ ...item, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Количество
                  <input
                    value={item.amount}
                    onChange={(event) =>
                      update({ ...item, amount: event.target.value })
                    }
                  />
                </label>
                <label>
                  URL иконки
                  <input
                    type="text"
                    inputMode="url"
                    value={item.iconUrl}
                    onChange={(event) =>
                      update({ ...item, iconUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Где получить
                  <textarea
                    rows={3}
                    value={item.source}
                    onChange={(event) =>
                      update({ ...item, source: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
          <Collection<CharacterFriendshipLevel>
            title="Симпатия 1-10"
            description="Награда и пояснение для каждого уровня дружбы."
            items={profile.friendship}
            addLabel="Добавить уровень"
            createItem={() => ({
              level: Math.min(profile.friendship.length + 1, 10),
              rewardName: '',
              rewardIconUrl: '',
              description: '',
            })}
            onChange={(friendship) => patchProfile({ friendship })}
            render={(item, _index, update) => (
              <>
                <label>
                  Уровень
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={item.level}
                    onChange={(event) =>
                      update({ ...item, level: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Награда
                  <input
                    value={item.rewardName}
                    onChange={(event) =>
                      update({ ...item, rewardName: event.target.value })
                    }
                  />
                </label>
                <label>
                  URL иконки
                  <input
                    type="text"
                    inputMode="url"
                    value={item.rewardIconUrl}
                    onChange={(event) =>
                      update({ ...item, rewardIconUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Описание
                  <textarea
                    rows={3}
                    value={item.description}
                    onChange={(event) =>
                      update({ ...item, description: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
          <Collection<CharacterGift>
            title="Любимые подарки"
            description="Подарки, которые эффективнее всего повышают симпатию."
            items={profile.gifts}
            addLabel="Добавить подарок"
            createItem={() => ({
              id: rowId(),
              name: '',
              iconUrl: '',
              effect: '',
            })}
            onChange={(gifts) => patchProfile({ gifts })}
            render={(item, _index, update) => (
              <>
                <label>
                  Подарок
                  <input
                    value={item.name}
                    onChange={(event) =>
                      update({ ...item, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  URL иконки
                  <input
                    type="text"
                    inputMode="url"
                    value={item.iconUrl}
                    onChange={(event) =>
                      update({ ...item, iconUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Эффект
                  <input
                    value={item.effect}
                    onChange={(event) =>
                      update({ ...item, effect: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
          <Collection<CharacterSkin>
            title="Гардероб"
            description="Скины персонажа с изображениями и описанием."
            items={profile.skins}
            addLabel="Добавить скин"
            createItem={() => ({
              id: rowId(),
              name: '',
              imageUrl: '',
              description: '',
            })}
            onChange={(skins) => patchProfile({ skins })}
            render={(item, _index, update) => (
              <>
                <label>
                  Название
                  <input
                    value={item.name}
                    onChange={(event) =>
                      update({ ...item, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  URL изображения
                  <input
                    type="text"
                    inputMode="url"
                    value={item.imageUrl}
                    onChange={(event) =>
                      update({ ...item, imageUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Описание
                  <textarea
                    rows={3}
                    value={item.description}
                    onChange={(event) =>
                      update({ ...item, description: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          />
        </details>

        <details className="editor-section">
          <summary>Консоли и модули</summary>
          <Collection<CharacterConsole>
            title="Рекомендуемые консоли"
            description="Изображения, особенности консоли и рекомендуемые модули."
            items={profile.consoles}
            addLabel="Добавить консоль"
            createItem={() => ({
              id: rowId(),
              name: '',
              imageUrls: [],
              description: '',
              features: [],
              recommendedModules: '',
            })}
            onChange={(consoles) => patchProfile({ consoles })}
            render={(item, _index, update) => (
              <>
                <label>
                  Название
                  <input
                    value={item.name}
                    onChange={(event) =>
                      update({ ...item, name: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  URL изображений, по одному на строку
                  <textarea
                    rows={3}
                    value={item.imageUrls.join('\n')}
                    onChange={(event) =>
                      update({
                        ...item,
                        imageUrls: event.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="wide-field">
                  Описание
                  <textarea
                    rows={5}
                    value={item.description}
                    onChange={(event) =>
                      update({ ...item, description: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Особенности, по одной на строку
                  <textarea
                    rows={4}
                    value={item.features.join('\n')}
                    onChange={(event) =>
                      update({
                        ...item,
                        features: event.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="wide-field">
                  Рекомендуемые модули
                  <textarea
                    rows={4}
                    value={item.recommendedModules}
                    onChange={(event) =>
                      update({
                        ...item,
                        recommendedModules: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            )}
          />
        </details>

        <details className="editor-section">
          <summary>Озвучка персонажа</summary>
          <Collection<CharacterVoiceLine>
            title="Реплики"
            description="Аудиофайлы для английской, японской, корейской и китайской озвучки."
            items={profile.voiceLines}
            addLabel="Добавить реплику"
            createItem={() => ({
              id: rowId(),
              title: '',
              language: 'Японский',
              audioUrl: '',
              sourceUrl: '',
              description: '',
            })}
            onChange={(voiceLines) => patchProfile({ voiceLines })}
            render={(item, _index, update) => (
              <>
                <label>
                  Название реплики
                  <input
                    value={item.title}
                    onChange={(event) =>
                      update({ ...item, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  Язык
                  <select
                    value={item.language}
                    onChange={(event) =>
                      update({
                        ...item,
                        language: event.target
                          .value as CharacterVoiceLine['language'],
                      })
                    }
                  >
                    {voiceLanguages.map((language) => (
                      <option key={language}>{language}</option>
                    ))}
                  </select>
                </label>
                <label className="wide-field">
                  URL аудио-файла
                  <input
                    type="url"
                    value={item.audioUrl}
                    onChange={(event) =>
                      update({ ...item, audioUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Источник записи или видео
                  <input
                    type="url"
                    value={item.sourceUrl || ''}
                    onChange={(event) =>
                      update({ ...item, sourceUrl: event.target.value })
                    }
                  />
                </label>
                <label className="wide-field">
                  Заметка для редакции
                  <textarea
                    rows={2}
                    value={item.description || ''}
                    onChange={(event) =>
                      update({ ...item, description: event.target.value })
                    }
                  />
                </label>
                {item.audioUrl &&
                !/youtube\.com|youtu\.be|vimeo\.com/i.test(item.audioUrl) ? (
                  <audio controls preload="none" src={item.audioUrl}>
                    Ваш браузер не поддерживает аудио.
                  </audio>
                ) : item.sourceUrl ? (
                  <a
                    className="ghost-button"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Headphones aria-hidden="true" /> Открыть источник записи
                  </a>
                ) : (
                  <span className="audio-placeholder">
                    <Headphones aria-hidden="true" /> Добавьте URL аудио или источник
                  </span>
                )}
              </>
            )}
          />
        </details>
      </form>

      <dialog className="confirm-dialog" ref={deleteDialogRef}>
        <form method="dialog">
          <h2>Удалить персонажа?</h2>
          <p>
            Связанные гайды и разделы могут быть удалены каскадно. Это действие
            нельзя отменить.
          </p>
          <div className="button-row">
            <button className="ghost-button" value="cancel">
              Отменить
            </button>
            <button
              className="primary-button danger-action"
              type="button"
              onClick={() => void confirmDelete()}
            >
              <Trash2 aria-hidden="true" /> Удалить
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
