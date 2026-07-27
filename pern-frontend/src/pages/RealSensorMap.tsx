import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { apiClient } from '../lib/api-client';
import { fetchOpenAQData } from '../lib/openaq-service';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface SensorLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  pm25: number;
  source: 'device' | 'openaq';
  status?: string;
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
  const [sensors, setSensors] = useState<SensorLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorLocation | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const allSensors: SensorLocation[] = [];

    try {
      const devices = await apiClient.getDeviceLocations();
      for (const d of devices) {
        allSensors.push({
          id: d.id,
          name: d.name || d.id,
          lat: d.lat,
          lng: d.lng,
          pm25: 0,
          source: 'device',
          status: d.status,
        });
      }
    } catch { /* skip */ }

    for (const city of CITIES) {
      try {
        const data = await fetchOpenAQData(city);
        const coords = cityCoords[city];
        if (coords) {
          allSensors.push({
            id: `openaq-${city}`,
            name: `${city} (OpenAQ)`,
            lat: coords.lat,
            lng: coords.lng,
            pm25: data?.pm25 || 0,
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

  const getMarkerColor = (pm25: number) => {
    if (pm25 <= 12) return '#10b981';
    if (pm25 <= 25) return '#22c55e';
    if (pm25 <= 35) return '#eab308';
    return '#f97316';
  };

  const createIcon = (color: string) => L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-semibold tracking-tighter">Real Sensor Map</h1>
          <p className="text-emerald-400">Device locations + OpenAQ city data • Interactive Leaflet map</p>
        </div>
        <button onClick={() => loadData(true)} disabled={refreshing} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-2xl text-sm">
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-slate-400">Loading sensor locations...</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="card p-0 overflow-hidden h-[580px]">
              <MapContainer center={[28.5, 31.5]} zoom={6} style={{ height: '100%', width: '100%' }} className="rounded-3xl">
                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {sensors.map(sensor => (
                  <React.Fragment key={sensor.id}>
                    <Marker
                      position={[sensor.lat, sensor.lng]}
                      icon={createIcon(getMarkerColor(sensor.pm25))}
                      eventHandlers={{ click: () => setSelectedSensor(sensor) }}
                    >
                      <Popup>
                        <div className="font-semibold">{sensor.name}</div>
                        {sensor.pm25 > 0 && <div>PM2.5: {sensor.pm25} µg/m³</div>}
                        {sensor.status && <div>Status: {sensor.status}</div>}
                        <div className="text-xs text-gray-500 mt-1">Source: {sensor.source}</div>
                      </Popup>
                    </Marker>
                    {sensor.pm25 > 0 && (
                      <Circle
                        center={[sensor.lat, sensor.lng]}
                        radius={15000}
                        pathOptions={{ color: getMarkerColor(sensor.pm25), fillColor: getMarkerColor(sensor.pm25), fillOpacity: 0.15 }}
                      />
                    )}
                  </React.Fragment>
                ))}
              </MapContainer>
            </div>
          </div>

          <div className="card">
            <div className="font-semibold mb-4">Sensor Locations ({sensors.length})</div>
            <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
              {sensors.map(sensor => (
                <div
                  key={sensor.id}
                  onClick={() => setSelectedSensor(sensor)}
                  className={`p-3 rounded-2xl cursor-pointer transition-all flex justify-between items-center ${selectedSensor?.id === sensor.id ? 'bg-emerald-500/10 border border-emerald-500/30' : 'hover:bg-white/5'}`}
                >
                  <div>
                    <div className="font-medium text-sm">{sensor.name}</div>
                    <div className="text-[10px] text-slate-400">{sensor.source} • {sensor.lat.toFixed(2)}, {sensor.lng.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    {sensor.pm25 > 0 && (
                      <div className="font-mono text-lg font-semibold" style={{ color: getMarkerColor(sensor.pm25) }}>
                        {sensor.pm25}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400">PM2.5</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedSensor && (
        <div className="mt-6 card">
          <div className="font-semibold text-lg">{selectedSensor.name} — Detail</div>
          <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
            <div>PM2.5: <span className="font-mono text-2xl">{selectedSensor.pm25 || 'N/A'}</span> µg/m³</div>
            <div>Lat: <span className="font-mono">{selectedSensor.lat}</span></div>
            <div>Lng: <span className="font-mono">{selectedSensor.lng}</span></div>
            <div>Source: <span className="text-emerald-400">{selectedSensor.source}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
