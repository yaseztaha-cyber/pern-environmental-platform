import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { apiClient } from '../lib/api-client';
import { fetchOpenAQData } from '../lib/openaq-service';
import { PageHeader, Card, Pill, SectionTitle, Btn, LoadingState } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { RefreshCw, Radio, Globe } from 'lucide-react';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface SensorMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  pm25: number;
  source: 'device' | 'openaq';
  status?: string;
  sensors?: Record<string, number>;
  firmware?: string;
}

const CITIES = ['Cairo', 'Alexandria', 'Giza', 'Aswan', 'Luxor'];

const cityCoords: Record<string, { lat: number; lng: number }> = {
  Cairo: { lat: 30.04, lng: 31.24 },
  Alexandria: { lat: 31.20, lng: 29.92 },
  Giza: { lat: 30.01, lng: 31.21 },
  Aswan: { lat: 24.09, lng: 32.90 },
  Luxor: { lat: 25.70, lng: 32.64 },
};

export default function RealSensorMap() {
  const { t } = useI18n();
  const [sensors, setSensors] = useState<SensorMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorMarker | null>(null);
  const [filter, setFilter] = useState<'all' | 'device' | 'openaq'>('all');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const allSensors: SensorMarker[] = [];

    // 1. Fetch real devices with coordinates + latest sensor readings
    try {
      const locations = await apiClient.getDeviceLocations();
      for (const d of locations as any[]) {
        if (d.lat == null || d.lng == null) continue; // Skip unlocated devices
        const pm25 = d.latestReading?.pm25 ?? 0;
        allSensors.push({
          id: d.id,
          name: d.name || d.id,
          lat: Number(d.lat),
          lng: Number(d.lng),
          pm25: typeof pm25 === 'number' ? pm25 : 0,
          source: 'device',
          status: d.status,
          sensors: d.latestReading || undefined,
          firmware: d.firmware || undefined,
        });
      }
    } catch { /* skip */ }

    // 2. Fetch OpenAQ city-level data
    for (const city of CITIES) {
      try {
        const data = await fetchOpenAQData(city);
        const coords = cityCoords[city];
        if (coords && data) {
          allSensors.push({
            id: `openaq-${city}`,
            name: `${city} (OpenAQ)`,
            lat: coords.lat,
            lng: coords.lng,
            pm25: data.pm25 || 0,
            source: 'openaq',
          });
        }
      } catch { /* skip */ }
    }

    setSensors(allSensors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getMarkerColor = (pm25: number, source: string) => {
    if (source === 'device') return '#3b82f6'; // blue for real devices
    if (pm25 <= 12) return '#10b981';
    if (pm25 <= 25) return '#22c55e';
    if (pm25 <= 35) return '#eab308';
    return '#f97316';
  };

  const createIcon = (color: string, isDevice: boolean) => L.divIcon({
    className: '',
    html: isDevice
      ? `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:50%;background:white;"></div></div>`
      : `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: isDevice ? [16, 16] : [14, 14],
    iconAnchor: isDevice ? [8, 8] : [7, 7],
  });

  const filtered = filter === 'all' ? sensors : sensors.filter(s => s.source === filter);
  const deviceCount = sensors.filter(s => s.source === 'device').length;
  const openaqCount = sensors.filter(s => s.source === 'openaq').length;

  // Map center
  const devices = sensors.filter(s => s.source === 'device');
  const center: [number, number] = devices.length > 0
    ? [devices.reduce((s, d) => s + d.lat, 0) / devices.length, devices.reduce((s, d) => s + d.lng, 0) / devices.length]
    : [30.04, 31.24];

  return (
    <div>
      <PageHeader
        title={t('realSensorMap.title', 'Real Sensor Map')}
        subtitle={`${t('realSensorMap.devicesCount', '{count} devices', { count: deviceCount })} · ${t('realSensorMap.openaqStations', '{count} OpenAQ stations', { count: openaqCount })}`}
        right={
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={() => loadData(true)} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {t('common.refresh', 'Refresh')}
            </Btn>
          </div>
        }
      />

      {loading ? (
        <LoadingState label={t('realSensorMap.loading', 'Loading sensor locations…')} />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card hover={false} className="!p-0 overflow-hidden h-[580px]">
              <MapContainer center={center} zoom={devices.length > 0 ? 10 : 6} style={{ height: '100%', width: '100%' }} className="rounded-[var(--radius-xl)]">
                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {filtered.map(sensor => (
                  <React.Fragment key={sensor.id}>
                    <Marker
                      position={[sensor.lat, sensor.lng]}
                      icon={createIcon(getMarkerColor(sensor.pm25, sensor.source), sensor.source === 'device')}
                      eventHandlers={{ click: () => setSelectedSensor(sensor) }}
                    >
                      <Popup>
                        <div style={{ fontFamily: 'system-ui' }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{sensor.name}</div>
                          {sensor.pm25 > 0 && <div style={{ fontSize: 12 }}>PM2.5: <strong>{sensor.pm25.toFixed(1)}</strong> µg/m³</div>}
                          {sensor.status && <div style={{ fontSize: 11, color: sensor.status === 'online' ? '#10b981' : '#ef4444' }}>{t('realSensorMap.status', 'Status:')} {sensor.status}</div>}
                          {sensor.firmware && <div style={{ fontSize: 10, color: '#888' }}>{t('realSensorMap.fw', 'FW:')} {sensor.firmware}</div>}
                          <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>{t('realSensorMap.source', 'Source:')} {sensor.source}</div>
                          {sensor.sensors && Object.keys(sensor.sensors).length > 0 && (
                            <div style={{ fontSize: 10, borderTop: '1px solid #eee', paddingTop: 4, marginTop: 4 }}>
                              {Object.entries(sensor.sensors).slice(0, 5).map(([k, v]) => (
                                <div key={k}>{k}: <strong>{typeof v === 'number' ? v.toFixed(1) : v}</strong></div>
                              ))}
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                    <Circle
                      center={[sensor.lat, sensor.lng]}
                      radius={sensor.source === 'device' ? 12000 : 15000}
                      pathOptions={{
                        color: getMarkerColor(sensor.pm25, sensor.source),
                        fillColor: getMarkerColor(sensor.pm25, sensor.source),
                        fillOpacity: sensor.source === 'device' ? 0.2 : 0.12,
                        weight: sensor.source === 'device' ? 2 : 1,
                        dashArray: sensor.source === 'openaq' ? '5,5' : undefined,
                      }}
                    />
                  </React.Fragment>
                ))}
              </MapContainer>
            </Card>
          </div>

          <Card hover={false}>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>{t('realSensorMap.sensorsTitle', 'Sensors ({count})', { count: filtered.length })}</SectionTitle>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 mb-3 bg-[var(--surface)] p-1 rounded-[var(--radius-sm)]">
              {(['all', 'device', 'openaq'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                    filter === f ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {f === 'device' ? <Radio size={10} /> : f === 'openaq' ? <Globe size={10} /> : null}
                  {f === 'all' ? t('realSensorMap.filter.all', 'All') : f === 'device' ? t('realSensorMap.filter.devices', 'Devices') : 'OpenAQ'}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[440px] overflow-auto pr-2 rtl:pr-0 rtl:pl-2">
              {filtered.length === 0 && (
                <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                  {t('realSensorMap.noSensors', 'No sensors found.')} {filter === 'device' ? t('realSensorMap.deviceHint', 'Set device coordinates on the Map page first.') : ''}
                </div>
              )}
              {filtered.map(sensor => (
                <div
                  key={sensor.id}
                  onClick={() => setSelectedSensor(sensor)}
                  className={`p-3 rounded-[var(--radius-sm)] cursor-pointer transition-all flex justify-between items-center ${selectedSensor?.id === sensor.id ? 'bg-[var(--emerald-dim)] border border-[var(--emerald-glow)]' : 'hover:bg-[var(--surface-hover)]'}`}
                >
                  <div>
                    <div className="font-medium text-sm">{sensor.name}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      {sensor.source} • {sensor.lat.toFixed(3)}, {sensor.lng.toFixed(3)}
                    </div>
                    {sensor.sensors && (
                      <div className="text-[10px] text-[var(--text-disabled)] mt-0.5">
                        {Object.entries(sensor.sensors).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="mr-2 rtl:mr-0 rtl:ml-2">{k}: {typeof v === 'number' ? v.toFixed(1) : v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right rtl:text-left">
                    {sensor.pm25 > 0 && (
                      <div className="font-mono text-lg font-semibold" style={{ color: getMarkerColor(sensor.pm25, sensor.source) }}>
                        {sensor.pm25.toFixed(1)}
                      </div>
                    )}
                    <div className="text-[10px] text-[var(--text-tertiary)]">PM2.5</div>
                    {sensor.status && (
                      <Pill tone={sensor.status === 'online' ? 'emerald' : 'rose'} className="mt-0.5">
                        {sensor.status}
                      </Pill>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {selectedSensor && (
        <Card className="mt-6">
          <div className="font-semibold text-lg">{t('realSensorMap.detailTitle', '{name} — Detail', { name: selectedSensor.name })}</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 text-sm">
            <div>PM2.5: <span className="font-mono text-2xl">{selectedSensor.pm25 > 0 ? selectedSensor.pm25.toFixed(1) : 'N/A'}</span> µg/m³</div>
            <div>{t('realSensorMap.lat', 'Lat:')} <span className="font-mono">{selectedSensor.lat}</span></div>
            <div>{t('realSensorMap.lng', 'Lng:')} <span className="font-mono">{selectedSensor.lng}</span></div>
            <div>{t('realSensorMap.source', 'Source:')} <span className="text-[var(--emerald)]">{selectedSensor.source}</span></div>
            {selectedSensor.status && <div>{t('realSensorMap.status', 'Status:')} <Pill tone={selectedSensor.status === 'online' ? 'emerald' : 'rose'}>{selectedSensor.status}</Pill></div>}
          </div>
          {selectedSensor.sensors && Object.keys(selectedSensor.sensors).length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="section-label mb-2">{t('realSensorMap.allReadings', 'All Sensor Readings')}</div>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-3 text-xs">
                {Object.entries(selectedSensor.sensors).map(([k, v]) => (
                  <div key={k} className="p-2 rounded bg-white/[0.03]">
                    <div className="text-[var(--text-tertiary)]">{k}</div>
                    <div className="font-mono font-semibold text-[var(--text-primary)]">{typeof v === 'number' ? v.toFixed(1) : v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
