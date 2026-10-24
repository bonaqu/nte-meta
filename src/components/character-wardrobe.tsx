import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Maximize2, X } from 'lucide-react';
import type { CharacterSkin } from '../types';
import { resolveAssetUrl } from '../lib/assets';
import { PageStepper } from './page-stepper';

export function CharacterWardrobe({ skins }: { skins: CharacterSkin[] }) {
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeIndex = Math.min(index, Math.max(0, skins.length - 1));
  const skin = skins[activeIndex];
  useEffect(() => {
    if (opened && !dialog.current?.open) dialog.current?.showModal();
    if (!opened && dialog.current?.open) dialog.current.close();
  }, [opened]);
  if (!skin) return null;
  return (
    <div className="wardrobe-gallery">
      <div className="wardrobe-gallery__stage">
        <CharacterSkinMedia
          key={skin.id}
          skin={skin}
          onOpen={() => setOpened(true)}
        />
        <div className="wardrobe-gallery__copy">
          <p className="eyebrow">Наряд</p>
          <h3>{skin.name}</h3>
          <p>{skin.description}</p>
          <PageStepper
            label="Гардероб"
            unit="Наряд"
            value={activeIndex + 1}
            total={skins.length}
            onChange={(value) => setIndex(value - 1)}
          />
        </div>
      </div>
      {skins.length > 1 ? (
        <div
          className="wardrobe-thumbnails"
          role="group"
          aria-label="Выбор наряда"
        >
          {skins.map((item, i) => (
            <button
              type="button"
              key={item.id}
              aria-label={item.name}
              aria-pressed={i === activeIndex}
              onClick={() => setIndex(i)}
            >
              {item.imageUrl ? (
                <img
                  src={resolveAssetUrl(item.imageUrl)}
                  alt=""
                  width="80"
                  height="96"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <ImageIcon aria-hidden="true" />
              )}
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      <dialog
        ref={dialog}
        className="skin-lightbox"
        aria-label={`Гардероб: ${skin.name}`}
        onClose={() => setOpened(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpened(false);
        }}
      >
        {opened ? (
          <div className="skin-lightbox-layout">
            <button
              className="icon-button game-close-button skin-lightbox-close"
              type="button"
              aria-label="Закрыть полноразмерное изображение"
              onClick={() => setOpened(false)}
            >
              <X aria-hidden="true" />
            </button>
            <img
              src={resolveAssetUrl(skin.imageUrl)}
              alt={skin.name}
              decoding="async"
              fetchPriority="high"
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="eyebrow">Гардероб</p>
              <h2>{skin.name}</h2>
              {skin.description ? <p>{skin.description}</p> : null}
              <PageStepper
                label="Полноразмерный гардероб"
                unit="Наряд"
                value={activeIndex + 1}
                total={skins.length}
                onChange={(value) => setIndex(value - 1)}
              />
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function CharacterSkinMedia({
  skin,
  onOpen,
}: {
  skin: CharacterSkin;
  onOpen: () => void;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  useEffect(() => setLoadState('loading'), [skin.imageUrl]);
  if (!skin.imageUrl)
    return (
      <div className="skin-media-fallback">
        <ImageIcon aria-hidden="true" />
        Изображение наряда не добавлено.
      </div>
    );
  if (loadState === 'failed')
    return (
      <div className="skin-media-fallback" role="status">
        <ImageIcon aria-hidden="true" />
        <span>Изображение пока недоступно.</span>
        <button
          type="button"
          className="button secondary"
          onClick={() => setLoadState('loading')}
        >
          Повторить загрузку
        </button>
      </div>
    );
  return (
    <button
      className="skin-media"
      type="button"
      aria-label={`Открыть изображение «${skin.name}» целиком`}
      aria-busy={loadState === 'loading'}
      onClick={onOpen}
    >
      <img
        src={resolveAssetUrl(skin.imageUrl)}
        alt={skin.name}
        width="320"
        height="360"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoadState('ready')}
        onError={() => setLoadState('failed')}
      />
      <span className="skin-media-action">
        <Maximize2 aria-hidden="true" />
        Посмотреть целиком
      </span>
    </button>
  );
}
