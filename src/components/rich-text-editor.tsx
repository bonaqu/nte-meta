import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Unlink,
  Underline,
  Undo2,
} from 'lucide-react';

type RichTextAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'h2'
  | 'h3'
  | 'list'
  | 'ordered-list'
  | 'quote'
  | 'link'
  | 'clear';

const defaultActions: RichTextAction[] = [
  'bold',
  'italic',
  'underline',
  'strike',
  'h2',
  'h3',
  'list',
  'ordered-list',
  'quote',
  'link',
  'clear',
];

const actionMeta = {
  bold: { label: 'Жирный', icon: Bold },
  italic: { label: 'Курсив', icon: Italic },
  underline: { label: 'Подчёркнутый', icon: Underline },
  strike: { label: 'Зачёркнутый', icon: Strikethrough },
  h2: { label: 'Крупный раздел', icon: Heading2 },
  h3: { label: 'Малый раздел', icon: Heading3 },
  list: { label: 'Маркированный список', icon: List },
  'ordered-list': { label: 'Нумерованный список', icon: ListOrdered },
  quote: { label: 'Цитата', icon: Quote },
  link: { label: 'Ссылка', icon: Link2 },
  clear: { label: 'Убрать форматирование', icon: RemoveFormatting },
} satisfies Record<RichTextAction, { label: string; icon: typeof Bold }>;

export interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  maxLength?: number;
  minHeight?: number;
  actions?: RichTextAction[];
  compact?: boolean;
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = 'Начните писать...',
  ariaLabel = 'Визуальный редактор текста',
  disabled = false,
  maxLength,
  minHeight = 220,
  actions = defaultActions,
  compact = false,
}: RichTextEditorProps) {
  const generatedId = useId();
  const editorId = id || `rich-text-${generatedId.replace(/:/g, '')}`;
  const lastEmittedValue = useRef(value);
  const linkDialogRef = useRef<HTMLDialogElement>(null);
  const linkTitleId = useId();
  const [linkHref, setLinkHref] = useState('');
  const [linkError, setLinkError] = useState('');
  const [editingLink, setEditingLink] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
        },
      }),
      Markdown,
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    contentType: 'markdown',
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: editorId,
        role: 'textbox',
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const markdown = currentEditor.getMarkdown();
      lastEmittedValue.current = markdown;
      onChange(markdown);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || value === lastEmittedValue.current) return;
    const currentValue = editor.getMarkdown();
    if (currentValue === value) return;
    editor.commands.setContent(value || '', {
      contentType: 'markdown',
      emitUpdate: false,
    });
    lastEmittedValue.current = value;
  }, [editor, value]);

  function runAction(action: RichTextAction) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (action === 'bold') chain.toggleBold().run();
    if (action === 'italic') chain.toggleItalic().run();
    if (action === 'underline') chain.toggleUnderline().run();
    if (action === 'strike') chain.toggleStrike().run();
    if (action === 'h2') chain.toggleHeading({ level: 2 }).run();
    if (action === 'h3') chain.toggleHeading({ level: 3 }).run();
    if (action === 'list') chain.toggleBulletList().run();
    if (action === 'ordered-list') chain.toggleOrderedList().run();
    if (action === 'quote') chain.toggleBlockquote().run();
    if (action === 'clear') chain.unsetAllMarks().clearNodes().run();
    if (action === 'link') {
      const currentHref = editor.getAttributes('link').href as
        | string
        | undefined;
      setLinkHref(currentHref || '');
      setEditingLink(Boolean(currentHref));
      setLinkError('');
      linkDialogRef.current?.showModal();
    }
  }

  function normalizeLinkHref(rawHref: string) {
    const href = rawHref.trim();
    if (!href) return '';
    if (href.startsWith('#') || href.startsWith('/')) return href;
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(href)
      ? href
      : `https://${href}`;
    try {
      const url = new URL(candidate, window.location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol)
        ? candidate
        : null;
    } catch {
      return null;
    }
  }

  function applyLink() {
    if (!editor) return;
    const href = normalizeLinkHref(linkHref);
    if (href === null) {
      setLinkError(
        'Проверьте адрес. Разрешены ссылки http(s), email и переходы внутри сайта.',
      );
      return;
    }
    if (!href) {
      setLinkError('Введите адрес ссылки или выберите «Удалить ссылку».');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    linkDialogRef.current?.close();
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    linkDialogRef.current?.close();
  }

  function isActive(action: RichTextAction) {
    if (!editor) return false;
    if (action === 'h2') return editor.isActive('heading', { level: 2 });
    if (action === 'h3') return editor.isActive('heading', { level: 3 });
    if (action === 'list') return editor.isActive('bulletList');
    if (action === 'ordered-list') return editor.isActive('orderedList');
    if (action === 'quote') return editor.isActive('blockquote');
    if (action === 'link') return editor.isActive('link');
    if (action === 'clear') return false;
    return editor.isActive(action);
  }

  const overLimit = maxLength !== undefined && value.length > maxLength;

  return (
    <div
      className={`rich-text-editor${compact ? ' rich-text-editor--compact' : ''}${
        disabled ? ' is-disabled' : ''
      }${overLimit ? ' is-invalid' : ''}`}
      style={
        { '--rich-editor-min-height': `${minHeight}px` } as React.CSSProperties
      }
    >
      <div
        className="rich-text-editor__toolbar"
        role="toolbar"
        aria-label="Форматирование"
      >
        <div className="rich-text-editor__tools">
          {actions.map((action) => {
            const meta = actionMeta[action];
            const Icon = meta.icon;
            return (
              <button
                key={action}
                type="button"
                className={isActive(action) ? 'is-active' : ''}
                onClick={() => runAction(action)}
                disabled={disabled}
                aria-label={meta.label}
                aria-pressed={isActive(action)}
                title={meta.label}
              >
                <Icon aria-hidden="true" />
              </button>
            );
          })}
          <span className="rich-text-editor__divider" aria-hidden="true" />
          <button
            type="button"
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={disabled || !editor?.can().undo()}
            aria-label="Отменить"
            title="Отменить"
          >
            <Undo2 aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={disabled || !editor?.can().redo()}
            aria-label="Повторить"
            title="Повторить"
          >
            <Redo2 aria-hidden="true" />
          </button>
        </div>
      </div>
      <EditorContent editor={editor} />

      {maxLength !== undefined ? (
        <div className="rich-text-editor__status" aria-live="polite">
          <span>
            {overLimit
              ? `Сократите текст на ${value.length - maxLength} симв.`
              : ''}
          </span>
          <span>
            {value.length.toLocaleString('ru-RU')} /{' '}
            {maxLength.toLocaleString('ru-RU')}
          </span>
        </div>
      ) : null}
      <dialog
        className="confirm-dialog rich-text-link-dialog"
        ref={linkDialogRef}
        aria-labelledby={linkTitleId}
        onCancel={(event) => {
          event.preventDefault();
          linkDialogRef.current?.close();
        }}
        onClose={() => editor?.commands.focus()}
      >
        <div className="confirm-dialog__content">
          <div>
            <p className="eyebrow">Форматирование</p>
            <h2 id={linkTitleId}>
              {editingLink ? 'Изменить ссылку' : 'Добавить ссылку'}
            </h2>
          </div>
          <label>
            Адрес
            <input
              value={linkHref}
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              autoFocus
              aria-invalid={Boolean(linkError)}
              aria-describedby={
                linkError ? `${editorId}-link-error` : undefined
              }
              onChange={(event) => {
                setLinkHref(event.target.value);
                setLinkError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
          </label>
          <p
            id={`${editorId}-link-error`}
            className="form-message"
            aria-live="polite"
          >
            {linkError ||
              'Можно вставить полный адрес или ссылку на раздел этого сайта.'}
          </p>
          <div className="button-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() => linkDialogRef.current?.close()}
            >
              Отменить
            </button>
            {editingLink ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={removeLink}
              >
                <Unlink aria-hidden="true" /> Удалить ссылку
              </button>
            ) : null}
            <button
              className="primary-button"
              type="button"
              onClick={applyLink}
            >
              <Link2 aria-hidden="true" /> Применить
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export default RichTextEditor;
