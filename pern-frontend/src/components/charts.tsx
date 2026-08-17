/* oxlint-disable react/only-export-components */
import { memo } from 'react';
import { CartesianGrid } from 'recharts';

/* ------------------------------------------------------------------ */
/*  Shared chart design system — one consistent "deep space glass"     */
/*  look across every chart on the platform.                           */
/* ------------------------------------------------------------------ */

export const CHART_PALETTE = [
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#3b82f6', // blue
] as const;

export const CHART_TICK = { fill: 'var(--text-tertiary)', fontSize: 11 } as const;

/** Clean axes: no axis lines, no tick lines */
export const CHART_AXIS = { axisLine: false, tickLine: false } as const;

export const CHART_CURSOR = {
  stroke: 'var(--text-disabled)',
  strokeDasharray: '4 4',
  strokeOpacity: 0.4,
} as const;

/** Subtle horizontal grid lines only */
export function ChartGrid({ vertical = false }: { vertical?: boolean }) {
  return (
    <CartesianGrid
      stroke="var(--border)"
      strokeOpacity={0.5}
      strokeDasharray="3 3"
      vertical={vertical}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Glass tooltip                                                      */
/* ------------------------------------------------------------------ */

interface TooltipPayloadEntry {
  name?: string | number;
  dataKey?: string | number;
  value?: unknown;
  color?: string;
  fill?: string;
}

export const ChartTooltip = memo(function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      {label !== undefined && label !== null && String(label) !== '' && (
        <div className="chart-tooltip-label">{String(label)}</div>
      )}
      <div className="chart-tooltip-rows">
        {payload.map((p, i) => (
          <div key={i} className="chart-tooltip-row">
            <span className="chart-tooltip-dot" style={{ background: p.color || p.fill }} />
            <span className="chart-tooltip-name">{p.name ?? p.dataKey}</span>
            <span className="chart-tooltip-value">
              {p.value === null || p.value === undefined ? '—' : String(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Gradient defs for area / bar fills                                 */
/* ------------------------------------------------------------------ */

export function ChartAreaGradient({
  id,
  from = 'var(--emerald)',
  to = 'var(--cyan)',
}: {
  id: string;
  from?: string;
  to?: string;
}) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={from} stopOpacity={0.35} />
        <stop offset="60%" stopColor={to} stopOpacity={0.1} />
        <stop offset="100%" stopColor={to} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}
