/* oxlint-disable react/only-export-components */
import { memo, useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Loader2, BookOpen } from 'lucide-react';
import { useCountUp } from '../hooks/useCountUp';
import { toChipLabel, type SourceReference } from '../lib/ai-references';

/* ---------- Number Formatting ---------- */
/** Format a number to a clean display: integers stay whole, decimals get 1–2 digits */
export function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return String(value);
  if (Number.isInteger(n)) return n.toLocaleString();
  // Show 1 decimal if <100, 2 decimals otherwise
  return n < 100 ? n.toFixed(1) : n.toFixed(0);
}

/* ---------- Card ---------- */
export const Card = memo(function Card({
  children, className = '', hover = true, onClick,
}: {
  children: ReactNode; className?: string; hover?: boolean; onClick?: () => void;
}) {
  return (
    <div
      className={`${hover ? 'card card-interactive' : 'card'} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {children}
    </div>
  );
});

/* ---------- EmptyState ---------- */
export const EmptyState = memo(function EmptyState({
  icon, title, message, action,
}: {
  icon?: ReactNode; title: string; message?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-4 animate-fade-in-up">
      {icon && (
        <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-[var(--emerald-dim)] text-[var(--emerald)] flex items-center justify-center animate-breathe">
          {icon}
        </div>
      )}
      <div className="text-[var(--text-primary)] text-lg font-semibold">{title}</div>
      {message && <p className="text-[var(--text-tertiary)] text-sm max-w-md leading-relaxed">{message}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
});

/* ---------- LoadingState ---------- */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-[var(--text-tertiary)] text-sm animate-fade-in" role="status">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--border)]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--emerald)] animate-spin-slow" />
      </div>
      <span className="font-medium">{label}</span>
    </div>
  );
}

/* ---------- SectionTitle ---------- */
export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`section-label mb-3 ${className}`}>{children}</h2>;
}

/* ---------- PageHeader ---------- */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in-up">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-gradient">{title}</h1>
        {subtitle && <div className="text-[var(--text-tertiary)] text-sm mt-1.5">{subtitle}</div>}
      </div>
      {right && <div className="flex items-center gap-2.5 flex-wrap">{right}</div>}
    </div>
  );
}

/* ---------- StatCard (module-level lookups for memo perf) ---------- */
const STAT_ACCENT_CLASSES: Record<string, string> = {
  emerald: 'text-[var(--emerald)]',
  cyan: 'text-[var(--cyan)]',
  violet: 'text-[var(--violet)]',
  amber: 'text-[var(--amber)]',
  blue: 'text-[var(--blue)]',
  rose: 'text-[var(--rose)]',
};
const STAT_ACCENT_BORDERS: Record<string, string> = {
  emerald: 'border-s-[var(--emerald)]',
  cyan: 'border-s-[var(--cyan)]',
  violet: 'border-s-[var(--violet)]',
  amber: 'border-s-[var(--amber)]',
  blue: 'border-s-[var(--blue)]',
  rose: 'border-s-[var(--rose)]',
};
const STAT_ACCENT_GLOWS: Record<string, string> = {
  emerald: 'var(--emerald-dim)',
  cyan: 'var(--cyan-dim)',
  violet: 'rgba(167,139,250,0.08)',
  amber: 'var(--amber-dim)',
  blue: 'var(--blue-dim)',
  rose: 'var(--rose-dim)',
};
export const StatCard = memo(function StatCard({
  label, value, unit, accent = 'emerald', icon, trend,
}: {
  label: string; value: ReactNode; unit?: string;
  accent?: 'emerald' | 'cyan' | 'violet' | 'amber' | 'blue' | 'rose';
  icon?: ReactNode; trend?: string;
}) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const animated = useCountUp(numeric ?? 0, 700);
  const display = numeric !== null ? fmt(animated) : value;
  const prevNumeric = useRef<number | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (numeric !== null && prevNumeric.current !== null && numeric !== prevNumeric.current) {
      setPulseKey((k) => k + 1);
    }
    prevNumeric.current = numeric;
  }, [numeric]);
  return (
    <div
      className={`rounded-[var(--radius-md)] p-5 border-s-[3px] ${STAT_ACCENT_BORDERS[accent]} transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover-lift`}
      style={{ background: STAT_ACCENT_GLOWS[accent] }}
    >
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        {icon && <span className={`${STAT_ACCENT_CLASSES[accent]} icon-bounce`}>{icon}</span>}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span key={pulseKey} className={`text-[28px] font-bold tracking-tight stat-number ${STAT_ACCENT_CLASSES[accent]}`}>{display}</span>
        {unit && <span className="text-xs text-[var(--text-tertiary)] font-medium">{unit}</span>}
      </div>
      {trend && <div className="mt-1 text-xs text-[var(--text-tertiary)]">{trend}</div>}
    </div>
  );
});

/* ---------- Pill ---------- */
const PILL_TONES: Record<string, string> = {
  slate: 'bg-white/[0.05] text-[var(--text-secondary)] border-white/[0.1]',
  emerald: 'bg-[var(--emerald-dim)] text-[var(--emerald)] border-[var(--emerald-glow)]',
  cyan: 'bg-[var(--cyan-dim)] text-[var(--cyan)] border-[rgba(34,211,238,0.25)]',
  violet: 'bg-[rgba(167,139,250,0.1)] text-[var(--violet)] border-[rgba(167,139,250,0.25)]',
  amber: 'bg-[var(--amber-dim)] text-[var(--amber)] border-[rgba(251,191,36,0.25)]',
  blue: 'bg-[var(--blue-dim)] text-[var(--blue)] border-[rgba(96,165,250,0.25)]',
  rose: 'bg-[var(--rose-dim)] text-[var(--rose)] border-[rgba(251,113,113,0.25)]',
};
export const Pill = memo(function Pill({
  children, tone = 'slate', className = '',
}: {
  children: ReactNode;
  tone?: 'slate' | 'emerald' | 'cyan' | 'violet' | 'amber' | 'blue' | 'rose';
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${PILL_TONES[tone]} ${className}`}>
      {children}
    </span>
  );
});

