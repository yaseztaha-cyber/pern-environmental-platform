/* oxlint-disable react/only-export-components */
import { useEffect, useState, type ReactNode, Fragment } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { Pill, Gauge } from './ui';
import { useCountUp } from '../hooks/useCountUp';
import { detectTrendDirection, type TrendDirection } from '../lib/prediction-engine';

/* ------------------------------------------------------------------ */
/*  Model explainability — shared across AI + Predictions pages        */
/* ------------------------------------------------------------------ */

const TONE_BORDER: Record<string, string> = {
  emerald: 'rgba(16,185,129,0.3)',
  cyan: 'rgba(34,211,238,0.3)',
  blue: 'rgba(96,165,250,0.3)',
  violet: 'rgba(167,139,250,0.3)',
  amber: 'rgba(251,191,36,0.3)',
  rose: 'rgba(251,113,113,0.3)',
};

const TONE_TEXT: Record<string, string> = {
  emerald: 'var(--emerald)',
  cyan: 'var(--cyan)',
  blue: 'var(--blue)',
  violet: 'var(--violet)',
  amber: 'var(--amber)',
  rose: 'var(--rose)',
};

export interface PipelineStep {
  label: string;
  sub?: string;
  tone: 'emerald' | 'cyan' | 'blue' | 'violet' | 'amber' | 'rose';
  pulse?: boolean;
}

