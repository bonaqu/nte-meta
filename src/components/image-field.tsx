import { useId, useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { uploadImage } from '../lib/media';
import { resolveAssetUrl } from '../lib/assets';

export function ImageUploadButton({
  onUploaded,
  context,
  disabled = false,
  label = 'Выбрать с компьютера',
}: {
  onUploaded: (url: string) => void;
  context?: string;
  disabled?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState('');
  const [dragging, setDragging] = useState(false);
  async function upload(file?: File) {
    if (!file || pending || disabled) return;
    setPending(true);
    setError('');
    setUploaded('');
    try {
      onUploaded(await uploadImage(file, context));
      setUploaded(file.name);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить изображение.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className={`image-upload${dragging ? ' image-upload--dragging' : ''}`}
      aria-busy={pending}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void upload(event.dataTransfer.files[0]);
      }}
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.files).find((f) =>
          f.type.startsWith('image/'),
        );
        if (file) {
          event.preventDefault();
          void upload(file);
        }
      }}
    >
      <button
        type="button"
        className="ghost-button"
        disabled={pending || disabled}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden="true" /> {pending ? 'Загружаем…' : label}
      </button>
      <input
        ref={input}
        hidden
        aria-label={`Файл изображения: ${label}`}
        className="file-upload-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={pending || disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void upload(file);
        }}
      />
      <small>
        PNG, JPEG, WebP · до 12 МБ. Можно перетащить файл или вставить из
        буфера.
      </small>
      {uploaded ? (
        <span className="image-upload__success" role="status">
          Загружено: {uploaded}
        </span>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ImageField({
  label,
  value,
  onChange,
  context,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  context?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="image-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="Ссылка на изображение"
      />
      <ImageUploadButton
        onUploaded={onChange}
        context={context}
        disabled={disabled}
      />
      {value ? (
        <img
          className="editor-image-preview"
          src={resolveAssetUrl(value)}
          alt="Предпросмотр"
          width="96"
          height="96"
          loading="lazy"
        />
      ) : null}
    </div>
  );
}
