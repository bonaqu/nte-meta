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
import { RichTextEditor } from '../../components/rich-text-editor';
import { ImportSourceLinks } from '../../components/import-source-links';
import { normalizeExternalAssetUrl, resolveAssetUrl } from '../../lib/assets';
import type {
  Character,
  CharacterAbility,
  CharacterAwakening,
  CharacterFriendshipLevel,
  CharacterFriendshipReward,
  CharacterGift,
  CharacterImportLookupResult,
  CharacterImportSuggestion,
  CharacterMaterial,
  CharacterProfile,
  CharacterRoleIcon,
  CharacterSkin,
  CharacterStat,
  CharacterVoiceActor,
  CharacterVoiceLine,
  PublishStatus,
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
const directAudioPattern =
  /\.(mp3|m4a|ogg|oga|wav|flac|webm)(?:\/revision\/latest)?(?:[?#].*)?$/i;

function isDirectAudioUrl(url: string) {
  const value = url.trim();
  return /^https?:\/\//i.test(value) && directAudioPattern.test(value);
}

function isVideoSourceUrl(url: string) {
  return /youtube\.com|youtu\.be|vimeo\.com|bilibili\.com/i.test(url);
}

function getYoutubeThumbnailUrl(url: string) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?[^#\s]*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  );
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '';
}

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

function friendshipRewards(item: CharacterFriendshipLevel) {
  if (item.rewards?.length) return item.rewards;
  if (!item.rewardName && !item.rewardIconUrl) return [];
  return [
    {
      id: `legacy-reward-${item.level}`,
      name: item.rewardName,
      quantity: '',
      iconUrl: item.rewardIconUrl,
    },
  ];
}

function withFriendshipRewards(
  item: CharacterFriendshipLevel,
  rewards: CharacterFriendshipReward[],
) {
  return {
    ...item,
    rewards,
    rewardName: rewards
      .map((reward) =>
        [reward.name, reward.quantity ? `×${reward.quantity}` : '']
          .filter(Boolean)
          .join(' '),
      )
      .join('; ')
      .slice(0, 160),
    rewardIconUrl: rewards[0]?.iconUrl || '',
  };
}

function emptyProfile(): CharacterProfile {
  return {
    faction: '',
    arcType: '',
    birthday: '',
    releaseDate: '',
    biographyShort: '',
    biography: '',
    trivia: '',
    roleTags: ['DPS'],
    roleIcons: [],
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
      rewards: [],
    })),
    gifts: [],
    voiceLines: [],
    awakenings: [],
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
  const biography =
    profile.biography || profile.biographyShort || character.summary || '';
  return {
    ...character,
    profile: {
      ...emptyProfile(),
      ...profile,
      biography,
      biographyShort: createBiographyExcerpt(biography),
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
  return (
    <div className="character-markdown-field">
      <label htmlFor={id}>{label}</label>
      <RichTextEditor
        id={id}
        value={value}
        onChange={onChange}
        minHeight={260}
        maxLength={16000}
        placeholder={`Заполните поле «${label}»...`}
        ariaLabel={label}
      />
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
  const suggestionsByField = new Map<string, CharacterImportSuggestion[]>();
  for (const suggestion of suggestions) {
    const variants = suggestionsByField.get(suggestion.field) || [];
    variants.push(suggestion);
    suggestionsByField.set(suggestion.field, variants);
  }
  const variantPosition = new Map<string, { index: number; total: number }>();
  for (const variants of suggestionsByField.values()) {
    variants.forEach((suggestion, index) => {
      variantPosition.set(suggestion.id, {
        index: index + 1,
        total: variants.length,
      });
    });
  }

  return (
    <section className="import-review-panel" aria-label="Предложения автоимпорта">
      <div>
        <p className="eyebrow">Автоимпорт</p>
        <h3>Выберите и подтвердите найденные данные</h3>
        <p>
          Для одного поля может быть несколько вариантов из разных источников.
          Галочка применяет выбранное в черновик; на сайте данные появятся только
          после сохранения или публикации.
        </p>
      </div>
      <div className="import-suggestion-list">
        {suggestions.map((suggestion) => {
          const decision = decisions[suggestion.id];
          const previewUrls = getSuggestionPreviewUrls(suggestion);
          const fieldLabel = getSuggestionFieldLabel(suggestion);
          const suggestionContext = getSuggestionContextLabel(
            suggestion,
            fieldLabel,
          );
          const rowSuggestions = getImportSuggestionRows(suggestion);
          const variant = variantPosition.get(suggestion.id);
          const variantCount = suggestion.variantCount || variant?.total || 1;
          const agreementCount = suggestion.agreementCount || 1;
          return (
            <article
              className={`import-suggestion ${decision ? `is-${decision}` : ''}`}
              key={suggestion.id}
            >
              <div>
                <strong>{fieldLabel}</strong>
                {variant && variant.total > 1 ? (
                  <span className="import-variant-label">
                    Вариант {variant.index} из {variant.total}
                  </span>
                ) : null}
                <div className="import-quality-badges" aria-label="Качество предложения">
                  {agreementCount >= 2 ? (
                    <span className="quality-consensus">
                      Совпало в {agreementCount} источниках
                    </span>
                  ) : null}
                  {variantCount >= 2 ? (
                    <span className="quality-conflict">
                      На выбор: {variantCount} варианта
                    </span>
                  ) : null}
                  {suggestion.qualityFlags?.includes('incomplete') ? (
                    <span className="quality-review">Нужна внимательная проверка</span>
                  ) : null}
                </div>
                {suggestionContext ? <span>{suggestionContext}</span> : null}
              </div>
              <div className="import-suggestion-value">
                {previewUrls.length ? (
                  <div
                    className={`import-image-preview ${
                      previewUrls.length > 1 ? 'import-image-preview--grid' : ''
                    }`}
                  >
                    <div>
                      {previewUrls.map((previewUrl) => (
                        <a
                          href={resolveAssetUrl(previewUrl)}
                          key={previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Открыть изображение из автоимпорта"
                        >
                          <img
                            src={resolveAssetUrl(previewUrl)}
                            alt=""
                            width="92"
                            height="92"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                              event.currentTarget
                                .closest('.import-image-preview')
                                ?.setAttribute('data-broken', 'true');
                            }}
                          />
                        </a>
                      ))}
                    </div>
                    <span>Нажмите на превью, чтобы открыть оригинал</span>
                  </div>
                ) : null}
                <p>{summarizeSuggestionValue(suggestion.value)}</p>
                {rowSuggestions.length ? (
                  <details className="import-row-review">
                    <summary>
                      Проверить строки по одной
                      <span>{rowSuggestions.length}</span>
                    </summary>
                    <div className="import-row-bulk-actions">
                      <button
                        className="compact-action"
                        type="button"
                        disabled={decision === 'accepted'}
                        onClick={() => onAccept(suggestion)}
                      >
                        <CheckCircle2 aria-hidden="true" />
                        Принять весь блок
                      </button>
                      <button
                        className="compact-action danger"
                        type="button"
                        disabled={decision === 'rejected'}
                        onClick={() => onReject(suggestion)}
                      >
                        <XCircle aria-hidden="true" />
                        Отклонить весь блок
                      </button>
                    </div>
                    <div className="import-row-review-list" aria-label={`Строки: ${fieldLabel}`}>
                      {rowSuggestions.map((row) => {
                        const rowDecision = decisions[row.id];
                        const rowPreviewUrls = getSuggestionPreviewUrls(row);
                        const rowAudioUrl = getSuggestionAudioUrl(row);
                        return (
                          <div
                            className={`import-row ${rowDecision ? `is-${rowDecision}` : ''}`}
                            key={row.id}
                          >
                            {rowPreviewUrls[0] ? (
                              <img
                                src={resolveAssetUrl(rowPreviewUrls[0])}
                                alt=""
                                width="44"
                                height="44"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <div className="import-row-content">
                              <span>{row.label}</span>
                              {rowAudioUrl ? (
                                <audio controls preload="none" src={rowAudioUrl}>
                                  Ваш браузер не поддерживает аудио.
                                </audio>
                              ) : null}
                            </div>
                            <div className="import-row-actions">
                              <button
                                className="icon-button success"
                                type="button"
                                aria-label={`Принять строку: ${row.label}`}
                                disabled={rowDecision === 'accepted'}
                                onClick={() => onAccept(row)}
                              >
                                <CheckCircle2 aria-hidden="true" />
                              </button>
                              <button
                                className="icon-button danger"
                                type="button"
                                aria-label={`Отклонить строку: ${row.label}`}
                                disabled={rowDecision === 'rejected'}
                                onClick={() => onReject(row)}
                              >
                                <XCircle aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </div>
              <small>
                {suggestion.sourceName} · {formatImportConfidence(suggestion.confidence)}
                {suggestion.note ? ` · ${suggestion.note}` : ''}
              </small>
              <div className="import-suggestion-actions">
                <ImportSourceLinks suggestion={suggestion} />
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
    if (Array.isArray(parsed)) {
      const names = parsed
        .map((item) => {
          if (!item || typeof item !== 'object') return '';
          const record = item as Record<string, unknown>;
          const prefix =
            typeof record.level === 'number'
              ? `Уровень ${record.level}: `
              : typeof record.language === 'string'
                ? `${record.language}: `
                : '';
          const label =
            record.name ||
            record.title ||
            record.label ||
            record.rewardName ||
            record.value;
          return label ? `${prefix}${String(label)}` : '';
        })
        .filter(Boolean);
      if (names.length) {
        const suffix = names.length > 4 ? '...' : '';
        return `${parsed.length} записей: ${names.slice(0, 4).join(', ')}${suffix}`;
      }
      return `${parsed.length} записей`;
    }
  } catch {
    // plain text suggestion
  }
  return value.length > 260 ? `${value.slice(0, 260)}...` : value;
}

function formatImportConfidence(confidence: CharacterImportSuggestion['confidence']) {
  if (confidence === 'high') return 'Высокая уверенность';
  if (confidence === 'medium') return 'Средняя уверенность';
  return 'Требует ручной проверки';
}

function parseImportValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function getSuggestionPreviewUrls(suggestion: CharacterImportSuggestion) {
  const urls: string[] = [];
  const addUrl = (value: unknown) => {
    if (typeof value !== 'string') return;
    if (!/^(?:https?:|data:|blob:|\/?assets\/)/i.test(value)) return;
    if (directAudioPattern.test(value)) return;
    const normalized = getYoutubeThumbnailUrl(value) || normalizeExternalAssetUrl(value);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  };
  const visit = (value: unknown, depth = 0) => {
    if (urls.length >= 6 || depth > 4) return;
    if (typeof value === 'string') {
      addUrl(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach((item) => visit(item, depth + 1));
    }
  };

  const parsed = parseImportValue(suggestion.value);
  if (typeof parsed === 'string' && /(?:image|splash|icon)url/i.test(suggestion.field)) {
    addUrl(parsed);
    return urls;
  }

  if (Array.isArray(parsed)) {
    visit(parsed);
  }

  return urls;
}

function getSuggestionAudioUrl(suggestion: CharacterImportSuggestion) {
  const parsed = parseImportValue(suggestion.value);
  if (!Array.isArray(parsed)) return '';
  const audioUrl = parsed
    .map((item) =>
      item && typeof item === 'object' && 'audioUrl' in item
        ? String((item as { audioUrl?: unknown }).audioUrl || '').trim()
        : '',
    )
    .find((value) => isDirectAudioUrl(value));
  return audioUrl || '';
}

function getSuggestionFieldLabel(suggestion: CharacterImportSuggestion) {
  const labels: Record<string, string> = {
    name: 'Имя',
    originalName: 'Оригинальное имя',
    rarity: 'Редкость',
    attribute: 'Атрибут',
    tier: 'Подсказка для тир-листа',
    imageUrl: 'Карточка персонажа',
    splashUrl: 'Splash персонажа',
    'profile.arcType': 'Тип дуги',
    'profile.birthday': 'День рождения',
    'profile.releaseDate': 'Дата релиза',
    'profile.faction': 'Фракция',
    'profile.biographyShort': 'Биография',
    'profile.biography': 'Биография',
    'profile.trivia': 'Интересные факты',
    'profile.roleTags': 'Роли в отряде',
    'profile.roleIcons': 'Иконки ролей',
    'profile.voiceActors': 'Озвучка: актёры',
    'profile.voiceLines': 'Озвучка: реплики',
    'profile.materials': 'Материалы прокачки',
    'profile.baseStats': 'Начальные показатели',
    'profile.abilities': 'Способности',
    'profile.awakenings': 'Пробуждения',
    'profile.friendship': 'Симпатия',
    'profile.gifts': 'Любимые подарки',
    'profile.skins': 'Гардероб',
  };
  return labels[suggestion.field] || suggestion.label;
}

function getSuggestionContextLabel(
  suggestion: CharacterImportSuggestion,
  fieldLabel: string,
) {
  const escapedField = suggestion.field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleaned = suggestion.label
    .replace(new RegExp(escapedField, 'gi'), '')
    .replace(/\bprofile\.[a-zA-Z.]+\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

  if (
    !cleaned ||
    cleaned.toLocaleLowerCase('ru-RU') === fieldLabel.toLocaleLowerCase('ru-RU')
  ) {
    return '';
  }

  return cleaned;
}

function getImportSuggestionRows(
  suggestion: CharacterImportSuggestion,
): CharacterImportSuggestion[] {
  const parsed = parseImportValue(suggestion.value);
  if (!Array.isArray(parsed) || parsed.length < 2) return [];
  return parsed.map((item, index) => ({
    ...suggestion,
    id: `${suggestion.id}:row:${index}`,
    label: getImportRowLabel(item, index),
    value: JSON.stringify([item]),
    note: suggestion.note
      ? `Строка ${index + 1}. ${suggestion.note}`
      : `Строка ${index + 1}`,
  }));
}

function getImportRowLabel(item: unknown, index: number) {
  if (typeof item === 'string' && item.trim()) return item.trim();
  if (!item || typeof item !== 'object') return `Строка ${index + 1}`;
  const record = item as Record<string, unknown>;
  const prefix =
    typeof record.level === 'number'
      ? `Уровень ${record.level}: `
      : typeof record.language === 'string'
        ? `${record.language}: `
        : typeof record.type === 'string'
          ? `${record.type}: `
          : '';
  const value =
    record.name ||
    record.title ||
    record.label ||
    record.rewardName ||
    record.value ||
    `Строка ${index + 1}`;
  return `${prefix}${String(value)}`;
}

function formatEditorError(error: string) {
  const text = error || 'Не удалось сохранить изменения.';
  if (/profile\.awakenings.+не больше 7 записей/i.test(text)) {
    return 'В пробуждениях можно сохранить не больше 7 строк: пустой уровень и пробуждения 1-6. Удалите лишние записи.';
  }
  if (/profile\.abilities.+не больше/i.test(text)) {
    return 'В способностях слишком много строк. Оставьте основные навыки персонажа и удалите лишнее.';
  }
  if (/profile\.friendship.+не больше/i.test(text)) {
    return 'В симпатии можно сохранить не больше 10 уровней. Оставьте уровни дружбы с 1 по 10.';
  }
  if (/profile\.skins.+не больше/i.test(text)) {
    return 'В гардеробе слишком много записей. Оставьте только реальные скины персонажа.';
  }
  if (/profile\.gifts.+не больше/i.test(text)) {
    return 'В любимых подарках слишком много записей. Оставьте проверенные подарки без дублей.';
  }
  if (/profile\.voiceLines.+не больше/i.test(text)) {
    return 'В озвучке можно сохранить не больше 500 записей. Удалите дубли или неподтверждённые реплики.';
  }
  if (/profile\./i.test(text)) {
    return text
      .replace(/profile\.awakenings/g, 'Пробуждения')
      .replace(/profile\.abilities/g, 'Способности')
      .replace(/profile\.voiceActors/g, 'Озвучка: актёры')
      .replace(/profile\.voiceLines/g, 'Озвучка: реплики')
      .replace(/profile\.baseStats/g, 'Начальные показатели')
      .replace(/profile\.materials/g, 'Материалы')
      .replace(/profile\.roleTags/g, 'Роли персонажа')
      .replace(/profile\.friendship/g, 'Симпатия')
      .replace(/profile\.gifts/g, 'Любимые подарки')
      .replace(/profile\.skins/g, 'Гардероб')
      .replace(/profile\.arcType/g, 'Тип дуги')
      .replace(/profile\.faction/g, 'Фракция')
      .replace(/profile\.birthday/g, 'День рождения')
      .replace(/profile\.releaseDate/g, 'Дата релиза')
      .replace(/Поле\s+/g, '');
  }
  return text;
}

function readEditorImageFile(
  file: File,
  {
    maxBytes,
    maxSide,
    label,
  }: { maxBytes: number; maxSide: number; label: string },
) {
  const allowedTypes = new Set(['image/png', 'image/webp', 'image/jpeg']);

  if (!allowedTypes.has(file.type)) {
    throw new Error('Поддерживаются только PNG, WebP или JPEG.');
  }
  if (file.size > maxBytes) {
    throw new Error(`${label} должен весить не больше ${Math.round(maxBytes / 1024)} KB.`);
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const image = new Image();
      image.onerror = () => reject(new Error('Не удалось проверить изображение.'));
      image.onload = () => {
        if (image.naturalWidth > maxSide || image.naturalHeight > maxSide) {
          reject(new Error(`Размер файла должен быть не больше ${maxSide}×${maxSide} px.`));
          return;
        }
        resolve(dataUrl);
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function readSmallIconFile(file: File) {
  return readEditorImageFile(file, {
    maxBytes: 250 * 1024,
    maxSide: 512,
    label: 'Иконка',
  });
}

function readSkinImageFile(file: File) {
  return readEditorImageFile(file, {
    maxBytes: 900 * 1024,
    maxSide: 1600,
    label: 'Изображение',
  });
}

function mergeText(current: string, addition: string) {
  const cleanAddition = addition.trim();
  if (!cleanAddition) return current;
  if (!current.trim()) return cleanAddition;
  if (current.includes(cleanAddition)) return current;
  return `${current.trim()}\n\n${cleanAddition}`;
}

function createBiographyExcerpt(value: string, maxLength = 320) {
  const plain = String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`#>*_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}

function mergeFriendshipLevels(
  current: CharacterFriendshipLevel[],
  imported: CharacterFriendshipLevel[],
) {
  const byLevel = new Map<number, CharacterFriendshipLevel>();
  current.forEach((item) => {
    const level = Number(item.level);
    if (level >= 1 && level <= 10) byLevel.set(level, item);
  });
  imported.forEach((item) => {
    const level = Number(item.level);
    if (level < 1 || level > 10) return;
    const existing = byLevel.get(level);
    const importedRewards = (item.rewards || []).map(normalizeAssetFields);
    const existingRewards = (existing?.rewards || []).map(normalizeAssetFields);
    const rewards = mergeRowsByKey(
      existingRewards,
      importedRewards,
      (reward) => `${reward.name}:${reward.quantity}`,
    );
    byLevel.set(level, {
      level,
      rewardName: item.rewardName || existing?.rewardName || '',
      rewardIconUrl: normalizeExternalAssetUrl(
        item.rewardIconUrl || existing?.rewardIconUrl || '',
      ),
      description: item.description || existing?.description || '',
      rewards,
    });
  });
  return [...byLevel.values()].sort((a, b) => a.level - b.level);
}

function mergeNamedRows<T extends { id?: string; name: string }>(
  current: T[],
  imported: T[],
) {
  const result = current.map(normalizeAssetFields);
  const indexByName = new Map<string, number>();

  result.forEach((item, index) => {
    const key = item.name.trim().toLocaleLowerCase('ru-RU');
    if (key) indexByName.set(key, index);
  });

  imported.map(normalizeAssetFields).forEach((item) => {
    const key = item.name.trim().toLocaleLowerCase('ru-RU');
    if (!key) return;
    const index = indexByName.get(key);
    if (index === undefined) {
      result.push(item);
      indexByName.set(key, result.length - 1);
      return;
    }
    result[index] = { ...result[index], ...item };
  });

  return result;
}

function normalizeAssetFields<T extends object>(item: T): T {
  const next = { ...item } as Record<string, unknown>;
  if (typeof next.id === 'string' && next.id.length > 80) {
    next.id = rowId();
  }
  for (const field of ['iconUrl', 'imageUrl', 'rewardIconUrl'] as const) {
    if (typeof next[field] === 'string') {
      next[field] = normalizeExternalAssetUrl(next[field]);
    }
  }
  return next as T;
}

function mergeRowsByKey<T extends object>(
  current: T[],
  imported: T[],
  getKey: (item: T) => string,
) {
  const result = current.map(normalizeAssetFields);
  const indexByKey = new Map<string, number>();

  result.forEach((item, index) => {
    const key = getKey(item).trim().toLocaleLowerCase('ru-RU');
    if (key) indexByKey.set(key, index);
  });

  imported.map(normalizeAssetFields).forEach((item) => {
    const key = getKey(item).trim().toLocaleLowerCase('ru-RU');
    if (!key) return;
    const index = indexByKey.get(key);
    if (index === undefined) {
      result.push(item);
      indexByKey.set(key, result.length - 1);
      return;
    }
    result[index] = { ...result[index], ...item };
  });

  return result;
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
  const [importCoverage, setImportCoverage] = useState<
    CharacterImportLookupResult['coverage']
  >();
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
    setImportCoverage(undefined);
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
      setImportCoverage(result.data.coverage);
    } else {
      setTone('danger');
      setMessage(formatEditorError(result.error));
    }
    setPending(false);
  }

  function applyImportSuggestion(suggestion: CharacterImportSuggestion) {
    const parsed = parseImportValue(suggestion.value);
    if (suggestion.field === 'tier') {
      setImportDecisions((current) => ({
        ...current,
        [suggestion.id]: 'rejected',
      }));
      setTone('info');
      setMessage(
        `Внешний тир «${String(parsed)}» не записан в профиль персонажа. Ранг персонажа редактируется только в едином разделе «Тир-листы».`,
      );
      return;
    }

    setDraft((current) => {
      const next: CharacterDraft = {
        ...current,
        profile: { ...current.profile },
      };
      if (suggestion.field === 'name') next.name = String(parsed);
      else if (suggestion.field === 'originalName') next.originalName = String(parsed);
      else if (suggestion.field === 'rarity' && ['S', 'A'].includes(String(parsed))) {
        next.rarity = String(parsed) as Character['rarity'];
      } else if (suggestion.field === 'attribute') next.attribute = String(parsed);
      else if (suggestion.field === 'profile.faction') {
        next.profile.faction = String(parsed);
      } else if (suggestion.field === 'profile.arcType') {
        next.profile.arcType = String(parsed);
      } else if (suggestion.field === 'profile.birthday') {
        next.profile.birthday = String(parsed);
      } else if (suggestion.field === 'profile.releaseDate') {
        next.profile.releaseDate = String(parsed);
      } else if (
        suggestion.field === 'profile.biography' ||
        suggestion.field === 'profile.biographyShort'
      ) {
        next.profile.biography = String(parsed);
      } else if (suggestion.field === 'profile.trivia') {
        next.profile.trivia = mergeText(next.profile.trivia, String(parsed));
      } else if (suggestion.field === 'profile.roleTags' && Array.isArray(parsed)) {
        next.profile.roleTags = Array.from(
          new Set([...next.profile.roleTags, ...parsed.map(String).filter(Boolean)]),
        );
      } else if (suggestion.field === 'profile.roleIcons' && Array.isArray(parsed)) {
        next.profile.roleIcons = mergeRowsByKey(
          next.profile.roleIcons || [],
          parsed as CharacterRoleIcon[],
          (item) => item.name,
        );
      } else if (suggestion.field === 'profile.voiceActors' && Array.isArray(parsed)) {
        next.profile.voiceActors = mergeRowsByKey(
          next.profile.voiceActors,
          parsed as CharacterVoiceActor[],
          (item) => item.language,
        );
      } else if (suggestion.field === 'profile.voiceLines' && Array.isArray(parsed)) {
        next.profile.voiceLines = mergeRowsByKey(
          next.profile.voiceLines,
          parsed as CharacterVoiceLine[],
          (item) => `${item.language}:${item.title}`,
        );
      } else if (suggestion.field === 'profile.materials' && Array.isArray(parsed)) {
        next.profile.materials = mergeRowsByKey(
          next.profile.materials,
          parsed as CharacterMaterial[],
          (item) => item.name,
        );
      } else if (suggestion.field === 'profile.friendship' && Array.isArray(parsed)) {
        next.profile.friendship = mergeFriendshipLevels(
          next.profile.friendship,
          parsed as CharacterFriendshipLevel[],
        );
      } else if (suggestion.field === 'profile.gifts' && Array.isArray(parsed)) {
        next.profile.gifts = mergeNamedRows(
          next.profile.gifts,
          parsed as CharacterGift[],
        );
      } else if (suggestion.field === 'profile.skins' && Array.isArray(parsed)) {
        next.profile.skins = mergeNamedRows(
          next.profile.skins,
          parsed as CharacterSkin[],
        );
      } else if (suggestion.field === 'profile.baseStats' && Array.isArray(parsed)) {
        next.profile.baseStats = mergeRowsByKey(
          next.profile.baseStats,
          parsed as CharacterStat[],
          (item) => item.label,
        );
      } else if (suggestion.field === 'profile.abilities' && Array.isArray(parsed)) {
        next.profile.abilities = mergeRowsByKey(
          next.profile.abilities,
          parsed as CharacterAbility[],
          (item) => `${item.type}:${item.name}`,
        );
      } else if (suggestion.field === 'profile.awakenings' && Array.isArray(parsed)) {
        next.profile.awakenings = mergeRowsByKey(
          next.profile.awakenings,
          parsed as CharacterAwakening[],
          (item) => `${item.level}`,
        ).sort((a, b) => a.level - b.level);
      } else if (suggestion.field === 'imageUrl') {
        next.imageUrl = normalizeExternalAssetUrl(String(parsed));
      } else if (suggestion.field === 'splashUrl') {
        next.splashUrl = normalizeExternalAssetUrl(String(parsed));
      }
      return next;
    });
    setImportDecisions((current) => {
      const next = { ...current };
      if (!/:row:\d+$/.test(suggestion.id)) {
        importSuggestions
          .filter((candidate) => candidate.field === suggestion.field)
          .forEach((candidate) => {
            next[candidate.id] =
              candidate.id === suggestion.id ? 'accepted' : 'rejected';
          });
      } else {
        next[suggestion.id] = 'accepted';
      }
      return next;
    });
    setTone('success');
    setMessage(
      `Поле «${suggestion.label}» добавлено в черновик. Проверьте и сохраните персонажа.`,
    );
  }

  async function uploadInlineIcon(
    file: File | undefined,
    onReady: (dataUrl: string) => void,
  ) {
    if (!file) return;
    try {
      const dataUrl = await readSmallIconFile(file);
      onReady(dataUrl);
      setTone('success');
      setMessage('Иконка загружена в черновик. Проверьте предпросмотр и сохраните персонажа.');
    } catch (error) {
      setTone('danger');
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить иконку.');
    }
  }

  async function uploadInlineImage(
    file: File | undefined,
    onReady: (dataUrl: string) => void,
  ) {
    if (!file) return;
    try {
      const dataUrl = await readSkinImageFile(file);
      onReady(dataUrl);
      setTone('success');
      setMessage('Изображение загружено в черновик. Проверьте предпросмотр и сохраните персонажа.');
    } catch (error) {
      setTone('danger');
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить изображение.');
    }
  }

  async function persist(status: 'draft' | 'published') {
    if (!hasApiBase()) {
      setTone('info');
      setMessage('Сохранение доступно после подключения Worker API.');
      return;
    }
    const biography = draft.profile.biography.trim();
    if (!biography) {
      setTone('danger');
      setMessage('Заполните биографию персонажа перед сохранением.');
      return;
    }
    const biographyShort = createBiographyExcerpt(biography);
    const profile = { ...draft.profile, biography, biographyShort };
    setPending(true);
    setMessage('');
    const payload = {
      ...draft,
      shortDescription: biographyShort,
      summary: biography,
      status,
      patchVersion: draft.patch,
      tagsJson: draft.tags,
      profile,
    };
    const result = await saveEntity<{
      id?: string;
      slug?: string;
      status?: string;
      success?: boolean;
    }>(
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
        slug: String(result.data.slug || draft.slug || '').trim(),
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
      setMessage(formatEditorError(result.error));
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
      setMessage(formatEditorError(result.error));
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
                      referrerPolicy="no-referrer"
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
      {importCoverage ? (
        <div className="import-coverage" aria-label="Покрытие найденных данных">
          <div>
            <strong>Можно сверять</strong>
            <span>{importCoverage.readyFields.join(', ') || 'Нет'}</span>
          </div>
          <div>
            <strong>Нужна ручная проверка</strong>
            <span>{importCoverage.reviewFields.join(', ') || 'Нет'}</span>
          </div>
          <div>
            <strong>Не найдено</strong>
            <span>{importCoverage.missingFields.join(', ') || 'Нет'}</span>
          </div>
        </div>
      ) : null}
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
              Адрес страницы
              <input
                required
                value={draft.slug}
                onChange={(event) => patch({ slug: event.target.value })}
                aria-describedby="character-slug-help"
              />
              <small id="character-slug-help">
                Создаётся из имени автоматически. Измените только если нужна другая короткая ссылка.
              </small>
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
          Дата релиза
          <input
            value={profile.releaseDate}
            placeholder="Например, 03 июня 2026"
            onChange={(event) =>
              patchProfile({ releaseDate: event.target.value })
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
            <div className="wide-field">
              <Collection<CharacterRoleIcon>
                title="Иконки ролей"
                description="Иконки используются рядом с русскими названиями ролей в профиле."
                items={profile.roleIcons || []}
                addLabel="Добавить иконку роли"
                createItem={() => ({ name: '', iconUrl: '' })}
                onChange={(roleIcons) => patchProfile({ roleIcons })}
                render={(item, _index, update) => (
                  <>
                    <label>
                      Роль
                      <input
                        value={item.name}
                        placeholder="Основной ДД"
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
                    <label>
                      Загрузить иконку
                      <input
                        type="file"
                        accept="image/png,image/webp,image/jpeg"
                        onChange={(event) =>
                          void uploadInlineIcon(event.target.files?.[0], (iconUrl) =>
                            update({ ...item, iconUrl }),
                          )
                        }
                      />
                    </label>
                    {item.iconUrl ? (
                      <img
                        className="editor-icon-preview"
                        src={resolveAssetUrl(item.iconUrl)}
                        alt=""
                        width="54"
                        height="54"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                  </>
                )}
              />
            </div>
            <div className="inline-note wide-field">
              <strong>Тир персонажа редактируется в разделе «Тир-листы».</strong>
              <span>
                Профиль персонажа хранит лор, биографию и игровые данные.
                Актуальная позиция S/A/B/C/D берётся из единого тир-листа и не
                меняется на странице профиля.
              </span>
              <a className="text-button" href="#/tierlists">
                Открыть тир-лист
              </a>
            </div>
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
          <div className="media-field-preview">
            <label>
              Загрузить иконку/карточку
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void uploadInlineImage(event.target.files?.[0], (imageUrl) =>
                    patch({ imageUrl }),
                  );
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {draft.imageUrl ? (
              <img
                className="editor-image-preview"
                src={resolveAssetUrl(draft.imageUrl)}
                alt=""
                width="120"
                height="120"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>Превью появится после URL или загрузки файла.</span>
            )}
          </div>
          <label>
            URL splash art
            <input
              type="text"
              inputMode="url"
              value={draft.splashUrl}
              onChange={(event) => patch({ splashUrl: event.target.value })}
            />
          </label>
          <div className="media-field-preview">
            <label>
              Загрузить splash art
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void uploadInlineImage(event.target.files?.[0], (splashUrl) =>
                    patch({ splashUrl }),
                  );
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {draft.splashUrl ? (
              <img
                className="editor-image-preview editor-image-preview--wide"
                src={resolveAssetUrl(draft.splashUrl)}
                alt=""
                width="180"
                height="112"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>Превью появится после URL или загрузки файла.</span>
            )}
          </div>
          </div>
        </details>

        <details className="editor-section" open>
          <summary>Биография и интересные факты</summary>
          <MarkdownField
            id="character-biography"
            label="Биография"
            value={profile.biography}
            onChange={(biography) => patchProfile({ biography })}
          />
          <MarkdownField
            id="character-trivia"
            label="Пасхалки и интересные факты"
            value={profile.trivia}
            onChange={(trivia) => patchProfile({ trivia })}
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
              type: 'Базовая атака',
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
                  <select
                    value={item.type}
                    onChange={(event) =>
                      update({ ...item, type: event.target.value })
                    }
                  >
                    {[
                      'Базовая атака',
                      'Навык',
                      'Навык перенаправления',
                      'Сверхспособность',
                      'Навык поддержки',
                      'Пассивный навык',
                      'Черта персонажа',
                      'Повседневный навык',
                    ].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
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
                <label>
                  Загрузить иконку
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    onChange={(event) =>
                      void uploadInlineIcon(event.target.files?.[0], (iconUrl) =>
                        update({ ...item, iconUrl }),
                      )
                    }
                  />
                </label>
                {item.iconUrl ? (
                  <img
                    className="editor-icon-preview"
                    src={resolveAssetUrl(item.iconUrl)}
                    alt=""
                    width="54"
                    height="54"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
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
            title="Пробуждения 0-6"
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
                    {level === 0 ? 'Без пробуждений' : `Пробуждение ${level}`}
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
                <label>
                  Загрузить иконку
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    onChange={(event) =>
                      void uploadInlineIcon(event.target.files?.[0], (iconUrl) =>
                        update({ ...item, iconUrl }),
                      )
                    }
                  />
                </label>
                {item.iconUrl ? (
                  <img
                    className="editor-icon-preview"
                    src={resolveAssetUrl(item.iconUrl)}
                    alt=""
                    width="54"
                    height="54"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
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
              rewards: [],
            })}
            onChange={(friendship) => patchProfile({ friendship })}
            render={(item, _index, update) => {
              const rewards = friendshipRewards(item);
              const setRewards = (nextRewards: CharacterFriendshipReward[]) =>
                update(withFriendshipRewards(item, nextRewards));
              return (
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
                <div className="friendship-reward-editor wide-field">
                  <div className="friendship-reward-editor__header">
                    <div>
                      <strong>Награды уровня</strong>
                      <small>Каждая награда хранится с количеством и своей иконкой.</small>
                    </div>
                    <button
                      className="ghost-button compact-button"
                      type="button"
                      onClick={() =>
                        setRewards([
                          ...rewards,
                          { id: rowId(), name: '', quantity: '', iconUrl: '' },
                        ])
                      }
                    >
                      <Plus aria-hidden="true" /> Добавить награду
                    </button>
                  </div>
                  {rewards.length ? (
                    <div className="friendship-reward-editor__list">
                      {rewards.map((reward, rewardIndex) => (
                        <article key={reward.id}>
                          {reward.iconUrl ? (
                            <img
                              src={resolveAssetUrl(reward.iconUrl)}
                              alt=""
                              width="48"
                              height="48"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="friendship-reward-placeholder" aria-hidden="true">
                              {rewardIndex + 1}
                            </span>
                          )}
                          <label>
                            Награда
                            <input
                              value={reward.name}
                              onChange={(event) =>
                                setRewards(
                                  rewards.map((entry, index) =>
                                    index === rewardIndex
                                      ? { ...entry, name: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            Количество
                            <input
                              value={reward.quantity}
                              onChange={(event) =>
                                setRewards(
                                  rewards.map((entry, index) =>
                                    index === rewardIndex
                                      ? { ...entry, quantity: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="friendship-reward-url">
                            URL иконки
                            <input
                              type="text"
                              inputMode="url"
                              value={reward.iconUrl}
                              onChange={(event) =>
                                setRewards(
                                  rewards.map((entry, index) =>
                                    index === rewardIndex
                                      ? { ...entry, iconUrl: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="friendship-reward-upload">
                            Загрузить иконку
                            <input
                              type="file"
                              accept="image/png,image/webp,image/jpeg"
                              onChange={(event) =>
                                void uploadInlineIcon(event.target.files?.[0], (iconUrl) =>
                                  setRewards(
                                    rewards.map((entry, index) =>
                                      index === rewardIndex ? { ...entry, iconUrl } : entry,
                                    ),
                                  ),
                                )
                              }
                            />
                          </label>
                          <button
                            className="icon-button danger"
                            type="button"
                            aria-label={`Удалить награду ${reward.name || rewardIndex + 1}`}
                            onClick={() =>
                              setRewards(rewards.filter((_, index) => index !== rewardIndex))
                            }
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="friendship-reward-empty">Награды пока не добавлены.</p>
                  )}
                </div>
                </>
              );
            }}
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
                    <label>
                      Загрузить изображение
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          void uploadInlineImage(event.target.files?.[0], (imageUrl) =>
                            update({ ...item, imageUrl }),
                          )
                        }
                      />
                    </label>
                    {item.imageUrl ? (
                      <img
                        className="editor-image-preview"
                        src={resolveAssetUrl(item.imageUrl)}
                        alt=""
                        width="120"
                        height="72"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
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
          <summary>Озвучка персонажа</summary>
          <p className="editor-section-intro">
            Актёры дубляжа и реплики собраны вместе. Для каждого языка можно
            указать исполнителя, аудиофайл и проверяемый источник.
          </p>
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
                    inputMode="url"
                    placeholder="https://example.com/voice-line.mp3"
                    value={item.audioUrl}
                    onChange={(event) =>
                      update({ ...item, audioUrl: event.target.value })
                    }
                  />
                  <small>
                    Для нативного плеера нужен прямой файл: mp3, m4a, ogg, wav,
                    flac или webm. Видео и страницы добавляйте ниже как источник.
                  </small>
                </label>
                <label className="wide-field">
                  Источник записи или видео
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="YouTube, Bilibili, wiki-страница или официальный источник"
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
              {item.sourceUrl && getYoutubeThumbnailUrl(item.sourceUrl) ? (
                <a
                  className="audio-source-preview"
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={getYoutubeThumbnailUrl(item.sourceUrl)}
                    alt=""
                    width="168"
                    height="94"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <span>Открыть видео-источник реплик</span>
                </a>
              ) : null}
              {item.audioUrl && isDirectAudioUrl(item.audioUrl) ? (
                <audio controls preload="none" src={item.audioUrl}>
                  Ваш браузер не поддерживает аудио.
                  </audio>
                ) : item.audioUrl && isVideoSourceUrl(item.audioUrl) ? (
                  <span className="audio-placeholder audio-placeholder--warning">
                    <Headphones aria-hidden="true" /> Это видео-источник, а не
                    прямой аудиофайл. Перенесите ссылку в поле источника записи.
                  </span>
                ) : item.audioUrl ? (
                  <span className="audio-placeholder">
                    <Headphones aria-hidden="true" /> Плеер появится после ссылки
                    на прямой аудиофайл.
                  </span>
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
