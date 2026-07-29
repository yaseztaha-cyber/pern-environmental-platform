import { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ResponsiveTable } from './ResponsiveTable';
import { Card, StatCard, Pill, SectionTitle, Btn } from './ui';
import { Activity, Thermometer, Wind, CloudRain, Radio, Droplets, RefreshCw } from 'lucide-react';
import { fetchSensorCommunityData, type SensorCommunityReading } from '../lib/sensor-community-service';
import { fetchOpenAQData } from '../lib/openaq-service';
import { apiClient } from '../lib/api-client';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface SensorPoint {
  id: string; name: string; lat: number; lng: number;
  source: 'device' | 'community' | 'openaq';
  pm25: number | null; pm10: number | null; no2: number | null;
  temperature: number | null; humidity: number | null;
  lastSeen: string | null;
}

interface WindPoint {
  lat: number; lng: number; speed: number; direction: number;
}

const PM25_COLOR = (v: number | null) => v === null ? '#6b7280' : v > 100 ? '#ef4444' : v > 50 ? '#f59e0b' : '#22c55e';
const PIE_COLORS = ['#22c55e', '#f59e0b', '#6b7280'];
const SOURCE_TONES: Record<string, 'emerald' | 'cyan' | 'slate'> = { device: 'emerald', community: 'cyan', openaq: 'slate' };
const SOURCE_LABELS: Record<string, string> = { device: 'Device', community: 'Sensor.Community', openaq: 'OpenAQ' };

const CITIES = [
  { name: 'Cairo', lat: 30.04, lng: 31.24 },
  { name: 'Alexandria', lat: 31.20, lng: 29.92 },
  { name: 'Giza', lat: 30.01, lng: 31.21 },
  { name: 'London', lat: 51.51, lng: -0.13 },
  { name: 'Paris', lat: 48.86, lng: 2.35 },
  { name: 'Berlin', lat: 52.52, lng: 13.41 },
];

function WindArrows({ data, visible }: { data: WindPoint[]; visible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!visible || !data.length) return;
    const group = L.layerGroup();
    data.forEach(p => {
      const rad = p.direction * Math.PI / 180;
      const len = Math.min(p.speed * 3000, 30000);
      const endLat = p.lat + (len / 111000) * Math.cos(rad);
      const endLng = p.lng + (len / (111000 * Math.cos(p.lat * Math.PI / 180))) * Math.sin(rad);
      L.polyline([[p.lat, p.lng], [endLat, endLng]], {
        color: '#34d399', weight: 1.5, opacity: 0.6
      }).addTo(group);
      L.circleMarker([endLat, endLng], {
        radius: 3, color: '#34d399', fillColor: '#34d399', fillOpacity: 0.8
      }).addTo(group);
    });
    group.addTo(map);
    return () => { group.remove(); };
  }, [data, visible, map]);
  return null;
}

function SensorCluster({ sensors }: { sensors: SensorPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const mcg = L.markerClusterGroup({
      chunkedLoading: true, maxClusterRadius: 60,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        const color = count > 10 ? '#ef4444' : count > 5 ? '#f59e0b' : '#22c55e';
        return L.divIcon({
          html: `<div style="background:${color};color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid rgba(255,255,255,0.3)">${count}</div>`,
          className: '', iconSize: L.point(40, 40),
        });
      },
    });
    sensors.forEach(s => {
      const color = PM25_COLOR(s.pm25);
      const borderColor = s.source === 'device' ? '#3b82f6' : s.source === 'openaq' ? '#a78bfa' : '#22c55e';
      const icon = L.divIcon({
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid ${borderColor};box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
        className: '', iconSize: L.point(14, 14), iconAnchor: [7, 7],
      });
      const m = L.marker([s.lat, s.lng], { icon });
      m.bindPopup(`<div><b>${s.name}</b><br/>PM2.5: ${s.pm25 ?? '-'} µg/m³<br/>Source: ${s.source}</div>`);
      mcg.addLayer(m);
    });
    map.addLayer(mcg);
    return () => { map.removeLayer(mcg); };
  }, [sensors, map]);
  return null;
}

function HeatLayer({ sensors }: { sensors: SensorPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup();
    sensors.forEach(s => {
      if (s.pm25 != null) {
        const r = Math.min(s.pm25 * 150, 500000);
        L.circle([s.lat, s.lng], { radius: r, color: PM25_COLOR(s.pm25), fillColor: PM25_COLOR(s.pm25), fillOpacity: 0.12 }).addTo(group);
      }
    });
    group.addTo(map);
    return () => { group.remove(); };
  }, [sensors, map]);
  return null;
}

