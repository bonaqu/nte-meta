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
  const closeDialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeTitleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open && closeDialogRef.current?.open) closeDialogRef.current.close();
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
    if (dirty) {
      if (!closeDialogRef.current?.open) closeDialogRef.current?.showModal();
      return;
    }
    onClose();
  }

  function discardChanges() {
    closeDialogRef.current?.close();
    onClose();
  }

  return (
    <>
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
            <button
              className="icon-button editor-shell__close-button"
              type="button"
              aria-label="Закрыть редактор"
              onClick={requestClose}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="editor-shell__body">{children}</div>
        </div>
      </dialog>
      <dialog
        ref={closeDialogRef}
        className="confirm-dialog editor-shell__close-dialog"
        aria-labelledby={closeTitleId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialogRef.current?.close();
        }}
      >
        <div className="confirm-dialog__content">
          <div>
            <p className="eyebrow">Есть несохранённые изменения</p>
            <h2 id={closeTitleId}>Закрыть редактор?</h2>
          </div>
          <p>Изменения, которые ещё не были сохранены, будут потеряны.</p>
          <div className="button-row editor-shell__close-actions">
            <button
              className="primary-button editor-shell__continue-button"
              type="button"
              onClick={() => closeDialogRef.current?.close()}
            >
              Продолжить редактирование
            </button>
            <button
              className="danger-button editor-shell__discard-button"
              type="button"
              onClick={discardChanges}
            >
              Закрыть без сохранения
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
