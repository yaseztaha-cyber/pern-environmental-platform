import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const PRESETS = [
  { label: 'Today', value: 'today', from: () => new Date(new Date().setHours(0, 0, 0, 0)), to: () => new Date() },
  { label: 'Last 24h', value: '24h', from: () => new Date(Date.now() - 86400000), to: () => new Date() },
  { label: 'Last 7 days', value: '7d', from: () => new Date(Date.now() - 7 * 86400000), to: () => new Date() },
  { label: 'Last 30 days', value: '30d', from: () => new Date(Date.now() - 30 * 86400000), to: () => new Date() },
  { label: 'Last 90 days', value: '90d', from: () => new Date(Date.now() - 90 * 86400000), to: () => new Date() },
];

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

export default function DateRangePicker({ from, to, onChange, className = '' }: DateRangePickerProps) {
  const [showPresets, setShowPresets] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPresets) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPresets(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPresets(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showPresets]);

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const f = preset.from().toISOString().slice(0, 10);
    const t = preset.to().toISOString().slice(0, 10);
    onChange(f, t);
    setShowPresets(false);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)]"
          aria-label="Date range presets"
        >
          <Calendar size={14} />
          <span>Presets</span>
          <ChevronDown size={12} />
        </button>
        {showPresets && (
          <div className="absolute top-full left-0 mt-1 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-lg z-50 py-1 min-w-[160px] animate-pop">
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => applyPreset(p)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <input type="date" value={from} onChange={e => onChange(e.target.value, to)}
        className="px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)]"
        aria-label="Start date" />
      <span className="text-[var(--text-disabled)] text-xs">to</span>
      <input type="date" value={to} onChange={e => onChange(from, e.target.value)}
        className="px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)]"
        aria-label="End date" />
    </div>
  );
}
