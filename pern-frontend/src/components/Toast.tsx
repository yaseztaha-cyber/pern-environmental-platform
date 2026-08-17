/* oxlint-disable react/only-export-components */
import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { X, AlertTriangle, CheckCircle2, Info, AlertCircle } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  sound?: boolean;
  exiting?: boolean;
}

interface ToastContextType {
  toast: (message: string, type?: Toast['type'], sound?: boolean) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const ICONS = {
  success: <CheckCircle2 size={16} className="text-emerald-400" />,
  error: <AlertCircle size={16} className="text-red-400" />,
  warning: <AlertTriangle size={16} className="text-amber-400" />,
  info: <Info size={16} className="text-blue-400" />,
};

const BG = {
  success: 'border-emerald-500/30 bg-emerald-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
};

let nextId = 0;
let globalToastFn: ((message: string, type?: Toast['type'], sound?: boolean) => void) | null = null;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const recentMessages = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    const recent = recentMessages.current;
    return () => {
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      recent.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    const timer = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    timersRef.current.set(id + 0.5, timer);
  }, []);

  const toast = useCallback((message: string, type: Toast['type'] = 'info', sound = false) => {
    const now = Date.now();
    const last = recentMessages.current.get(message);
    if (last && now - last < 3000) return;
    recentMessages.current.set(message, now);

    const id = nextId++;
    const cleanupTimer = setTimeout(() => recentMessages.current.delete(message), 3000);
    timersRef.current.set(id + 0.2, cleanupTimer);

    setToasts(prev => {
      const trimmed = prev.length >= 5 ? prev.slice(-4) : prev;
      return [...trimmed, { id, message, type, sound }];
    });
    if (sound) {
      try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH+Jk42LhH1wa3V+iZGQjIZ/d3B0fImRkI2GfnRwdH2JkZCNh4B4cXR9iZGQjYaAeXF0fYmRkI2HgXpydH2JkZCNh4F6cnR9iZGQjYeBenJ0fYmRkI2HgXpydH2JkZCNh4B5cXR9iZGQjYOAeXF0fYmRkI2DgHlxdH2JkZCNg4B5cXR9iZGQjYOAeXF0fYmRkI2DgHlxdH2JkZCNh4F6cnR9iZGQjYeBenJ0fYmRkI2HgXpydH2JkZCNh4F6cnR9iZGQjYeBenJ0fYmRkI2DgHlxdH2JkZCNh4F6cnR9iZGQjYOAeXF0fYmRkI2DgHlxdH2JkZCNh4F6cnR9iZGQjYOAeXF0fYg=').play().catch(() => {}); } catch {}
    }
    const timer = setTimeout(() => dismiss(id), 4000);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => {
    globalToastFn = toast;
    return () => { globalToastFn = null; };
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] space-y-2 max-w-sm" role="status" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-sm)] border ${BG[t.type]} backdrop-blur-sm transition-all duration-300 ${
              t.exiting ? 'opacity-0 translate-x-4 scale-95' : 'animate-slide-up'
            }`}
          >
            {ICONS[t.type]}
            <span className="text-sm text-[var(--text-primary)] flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-[var(--text-disabled)] hover:text-[var(--text-primary)]" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: () => {} };
  return ctx;
}

export function showToast(message: string, type: Toast['type'] = 'info', sound = false) {
  if (globalToastFn) {
    globalToastFn(message, type, sound);
  }
}
