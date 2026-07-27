import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES } from '../lib/constants';
import { showToast } from '../components/Toast';
import { PageHeader, Card, Pill, Btn, SectionTitle } from '../components/ui';

interface CalibrationEntry {
  offset: number;
  multiplier: number;
  lastCalibrated: string;
}

export default function SensorCalibration() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [calibrations, setCalibrations] = useState<Record<string, CalibrationEntry>>({});
  const [selectedSensor, setSelectedSensor] = useState('pm25');
  const [offset, setOffset] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadDevices = useCallback(async () => {
    const devs = await apiClient.getDevices();
    setDevices(devs);
    if (devs.length > 0 && !selectedDevice) {
      setSelectedDevice(devs[0].id);
    }
    setLoading(false);
  }, [selectedDevice]);

  const loadCalibration = useCallback(async () => {
    if (!selectedDevice) return;
    const data = await apiClient.getDeviceCalibration(selectedDevice);
    const mapped: Record<string, CalibrationEntry> = {};
    for (const [sensor, cal] of Object.entries(data)) {
      mapped[sensor] = {
        offset: (cal as any).offset || 0,
        multiplier: (cal as any).multiplier || 1,
        lastCalibrated: (cal as any).lastCalibrated || '',
      };
    }
    setCalibrations(mapped);
  }, [selectedDevice]);

  useEffect(() => { loadDevices(); }, []);
  useEffect(() => { loadCalibration(); }, [loadCalibration]);

  const saveCalibration = async () => {
    if (!selectedDevice) return;
    const entry: CalibrationEntry = {
      offset,
      multiplier,
      lastCalibrated: new Date().toISOString(),
    };
    const updated = { ...calibrations, [selectedSensor]: entry };
    await apiClient.saveDeviceCalibration(selectedDevice, updated);
    setCalibrations(updated);
    showToast(`Calibration saved for ${SENSOR_TYPES[selectedSensor as keyof typeof SENSOR_TYPES]?.name ?? selectedSensor}`, 'success');
  };

  const selectSensor = (sensor: string) => {
    setSelectedSensor(sensor);
    const cal = calibrations[sensor];
    setOffset(cal?.offset || 0);
    setMultiplier(cal?.multiplier || 1);
  };

  return (
    <div>
      <PageHeader
        title="Sensor Calibration"
        subtitle="Adjust sensor readings for accuracy • Persisted per device"
      />

      <div className="grid lg:grid-cols-3 gap-6 grid-entrance">
        <Card hover={false}>
          <SectionTitle>Select Device & Sensor</SectionTitle>

          <label className="text-xs text-[var(--text-tertiary)] block mb-1">Device</label>
          <select
            value={selectedDevice}
            onChange={e => setSelectedDevice(e.target.value)}
            className="bg-white/5 w-full px-4 py-3 rounded-2xl mb-4 text-sm"
          >
            {loading ? (
              <option>Loading devices...</option>
            ) : devices.length === 0 ? (
              <option>No devices found</option>
            ) : (
              devices.map(d => (
                <option key={d.id} value={d.id}>{d.name || d.id} ({d.type})</option>
              ))
            )}
          </select>

          <label className="text-xs text-[var(--text-tertiary)] block mb-1">Sensor</label>
          <select
            value={selectedSensor}
            onChange={e => selectSensor(e.target.value)}
            className="bg-white/5 w-full px-4 py-3 rounded-2xl text-sm"
          >
            {Object.keys(SENSOR_TYPES).map(key => (
              <option key={key} value={key}>{SENSOR_TYPES[key as keyof typeof SENSOR_TYPES].name} ({key.toUpperCase()})</option>
            ))}
          </select>

          <div className="mt-4 text-xs text-[var(--text-tertiary)]">
            {Object.keys(calibrations).length} sensor(s) calibrated on this device
          </div>
        </Card>

        <Card hover={false}>
          <SectionTitle>Calibrate {SENSOR_TYPES[selectedSensor as keyof typeof SENSOR_TYPES]?.name ?? selectedSensor}</SectionTitle>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-[var(--text-tertiary)]">Offset (add to raw reading)</label>
              <input
                type="number"
                step="0.1"
                value={offset}
                onChange={e => setOffset(parseFloat(e.target.value) || 0)}
                className="w-full bg-white/5 px-4 py-2.5 rounded-2xl mt-1 text-sm"
              />
              <div className="text-[10px] text-[var(--text-tertiary)] mt-1">Corrected = Raw × {multiplier} + {offset}</div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-tertiary)]">Multiplier (scale factor)</label>
              <input
                type="number"
                step="0.01"
                value={multiplier}
                onChange={e => setMultiplier(parseFloat(e.target.value) || 1)}
                className="w-full bg-white/5 px-4 py-2.5 rounded-2xl mt-1 text-sm"
              />
              <div className="text-[10px] text-[var(--text-tertiary)] mt-1">Default multiplier is 1.0 (no scaling)</div>
            </div>
          </div>

          <Btn variant="primary" onClick={saveCalibration} className="mt-6 w-full">
            Save Calibration
          </Btn>
        </Card>

        <Card hover={false}>
          <SectionTitle>Current Calibrations</SectionTitle>
          {Object.keys(calibrations).length === 0 ? (
            <div className="text-sm text-[var(--text-tertiary)]">No calibrations saved for this device yet.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(calibrations).map(([sensor, cal]) => (
                <div
                  key={sensor}
                  onClick={() => selectSensor(sensor)}
                  className={`p-3 rounded-2xl text-sm cursor-pointer transition-all ${
                    selectedSensor === sensor
                      ? 'bg-[var(--emerald-dim)] border border-[var(--emerald-glow)]'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{SENSOR_TYPES[sensor as keyof typeof SENSOR_TYPES]?.name ?? sensor}</span>
                    {selectedSensor === sensor && <Pill tone="emerald">Active</Pill>}
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)] mt-1">
                    Offset: {cal.offset} • Multiplier: {cal.multiplier}
                  </div>
                  {cal.lastCalibrated && (
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-1 opacity-60">
                      Calibrated: {new Date(cal.lastCalibrated).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
