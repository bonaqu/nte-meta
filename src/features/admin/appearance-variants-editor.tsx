import { VariantAbilitiesEditor } from './variant-abilities-editor';
import { useState } from 'react';
import type {
  CharacterAppearanceVariant,
  CharacterAbility,
  CharacterSkin,
  CharacterVoiceLine,
} from '../../types';
import { CharacterAppearanceSelector } from '../../components/character-appearance-selector';
import { ImageField } from '../../components/image-field';
import { PageStepper } from '../../components/page-stepper';

export function AppearanceVariantsEditor({
  value,
  context,
  commonAbilities,
  onChange,
}: {
  value: CharacterAppearanceVariant[];
  context: string;
  commonAbilities: CharacterAbility[];
  onChange: (value: CharacterAppearanceVariant[]) => void;
}) {
  const [selected, setSelected] = useState('');
  const [skinPage, setSkinPage] = useState(1);
  const [voicePage, setVoicePage] = useState(1);
  const active = value.find((row) => row.id === selected) || value[0];
  const skinIndex = Math.min(
    skinPage - 1,
    Math.max(0, (active?.skins.length || 0) - 1),
  );
  const voiceIndex = Math.min(
    voicePage - 1,
    Math.max(0, (active?.voiceLines.length || 0) - 1),
  );
  const skin = active?.skins[skinIndex];
  const voice = active?.voiceLines[voiceIndex];
  const patch = (next: Partial<CharacterAppearanceVariant>) => {
    if (active)
      onChange(
        value.map((row) => (row.id === active.id ? { ...row, ...next } : row)),
      );
  };
  const patchSkin = (next: Partial<CharacterSkin>) => {
    if (active)
      patch({
        skins: active.skins.map((row, index) =>
          index === skinIndex ? { ...row, ...next } : row,
        ),
      });
  };
  const patchVoice = (next: Partial<CharacterVoiceLine>) => {
    if (active)
      patch({
        voiceLines: active.voiceLines.map((row, index) =>
          index === voiceIndex ? { ...row, ...next } : row,
        ),
      });
  };
  return (
    <section
      className="character-collection character-variants-editor"
      aria-label="Варианты персонажа"
    >
      <div className="panel-title-row">
        <h3>Варианты персонажа</h3>
        <button
          className="ghost-button"
          type="button"
          disabled={value.length >= 4}
          onClick={() => {
            const id = crypto.randomUUID();
            onChange([
              ...value,
              { id, name: 'Новый вариант', skins: [], voiceLines: [] },
            ]);
            setSelected(id);
            setSkinPage(1);
            setVoicePage(1);
          }}
        >
          Добавить вариант
        </button>
      </div>
      <CharacterAppearanceSelector
        variants={value}
        value={active?.id || ''}
        label="Редактируемый вариант"
        onChange={(id) => {
          setSelected(id);
          setSkinPage(1);
          setVoicePage(1);
        }}
      />
      {active ? (
        <>
          <div className="form-grid">
            <label>
              Название варианта
              <input
                value={active.name}
                maxLength={80}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            <button
              className="ghost-button danger-action"
              type="button"
              onClick={() =>
                onChange(value.filter((row) => row.id !== active.id))
              }
            >
              Удалить вариант
            </button>
          </div>
          <VariantAbilitiesEditor
            key={active.id}
            value={active.abilities || []}
            common={commonAbilities}
            context={`${context}/variants/${active.id}`}
            onChange={(abilities) => patch({ abilities })}
          />
          <section
            className="appearance-variant-editor-part"
            aria-label="Образы выбранного варианта"
          >
            <div className="panel-title-row">
              <h4>Гардероб варианта</h4>
              <button
                className="ghost-button"
                type="button"
                disabled={active.skins.length >= 30}
                onClick={() => {
                  patch({
                    skins: [
                      ...active.skins,
                      {
                        id: crypto.randomUUID(),
                        name: '',
                        imageUrl: '',
                        description: '',
                      },
                    ],
                  });
                  setSkinPage(active.skins.length + 1);
                }}
              >
                Добавить образ
              </button>
            </div>
            {skin ? (
              <>
                <PageStepper
                  value={skinIndex + 1}
                  total={active.skins.length}
                  onChange={setSkinPage}
                  label="Образы в редакторе"
                  unit="Образ"
                />
                <div className="form-grid">
                  <label>
                    Название образа
                    <input
                      value={skin.name}
                      onChange={(event) =>
                        patchSkin({ name: event.target.value })
                      }
                    />
                  </label>
                  <ImageField
                    label="Изображение образа"
                    value={skin.imageUrl}
                    onChange={(imageUrl) => patchSkin({ imageUrl })}
                    context={`${context}/variants/${active.id}/skins`}
                  />
                  <label className="wide-field">
                    Описание образа
                    <textarea
                      rows={3}
                      value={skin.description}
                      onChange={(event) =>
                        patchSkin({ description: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="ghost-button danger-action"
                    type="button"
                    onClick={() =>
                      patch({
                        skins: active.skins.filter(
                          (_, index) => index !== skinIndex,
                        ),
                      })
                    }
                  >
                    Удалить образ
                  </button>
                </div>
              </>
            ) : (
              <p className="empty-inline-copy">Образы пока не добавлены.</p>
            )}
          </section>
          <section
            className="appearance-variant-editor-part"
            aria-label="Реплики выбранного варианта"
          >
            <div className="panel-title-row">
              <h4>Реплики варианта</h4>
              <button
                className="ghost-button"
                type="button"
                disabled={active.voiceLines.length >= 500}
                onClick={() => {
                  patch({
                    voiceLines: [
                      ...active.voiceLines,
                      {
                        id: crypto.randomUUID(),
                        title: '',
                        language: 'Японский',
                        audioUrl: '',
                        sourceUrl: '',
                        description: '',
                      },
                    ],
                  });
                  setVoicePage(active.voiceLines.length + 1);
                }}
              >
                Добавить реплику варианта
              </button>
            </div>
            {voice ? (
              <>
                <PageStepper
                  value={voiceIndex + 1}
                  total={active.voiceLines.length}
                  onChange={setVoicePage}
                  label="Реплики в редакторе"
                  unit="Реплика"
                />
                <div className="form-grid">
                  <label>
                    Название реплики варианта
                    <input
                      value={voice.title}
                      onChange={(event) =>
                        patchVoice({ title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Язык реплики варианта
                    <select
                      value={voice.language}
                      onChange={(event) =>
                        patchVoice({
                          language: event.target
                            .value as CharacterVoiceLine['language'],
                        })
                      }
                    >
                      {['Английский', 'Японский', 'Корейский', 'Китайский'].map(
                        (language) => (
                          <option key={language}>{language}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Аудиофайл варианта
                    <input
                      type="text"
                      inputMode="url"
                      value={voice.audioUrl}
                      onChange={(event) =>
                        patchVoice({ audioUrl: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Источник реплики варианта
                    <input
                      type="text"
                      inputMode="url"
                      value={voice.sourceUrl || ''}
                      onChange={(event) =>
                        patchVoice({ sourceUrl: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide-field">
                    Текст реплики варианта
                    <textarea
                      rows={3}
                      value={voice.description || ''}
                      onChange={(event) =>
                        patchVoice({ description: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="ghost-button danger-action"
                    type="button"
                    onClick={() =>
                      patch({
                        voiceLines: active.voiceLines.filter(
                          (_, index) => index !== voiceIndex,
                        ),
                      })
                    }
                  >
                    Удалить реплику варианта
                  </button>
                </div>
              </>
            ) : (
              <p className="empty-inline-copy">Реплики пока не добавлены.</p>
            )}
          </section>
        </>
      ) : (
        <p className="empty-inline-copy">Отдельных вариантов нет.</p>
      )}
    </section>
  );
}
