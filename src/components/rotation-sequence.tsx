import type { ReactNode } from 'react';
import { Play, RotateCw } from 'lucide-react';

export function RotationSequence({
  steps,
  title = '',
  endLabel = 'Конец цепочки · повторить цикл с первого шага',
  className = '',
}: {
  steps: Array<{ id: string; content: ReactNode }>;
  title?: string;
  endLabel?: string;
  className?: string;
}) {
  if (!steps.length) return null;
  return (
    <div className={`team-rotation-sequence ${className}`.trim()}>
      <div className="rotation-sequence-heading">
        <span>
          <Play aria-hidden="true" /> Старт
        </span>
        {title ? <strong>{title}</strong> : null}
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <span className="rotation-step-index">{index + 1}</span>
            {step.content}
          </li>
        ))}
      </ol>
      <div className="rotation-cycle-end">
        <RotateCw aria-hidden="true" />
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
