/**
 * PERN Constants & Configuration
 */

export const SENSOR_TYPES = {
  // Water Quality
  ph: { name: 'pH', unit: '', safeRange: [6.5, 8.5], icon: 'Droplet' },
  tds: { name: 'TDS', unit: 'ppm', safeRange: [0, 500], icon: 'Beaker' },
  wT: { name: 'Water Temp', unit: '°C', safeRange: [10, 30], icon: 'Thermometer' },
  dO: { name: 'Dissolved O₂', unit: 'mg/L', safeRange: [5, 14], icon: 'Wind' },
  tb: { name: 'Turbidity', unit: 'NTU', safeRange: [0, 5], icon: 'Waves' },
  
  // Air Quality
  pm25: { name: 'PM2.5', unit: 'µg/m³', safeRange: [0, 35], icon: 'Wind' },
  mq: { name: 'MQ135 Gas', unit: 'ppm', safeRange: [0, 1.0], icon: 'Flame' },
  tmp: { name: 'Air Temp', unit: '°C', safeRange: [15, 35], icon: 'ThermometerSun' },
  hum: { name: 'Humidity', unit: '%', safeRange: [30, 70], icon: 'Droplet' },
  co2: { name: 'CO₂', unit: 'ppm', safeRange: [300, 1000], icon: 'Cloud' },
  nh3: { name: 'NH₃', unit: 'ppm', safeRange: [0, 25], icon: 'AlertTriangle' },
  voc: { name: 'VOC', unit: 'ppb', safeRange: [0, 500], icon: 'FlaskConical' },
  
  // Soil
  sm: { name: 'Soil Moisture', unit: '%', safeRange: [20, 60], icon: 'Sprout' },
  
  // Light / Optical
  light: { name: 'Light Intensity', unit: 'lux', safeRange: [0, 100000], icon: 'Sun' },
} as const;

export type SensorType = keyof typeof SENSOR_TYPES;

export const EHI_CATEGORIES = {
  excellent: { min: 80, label: 'Excellent', color: '#10b981' },
  good: { min: 60, label: 'Good', color: '#22c55e' },
  moderate: { min: 40, label: 'Moderate', color: '#eab308' },
  poor: { min: 20, label: 'Poor', color: '#f97316' },
  critical: { min: 0, label: 'Critical', color: '#ef4444' },
};

export const NTFY_DEFAULT_TOPIC = 'pern-platform-alerts-2026';
export const MQTT_BROKER_WS = import.meta.env.VITE_MQTT_BROKER_WS || 'wss://broker.emqx.io:8084/mqtt';
// Use VITE_API_URL when provided (e.g. a remote backend), otherwise fall back
// to a same-origin relative path so the app works from any host/IP behind a proxy.
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const DEVICE_TYPES = [
  'ESP32', 'ESP8266', 'Arduino Uno', 'Arduino Mega', 
  'Raspberry Pi', 'Raspberry Pi Pico', 'NodeMCU'
];