/* oxlint-disable react/only-export-components */
/**
 * PERN Device Context
 *
 * Tracks devices that are ACTUALLY connected — discovered from real MQTT
 * sensor traffic or registered through the connection system. No mock/seed
 * devices are present; the list is empty until real data arrives.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { mqttClient, type DiscoveredDevice, type SensorData } from './mqtt-client';
import { apiClient } from './api-client';

export interface ConnectedDevice {
  id: string;
  name: string;
  type: string;
  lastSeen: string;
  status: 'connected' | 'pending';
}

export interface DeviceReading {
  sensors: Record<string, number>;
  timestamp: number;
}

interface DeviceContextType {
  selectedDevice: ConnectedDevice | null;
  connectedDevices: ConnectedDevice[];
  setSelectedDevice: (device: ConnectedDevice) => void;
  addDevice: (device: ConnectedDevice) => void;
  registerRealDevice: (id: string, type?: string) => void;
  touchDevice: (id: string) => void;
  clearDevices: () => void;
  deviceReadings: Record<string, DeviceReading>;
  getDeviceReadings: (id: string) => DeviceReading | null;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [selectedDevice, setSelectedDevice] = useState<ConnectedDevice | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [deviceReadings, setDeviceReadings] = useState<Record<string, DeviceReading>>({});

  // Ingest every real reading into a per-device store so different devices
  // keep their own latest values instead of overwriting each other.
  useEffect(() => {
    const unsub = mqttClient.onSensorData((data: SensorData) => {
      setDeviceReadings(prev => ({
        ...prev,
        [data.device]: { sensors: data.sensors, timestamp: data.timestamp },
      }));
      setConnectedDevices(prev => {
        const next = prev.map(d => (d.id === data.device ? { ...d, lastSeen: new Date(data.timestamp).toISOString(), status: 'connected' as const } : d));
        const changed = next.find(d => d.id === data.device);
        if (changed && !prev.find(d => d.id === data.device && d.status === 'connected')) persistDevice(changed);
        return next;
      });
    });
    return unsub;
  }, []);

  // Register a device the moment real MQTT data arrives from it
  useEffect(() => {
    const unsub = mqttClient.onDeviceDiscovered((d: DiscoveredDevice) => {
      setConnectedDevices(prev => {
        const existing = prev.find(dev => dev.id === d.device);
        if (existing) {
          const updated = prev.map(dev =>
            dev.id === d.device ? { ...dev, lastSeen: new Date().toISOString(), status: 'connected' as const } : dev
          );
          persistDevice(updated.find(dev => dev.id === d.device)!);
          return updated;
        }
        const added: ConnectedDevice = {
          id: d.device,
          name: d.device,
          type: inferType(d.device),
          lastSeen: new Date(d.timestamp).toISOString(),
          status: 'connected' as const,
        };
        persistDevice(added);
        // Auto-select the first real device
        if (prev.length === 0) setSelectedDevice(added);
        return [...prev, added];
      });
    });
    return unsub;
  }, []);

  // In live mode, devices are ONLY discovered from real MQTT sensor traffic.
  // No seeding, no fake devices.  The list starts empty and grows only when
  // actual hardware sends data.

  const addDevice = useCallback((device: ConnectedDevice) => {
    setConnectedDevices(prev => {
      if (prev.find(d => d.id === device.id)) return prev;
      persistDevice(device);
      return [...prev, device];
    });
  }, []);

  const registerRealDevice = useCallback((id: string, type: string = 'Generic') => {
    const device: ConnectedDevice = {
      id,
      name: id,
      type,
      lastSeen: new Date().toISOString(),
      status: 'pending',
    };
    setConnectedDevices(prev => {
      if (prev.find(d => d.id === id)) return prev;
      persistDevice(device);
      return [...prev, device];
    });
    if (!selectedDevice) setSelectedDevice(device);
  }, [selectedDevice]);

  const touchDevice = useCallback((id: string) => {
    setConnectedDevices(prev =>
      prev.map(d => (d.id === id ? { ...d, lastSeen: new Date().toISOString(), status: 'connected' } : d))
    );
  }, []);

  const getDeviceReadings = useCallback((id: string): DeviceReading | null => deviceReadings[id] || null, [deviceReadings]);

  const clearDevices = useCallback(() => {
    setConnectedDevices([]);
    setDeviceReadings({});
    setSelectedDevice(null);
  }, []);

  const value = useMemo(() => ({
    selectedDevice,
    connectedDevices,
    setSelectedDevice,
    addDevice,
    registerRealDevice,
    touchDevice,
    clearDevices,
    deviceReadings,
    getDeviceReadings,
  }), [selectedDevice, connectedDevices, addDevice, registerRealDevice, touchDevice, clearDevices, deviceReadings, getDeviceReadings]);

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

function persistDevice(device: ConnectedDevice) {
  apiClient.saveDevice({
    id: device.id, name: device.name, type: device.type, status: device.status, lastSeen: device.lastSeen,
  }).catch(() => {});
}

function inferType(id: string): string {
  const upper = id.toUpperCase();
  if (upper.includes('ESP32')) return 'ESP32';
  if (upper.includes('ESP8266')) return 'ESP8266';
  if (upper.includes('NODEMCU')) return 'NodeMCU';
  if (upper.includes('RPI') || upper.includes('RASPBERRY')) return 'Raspberry Pi';
  if (upper.includes('ARDUINO')) return 'Arduino-USB';
  return 'Generic';
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
}
