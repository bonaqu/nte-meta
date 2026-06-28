import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type EditorShellProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  dirty?: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function EditorShell({
  open,
  title,
  eyebrow,
  description,
  dirty = false,
  onClose,
  children,
}: EditorShellProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!dirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  function requestClose() {
    if (dirty && !window.confirm('Закрыть редактор? Несохраненные изменения могут потеряться.')) {
      return;
    }

    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="editor-shell"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
    >
      <div className="editor-shell__panel">
        <header className="editor-shell__header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1 id={titleId}>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть редактор" onClick={requestClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="editor-shell__body">{children}</div>
      </div>
    </dialog>
  );
}