/* ---------- LiveBadge ---------- */
export const LiveBadge = memo(function LiveBadge({ on, label }: { on: boolean; label?: string }) {
  return (
    <span className={`live-pill ${on ? 'on' : 'off'}`} role="status" aria-label={on ? 'Live data active' : 'Live data paused'}>
      <span className="live-ring" />
      {label ? label : on ? 'LIVE' : 'PAUSED'}
    </span>
  );
});

/* ---------- Btn ---------- */
const BTN_VARIANTS: Record<string, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};
export const Btn = memo(function Btn({
  children, variant = 'ghost', onClick, disabled, loading, type = 'button',
  className = '', size = 'md', ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  size?: 'sm' | 'md';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'disabled'>) {
  const sizeClass = size === 'sm' ? 'btn-sm' : '';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn ${BTN_VARIANTS[variant]} ${sizeClass} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
});

/* ---------- Toggle ---------- */
export const Toggle = memo(function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 group"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Toggle'}
    >
      <span
        className={`relative w-10 h-[22px] rounded-full transition-all duration-300 ${
          checked ? 'bg-[var(--emerald)] shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-[3px] start-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${
            checked ? 'translate-x-[18px] rtl:-translate-x-[18px]' : ''
          }`}
        />
      </span>
      {label && <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>}
    </button>
  );
});

/* ---------- Skeleton ---------- */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/* ---------- Badge (for category/status labels) ---------- */
const BADGE_VARIANTS: Record<string, string> = {
  success: 'badge-excellent',
  error: 'badge-critical',
  warning: 'badge-moderate',
  info: 'badge-good',
};
export const Badge = memo(function Badge({ category, variant, className = '', children }: { category?: string; variant?: string; className?: string; children?: React.ReactNode }) {
  const cls = variant ? (BADGE_VARIANTS[variant] || `badge-${variant}`) : `badge-${category || ''}`;
  return <span className={`${cls} ${className}`}>{children || category}</span>;
});

/* ---------- Divider ---------- */
export const Divider = memo(function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-[var(--border)] ${className}`} />;
});

/* ---------- SourceChips (curated citations) ---------- */
export const SourceChips = memo(function SourceChips({
  sources, label = 'Sources', className = '',
}: {
  sources?: SourceReference[]; label?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  const shown = open ? sources : sources.slice(0, 2);
  const overflow = sources.length - shown.length;
  return (
    <div className={className}>
      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        {shown.map(r => (
          <span key={r.id} title={`${r.authors} (${r.year}). ${r.publisher}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium border bg-[var(--surface-hover)] text-[var(--text-secondary)] border-[var(--border)] cursor-help transition-colors hover:border-[var(--emerald-glow)] hover:text-[var(--emerald)]">
            <BookOpen size={9} className="opacity-60" />
            {toChipLabel(r)}
          </span>
        ))}
        {overflow > 0 && (
          <button onClick={() => setOpen(!open)} className="text-[9px] px-1.5 py-0.5 rounded-md text-[var(--emerald)] hover:bg-[var(--emerald-dim)] font-medium transition-colors">
            {open ? 'Show less' : `+${overflow} more`}
          </button>
        )}
      </div>
    </div>
  );
});

/* ---------- ProgressRing ---------- */
const PR_COLORS: Record<string, string> = {
  emerald: 'var(--emerald)', cyan: 'var(--cyan)',
  amber: 'var(--amber)', rose: 'var(--rose)', blue: 'var(--blue)', violet: 'var(--violet)',
};
export const ProgressRing = memo(function ProgressRing({
  value, size = 60, strokeWidth = 5, accent = 'emerald',
}: {
  value: number; size?: number; strokeWidth?: number;
  accent?: 'emerald' | 'cyan' | 'amber' | 'rose' | 'blue' | 'violet';
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90" role="img" aria-label={`Progress: ${Math.round(value)}%`}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none"
        stroke="var(--border)" strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none"
        stroke={PR_COLORS[accent]} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-700 ease-out" />
    </svg>
  );
});

