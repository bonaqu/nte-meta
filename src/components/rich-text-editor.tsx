import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code2,
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
  const [sourceMode, setSourceMode] = useState(false);

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
    if (!editor || sourceMode || value === lastEmittedValue.current) return;
    const currentValue = editor.getMarkdown();
    if (currentValue === value) return;
    editor.commands.setContent(value || '', {
      contentType: 'markdown',
      emitUpdate: false,
    });
    lastEmittedValue.current = value;
  }, [editor, sourceMode, value]);

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
      const currentHref = editor.getAttributes('link').href as string | undefined;
      const href = window.prompt('Введите ссылку', currentHref || 'https://');
      if (href === null) return;
      if (!href.trim()) {
        chain.extendMarkRange('link').unsetLink().run();
        return;
      }
      chain.extendMarkRange('link').setLink({ href: href.trim() }).run();
    }
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

  function toggleSourceMode() {
    if (sourceMode && editor) {
      editor.commands.setContent(value || '', {
        contentType: 'markdown',
        emitUpdate: false,
      });
      lastEmittedValue.current = value;
    }
    setSourceMode((current) => !current);
  }

  const overLimit = maxLength !== undefined && value.length > maxLength;

  return (
    <div
      className={`rich-text-editor${compact ? ' rich-text-editor--compact' : ''}${
        disabled ? ' is-disabled' : ''
      }${overLimit ? ' is-invalid' : ''}`}
      style={{ '--rich-editor-min-height': `${minHeight}px` } as React.CSSProperties}
    >
      <div className="rich-text-editor__toolbar" role="toolbar" aria-label="Форматирование">
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
                disabled={disabled || sourceMode}
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
            disabled={disabled || sourceMode || !editor?.can().undo()}
            aria-label="Отменить"
            title="Отменить"
          >
            <Undo2 aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={disabled || sourceMode || !editor?.can().redo()}
            aria-label="Повторить"
            title="Повторить"
          >
            <Redo2 aria-hidden="true" />
          </button>
        </div>
        <button
          className={sourceMode ? 'is-active rich-text-editor__source' : 'rich-text-editor__source'}
          type="button"
          onClick={toggleSourceMode}
          disabled={disabled}
          aria-pressed={sourceMode}
          title="Режим Markdown для служебной разметки"
        >
          <Code2 aria-hidden="true" />
          <span>{sourceMode ? 'Визуально' : 'Markdown'}</span>
        </button>
      </div>

      {sourceMode ? (
        <textarea
          id={editorId}
          className="rich-text-editor__source-field"
          value={value}
          onChange={(event) => {
            lastEmittedValue.current = event.target.value;
            onChange(event.target.value);
          }}
          placeholder={placeholder}
          aria-label={`${ariaLabel}: исходный Markdown`}
          disabled={disabled}
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      {maxLength !== undefined ? (
        <div className="rich-text-editor__status" aria-live="polite">
          <span>{overLimit ? `Сократите текст на ${value.length - maxLength} симв.` : ''}</span>
          <span>{value.length.toLocaleString('ru-RU')} / {maxLength.toLocaleString('ru-RU')}</span>
        </div>
      ) : null}
    </div>
  );
}

export default RichTextEditor;
