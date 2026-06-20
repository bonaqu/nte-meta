import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { EmptyState, StatusBanner } from '../../components/ui-state';
import { deleteEntity, hasApiBase, saveEntity } from '../../lib/api';
import { MarkdownPreview } from '../../lib/markdown';
import type {
  Character,
  LeakItem,
  NewsItem,
  Rotation,
  Source,
  Team,
  TeamMember,
} from '../../types';
import { resolveAssetUrl } from '../../lib/assets';

type EditorValues = Record<string, unknown>;
type FieldKind =
  | 'text'
  | 'url'
  | 'textarea'
  | 'markdown'
  | 'select'
  | 'number'
  | 'checkbox'
  | 'tags'
  | 'lines'
  | 'members';

type FieldOption = { label: string; value: string };

type FieldDefinition = {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  help?: string;
  options?: FieldOption[];
  min?: number;
  max?: number;
  rows?: number;
};

type ManagedItem = { id: string };

type ManagerConfig<T extends ManagedItem> = {
  endpoint: string;
  title: string;
  singular: string;
  description: string;
  fields: FieldDefinition[];
  empty: () => EditorValues;
  fromItem: (item: T) => EditorValues;
  toPayload: (
    values: EditorValues,
    publishStatus?: 'draft' | 'published',
  ) => Record<string, unknown>;
  itemTitle: (item: T) => string;
  itemMeta: (item: T) => string;
  preview: (values: EditorValues) => ReactNode;
  supportsPublishing?: boolean;
};

function textValue(values: EditorValues, name: string) {
  return String(values[name] ?? '');
}

function numberValue(values: EditorValues, name: string) {
  const value = Number(values[name]);
  return Number.isFinite(value) ? value : 0;
}

function booleanValue(values: EditorValues, name: string) {
  return Boolean(values[name]);
}

function splitTags(value: unknown) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function splitLines(value: unknown) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 60);
}

function options(values: readonly string[]): FieldOption[] {
  return values.map((value) => ({ label: value, value }));
}

