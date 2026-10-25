import { useState } from 'react';
import {
  validProposal,
  type Proposal,
} from '../../lib/local-character-proposal';
import { loadEntityCollection, saveEntity } from '../../lib/api';
import { resolveAssetUrl } from '../../lib/assets';
import type { Character } from '../../types';

export default function LocalCharacterImport() {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState<string[]>([]);
  const row = rows[selected];
  return (
    <details className="local-character-import admin-panel">
      <summary>Новые персонажи из локальной программы</summary>
      <p>
        Выберите файл «Персонажи для сайта.json», созданный шагом 6 программы.
        Проверьте сведения и создайте черновик. Существующие персонажи
        сохранятся.
      </p>
      <label className="local-character-import__file">
        Файл персонажей{' '}
        <input
          type="file"
          accept=".json,application/json"
          disabled={pending}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setMessage('');
            try {
              if (file.size > 8_000_000)
                throw Error(
                  'Файл превышает 8 МБ. Разделите выгрузку на несколько файлов.',
                );
              const data = JSON.parse(await file.text());
              if (
                data.format !== 'nte-character-proposals' ||
                data.version !== 1 ||
                !Array.isArray(data.characters) ||
                data.characters.length > 60
              )
                throw Error('Выберите файл персонажей из шага 6 программы.');
              if (!data.characters.every(validProposal))
                throw Error(
                  'В файле повреждены сведения персонажа. Подготовьте его заново.',
                );
              setRows(data.characters);
              setSelected(0);
              setCreated([]);
              if (!data.characters.length)
                setMessage('Новых персонажей в снимке нет.');
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : 'Не удалось прочитать файл.',
              );
            }
          }}
        />
      </label>
      {rows.length ? (
        <div
          className="local-character-import__choices"
          role="group"
          aria-label="Персонажи из файла"
        >
          {rows.map((r, i) => (
            <button
              className="ghost-button"
              key={r.ownerId}
              type="button"
              aria-pressed={i === selected}
              onClick={() => {
                setSelected(i);
                setMessage('');
              }}
            >
              {r.name}
              {created.includes(r.ownerId) ? ' · Черновик создан' : ''}
            </button>
          ))}
        </div>
      ) : null}
      {row ? (
        <form
          key={row.ownerId}
          className="entity-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            setPending(true);
            setMessage('');
            const existing =
              await loadEntityCollection<Character>('/api/characters');
            if (!existing.ok) {
              setMessage(existing.error);
              setPending(false);
              return;
            }
            const key = (s: string) =>
              s
                .normalize('NFKC')
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]/gu, '');
            if (
              existing.data.some(
                (c) =>
                  c.slug === String(fields.get('slug')) ||
                  [key(c.name), key(c.originalName)].some(
                    (n) =>
                      n &&
                      [
                        key(row.name),
                        key(row.originalName),
                        key(String(fields.get('name'))),
                      ].includes(n),
                  ),
              )
            ) {
              setMessage(
                'Этот персонаж уже есть на сайте, в том числе среди черновиков. Откройте его в разделе «Персонажи».',
              );
              setPending(false);
              return;
            }
            const result = await saveEntity<{ id: string }>('/api/characters', {
              slug: String(fields.get('slug')),
              name: String(fields.get('name')),
              originalName: row.originalName,
              rarity: String(fields.get('rarity')),
              role: String(fields.get('role')),
              type: String(fields.get('arcType')),
              attribute: String(fields.get('attribute')),
              imageUrl: row.imageUrl,
              splashUrl: row.splashUrl,
              summary: String(fields.get('summary')),
              shortDescription: row.profile.biographyShort || '',
              tags: row.profile.roleTags || [],
              profile: {
                ...row.profile,
                arcType: String(fields.get('arcType')),
              },
              status: 'draft',
            });
            setPending(false);
            if (result.ok) {
              setCreated((value) => [...value, row.ownerId]);
              setMessage(
                'Черновик создан. Откройте «Админка → Персонажи», проверьте его и опубликуйте.',
              );
            } else setMessage(result.error);
          }}
        >
          <div className="local-character-import__overview">
            {row.imageUrl ? (
              <img
                src={resolveAssetUrl(row.imageUrl)}
                alt={row.name}
                width="100"
                height="100"
              />
            ) : null}
            <div>
              <h3>{row.name}</h3>
              <p>
                {row.originalName} · ID {row.ownerId}
              </p>
              <p>
                Навыки: {row.profile.abilities?.length || 0} · Пробуждения:{' '}
                {row.profile.awakenings?.length || 0} · Наряды:{' '}
                {row.profile.skins?.length || 0} · Реплики:{' '}
                {row.profile.voiceLines?.length || 0}
              </p>
            </div>
          </div>
          <label>
            Имя
            <input
              name="name"
              defaultValue={row.name}
              required
              maxLength={160}
            />
          </label>
          <label>
            Адрес страницы
            <input
              name="slug"
              defaultValue={row.slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={120}
            />
          </label>
          <div className="guide-section-fields">
            <label>
              Редкость
              <select
                aria-label="Редкость"
                name="rarity"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Выберите
                </option>
                <option>S</option>
                <option>A</option>
              </select>
            </label>
            <label>
              Атрибут
              <select
                aria-label="Атрибут"
                name="attribute"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Выберите
                </option>
                {['Чары', 'Хаос', 'Психика', 'Анима', 'Космос', 'Лакшана'].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Тип дуги
              <select
                name="arcType"
                required
                defaultValue={row.profile.arcType || ''}
              >
                <option value="" disabled>
                  Выберите
                </option>
                {[
                  'Гибридный',
                  'Твёрдый',
                  'Жидкий',
                  'Газовый',
                  'Плазменный',
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Роль
              <input
                name="role"
                required
                maxLength={120}
                defaultValue={row.profile.roleTags?.[0] || ''}
              />
            </label>
          </div>
          <label>
            Краткое описание
            <textarea
              name="summary"
              required
              maxLength={8000}
              rows={3}
              defaultValue={(
                row.profile.biographyShort ||
                row.profile.biography ||
                ''
              ).slice(0, 8000)}
            />
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={pending || created.includes(row.ownerId) || !row.imageUrl}
          >
            {pending ? 'Создаём…' : 'Создать черновик персонажа'}
          </button>
          {!row.imageUrl ? (
            <p>
              В снимке нет портрета. Дополните данные персонажа перед созданием.
            </p>
          ) : null}
        </form>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </details>
  );
}
