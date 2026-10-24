import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Coins, Info, Package, X } from 'lucide-react';
import type { ItemDescription } from '../lib/item-descriptions';
import { resolveItemIcon } from '../lib/item-icons';
type Lookup = (id: string, name: string) => ItemDescription | undefined;
let lookup: Lookup | undefined;
let registry: Promise<Lookup> | undefined;
function loadRegistry() {
  return (registry ||= import('../lib/item-descriptions')
    .then((module) => {
      lookup = module.findItemDescription;
      return lookup;
    })
    .catch((error) => {
      registry = undefined;
      throw error;
    }));
}

/** A top-layer item sheet: hover, keyboard focus and touch share one control. */
export function ItemDetails({
  id,
  name,
  iconUrl,
  context,
  quantity,
  iconOnly = false,
}: {
  id: string;
  name: string;
  iconUrl: string;
  context: string;
  quantity?: string;
  iconOnly?: boolean;
}) {
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const skipFocus = useRef(false);
  const [detail, setDetail] = useState(() => lookup?.(id, name));
  const [pending, setPending] = useState(!lookup);
  const icon = resolveItemIcon(name, iconUrl);
  const hide = () => panel.current?.hidePopover();
  const cancel = () => clearTimeout(timer.current);
  const position = useCallback(() => {
    const sheet = panel.current;
    const button = trigger.current;
    if (!sheet || !button) return;
    const anchor = button.getBoundingClientRect();
    const bounds = sheet.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(anchor.left, innerWidth - bounds.width - 12),
    );
    const below = anchor.bottom + 8;
    const top =
      below + bounds.height <= innerHeight - 12
        ? below
        : Math.max(12, anchor.top - bounds.height - 8);
    sheet.style.left = `${left}px`;
    sheet.style.top = `${top}px`;
  }, []);
  const show = () => {
    cancel();
    panel.current?.showPopover();
    position();
  };
  useEffect(() => {
    let mounted = true;
    loadRegistry()
      .then((find) => {
        if (mounted) {
          setDetail(find(id, name));
          setPending(false);
        }
      })
      .catch(() => {
        if (mounted) setPending(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, name]);
  useLayoutEffect(() => {
    if (panel.current?.matches(':popover-open')) position();
  }, [detail, pending, position]);
  const leave = () => {
    cancel();
    timer.current = setTimeout(() => {
      if (
        !panel.current?.matches(':hover, :focus-within') &&
        !trigger.current?.matches(':hover, :focus-visible')
      )
        hide();
    }, 160);
  };
  const close = () => {
    skipFocus.current = true;
    hide();
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const follow = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor || anchor.bottom <= 0 || anchor.top >= innerHeight)
        panel.current?.hidePopover();
      else position();
    };
    window.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow);
      window.removeEventListener('resize', follow);
    };
  }, [open, position]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`item-details-trigger${iconOnly ? ' item-details-trigger--icon' : ''}`}
        aria-label={`Подробнее: ${name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onMouseEnter={show}
        onMouseLeave={leave}
        onFocus={(event) => {
          if (skipFocus.current) {
            skipFocus.current = false;
            return;
          }
          if (event.currentTarget.matches(':focus-visible')) show();
        }}
        onBlur={leave}
        onClick={show}
      >
        <Info aria-hidden="true" />
      </button>
      {createPortal(
        <div
          ref={panel}
          id={panelId}
          popover="auto"
          className="item-detail-popover"
          data-rarity={detail?.rarity}
          role="dialog"
          aria-labelledby={`${panelId}-name`}
          onToggle={(event) =>
            setOpen(event.currentTarget.matches(':popover-open'))
          }
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
          onMouseEnter={cancel}
          onMouseLeave={leave}
          onBlur={leave}
        >
          <div className="item-detail-popover__type">
            {detail?.type === 'Валюта' ? (
              <Coins aria-hidden="true" />
            ) : (
              <Package aria-hidden="true" />
            )}
            <span>{detail?.type || 'Предмет'}</span>
            <button
              type="button"
              aria-label="Закрыть описание предмета"
              onClick={close}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <header>
            {icon ? <img src={icon} alt="" width="96" height="96" /> : null}
            <div>
              <small>{context}</small>
              <h3 id={`${panelId}-name`}>{name}</h3>
              {quantity ? (
                <strong className="item-detail-popover__quantity">
                  ×{quantity}
                </strong>
              ) : null}
            </div>
          </header>
          <div className="item-detail-popover__text">
            {detail?.usage ? (
              <p className="item-detail-popover__usage">{detail.usage}</p>
            ) : null}
            {detail?.description ? <p>{detail.description}</p> : null}
            {pending ? (
              <p role="status">Загружаем описание…</p>
            ) : !detail ? (
              <p>
                {context === 'Награда за дружбу'
                  ? 'Награда за достижение этого уровня дружбы.'
                  : context}
              </p>
            ) : null}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