function FieldControl({
  field,
  values,
  setValue,
}: {
  field: FieldDefinition;
  values: EditorValues;
  setValue: (name: string, value: unknown) => void;
}) {
  const id = `cms-${field.name}`;
  const describedBy = field.help ? `${id}-help` : undefined;

  if (field.kind === 'checkbox') {
    return (
      <label className="toggle-row cms-toggle" htmlFor={id}>
        <input
          id={id}
          name={field.name}
          type="checkbox"
          checked={booleanValue(values, field.name)}
          onChange={(event) => setValue(field.name, event.target.checked)}
        />
        <span>
          {field.label}
          {field.help ? <small>{field.help}</small> : null}
        </span>
      </label>
    );
  }

  if (field.kind === 'members') {
    const members = Array.isArray(values[field.name])
      ? (values[field.name] as TeamMember[])
      : [];
    const characterOptions = field.options || [];

    return (
      <fieldset className="cms-members">
        <legend>{field.label}</legend>
        {members.map((member, index) => (
          <div key={`${member.characterId}-${index}`}>
            <label>
              Персонаж {index + 1}
              <select
                value={member.characterId}
                onChange={(event) => {
                  const next = [...members];
                  next[index] = {
                    ...member,
                    characterId: event.target.value,
                  };
                  setValue(field.name, next);
                }}
              >
                <option value="">Выберите персонажа</option>
                {characterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Роль в команде
              <input
                value={member.role}
                onChange={(event) => {
                  const next = [...members];
                  next[index] = { ...member, role: event.target.value };
                  setValue(field.name, next);
                }}
              />
            </label>
            <button
              className="icon-button danger"
              type="button"
              title="Удалить участника"
              aria-label={`Удалить участника ${index + 1}`}
              onClick={() =>
                setValue(
                  field.name,
                  members.filter((_, memberIndex) => memberIndex !== index),
                )
              }
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          className="ghost-button"
          type="button"
          disabled={members.length >= 8}
          onClick={() =>
            setValue(field.name, [
              ...members,
              { characterId: '', role: 'Support' },
            ])
          }
        >
          <Plus aria-hidden="true" />
          Добавить участника
        </button>
      </fieldset>
    );
  }

  return (
    <label htmlFor={id}>
      {field.label}
      {field.kind === 'select' ? (
        <select
          id={id}
          name={field.name}
          value={textValue(values, field.name)}
          required={field.required}
          aria-describedby={describedBy}
          onChange={(event) => setValue(field.name, event.target.value)}
        >
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'textarea' ||
        field.kind === 'markdown' ||
        field.kind === 'lines' ? (
        <textarea
          id={id}
          name={field.name}
          value={textValue(values, field.name)}
          required={field.required}
          rows={field.rows || (field.kind === 'markdown' ? 12 : 5)}
          aria-describedby={describedBy}
          onChange={(event) => setValue(field.name, event.target.value)}
        />
      ) : (
        <input
          id={id}
          name={field.name}
          type={
            field.kind === 'url'
              ? 'url'
              : field.kind === 'number'
                ? 'number'
                : 'text'
          }
          value={
            field.kind === 'number'
              ? numberValue(values, field.name)
              : textValue(values, field.name)
          }
          min={field.min}
          max={field.max}
          required={field.required}
          aria-describedby={describedBy}
          onChange={(event) =>
            setValue(
              field.name,
              field.kind === 'number'
                ? Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
      {field.help ? <small id={describedBy}>{field.help}</small> : null}
    </label>
  );
}

export function ContentManager<T extends ManagedItem>({
  items,
  config,
  onRefresh,
}: {
  items: T[];
  config: ManagerConfig<T>;
  onRefresh: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id || 'new');
  const [values, setValues] = useState<EditorValues>(() =>
    items[0] ? config.fromItem(items[0]) : config.empty(),
  );
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'danger' | 'success'>(
    'info',
  );
  const [pending, setPending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const selectedItem = items.find((item) => item.id === selectedId);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return items;
    return items.filter((item) =>
      `${config.itemTitle(item)} ${config.itemMeta(item)}`
        .toLocaleLowerCase('ru-RU')
        .includes(normalized),
    );
  }, [config, items, query]);

  useEffect(() => {
    const item = items.find((candidate) => candidate.id === selectedId);
    setValues(item ? config.fromItem(item) : config.empty());
    setPreviewOpen(false);
    setMessage('');
  }, [items, selectedId]);

  function setValue(name: string, value: unknown) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function startCreate() {
    setSelectedId('new');
    setValues(config.empty());
    setPreviewOpen(false);
    setMessage('');
  }

  async function persist(publishStatus?: 'draft' | 'published') {
    if (!hasApiBase()) {
      setMessageTone('info');
      setMessage(
        'Для сохранения запустите frontend с подключенным Worker API.',
      );
      return;
    }

    setPending(true);
    setMessage('');
    const result = await saveEntity<{ id?: string; success?: boolean }>(
      selectedItem
        ? `${config.endpoint}/${encodeURIComponent(selectedItem.id)}`
        : config.endpoint,
      config.toPayload(values, publishStatus),
      selectedItem ? 'PATCH' : 'POST',
    );

    if (result.ok) {
      if (result.data.id) setSelectedId(result.data.id);
      await onRefresh();
      setMessageTone('success');
      setMessage(
        publishStatus === 'draft'
          ? 'Черновик сохранен.'
          : `${config.singular} сохранен.`,
      );
    } else {
      setMessageTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  async function confirmDelete() {
    if (!selectedItem) return;
    deleteDialogRef.current?.close();
    setPending(true);
    const result = await deleteEntity(
      `${config.endpoint}/${encodeURIComponent(selectedItem.id)}`,
    );
    if (result.ok) {
      setSelectedId('new');
      await onRefresh();
      setMessageTone('success');
      setMessage(`${config.singular} удален.`);
    } else {
      setMessageTone('danger');
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <div className="cms-workspace">
      <aside className="cms-list" aria-label={config.title}>
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">{items.length} записей</p>
            <h2>{config.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title={`Создать: ${config.singular}`}
            aria-label={`Создать: ${config.singular}`}
            onClick={startCreate}
          >
            <FilePlus2 aria-hidden="true" />
          </button>
        </div>
        <p>{config.description}</p>
        <label className="cms-search">
          Поиск
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, статус, тип..."
          />
        </label>
        <div className="cms-records">
          {filteredItems.map((item) => (
            <button
              className={item.id === selectedId ? 'active' : ''}
              key={item.id}
              type="button"
              aria-pressed={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
            >
              <Pencil aria-hidden="true" />
              <span>
                <strong>{config.itemTitle(item)}</strong>
                <small>{config.itemMeta(item)}</small>
              </span>
            </button>
          ))}
          {filteredItems.length === 0 ? (
            <EmptyState
              title="Записи не найдены"
              text="Измените запрос или создайте новую запись."
            />
          ) : null}
        </div>
      </aside>

      <form
        className="cms-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void persist('published');
        }}
      >
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">
              {selectedItem ? 'Редактирование' : 'Новая запись'}
            </p>
            <h2>
              {selectedItem ? config.itemTitle(selectedItem) : config.singular}
            </h2>
          </div>
          {selectedItem ? (
            <button
              className="icon-button danger"
              type="button"
              title="Удалить запись"
              aria-label="Удалить запись"
              onClick={() => deleteDialogRef.current?.showModal()}
            >
              <Trash2 aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="cms-fields">
          {config.fields.map((field) => (
            <FieldControl
              field={field}
              key={field.name}
              values={values}
              setValue={setValue}
            />
          ))}
        </div>

        <div className="cms-actions">
          {config.supportsPublishing !== false ? (
            <button
              className="ghost-button"
              type="button"
              disabled={pending}
              onClick={() => void persist('draft')}
            >
              Сохранить черновик
            </button>
          ) : null}
          <button className="primary-button" type="submit" disabled={pending}>
            <CheckCircle2 aria-hidden="true" />
            {pending
              ? 'Сохраняем...'
              : config.supportsPublishing === false
                ? 'Сохранить'
                : 'Опубликовать'}
          </button>
          <button
            className="ghost-button"
            type="button"
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((current) => !current)}
          >
            <Eye aria-hidden="true" />
            {previewOpen ? 'Скрыть preview' : 'Предпросмотр'}
          </button>
        </div>

        {message ? <StatusBanner tone={messageTone} text={message} /> : null}

        {previewOpen ? (
          <section className="cms-preview" aria-label="Предпросмотр записи">
            {config.preview(values)}
          </section>
        ) : null}
      </form>

      <dialog className="confirm-dialog" ref={deleteDialogRef}>
        <form method="dialog">
          <h2>Удалить запись?</h2>
          <p>
            Удаление затронет публичную страницу и связанные данные. Действие
            попадет в audit log.
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
              <Trash2 aria-hidden="true" />
              Удалить
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

const publishStatuses = options(['draft', 'published', 'archived']);
const tiers = options(['S+', 'S', 'A', 'B', 'C']);

export function AdminCharactersManager({
  items,
  onRefresh,
}: {
  items: Character[];
  onRefresh: () => Promise<void>;
}) {
  const config = useMemo<ManagerConfig<Character>>(
    () => ({
      endpoint: '/api/characters',
      title: 'Персонажи',
      singular: 'Персонаж',
      description:
        'Карточка, фильтры, тиры, арты и статус публикации персонажа.',
      supportsPublishing: true,
      fields: [
        { name: 'name', label: 'Имя на русском', kind: 'text', required: true },
        {
          name: 'originalName',
          label: 'Оригинальное имя',
          kind: 'text',
          required: true,
        },
        { name: 'slug', label: 'Slug URL', kind: 'text', required: true },
        {
          name: 'rarity',
          label: 'Редкость',
          kind: 'select',
          options: options(['S', 'A', 'Нулевой']),
        },
        { name: 'role', label: 'Роль', kind: 'text', required: true },
        { name: 'type', label: 'Тип', kind: 'text', required: true },
        { name: 'attribute', label: 'Атрибут', kind: 'text', required: true },
        { name: 'tier', label: 'Base C0 тир', kind: 'select', options: tiers },
        {
          name: 'premiumTier',
          label: 'Premium C6 тир',
          kind: 'select',
          options: tiers,
        },
        {
          name: 'imageUrl',
          label: 'URL карточки',
          kind: 'url',
          required: true,
        },
        { name: 'splashUrl', label: 'URL splash art', kind: 'url' },
        {
          name: 'shortDescription',
          label: 'Короткое описание',
          kind: 'textarea',
          required: true,
        },
        {
          name: 'summary',
          label: 'Подробный вывод',
          kind: 'markdown',
          required: true,
        },
        { name: 'tags', label: 'Теги через запятую', kind: 'tags' },
        { name: 'patch', label: 'Версия патча', kind: 'text', required: true },
        {
          name: 'status',
          label: 'Статус',
          kind: 'select',
          options: publishStatuses,
        },
      ],
      empty: () => ({
        name: '',
        originalName: '',
        slug: '',
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
        tags: '',
        patch: '1.0',
        status: 'draft',
      }),
      fromItem: (item) => ({
        ...item,
        tags: item.tags.join(', '),
        patch: item.patch || '1.0',
        status: item.status || 'published',
      }),
      toPayload: (values, publishStatus) => ({
        name: textValue(values, 'name'),
        originalName: textValue(values, 'originalName'),
        slug: textValue(values, 'slug'),
        rarity: textValue(values, 'rarity'),
        role: textValue(values, 'role'),
        type: textValue(values, 'type'),
        attribute: textValue(values, 'attribute'),
        tier: textValue(values, 'tier'),
        premiumTier: textValue(values, 'premiumTier'),
        imageUrl: textValue(values, 'imageUrl'),
        splashUrl: textValue(values, 'splashUrl'),
        shortDescription: textValue(values, 'shortDescription'),
        summary: textValue(values, 'summary'),
        tagsJson: splitTags(values.tags),
        patchVersion: textValue(values, 'patch'),
        status: publishStatus || textValue(values, 'status'),
      }),
      itemTitle: (item) => item.name,
      itemMeta: (item) =>
        `${item.role} · ${item.tier} · ${item.status || 'published'}`,
      preview: (values) => (
        <article className="cms-character-preview">
          {textValue(values, 'imageUrl') ? (
            <img
              src={resolveAssetUrl(textValue(values, 'imageUrl'))}
              alt=""
              width="300"
              height="380"
            />
          ) : null}
          <div>
            <p className="eyebrow">
              {textValue(values, 'role')} · {textValue(values, 'attribute')}
            </p>
            <h2>{textValue(values, 'name') || 'Имя персонажа'}</h2>
            <MarkdownPreview value={textValue(values, 'summary')} />
          </div>
        </article>
      ),
    }),
    [],
  );
  return <ContentManager config={config} items={items} onRefresh={onRefresh} />;
}

const newsCategories = options([
  'Обновления',
  'Ивенты',
  'Оффлайн-ивенты',
  'Баннеры',
  'Баланс',
  'Официальные новости',
  'Профилактика',
  'Косплей',
  'Арты',
  'Прочее',
]);

export function AdminNewsManager({
  items,
  onRefresh,
}: {
  items: NewsItem[];
  onRefresh: () => Promise<void>;
}) {
  const config = useMemo<ManagerConfig<NewsItem>>(
    () => ({
      endpoint: '/api/news',
      title: 'Новости',
      singular: 'Новость',
      description:
        'Редакционные материалы, официальные источники и статусы публикации.',
      supportsPublishing: true,
      fields: [
        { name: 'title', label: 'Заголовок', kind: 'text', required: true },
        { name: 'slug', label: 'Slug URL', kind: 'text', required: true },
        {
          name: 'category',
          label: 'Категория',
          kind: 'select',
          options: newsCategories,
        },
        {
          name: 'summary',
          label: 'Краткое описание',
          kind: 'textarea',
          required: true,
        },
        {
          name: 'body',
          label: 'Полный текст Markdown',
          kind: 'markdown',
          required: true,
        },
        { name: 'author', label: 'Автор', kind: 'text' },
        { name: 'sourceName', label: 'Название источника', kind: 'text' },
        { name: 'sourceUrl', label: 'Ссылка на источник', kind: 'url' },
        {
          name: 'imageUrl',
          label: 'URL изображения',
          kind: 'url',
          required: true,
        },
        { name: 'tags', label: 'Теги через запятую', kind: 'tags' },
        {
          name: 'publishStatus',
          label: 'Статус',
          kind: 'select',
          options: publishStatuses,
        },
      ],
      empty: () => ({
        title: '',
        slug: '',
        category: 'Обновления',
        summary: '',
        body: '',
        author: 'NTE Meta',
        sourceName: '',
        sourceUrl: '',
        imageUrl: '',
        tags: '',
        publishStatus: 'draft',
      }),
      fromItem: (item) => ({
        ...item,
        tags: item.tags.join(', '),
        publishStatus: item.publishStatus || 'published',
      }),
      toPayload: (values, publishStatus) => ({
        title: textValue(values, 'title'),
        slug: textValue(values, 'slug'),
        category: textValue(values, 'category'),
        summary: textValue(values, 'summary'),
        bodyMarkdown: textValue(values, 'body'),
        authorName: textValue(values, 'author') || 'NTE Meta',
        sourceName: textValue(values, 'sourceName'),
        sourceUrl: textValue(values, 'sourceUrl'),
        imageUrl: textValue(values, 'imageUrl'),
        tagsJson: splitTags(values.tags),
        status: publishStatus || textValue(values, 'publishStatus'),
      }),
      itemTitle: (item) => item.title,
      itemMeta: (item) =>
        `${item.category} · ${item.publishStatus || 'published'}`,
      preview: (values) => (
        <article className="cms-article-preview">
          <p className="eyebrow">{textValue(values, 'category')}</p>
          <h2>{textValue(values, 'title') || 'Заголовок новости'}</h2>
          <p>{textValue(values, 'summary')}</p>
          <MarkdownPreview value={textValue(values, 'body')} />
        </article>
      ),
    }),
    [],
  );
  return <ContentManager config={config} items={items} onRefresh={onRefresh} />;
}

export function AdminLeaksManager({
  items,
  onRefresh,
}: {
  items: LeakItem[];
  onRefresh: () => Promise<void>;
}) {
  const config = useMemo<ManagerConfig<LeakItem>>(
    () => ({
      endpoint: '/api/leaks',
      title: 'Сливы и очередь',
      singular: 'Слив',
      description:
        'Материал не появляется публично, пока администратор явно не включит одобрение.',
      supportsPublishing: false,
      fields: [
        {
          name: 'title',
          label: 'Редактируемый заголовок',
          kind: 'text',
          required: true,
        },
        { name: 'slug', label: 'Slug URL', kind: 'text', required: true },
        { name: 'summary', label: 'Краткое описание', kind: 'textarea' },
        {
          name: 'body',
          label: 'Полный текст / репост Markdown',
          kind: 'markdown',
          required: true,
        },
        {
          name: 'sourceName',
          label: 'Оригинальный источник',
          kind: 'text',
          required: true,
        },
        { name: 'sourceUrl', label: 'Ссылка на источник', kind: 'url' },
        {
          name: 'trustLevel',
          label: 'Уровень доверия',
          kind: 'select',
          options: options(['низкий', 'средний', 'высокий']),
        },
        {
          name: 'status',
          label: 'Статус информации',
          kind: 'select',
          options: options(['слух', 'слив', 'подтверждено', 'опровергнуто']),
        },
        {
          name: 'approved',
          label: 'Одобрено для публичной выдачи',
          kind: 'checkbox',
          help: 'Публикуйте только после проверки источника и текста.',
        },
        { name: 'tags', label: 'Теги через запятую', kind: 'tags' },
      ],
      empty: () => ({
        title: '',
        slug: '',
        summary: '',
        body: '',
        sourceName: '',
        sourceUrl: '',
        trustLevel: 'низкий',
        status: 'слух',
        approved: false,
        tags: '',
      }),
      fromItem: (item) => ({ ...item, tags: item.tags.join(', ') }),
      toPayload: (values) => ({
        title: textValue(values, 'title'),
        slug: textValue(values, 'slug'),
        summary: textValue(values, 'summary'),
        bodyMarkdown: textValue(values, 'body'),
        sourceName: textValue(values, 'sourceName'),
        sourceUrl: textValue(values, 'sourceUrl'),
        trustLevel: textValue(values, 'trustLevel'),
        leakStatus: textValue(values, 'status'),
        approved: booleanValue(values, 'approved'),
        tagsJson: splitTags(values.tags),
      }),
      itemTitle: (item) => item.title,
      itemMeta: (item) =>
        `${item.status} · ${item.trustLevel} · ${item.approved ? 'одобрено' : 'очередь'}`,
      preview: (values) => (
        <article className="cms-article-preview leak">
          <p className="eyebrow">
            {textValue(values, 'status')} · доверие:{' '}
            {textValue(values, 'trustLevel')}
          </p>
          <h2>{textValue(values, 'title') || 'Заголовок слива'}</h2>
          <p>Информация не подтверждена и может измениться.</p>
          <MarkdownPreview value={textValue(values, 'body')} />
        </article>
      ),
    }),
    [],
  );
  return <ContentManager config={config} items={items} onRefresh={onRefresh} />;
}

export function AdminSourcesManager({
  items,
  onRefresh,
}: {
  items: Source[];
  onRefresh: () => Promise<void>;
}) {
  const config = useMemo<ManagerConfig<Source>>(
    () => ({
      endpoint: '/api/sources',
      title: 'Источники',
      singular: 'Источник',
      description:
        'Список каналов и сайтов для будущей очереди автоматического импорта.',
      supportsPublishing: false,
      fields: [
        { name: 'sourceName', label: 'Название', kind: 'text', required: true },
        {
          name: 'sourceType',
          label: 'Тип',
          kind: 'select',
          options: options([
            'telegram',
            'website',
            'youtube',
            'twitter/x',
            'manual',
          ]),
        },
        { name: 'sourceUrl', label: 'URL', kind: 'url', required: true },
        {
          name: 'trustLevel',
          label: 'Доверие',
          kind: 'select',
          options: options(['низкий', 'средний', 'высокий']),
        },
        {
          name: 'autoImportEnabled',
          label: 'Автоимпорт включен',
          kind: 'checkbox',
          help: 'Пока архитектурный флаг: публикация всё равно требует одобрения.',
        },
      ],
      empty: () => ({
        sourceName: '',
        sourceType: 'manual',
        sourceUrl: '',
        trustLevel: 'средний',
        autoImportEnabled: false,
      }),
      fromItem: (item) => ({ ...item }),
      toPayload: (values) => ({
        sourceName: textValue(values, 'sourceName'),
        sourceType: textValue(values, 'sourceType'),
        sourceUrl: textValue(values, 'sourceUrl'),
        trustLevel: textValue(values, 'trustLevel'),
        autoImportEnabled: booleanValue(values, 'autoImportEnabled'),
      }),
      itemTitle: (item) => item.sourceName,
      itemMeta: (item) => `${item.sourceType} · ${item.trustLevel}`,
      preview: (values) => (
        <article className="cms-article-preview">
          <p className="eyebrow">{textValue(values, 'sourceType')}</p>
          <h2>{textValue(values, 'sourceName') || 'Название источника'}</h2>
          <p>{textValue(values, 'sourceUrl')}</p>
        </article>
      ),
    }),
    [],
  );
  return <ContentManager config={config} items={items} onRefresh={onRefresh} />;
}

export function AdminRotationsManager({
  items,
  characters,
  guides,
  onRefresh,
}: {
  items: Rotation[];
  characters: Character[];
  guides: Array<{ id: string; title: string }>;
  onRefresh: () => Promise<void>;
}) {
  const config = useMemo<ManagerConfig<Rotation>>(() => {
    const characterOptions = characters.map((item) => ({
      label: item.name,
      value: item.id,
    }));
    return {
      endpoint: '/api/rotations',
      title: 'Ротации',
      singular: 'Ротация',
      description:
        'Отдельные пошаговые сценарии для персонажей и конкретных боевых задач.',
      supportsPublishing: true,
      fields: [
        { name: 'title', label: 'Название', kind: 'text', required: true },
        {
          name: 'characterId',
          label: 'Персонаж',
          kind: 'select',
          required: true,
          options: characterOptions,
        },
        {
          name: 'guideId',
          label: 'Связанный гайд',
          kind: 'select',
          options: [
            { label: 'Без отдельного гайда', value: '' },
            ...guides.map((item) => ({ label: item.title, value: item.id })),
          ],
        },
        {
          name: 'type',
          label: 'Тип',
          kind: 'select',
          options: options([
            'Простая',
            'Оптимальная',
            'Advanced',
            'Min-max',
            'F2P-friendly',
            'Boss rotation',
            'AoE/farm rotation',
          ]),
        },
        {
          name: 'purpose',
          label: 'Назначение',
          kind: 'textarea',
          required: true,
        },
        {
          name: 'steps',
          label: 'Шаги — один на строку',
          kind: 'lines',
          required: true,
          rows: 8,
        },
        {
          name: 'logic',
          label: 'Логика ротации',
          kind: 'markdown',
          required: true,
        },
        { name: 'mediaUrl', label: 'Видео / GIF / изображение', kind: 'url' },
        {
          name: 'status',
          label: 'Статус',
          kind: 'select',
          options: publishStatuses,
        },
      ],
      empty: () => ({
        title: '',
        characterId: characters[0]?.id || '',
        guideId: '',
        type: 'Простая',
        purpose: '',
        steps: '',
        logic: '',
        mediaUrl: '',
        status: 'draft',
      }),
      fromItem: (item) => ({
        ...item,
        steps: item.steps.join('\n'),
        status: item.status || 'published',
      }),
      toPayload: (values, publishStatus) => ({
        title: textValue(values, 'title'),
        characterId: textValue(values, 'characterId'),
        guideId: textValue(values, 'guideId') || null,
        rotationType: textValue(values, 'type'),
        purpose: textValue(values, 'purpose'),
        stepsJson: splitLines(values.steps),
        logic: textValue(values, 'logic'),
        mediaUrl: textValue(values, 'mediaUrl'),
        status: publishStatus || textValue(values, 'status'),
      }),
      itemTitle: (item) => item.title,
      itemMeta: (item) =>
        `${item.type} · ${characters.find((character) => character.id === item.characterId)?.name || item.characterId}`,
      preview: (values) => (
        <article className="rotation-card detailed">
          <p className="eyebrow">{textValue(values, 'type')}</p>
          <h2>{textValue(values, 'title') || 'Название ротации'}</h2>
          <p>{textValue(values, 'purpose')}</p>
          <ol>
            {splitLines(values.steps).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <MarkdownPreview value={textValue(values, 'logic')} />
        </article>
      ),
    };
  }, [characters, guides]);
  return <ContentManager config={config} items={items} onRefresh={onRefresh} />;
}

export function AdminTeamsManager({
  items,
  characters,
  onRefresh,
}: {
  items: Team[];
  characters: Character[];
  onRefresh: () => Promise<void>;
}) {
  const config = useMemo<ManagerConfig<Team>>(() => {
    const characterOptions = characters.map((item) => ({
      label: item.name,
      value: item.id,
    }));
    return {
      endpoint: '/api/teams',
      title: 'Команды',
      singular: 'Команда',
      description:
        'Составы, бюджет, сила, синергия и рекомендуемая командная ротация.',
      supportsPublishing: true,
      fields: [
        { name: 'title', label: 'Название', kind: 'text', required: true },
        { name: 'slug', label: 'Slug URL', kind: 'text', required: true },
        {
          name: 'type',
          label: 'Тип',
          kind: 'select',
          options: options([
            'Burst',
            'Sustain',
            'Reaction',
            'Farming',
            'Bossing',
            'AoE',
            'Beginner',
            'Endgame',
          ]),
        },
        {
          name: 'budget',
          label: 'Бюджет',
          kind: 'select',
          options: options(['F2P', 'Mixed', 'Premium']),
        },
        {
          name: 'difficulty',
          label: 'Сложность',
          kind: 'select',
          options: options(['Низкая', 'Средняя', 'Высокая']),
        },
        {
          name: 'power',
          label: 'Сила 0–100',
          kind: 'number',
          min: 0,
          max: 100,
        },
        {
          name: 'goodAt',
          label: 'Где команда сильна',
          kind: 'textarea',
          required: true,
        },
        {
          name: 'weakAt',
          label: 'Где команда слаба',
          kind: 'textarea',
          required: true,
        },
        {
          name: 'synergy',
          label: 'Описание синергии',
          kind: 'markdown',
          required: true,
        },
        {
          name: 'rotation',
          label: 'Рекомендуемая ротация',
          kind: 'textarea',
          required: true,
        },
        {
          name: 'members',
          label: 'Участники и роли',
          kind: 'members',
          options: characterOptions,
        },
        {
          name: 'status',
          label: 'Статус',
          kind: 'select',
          options: publishStatuses,
        },
      ],
      empty: () => ({
        title: '',
        slug: '',
        type: 'Beginner',
        budget: 'F2P',
        difficulty: 'Низкая',
        power: 50,
        goodAt: '',
        weakAt: '',
        synergy: '',
        rotation: '',
        members: [{ characterId: characters[0]?.id || '', role: 'Main DPS' }],
        status: 'draft',
      }),
      fromItem: (item) => ({
        ...item,
        members: item.members.map((member) => ({ ...member })),
        status: item.status || 'published',
      }),
      toPayload: (values, publishStatus) => ({
        title: textValue(values, 'title'),
        slug: textValue(values, 'slug'),
        teamType: textValue(values, 'type'),
        budget: textValue(values, 'budget'),
        difficulty: textValue(values, 'difficulty'),
        power: numberValue(values, 'power'),
        goodAt: textValue(values, 'goodAt'),
        weakAt: textValue(values, 'weakAt'),
        synergy: textValue(values, 'synergy'),
        rotation: textValue(values, 'rotation'),
        members: Array.isArray(values.members) ? values.members : [],
        status: publishStatus || textValue(values, 'status'),
      }),
      itemTitle: (item) => item.title,
      itemMeta: (item) =>
        `${item.type} · ${item.budget} · ${item.status || 'published'}`,
      preview: (values) => (
        <article className="cms-article-preview">
          <p className="eyebrow">
            {textValue(values, 'type')} · {textValue(values, 'budget')}
          </p>
          <h2>{textValue(values, 'title') || 'Название команды'}</h2>
          <MarkdownPreview value={textValue(values, 'synergy')} />
          <strong>Ротация: {textValue(values, 'rotation')}</strong>
        </article>
      ),
    };
  }, [characters]);
  return <ContentManager config={config} items={items} onRefresh={onRefresh} />;
}
