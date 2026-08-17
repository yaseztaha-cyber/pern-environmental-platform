/* oxlint-disable react/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface LiveModeContextType {
  isLive: boolean;
  setLiveMode: (live: boolean) => void;
  canSimulate: boolean;
}

const LiveModeContext = createContext<LiveModeContextType | undefined>(undefined);

export function LiveModeProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);

  const setLiveMode = useCallback((live: boolean) => {
    setIsLive(live);
  }, []);

  const value = useMemo(() => ({
    isLive,
    setLiveMode,
    canSimulate: !isLive,
  }), [isLive, setLiveMode]);

  return (
    <LiveModeContext.Provider value={value}>
      {children}
    </LiveModeContext.Provider>
  );
}

export function useLiveMode() {
  const context = useContext(LiveModeContext);
  if (!context) {
    throw new Error('useLiveMode must be used within a LiveModeProvider');
  }
  return context;
}