/** Animated horizontal pipeline: Sensor history → models → ensemble → forecast */
export function ModelPipeline({ steps, className = '' }: { steps: PipelineStep[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-y-3 ${className}`}>
      {steps.map((s, i) => (
        <Fragment key={`${s.label}-${i}`}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white/[0.03] animate-scale-in"
            style={{ borderColor: TONE_BORDER[s.tone], animationDelay: `${i * 90}ms` }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.pulse ? 'animate-pulse' : ''}`}
              style={{ background: TONE_TEXT[s.tone], boxShadow: s.pulse ? `0 0 8px ${TONE_TEXT[s.tone]}` : undefined }}
            />
            <div className="leading-tight">
              <div className="text-[11px] font-semibold whitespace-nowrap" style={{ color: TONE_TEXT[s.tone] }}>{s.label}</div>
              {s.sub && <div className="text-[9px] text-[var(--text-tertiary)] whitespace-nowrap">{s.sub}</div>}
            </div>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight
              size={14}
              className="text-[var(--text-disabled)] mx-0.5 animate-scale-in"
              style={{ animationDelay: `${i * 90 + 50}ms` }}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trend badge                                                        */
/* ------------------------------------------------------------------ */

export function TrendBadge({ direction, magnitude, className = '' }: {
  direction: TrendDirection | null;
  magnitude?: number;
  className?: string;
}) {
  if (!direction) {
    return <Pill tone="slate" className={className}><Minus size={11} /> No trend data</Pill>;
  }
  const map: Record<TrendDirection, { tone: 'rose' | 'cyan' | 'emerald'; icon: typeof TrendingUp; label: string }> = {
    rising: { tone: 'rose', icon: TrendingUp, label: 'Rising' },
    falling: { tone: 'cyan', icon: TrendingDown, label: 'Falling' },
    stable: { tone: 'emerald', icon: Minus, label: 'Stable' },
  };
  const m = map[direction];
  const Icon = m.icon;
  return (
    <Pill tone={m.tone} className={className}>
      <Icon size={11} />
      {m.label}
      {magnitude !== undefined && magnitude > 0 && (
        <span className="opacity-70 font-normal">· {magnitude >= 1 ? magnitude.toFixed(1) : magnitude.toFixed(2)}/h</span>
      )}
    </Pill>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature importance (animated bars)                                 */
/* ------------------------------------------------------------------ */

export interface FeatureImportanceEntry {
  key: string;
  label: string;
  weight: number;
  color?: string;
}

const DEFAULT_FEATURES: FeatureImportanceEntry[] = [
  { key: 'pm25', label: 'PM2.5', weight: 32, color: '#10b981' },
  { key: 'co2', label: 'CO₂', weight: 21, color: '#06b6d4' },
  { key: 'tmp', label: 'Temperature', weight: 16, color: '#3b82f6' },
  { key: 'hum', label: 'Humidity', weight: 13, color: '#8b5cf6' },
  { key: 'no2', label: 'NO₂', weight: 10, color: '#f59e0b' },
  { key: 'prs', label: 'Pressure', weight: 8, color: '#f43f5e' },
];

function FeatureBar({ f, delay }: { f: FeatureImportanceEntry; delay: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay + 100);
    return () => clearTimeout(t);
  }, [delay]);
  const pct = useCountUp(on ? f.weight : 0, 900);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-medium text-[var(--text-secondary)]">{f.label}</span>
        <span className="font-mono font-semibold tabular-nums" style={{ color: f.color ?? 'var(--emerald)' }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${f.color ?? '#10b981'}, ${f.color ?? '#10b981'}55)` }}
        />
      </div>
    </div>
  );
}

export function FeatureImportance({
  features = DEFAULT_FEATURES,
  className = '',
}: { features?: FeatureImportanceEntry[]; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {features.map((f, i) => <FeatureBar key={f.key} f={f} delay={i * 80} />)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AnimatedGauge — count-up wrapper around the instrument Gauge       */
/* ------------------------------------------------------------------ */

export function AnimatedGauge({
  value, min = 0, max = 100, size = 120, label, unit,
}: { value: number; min?: number; max?: number; size?: number; label?: string; unit?: string }) {
  const animated = useCountUp(value, 700);
  return <Gauge value={animated} min={min} max={max} size={size} label={label} unit={unit} />;
}

/* ------------------------------------------------------------------ */
/*  Metric cell (compact stat)                                         */
/* ------------------------------------------------------------------ */

function Metric({ label, value, unit, color }: { label: string; value: ReactNode; unit?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-disabled)]">{label}</div>
      <div className="text-base font-bold mt-0.5 tabular-nums" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
        {unit && <span className="text-[10px] font-medium text-[var(--text-tertiary)] ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ModelExplainabilityPanel — full panel                              */
/* ------------------------------------------------------------------ */

export function ModelExplainabilityPanel({
  history,
  horizon = 24,
  confidence,
  rSquared,
  method,
  accuracyScore,
  avgError,
  trend,
  anomalyCount,
  features,
}: {
  history?: number[];
  horizon?: number;
  confidence?: number;
  rSquared?: number;
  method?: string;
  accuracyScore?: number | null;
  avgError?: number | null;
  trend?: { direction: TrendDirection; magnitude: number } | null;
  anomalyCount?: number;
  features?: FeatureImportanceEntry[];
}) {
  const trendInfo = trend ?? (history && history.length >= 3 ? detectTrendDirection(history) : null);
  const confAnimated = useCountUp(confidence ?? 0, 800);
  const r2Animated = useCountUp((rSquared ?? 0) * 100, 800);

  const steps: PipelineStep[] = [
    { label: 'Sensor history', sub: `${history?.length ?? '—'} readings`, tone: 'emerald' },
    { label: 'Holt DES', sub: 'α 0.3', tone: 'cyan' },
    { label: 'WMA', sub: 'window 5', tone: 'blue' },
    { label: 'Holt-Winters', sub: 'season 7', tone: 'violet' },
    { label: 'Ensemble', sub: 'weighted', tone: 'amber', pulse: true },
    { label: `${horizon}h forecast`, sub: method ? 'output' : undefined, tone: 'emerald', pulse: true },
  ];

  return (
    <div className="glass-panel rounded-2xl p-5 animate-fade-slide-up">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <BrainCircuit size={15} className="text-[var(--violet)]" />
        <h3 className="text-sm font-semibold">Prediction engine</h3>
        <div className="h-px flex-1 bg-[var(--border)]" />
        {anomalyCount !== undefined && anomalyCount > 0 && (
          <Pill tone="rose">{anomalyCount} anomaly{anomalyCount > 1 ? 'ies' : ''} in window</Pill>
        )}
        <TrendBadge direction={trendInfo?.direction ?? null} magnitude={trendInfo?.magnitude} />
        {method && <Pill tone="violet">{method}</Pill>}
      </div>

      <div className="mb-5">
        <ModelPipeline steps={steps} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">
            Feature importance
          </div>
          <FeatureImportance features={features} />
        </div>

        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <Metric label="Confidence" value={confidence !== undefined ? Math.round(confAnimated) : '—'} unit="%" color="var(--emerald)" />
            <Metric label="Accuracy" value={accuracyScore != null ? accuracyScore : '—'} unit="%" color="var(--cyan)" />
            <Metric label="Mean error" value={avgError != null ? avgError : '—'} unit="EHI" color="var(--amber)" />
            <Metric label="Fit R²" value={rSquared !== undefined ? r2Animated.toFixed(2) : '—'} color="var(--violet)" />
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
            The ensemble blends Holt double exponential smoothing, a weighted moving average and a Holt-Winters seasonal
            model, then weights each on forecast error. The shaded band reflects ±95% uncertainty — wider bands at longer
            horizons. R² measures how well the model explains historical variance; confidence combines R², sample size,
            residual error and horizon penalty.
          </p>
        </div>
      </div>
    </div>
  );
}
