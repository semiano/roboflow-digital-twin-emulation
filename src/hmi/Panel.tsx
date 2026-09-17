import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ title, right, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <header className="panel__head">
        <h2 className="panel__title">{title}</h2>
        {right ? <div className="panel__head-right">{right}</div> : null}
      </header>
      <div className={`panel__body ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}

interface StatusChipProps {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'fault' | 'idle';
}

export function StatusChip({ label, value, tone = 'idle' }: StatusChipProps) {
  return (
    <div className={`chip chip--${tone}`}>
      <span className="chip__label">{label}</span>
      <span className="chip__value">{value}</span>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  unit?: string;
}

export function Metric({ label, value, unit }: MetricProps) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <span className="metric__value">
        {value}
        {unit ? <span className="metric__unit">{unit}</span> : null}
      </span>
    </div>
  );
}