export default function GlobalSensorMap() {
  const [sensors, setSensors] = useState<SensorPoint[]>([]);
  const [wind, setWind] = useState<WindPoint[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [showWind, setShowWind] = useState(false);
  const [showHeat, setShowHeat] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const all: SensorPoint[] = [];

    // 1. Fetch own devices from backend (if available)
    try {
      const devices = await apiClient.getDevices();
      for (const d of devices) {
        if (d.location_lat && d.location_lng) {
          all.push({
            id: d.id || `dev-${all.length}`,
            name: d.name || d.id || `Device ${all.length + 1}`,
            lat: Number(d.location_lat),
            lng: Number(d.location_lng),
            source: 'device',
            pm25: d.pm25 ?? null,
            pm10: d.pm10 ?? null,
            no2: d.no2 ?? null,
            temperature: d.temperature ?? null,
            humidity: d.humidity ?? null,
            lastSeen: d.last_seen || null,
          });
        }
      }
    } catch { /* no own devices */ }

    // 2. Fetch Sensor.Community data (open citizen sensors)
    try {
      const community = await fetchSensorCommunityData('DE');
      for (const r of community) {
        if (r.latitude && r.longitude) {
          all.push({
            id: `sc-${all.length}`,
            name: r.location || `Community Sensor ${all.length + 1}`,
            lat: r.latitude,
            lng: r.longitude,
            source: 'community',
            pm25: r.pm25,
            pm10: r.pm10,
            no2: null,
            temperature: r.temperature,
            humidity: r.humidity,
            lastSeen: r.timestamp,
          });
        }
      }
    } catch { /* community unavailable */ }

    // 3. Fetch OpenAQ city-level air quality
    for (const city of CITIES) {
      try {
        const data = await fetchOpenAQData(city.name);
        if (data && (data.pm25 != null || data.no2 != null)) {
          all.push({
            id: `oa-${city.name}`,
            name: `${city.name} (OpenAQ)`,
            lat: city.lat,
            lng: city.lng,
            source: 'openaq',
            pm25: data.pm25,
            pm10: null,
            no2: data.no2,
            temperature: null,
            humidity: null,
            lastSeen: data.timestamp,
          });
        }
      } catch { /* skip */ }
    }

    setSensors(all);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch wind from Open-Meteo (real, free, no key needed)
  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=30.5&longitude=31.5&hourly=wind_speed_10m,wind_direction_10m&forecast_days=1')
      .then(r => r.json())
      .then((d: any) => {
        if (d?.hourly) setWind(d.hourly.time.map((_: string, i: number) => ({
          lat: 30.5 + (Math.random() - 0.5) * 1.5,
          lng: 31.5 + (Math.random() - 0.5) * 1.5,
          speed: d.hourly.wind_speed_10m[i] || 5,
          direction: d.hourly.wind_direction_10m[i] || 180,
        })));
      })
      .catch(() => {});
  }, []);

  const filtered = filter === 'all' ? sensors : sensors.filter(s => s.source === filter);
  const counts = {
    all: sensors.length,
    device: sensors.filter(s => s.source === 'device').length,
    community: sensors.filter(s => s.source === 'community').length,
    openaq: sensors.filter(s => s.source === 'openaq').length,
  };

  const sensorsWithPM25 = sensors.filter(s => s.pm25 != null);

  const avgPM25 = useMemo(() => {
    const vals = sensorsWithPM25.map(s => s.pm25!);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [sensorsWithPM25]);

  const avgPM10 = useMemo(() => {
    const vals = sensors.filter(s => s.pm10 != null).map(s => s.pm10!);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [sensors]);

  const avgNO2 = useMemo(() => {
    const vals = sensors.filter(s => s.no2 != null).map(s => s.no2!);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [sensors]);

  const avgTemp = useMemo(() => {
    const vals = sensors.filter(s => s.temperature != null).map(s => s.temperature!);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  }, [sensors]);

  const avgHumidity = useMemo(() => {
    const vals = sensors.filter(s => s.humidity != null).map(s => s.humidity!);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }, [sensors]);

  const aqiDist = useMemo(() => {
    const good = sensorsWithPM25.filter(s => s.pm25! <= 50).length;
    const moderate = sensorsWithPM25.filter(s => s.pm25! > 50 && s.pm25! <= 100).length;
    const unhealthy = sensorsWithPM25.filter(s => s.pm25! > 100).length;
    return [
      { name: 'Good (0-50)', value: good, fill: '#22c55e' },
      { name: 'Moderate (51-100)', value: moderate, fill: '#f59e0b' },
      { name: 'Unhealthy (>100)', value: unhealthy, fill: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [sensorsWithPM25]);

  const sourceDist = useMemo(() =>
    ['device', 'community', 'openaq'].filter(k => counts[k] > 0).map((k, i) => ({
      name: SOURCE_LABELS[k], value: counts[k], color: PIE_COLORS[i],
    })),
  [counts]);

  const tableData = useMemo(() => filtered.map(s => ({
    ...s,
    pm25Display: s.pm25 != null ? `${s.pm25}` : '—',
    pm10Display: s.pm10 != null ? `${s.pm10}` : '—',
    no2Display: s.no2 != null ? `${s.no2}` : '—',
    tempDisplay: s.temperature != null ? `${s.temperature}°C` : '—',
    humidityDisplay: s.humidity != null ? `${s.humidity}%` : '—',
    lastSeenDisplay: s.lastSeen ? new Date(s.lastSeen).toLocaleString() : '—',
  })), [filtered]);

  const sourceDistTotal = sensors.length || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Map</h2>
          <p className="text-xs text-slate-500">{sensors.length} sensors · {wind.length} wind data points</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="ghost" size="sm" loading={refreshing} onClick={() => loadData(true)}>
            <RefreshCw size={14} />
          </Btn>
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} className="accent-emerald-500" />
            Heat
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={showWind} onChange={e => setShowWind(e.target.checked)} className="accent-emerald-500" />
            Wind
          </label>
          <div className="w-px h-5 bg-white/10 mx-1" />
          {(['all','device','community','openaq'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition ${
                f === filter ? 'bg-emerald-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}>
              {f === 'device' ? 'Devices' : f === 'community' ? 'Community' : f === 'openaq' ? 'OpenAQ' : 'All'} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <div className="h-[600px] rounded-2xl overflow-hidden border border-white/10">
        {loading ? (
          <div className="h-full flex items-center justify-center bg-slate-900 text-slate-400">Loading real sensor data from open sources...</div>
        ) : (
          <MapContainer center={[30.5, 31.5]} zoom={5} className="h-full w-full" scrollWheelZoom={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {showHeat && <HeatLayer sensors={filtered} />}
            {showWind && <WindArrows data={wind} visible={showWind} />}
            <SensorCluster sensors={filtered} />
          </MapContainer>
        )}
      </div>

      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Sources" value={sensors.length} accent="emerald" icon={<Radio size={18} />} />
            <StatCard label="Avg PM2.5" value={avgPM25} unit="µg/m³" accent="amber" icon={<Wind size={18} />} />
            <StatCard label="Avg PM10" value={avgPM10} unit="µg/m³" accent="violet" icon={<CloudRain size={18} />} />
            <StatCard label="Avg NO₂" value={avgNO2} unit="ppb" accent="rose" icon={<Activity size={18} />} />
            <StatCard label="Avg Temp" value={avgTemp} unit="°C" accent="rose" icon={<Thermometer size={18} />} />
            <StatCard label="Avg Humidity" value={avgHumidity} unit="%" accent="blue" icon={<Droplets size={18} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 lg:col-span-2">
              <SectionTitle>Sensor Readings</SectionTitle>
              <div className="text-xs text-slate-500 mb-3">
                Data sources: <Pill tone="emerald">Own Devices</Pill> <Pill tone="cyan">Sensor.Community</Pill> <Pill tone="slate">OpenAQ</Pill>
              </div>
              <ResponsiveTable
                columns={[
                  { key: 'name', header: 'Sensor', render: (r: any) => <span className="font-medium text-sm">{r.name}</span> },
                  { key: 'source', header: 'Source', render: (r: any) => <Pill tone={SOURCE_TONES[r.source] || 'slate'}>{SOURCE_LABELS[r.source]}</Pill> },
                  { key: 'pm25Display', header: 'PM2.5', render: (r: any) => <span style={{ color: PM25_COLOR(r.pm25) }} className="font-mono">{r.pm25Display}</span> },
                  { key: 'pm10Display', header: 'PM10', className: 'hidden md:table-cell', render: (r: any) => <span className="font-mono">{r.pm10Display}</span> },
                  { key: 'no2Display', header: 'NO₂', className: 'hidden lg:table-cell', render: (r: any) => <span className="font-mono">{r.no2Display}</span> },
                  { key: 'tempDisplay', header: 'Temp', className: 'hidden lg:table-cell' },
                  { key: 'humidityDisplay', header: 'Humidity', className: 'hidden lg:table-cell' },
                  { key: 'lastSeenDisplay', header: 'Last Seen', className: 'hidden xl:table-cell text-xs text-slate-400' },
                ]}
                data={tableData}
                renderCard={(r: any) => (
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{r.name}</span>
                      <Pill tone={SOURCE_TONES[r.source]}>{SOURCE_LABELS[r.source]}</Pill>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span>PM2.5: <span className="font-mono" style={{ color: PM25_COLOR(r.pm25) }}>{r.pm25Display}</span></span>
                      <span>PM10: <span className="font-mono">{r.pm10Display}</span></span>
                      <span>NO₂: <span className="font-mono">{r.no2Display}</span></span>
                      <span>Temp: {r.tempDisplay}</span>
                      <span>Humidity: {r.humidityDisplay}</span>
                      <span className="text-slate-500">{r.lastSeenDisplay}</span>
                    </div>
                  </div>
                )}
              />
            </Card>

            <div className="space-y-4">
              <Card className="p-4">
                <SectionTitle>AQI Distribution (PM2.5)</SectionTitle>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={aqiDist.length ? aqiDist : [{ name: 'No data', value: 1, fill: '#374151' }]}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-4">
                <SectionTitle>Data Sources</SectionTitle>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={sourceDist} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={2}>
                        {sourceDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 text-xs">
                    {sourceDist.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                        <span className="text-slate-400">{s.name}</span>
                        <span className="font-medium">{s.value}</span>
                        <span className="text-slate-500">({Math.round((s.value / sourceDistTotal) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
