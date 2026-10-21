import { useId, useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { uploadImage } from '../lib/media';
import { resolveAssetUrl } from '../lib/assets';

export function ImageUploadButton({
  onUploaded,
  context,
  disabled = false,
}: {
  onUploaded: (url: string) => void;
  context?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="image-upload">
      <button
        type="button"
        className="ghost-button"
        disabled={pending || disabled}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden="true" />{' '}
        {pending ? 'Загружаем…' : 'Выбрать с компьютера'}
      </button>
      <input
        ref={input}
        hidden
        aria-label="Файл изображения"
        className="file-upload-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={pending || disabled}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setPending(true);
          setError('');
          try {
            onUploaded(await uploadImage(file, context));
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Не удалось загрузить изображение.',
            );
          } finally {
            setPending(false);
          }
        }}
      />
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
