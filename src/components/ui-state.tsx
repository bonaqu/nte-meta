import type { ReactNode } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export function StatusBanner({
  tone,
  text,
}: {
  tone: 'info' | 'danger' | 'success';
  text: string;
}) {
  const Icon =
    tone === 'danger'
      ? CircleAlert
      : tone === 'success'
        ? CheckCircle2
        : Sparkles;

  return (
    <div
      className={`status-banner ${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {text ? <p>{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  icon: Icon = Sparkles,
  action,
}: {
  title: string;
  text: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <Icon aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </section>
  );
}

export function SkeletonGrid({
  label = 'Загрузка данных',
}: {
  label?: string;
}) {
  return (
    <section className="content-band" aria-label={label} aria-busy="true">
      <div className="skeleton-row">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
