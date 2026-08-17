import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'pern_animations';

function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function readStored(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return null;
    if (v === '0' || v === 'false') return false;
    if (v === '1' || v === 'true') return true;
    return null;
  } catch {
    return null;
  }
}

function applyAttr(enabled: boolean) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-animations', enabled ? 'on' : 'off');
  }
}

export function useAnimationsEnabled(): {
  animationsEnabled: boolean;
  setAnimationsEnabled: (v: boolean) => void;
  toggleAnimations: () => void;
} {
  const [prefersReduced, setPrefersReduced] = useState(systemPrefersReducedMotion);
  const [stored, setStored] = useState<boolean | null>(readStored);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const animationsEnabled = useMemo(
    () => !prefersReduced && stored !== false,
    [prefersReduced, stored],
  );

  useEffect(() => {
    applyAttr(animationsEnabled);
  }, [animationsEnabled]);

  const setAnimationsEnabled = useCallback((v: boolean) => {
    setStored(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    } catch { /* storage unavailable */ }
  }, []);

  const toggleAnimations = useCallback(() => {
    setStored(prev => {
      const next = prev === false;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  return { animationsEnabled, setAnimationsEnabled, toggleAnimations };
}
