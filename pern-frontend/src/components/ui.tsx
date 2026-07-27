import { memo, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

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
  emerald: 'border-l-[var(--emerald)]',
  cyan: 'border-l-[var(--cyan)]',
  violet: 'border-l-[var(--violet)]',
  amber: 'border-l-[var(--amber)]',
  blue: 'border-l-[var(--blue)]',
  rose: 'border-l-[var(--rose)]',
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
  return (
    <div
      className={`rounded-[var(--radius-md)] p-5 border-l-[3px] ${STAT_ACCENT_BORDERS[accent]} transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover-lift`}
      style={{ background: STAT_ACCENT_GLOWS[accent] }}
    >
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        {icon && <span className={`${STAT_ACCENT_CLASSES[accent]} icon-bounce`}>{icon}</span>}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className={`text-[28px] font-bold tracking-tight stat-number ${STAT_ACCENT_CLASSES[accent]}`}>{typeof value === 'number' ? fmt(value) : value}</span>
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
          className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${
            checked ? 'translate-x-[18px]' : ''
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

/* ---------- ProgressRing ---------- */
const PR_COLORS: Record<string, string> = {
  emerald: 'var(--emerald)', cyan: 'var(--cyan)',
  amber: 'var(--amber)', rose: 'var(--rose)', blue: 'var(--blue)',
};
export const ProgressRing = memo(function ProgressRing({
  value, size = 60, strokeWidth = 5, accent = 'emerald',
}: {
  value: number; size?: number; strokeWidth?: number;
  accent?: 'emerald' | 'cyan' | 'amber' | 'rose' | 'blue';
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
