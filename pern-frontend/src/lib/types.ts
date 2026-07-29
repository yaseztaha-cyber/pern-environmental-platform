export interface PhysicalReading {
  [key: string]: number;
  ph: number; tds: number; wT: number; dO: number; tb: number;
  pm25: number; mq: number; tmp: number; hum: number; co2: number;
  nh3: number; voc: number; sm: number;
}

export interface VirtualSensorResult {
  id: string; name: string; value: number; unit: string;
  category: 'success' | 'warning' | 'error' | 'info';
  formula: string; confidence: number; color: string;
  inputs: string[]; missingInputs?: string[];
}

export interface EnvironmentData {
  physical: PhysicalReading;
  virtualSensors: VirtualSensorResult[];
  ehi: number; timestamp: number; location: string;
}

export interface DataContextType {
  data: EnvironmentData;
  isLive: boolean; mqttConnected: boolean; lastUpdate: number;
  canSimulate: boolean; hasRealData: boolean;
  setLiveMode: (live: boolean) => void;
  updatePhysicalReading: (type: string, value: number) => void;
  simulateNewReading: () => void;
}

export interface ComplianceStandard {
  id: string; body: string; param: string;
  limit: number | string; unit: string; period: string;
  sensorKey: string; min?: number; max?: number; minVal?: number;
}

export interface ComplianceCheck extends ComplianceStandard {
  current: number | null; pass: boolean | null;
  status: 'pass' | 'fail' | 'no-data';
}

export interface ComplianceTrend {
  country: string; compliance: number; framework: string;
}

export interface ComplianceStats {
  countries: number; frameworks: number; overallPct: number;
}

export interface WindForecast {
  speed: number; direction: number; gust: number;
  time?: string; latitude?: number; longitude?: number;
}

export interface PlumeEvent {
  id: string; sourceLat: number; sourceLng: number;
  pollutant: string; concentration: number;
  direction: number; speed: number; timestamp: string;
}

export interface WeatherData {
  current: {
    temperature: number; humidity: number; windSpeed: number;
    windDirection: number; weatherCode: number;
    apparentTemperature: number; precipitation: number;
  };
  hourly: {
    time: string[]; temperature: number[]; humidity: number[];
    precipitationProbability: number[]; windSpeed: number[];
  };
  location: { name: string; lat: number; lon: number };
}

export interface DeviceLocation {
  id: string; name: string; type: string; status: string;
  lat: number | null; lng: number | null;
  description: string; firmware: string; tags: string[];
  hasCoordinates: boolean; latestReading: Record<string, number> | null;
}

export interface Scenario {
  name: string; values: Record<string, number>;
  ehi: number; aqi: number; wqi: number; timestamp: number;
}

export interface EnrichedDeviceAlert {
  type: 'rssi_low' | 'heap_low' | 'offline' | 'firmware_old' | 'compliance';
  severity: 'warning' | 'critical';
  message: string;
}

export interface EnrichedDevice {
  id: string; name: string; type: string; status: string;
  firmwareVersion: string; ipAddress: string;
  rssi: number | null; freeHeap: number | null;
  uptimeSeconds: number | null; wifiChannel: number | null;
  cpuFreq: number | null;
  healthScore: number; rssiQuality: number;
  heapHealth: number; uptimeQuality: number;
  lastSeen: string; recordedAt: string | null;
  history: RealDeviceHealth[]; alerts: EnrichedDeviceAlert[];
}

export interface RealDeviceHealth {
  rssi?: number; free_heap?: number; uptime_seconds?: number;
  recorded_at: string; firmware_version?: string;
  ip_address?: string; wifi_channel?: number; cpu_freq?: number;
}

export interface DeviceHeartbeat {
  device: string; rssi: number; freeHeap: number;
  uptime: number; fwVersion?: string; ip?: string;
  wifiChannel?: number; cpuFreq?: number; timestamp: number;
}

export interface Insight {
  id: string; type: 'warning' | 'info' | 'success' | 'error';
  title: string; message: string; timestamp: string; sensor?: string;
}

export interface Recommendation {
  id: string; category: string;
  priority: 'high' | 'medium' | 'low';
  title: string; description: string;
}

export type ViewMode = 'overview' | 'comparison' | 'alerts';
export type Locale = 'en' | 'ar';
export type SensorType = keyof PhysicalReading;
