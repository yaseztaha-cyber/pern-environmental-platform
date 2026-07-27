import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { computeDynamicVirtualSensors, type VirtualSensorResult } from './virtual-sensors';
import { mqttClient, type SensorData } from './mqtt-client';
import { calculateScientificEHI } from './scientific-ehi';
import { getCurrentContext } from './app-context';
import { addEHIReading } from './historical-data';
import { useDevice } from './device-context';
import { apiClient } from './api-client';
import { processBatch, resetPipeline } from './sensor-pipeline';

interface PhysicalReading {
  [key: string]: number;
}

interface EnvironmentData {
  physical: PhysicalReading;
  virtualSensors: VirtualSensorResult[];
  ehi: number;
  timestamp: number;
  location: string;
}

interface DataContextType {
  data: EnvironmentData;
  isLive: boolean;
  setLiveMode: (live: boolean) => void;
  mqttConnected: boolean;
  reconnecting: boolean;
  lastUpdate: number;
  canSimulate: boolean;
  hasRealData: boolean;
  updatePhysicalReading: (type: string, value: number) => void;
  simulateNewReading: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Seed values are ONLY used in Simulation Mode (no real device connected).
// In Live Mode the dashboard starts empty and is filled exclusively with
// real sensor data received from devices over MQTT — no mock values.
const INITIAL_READINGS: PhysicalReading = {
  ph: 7.25,
  tds: 178,
  wT: 23.8,
  dO: 8.7,
  tb: 2.4,
  pm25: 21.4,
  mq: 0.42,
  tmp: 29.3,
  hum: 54,
  co2: 438,
  nh3: 4.8,
  voc: 142,
  sm: 41,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const currentContext = getCurrentContext();
  const { selectedDevice, clearDevices } = useDevice();

  // Simulation baseline (used only when NOT in live mode)
  const getContextInitialReadings = () => {
    const base = { ...INITIAL_READINGS };
    if (currentContext.type === 'organization') {
      const orgId = currentContext.id;
      if (orgId.includes('cairo')) {
        base.pm25 = 28;
        base.co2 = 520;
      } else if (orgId.includes('giza')) {
        base.pm25 = 21;
        base.ph = 7.1;
      }
    }
    return base;
  };

  // In Live Mode: start with NO data. Real sensor readings populate this.
  const [physical, setPhysical] = useState<PhysicalReading>({});
  const [virtualSensors, setVirtualSensors] = useState<VirtualSensorResult[]>([]);
  const [ehi, setEhi] = useState<number>(-1);
  const [isLive, setIsLive] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [hasRealData, setHasRealData] = useState(false);

  // Keep the latest selected device in a ref so the Live Mode effect can read
  // it without re-subscribing on every device change.
  const selectedDeviceRef = useRef(selectedDevice);
  selectedDeviceRef.current = selectedDevice;

  // Context-aware location
  const displayLocation = currentContext.name;

  // Hydrate from backend on mount — loads the latest sensor readings so
  // every page starts with real data instead of empty/seed values.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || isLive) return;
    hydratedRef.current = true;

    (async () => {
      try {
        // Load real devices from backend — no auto-seeding
        const devices = await apiClient.getDevices();

        // Load latest readings for the selected or first available device
        const targetDevice = selectedDevice?.id || devices[0]?.id;
        if (!targetDevice) return;

        const readings = await apiClient.getDeviceReadings(targetDevice, 1);
        if (readings.length > 0) {
          const latest = readings[readings.length - 1];
          const sensors = latest.sensors || latest;
          if (typeof sensors === 'object' && Object.keys(sensors).length > 0) {
            if (import.meta.env.DEV) console.log('[DataProvider] Hydrating from backend:', targetDevice, Object.keys(sensors).length, 'sensors');
            setPhysical(sensors);
            setHasRealData(true);
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[DataProvider] Backend hydration failed:', e);
      }
    })();
  }, [isLive, selectedDevice?.id]);

  // Compute virtual sensors + Advanced EHI whenever physical readings change (debounced)
  useEffect(() => {
    if (Object.keys(physical).length === 0) {
      setVirtualSensors([]);
      setEhi(-1);
      return;
    }

    const timer = setTimeout(() => {
      const virtuals = computeDynamicVirtualSensors(physical);
      setVirtualSensors(virtuals);

      const scientific = calculateScientificEHI(physical);
      setEhi(scientific ? scientific.score : -1);
      setLastUpdate(Date.now());

      if (isLive && scientific) {
        addEHIReading(scientific.score, selectedDevice?.id);
        apiClient.postEHIHistory({ deviceId: selectedDevice?.id, ehi: scientific.score, category: scientific.category })
          .catch(() => {});
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [physical, isLive, selectedDevice?.id]);

  // MQTT Live Mode - STRICT ENFORCEMENT
  useEffect(() => {
    if (!isLive) {
      mqttClient.disconnect();
      setMqttConnected(false);
      if (import.meta.env.DEV) console.log('[DataProvider] → Exiting Live Mode (Simulation allowed)');
      return;
    }

    if (import.meta.env.DEV) console.log('[DataProvider] → Entering STRICT Live Mode');
    let unsubscribe: (() => void) | undefined;
    let statusUnsub: (() => void) | undefined;
    let reconnectUnsub: (() => void) | undefined;
    let cancelled = false;

    mqttClient.connect().then(success => {
      if (cancelled) {
        mqttClient.disconnect();
        return;
      }
      setMqttConnected(success);
      if (!success) {
        if (import.meta.env.DEV) console.error('[DataProvider] Failed to connect to MQTT broker');
        return;
      }
      // Register listeners only after a successful connection
      unsubscribe = mqttClient.onSensorData((sensorData: SensorData) => {
        // When a specific device is selected, only ingest that device's stream
        if (selectedDeviceRef.current && sensorData.device !== selectedDeviceRef.current.id) return;
        setHasRealData(true);
        // Run through temporal smoothing + outlier detection
        const { smoothed } = processBatch(sensorData.sensors);
        setPhysical(prev => {
          const updated = { ...prev };
          Object.keys(smoothed).forEach(key => {
            updated[key] = smoothed[key];
          });
          return updated;
        });
      });
      statusUnsub = mqttClient.onStatusChange(setMqttConnected);
      reconnectUnsub = mqttClient.onReconnecting(setReconnecting);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      statusUnsub?.();
      reconnectUnsub?.();
      mqttClient.disconnect();
      resetPipeline();
      setMqttConnected(false);
      setReconnecting(false);
    };
  }, [isLive]);

  const setLiveMode = useCallback((live: boolean) => {
    if (live) {
      resetPipeline();
      setPhysical({});
      setVirtualSensors([]);
      setEhi(-1);
      setHasRealData(false);
      clearDevices();
      window.dispatchEvent(new CustomEvent('live-mode-change', { detail: { isLive: true } }));
    } else {
      setPhysical(getContextInitialReadings());
      setHasRealData(false);
      window.dispatchEvent(new CustomEvent('live-mode-change', { detail: { isLive: false } }));
    }
    setIsLive(live);
  }, []);

  const updatePhysicalReading = useCallback((type: string, value: number) => {
    if (isLive) return;
    setPhysical(prev => ({ ...prev, [type]: value }));
  }, [isLive]);

  const simulateNewReading = useCallback(() => {
    if (isLive) return;

    const newReadings = { ...physical };
    
    // Simulate realistic sensor fluctuations
    Object.keys(newReadings).forEach(key => {
      const current = newReadings[key];
      const variation = (Math.random() - 0.5) * (key === 'pm25' ? 4 : key === 'co2' ? 25 : 1.2);
      newReadings[key] = Math.round((current + variation) * 100) / 100;
      
      // Clamp to reasonable ranges
      if (key === 'ph') newReadings[key] = Math.max(6.2, Math.min(8.4, newReadings[key]));
      if (key === 'pm25') newReadings[key] = Math.max(5, Math.min(68, newReadings[key]));
    });
    
    setPhysical(newReadings);
  }, [isLive, physical]);

  const value: DataContextType = useMemo(() => ({
    data: {
      physical,
      virtualSensors,
      ehi,
      timestamp: lastUpdate,
      location: displayLocation,
    },
    isLive,
    setLiveMode,
    mqttConnected,
    reconnecting,
    lastUpdate,
    canSimulate: !isLive,
    hasRealData,
    updatePhysicalReading,
    simulateNewReading,
  }), [physical, virtualSensors, ehi, lastUpdate, displayLocation, isLive, setLiveMode, mqttConnected, reconnecting, hasRealData, updatePhysicalReading, simulateNewReading]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}