/**
 * Real-time WebSocket hook
 * Connects to the backend actuator WS and provides live sensor readings,
 * notifications, and actuator status updates.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

type WSEvent = {
  type: 'sensor-reading' | 'notification' | 'actuator-status' | 'alert';
  [key: string]: any;
};

interface UseRealtimeOptions {
  url?: string;
  onReading?: (data: any) => void;
  onNotification?: (data: any) => void;
  onAlert?: (data: any) => void;
  onActuatorStatus?: (data: any) => void;
}

export function useRealtime(options?: UseRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const [lastReading, setLastReading] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const disposedRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    const url = options?.url || `ws://${window.location.hostname}:8081`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { if (!disposedRef.current) setConnected(true); };
      ws.onclose = () => {
        if (disposedRef.current) return;
        setConnected(false);
        reconnectTimeout.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => { ws.close(); };

      ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data);
          switch (data.type) {
            case 'sensor-reading':
              setLastReading(data);
              optionsRef.current?.onReading?.(data);
              break;
            case 'notification':
              setNotifications(prev => [data, ...prev].slice(0, 50));
              optionsRef.current?.onNotification?.(data);
              break;
            case 'alert':
              optionsRef.current?.onAlert?.(data);
              break;
            case 'actuator-status':
              optionsRef.current?.onActuatorStatus?.(data);
              break;
          }
        } catch { /* ignore parse errors */ }
      };
    } catch { /* ignore connection errors */ }
  }, [options?.url]);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { connected, lastReading, notifications };
}