/* ---------- Tooltip ---------- */
export const Tooltip = memo(function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <div className="relative group/tooltip inline-flex">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-[var(--radius-xs)] bg-[var(--bg-3)] text-[var(--text-primary)] text-[11px] font-medium whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none border border-[var(--border)] shadow-md z-50">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--bg-3)] rotate-45 -mt-1 border-r border-b border-[var(--border)]" />
      </div>
    </div>
  );
});

/* ---------- Gauge (semicircular instrument) ---------- */
function gaugeColor(value: number, min: number, max: number): string {
  const pct = (value - min) / (max - min);
  if (pct < 0.25) return 'var(--emerald)';
  if (pct < 0.5) return 'var(--cyan)';
  if (pct < 0.75) return 'var(--amber)';
  return 'var(--rose)';
}
export const Gauge = memo(function Gauge({
  value, min = 0, max = 100, size = 120, label, unit,
}: {
  value: number; min?: number; max?: number; size?: number;
  label?: string; unit?: string;
  thresholds?: [number, number, number, number];
}) {
  const gradId = useId();
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = (size - 26) / 2;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const arcLen = Math.PI * r;
  const color = gaugeColor(value, min, max);
  const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const fs = size * 0.16;
  const fullArc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const rad = (angleOf(pct) * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);

  return (
    <svg width={size} height={size / 2 + 22} viewBox={`0 0 ${size} ${size / 2 + 24}`} className="gauge-svg" role="img" aria-label={`${label || ''}: ${value}${unit || ''}`}>
      <defs>
        {/* Instrument gradient — emerald → cyan → amber → rose */}
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={cx - r} y1={cy} x2={cx + r} y2={cy}>
          <stop offset="0%" stopColor="var(--emerald)" />
          <stop offset="33%" stopColor="var(--cyan)" />
          <stop offset="66%" stopColor="var(--amber)" />
          <stop offset="100%" stopColor="var(--rose)" />
        </linearGradient>
      </defs>

      {/* Soft inner bowl */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} A ${r * 0.72} ${r * 0.72} 0 0 0 ${cx - r * 0.72} ${cy} Z`}
        fill="var(--surface-hover)" opacity={0.35} />

      {/* Track */}
      <path d={fullArc} fill="none" stroke="var(--surface-hover)" strokeWidth={10} strokeLinecap="round" />

      {/* Progress arc (gradient, glowing, smooth dash-offset animation) */}
      <path d={fullArc} fill="none" stroke={`url(#${gradId})`} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={arcLen} strokeDashoffset={arcLen * (1 - pct)}
        className="gauge-arc transition-[stroke-dashoffset] duration-700 ease-out"
        style={{ filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.35))' }} />

      {/* Tick marks */}
      {ticks.map(t => {
        const ta = -180 + t * 180;
        const trad = (ta * Math.PI) / 180;
        const inner = r - 7;
        const outer = r - (t === 0 || t === 0.5 || t === 1 ? 12 : 9);
        const major = t === 0 || t === 0.5 || t === 1;
        return (
          <line key={t} x1={cx + inner * Math.cos(trad)} y1={cy + inner * Math.sin(trad)}
            x2={cx + outer * Math.cos(trad)} y2={cy + outer * Math.sin(trad)}
            stroke={major ? 'var(--text-disabled)' : 'var(--border-hover)'}
            strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />
        );
      })}

      {/* End dot at the needle tip */}
      <circle cx={nx} cy={ny} r={4} fill={color} className="gauge-dot"
        style={{ filter: 'drop-shadow(0 0 5px rgba(16,185,129,0.8))' }} />

      {/* Value */}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="var(--text-primary)" fontSize={fs} fontWeight={700} className="tabular-nums gauge-value">
        {value < 1000 ? Math.round(value * 10) / 10 : Math.round(value)}
      </text>
      {unit && <text x={cx} y={cy + fs * 0.55} textAnchor="middle" fill="var(--text-tertiary)" fontSize={Math.max(9, size * 0.062)} fontWeight={500}>{unit}</text>}
      {label && <text x={cx} y={cy + fs * 0.95} textAnchor="middle" fill="var(--text-disabled)" fontSize={Math.max(8, size * 0.055)} style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}>{label}</text>}
    </svg>
  );
});

function angleOf(pct: number): number {
  return -180 + pct * 180;
}

/* ---------- ProgressBar (labeled horizontal) ---------- */
export const ProgressBar = memo(function ProgressBar({
  value, min = 0, max = 100, label, showValue = true, accent = 'emerald', size = 'md',
}: {
  value: number; min?: number; max?: number; label?: string;
  showValue?: boolean; accent?: 'emerald' | 'cyan' | 'amber' | 'rose' | 'blue' | 'violet';
  size?: 'sm' | 'md';
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const PR_BG: Record<string, string> = {
    emerald: 'var(--emerald)', cyan: 'var(--cyan)', amber: 'var(--amber)',
    rose: 'var(--rose)', violet: 'var(--violet)', blue: 'var(--blue)',
  };
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>}
          {showValue && <span className="text-xs font-semibold tabular-nums" style={{ color: PR_BG[accent] }}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={`rounded-full bg-[var(--surface-hover)] overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%`, background: PR_BG[accent] }}
        />
      </div>
    </div>
  );
});
