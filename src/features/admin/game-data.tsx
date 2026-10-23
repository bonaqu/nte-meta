import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  loadGameDataStats,
  loadGameRecord,
  loadGameRecords,
  saveGameRecord,
  type GameDataRecord,
} from '../../lib/api';
import { resolveAssetUrl } from '../../lib/assets';
import { ImageField } from '../../components/image-field';

const kinds: Record<string, string> = {
  character: 'Персонажи',
  skill: 'Навыки и пассивные умения',
  awakening: 'Пробуждения',
  arc: 'Дуги',
  cartridge: 'Картриджи и консоли',
  affinity: 'Симпатия и подарки',
  wardrobe: 'Гардероб',
  biography: 'Биографии',
  stat: 'Характеристики',
  item: 'Предметы и ресурсы',
  image: 'Изображения',
  audio: 'Озвучка',
  localization: 'Остальная локализация',
};
const locales = {
  ru: 'Русский',
  en: 'English',
  ja: '日本語',
  zh: '中文',
} as const;

export default function AdminGameData() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('character');
  const [owner, setOwner] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<GameDataRecord[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState<GameDataRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [stats, setStats] = useState<{
    total: number;
    kinds: Array<{ kind: string; count: number }>;
  } | null>(null);
  useEffect(() => {
    let active = true;
    loadGameDataStats().then((r) => {
      if (active && r.ok) setStats(r.data);
    });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError('');
      const r = await loadGameRecords(
        new URLSearchParams({ q, kind, owner, offset: String(offset) }),
      );
      if (active) {
        if (r.ok) {
          setItems(r.data.items);
          setNext(r.data.nextOffset);
        } else setError(r.error);
        setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [q, kind, owner, offset, revision]);
  async function select(id: string) {
    setError('');
    const r = await loadGameRecord(id);
    if (r.ok) setSelected(r.data);
    else setError(r.error);
  }
  return (
    <div className="game-data-manager">
      <p>
        Данные локальной игры на четырёх языках. Изменения сохраняются в базе
        сразу после нажатия «Сохранить в базу».
      </p>
      <div className="game-data-filters">
        <label>
          Поиск по названию или ключу
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="Хатор / Hathor / Role_Name_025"
          />
        </label>
        <label>
          Тип записи
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все типы</option>
            {Object.entries(kinds).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Игровой ID персонажа
          <input
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setOffset(0);
            }}
            placeholder="Например, 1025"
          />
        </label>
      </div>
      {stats ? (
        <p className="muted">
          Записей в базе: {stats.total.toLocaleString('ru-RU')}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="game-data-layout">
        <section aria-label="Записи игры" aria-busy={loading}>
          {loading ? <p role="status">Поиск…</p> : null}
          {!loading && !items.length ? (
            <p>
              {stats?.total === 0
                ? 'Справочник ещё не импортирован. Загрузите подготовленный локальный снимок.'
                : 'Записей по этим фильтрам нет.'}
            </p>
          ) : null}
          <ul className="game-data-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => void select(item.id)}
                >
                  {item.assets?.[0]?.url ? (
                    <img
                      src={resolveAssetUrl(item.assets[0].url)}
                      alt=""
                      loading="lazy"
                      width="52"
                      height="52"
                    />
                  ) : null}
                  <span>
                    <strong>
                      {item.values.ru || item.values.en || item.gameId}
                    </strong>
                    <small>
                      {kinds[item.kind]} · {item.gameId}
                    </small>
                    {item.values.en && item.values.en !== item.values.ru ? (
                      <small lang="en">{item.values.en}</small>
                    ) : null}
                    {item.modified ? <small>Есть ручные правки</small> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Страницы справочника"
            className="game-data-pagination"
          >
            <button
              type="button"
              className="ghost-button"
              disabled={!offset || loading}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              Назад
            </button>
            <span>{Math.floor(offset / 30) + 1}</span>
            <button
              type="button"
              className="ghost-button"
              disabled={next === null || loading}
              onClick={() => setOffset(next!)}
            >
              Далее
            </button>
          </nav>
        </section>
        {selected ? (
          <GameRecordEditor
            key={selected.id + ':' + selected.revision}
            record={selected}
            onSaved={(record) => {
              setSelected(record);
              setRevision((n) => n + 1);
              setNotice('Данные обновлены в базе.');
            }}
          />
        ) : (
          <section className="game-data-empty">
            <p>
              Выберите запись: названия на всех языках, данные и изображения
              откроются здесь.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function GameRecordEditor({
  record,
  onSaved,
}: {
  record: GameDataRecord;
  onSaved: (record: GameDataRecord) => void;
}) {
  const fieldId = useId();
  const [values, setValues] = useState(record.values);
  const [details, setDetails] = useState(
    JSON.stringify(record.details || {}, null, 2),
  );
  const [kind, setKind] = useState(record.kind);
  const [owner, setOwner] = useState(record.ownerId);
  const [assets, setAssets] = useState(record.assets || []);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(details);
      if (!data || Array.isArray(data) || typeof data !== 'object')
        throw new Error();
    } catch {
      setError('Данные должны быть корректным JSON-объектом.');
      return;
    }
    setPending(true);
    const original = record.original || record;
    const overrides: Partial<GameDataRecord> = {};
    const changedValues = Object.fromEntries(
      Object.entries(values).filter(
        ([locale, value]) =>
          value !== original.values[locale as keyof typeof locales],
      ),
    );
    if (Object.keys(changedValues).length) overrides.values = changedValues;
    if (JSON.stringify(data) !== JSON.stringify(original.details || {}))
      overrides.details = data;
    if (JSON.stringify(assets) !== JSON.stringify(original.assets || []))
      overrides.assets = assets;
    if (kind !== original.kind) overrides.kind = kind;
    if (owner !== original.ownerId) overrides.ownerId = owner;
    const result = await saveGameRecord(record.id, record.revision, overrides);
    setPending(false);
    if (result.ok) {
      onSaved(result.data);
      setMessage('Сохранено в базе.');
    } else setError(result.error);
  }
  return (
    <form
      className="game-record-editor"
      onSubmit={(e) => void save(e)}
      aria-label="Редактирование записи игры"
    >
      <h2>{record.values.ru || record.gameId}</h2>
      <p className="game-data-key">
        {record.namespace} · {record.gameId}
      </p>
      {Object.entries(locales).map(([locale, label]) => (
        <div key={locale}>
          <label htmlFor={`${fieldId}-${locale}`}>{label}</label>
          <textarea
            id={`${fieldId}-${locale}`}
            rows={3}
            lang={locale}
            value={values[locale as keyof typeof locales] || ''}
            onChange={(e) => setValues({ ...values, [locale]: e.target.value })}
          />
        </div>
      ))}
      <div className="form-grid">
        <label>
          Тип записи
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(kinds).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Игровой ID владельца
          <input
            value={owner}
            maxLength={100}
            onChange={(e) => setOwner(e.target.value)}
          />
        </label>
      </div>
      <label>
        Данные записи (JSON)
        <textarea
          className="game-data-json"
          rows={12}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          spellCheck={false}
        />
      </label>
      <fieldset>
        <legend>
          {record.kind === 'audio' ? 'Аудиофайлы' : 'Изображения'}
        </legend>
        {assets.map((asset, index) => (
          <div key={index}>
            {record.kind === 'audio' ? (
              <label>
                Аудиофайл {index + 1}
                <input
                  value={asset.url}
                  onChange={(event) =>
                    setAssets(
                      assets.map((a, i) =>
                        i === index ? { ...a, url: event.target.value } : a,
                      ),
                    )
                  }
                />
                <audio controls preload="none" src={resolveAssetUrl(asset.url)}>
                  Ваш браузер не поддерживает аудио.
                </audio>
              </label>
            ) : (
              <ImageField
                label={`Изображение ${index + 1}`}
                value={asset.url}
                context={`game-data/${record.gameId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'record'}`}
                onChange={(url) =>
                  setAssets(
                    assets.map((a, i) => (i === index ? { ...a, url } : a)),
                  )
                }
              />
            )}
            <button
              className="ghost-button"
              type="button"
              onClick={() => setAssets(assets.filter((_, i) => i !== index))}
            >
              Убрать {record.kind === 'audio' ? 'аудиофайл' : 'изображение'}{' '}
              {index + 1}
            </button>
          </div>
        ))}
        <button
          className="ghost-button"
          type="button"
          disabled={assets.length >= 80}
          onClick={() => setAssets([...assets, { url: '' }])}
        >
          Добавить {record.kind === 'audio' ? 'аудиофайл' : 'изображение'}
        </button>
      </fieldset>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? 'Сохраняем…' : 'Сохранить в базу'}
      </button>
      {record.modified ? (
        <button
          type="button"
          className="ghost-button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const r = await saveGameRecord(
              record.id,
              record.revision,
              {},
              true,
            );
            setPending(false);
            if (r.ok) onSaved(r.data);
            else setError(r.error);
          }}
        >
          Восстановить данные игры
        </button>
      ) : null}
      <details>
        <summary>Исходные данные игры</summary>
        <pre className="game-data-source">
          {JSON.stringify(record.original, null, 2)}
        </pre>
      </details>
    </form>
  );
}
