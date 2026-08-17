import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { PageHeader, Card, StatCard, SectionTitle, Btn, Pill } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { Globe, Satellite, MapPin, RefreshCw, Activity } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ChartGrid, ChartTooltip, CHART_TICK } from '../components/charts';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface VirtualSensor {
  id: string; name: string; latitude: number; longitude: number;
  source_type: string; parameters: string[];
  latest_values: Record<string, { value: number; unit: string }>;
  created_at: string; last_reading_at: string; active: boolean;
}

interface CoverageData {
  total_sensors: number; resolution: string; parameters: string[]; last_scan: string;
}

const SAT_PARAMS = [
  { key: 'no2', label: 'NO₂', unit: 'ppb', color: '#ef4444' },
  { key: 'o3', label: 'O₃', unit: 'ppb', color: '#f59e0b' },
  { key: 'so2', label: 'SO₂', unit: 'ppb', color: '#a855f7' },
  { key: 'co', label: 'CO', unit: 'ppb', color: '#3b82f6' },
  { key: 'ch4', label: 'CH₄', unit: 'ppb', color: '#22c55e' },
  { key: 'aerosol_index', label: 'Aerosol', unit: '', color: '#ec4899' },
];

const PIE_COLORS = ['#22c55e', '#06b6d4', '#a855f7', '#3b82f6', '#f59e0b'];

function MapBoundsUpdater({ sensors }: { sensors: VirtualSensor[] }) {
  const map = useMap();
  useEffect(() => {
    if (sensors.length > 0) {
      const bounds = L.latLngBounds(sensors.map(s => [Number(s.latitude), Number(s.longitude)]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [sensors, map]);
  return null;
}

export default function GlobalSensorsV3() {
  const { t } = useI18n();
  const [sensors, setSensors] = useState<VirtualSensor[]>([]);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dropPinMode, setDropPinMode] = useState(false);

  const paramLabel = useCallback((p: { key: string; label: string }) =>
    p.key === 'aerosol_index' ? t('globalSensors.param.aerosol', 'Aerosol') : p.label,
  [t]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [sensorList, cov] = await Promise.all([
        fetch('/api/v3/virtual-sensors').then(r => r.json()),
        fetch('/api/v3/virtual-sensors/coverage').then(r => r.json()),
      ]);
      setSensors(sensorList || []);
      setCoverage(cov || null);
    } catch {
      const devices = await apiClient.getDevices().catch(() => []);
      setSensors(devices.filter((d: any) => d.location_lat).map((d: any) => ({
        id: d.id, name: d.name || d.id, latitude: d.location_lat,
        longitude: d.location_lng, source_type: 'physical',
        parameters: ['pm25', 'pm10', 'no2'], latest_values: {},
        created_at: d.last_seen, last_reading_at: d.last_seen, active: true,
      })));
    }
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMapClick = async (e: any) => {
    if (!dropPinMode) return;
    const { lat, lng } = e.latlng;
    try {
      const sensor = await fetch('/api/v3/virtual-sensors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, name: `Satellite Pin @ ${lat.toFixed(4)}, ${lng.toFixed(4)}` }),
      }).then(r => r.json());
      setSensors(prev => [...prev, sensor]);
      setDropPinMode(false);
    } catch { /* ignore */ }
  };

  const handleScan = async () => {
    try {
      const result = await fetch('/api/v3/virtual-sensors/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounds: { north: 33, south: 29, east: 33, west: 29 }, interval: 360 }),
      }).then(r => r.json());
      if (result.sensors) setSensors(prev => [...prev, ...result.sensors]);
    } catch { /* ignore */ }
  };

  const getParamValue = (sensor: VirtualSensor, paramKey: string) => {
    return sensor.latest_values?.[paramKey]?.value;
  };

  const totalParams = sensors.reduce((acc, s) => {
    s.parameters?.forEach(p => { acc.add(p); });
    return acc;
  }, new Set<string>());

  const paramAvailData = useMemo(() => {
    const counts: Record<string, number> = {};
    sensors.forEach(s => {
      s.parameters?.forEach(p => {
        counts[p] = (counts[p] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([key, count]) => {
      const meta = SAT_PARAMS.find(p => p.key === key);
      return { name: meta ? paramLabel(meta) : key, count, color: meta?.color || '#64748b' };
    }).sort((a, b) => b.count - a.count);
  }, [sensors, paramLabel]);

  const sourceDist = useMemo(() => {
    const counts: Record<string, number> = {};
    sensors.forEach(s => {
      const type = s.source_type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [sensors]);

  const paramCoverage = useMemo(() => {
    if (sensors.length === 0) return [];
    return SAT_PARAMS.map(p => {
      const count = sensors.filter(s => s.parameters?.includes(p.key)).length;
      return { ...p, percent: Math.round((count / sensors.length) * 100), count };
    });
  }, [sensors]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('globalSensors.title', 'Global Satellite Sensors (v3)')}
        subtitle={coverage ? `${coverage.resolution} · ${t('globalSensors.parametersSuffix', '{count} parameters', { count: coverage.parameters.length })}` : t('globalSensors.subtitle.simulated', 'Sentinel-5P simulated data')}
        right={<div className="flex flex-wrap items-center gap-2">
          <Btn variant="ghost" size="sm" loading={refreshing} onClick={() => loadData(true)}>
            <RefreshCw size={14} />
          </Btn>
          <Btn variant={dropPinMode ? 'primary' : 'ghost'} size="sm" onClick={() => setDropPinMode(p => !p)}>
            <MapPin size={14} /> {dropPinMode ? t('globalSensors.cancelPin', 'Cancel Pin') : t('globalSensors.dropPin', 'Drop Pin')}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={handleScan}>
            {t('globalSensors.scanRegion', 'Scan Region')}
          </Btn>
        </div>}
      />

      <div className="h-[500px] rounded-2xl overflow-hidden border border-white/10">
        {loading ? (
          <div className="h-full flex items-center justify-center bg-slate-900 text-slate-400">
            {t('globalSensors.loading', 'Loading satellite sensor data...')}
          </div>
        ) : (
          <MapContainer center={[30.5, 31.5]} zoom={5} className="h-full w-full" scrollWheelZoom={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <MapBoundsUpdater sensors={sensors} />
            {dropPinMode && <MapClickHandler onClick={handleMapClick} />}
            {sensors.map(s => (
              <Marker key={s.id} position={[s.latitude, s.longitude]}
                icon={L.divIcon({
                  html: `<div style="background:#22c55e;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
                  className: '', iconSize: L.point(12, 12), iconAnchor: [6, 6],
                })}
              >
                <Popup>
                  <div style={{ minWidth: 180, fontSize: 12 }}>
                    <b>{s.name}</b><br />
                    <span style={{ color: '#22c55e' }}>{s.source_type}</span><br />
                    {SAT_PARAMS.filter(p => s.parameters?.includes(p.key)).map(p => (
                      <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 2 }}>
                        <span>{paramLabel(p)}:</span>
                        <span style={{ fontWeight: 600 }}>{getParamValue(s, p.key) ?? '—'} {p.unit}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 6, color: '#64748b', fontSize: 10 }}>
                      {new Date(s.last_reading_at).toLocaleString()}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {dropPinMode && (
        <div className="px-4 py-2 bg-[var(--emerald)]/10 text-[var(--emerald)] rounded-xl text-sm text-center border border-[var(--emerald)]/20">
          {t('globalSensors.dropPinHint', 'Click anywhere on the map to create a virtual satellite sensor at that location')}
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t('globalSensors.stat.virtualSensors', 'Virtual Sensors')} value={sensors.length} accent="emerald" icon={<Globe size={18} />} />
            <StatCard label={t('globalSensors.stat.resolution', 'Resolution')} value={coverage?.resolution?.split(' ')[0] || t('globalSensorsV3.na', 'N/A')} unit="deg" accent="cyan" icon={<Satellite size={18} />} />
            <StatCard label={t('globalSensors.stat.parameters', 'Parameters')} value={totalParams.size} accent="violet" icon={<Activity size={18} />} />
            <StatCard label={t('globalSensors.stat.lastScan', 'Last Scan')} value={coverage?.last_scan ? new Date(coverage.last_scan).toLocaleTimeString() : '—'} accent="blue" icon={<RefreshCw size={18} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <SectionTitle>{t('globalSensors.section.parameterAvailability', 'Parameter Availability')}</SectionTitle>
              {paramAvailData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={paramAvailData}>
                    <ChartGrid />
                    <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="count" name={t('globalSensors.chart.count', 'Count')} radius={[4, 4, 0, 0]}>
                      {paramAvailData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">{t('globalSensors.noParameterData', 'No parameter data')}</p>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle>{t('globalSensors.section.sourceDistribution', 'Source Distribution')}</SectionTitle>
              {sourceDist.length > 0 ? (
                <div className="flex items-center gap-4 mt-2">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={sourceDist} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={2}>
                        {sourceDist.map((_, i) => <Cell key={i} fill={_.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 text-xs">
                    {sourceDist.map(d => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-400 capitalize">{d.name}</span>
                        <span className="font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">{t('globalSensors.noSourceData', 'No source data')}</p>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle>{t('globalSensors.section.parameterCoverage', 'Parameter Coverage')}</SectionTitle>
              {paramCoverage.length > 0 && sensors.length > 0 ? (
                <div className="space-y-3 mt-1">
                  {paramCoverage.map(p => (
                    <div key={p.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium" style={{ color: p.color }}>{paramLabel(p)}</span>
                        <span className="text-slate-400">{p.count}/{sensors.length} · {p.percent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p.percent}%`, backgroundColor: p.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">{t('globalSensors.noCoverageData', 'No coverage data')}</p>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <SectionTitle>{t('globalSensors.section.satelliteVirtualSensors', 'Satellite Virtual Sensors')}</SectionTitle>
            <div className="mt-3 space-y-2">
              {sensors.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  {t('globalSensors.empty', 'No virtual sensors yet. Click "{dropPin}" to add one, or "{scanRegion}" to auto-generate a grid.', {
                    dropPin: t('globalSensors.dropPin', 'Drop Pin'),
                    scanRegion: t('globalSensors.scanRegion', 'Scan Region'),
                  })}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sensors.map(s => (
                    <div key={s.id}
                      className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium truncate">{s.name}</span>
                        <Pill tone="emerald">{s.source_type}</Pill>
                      </div>
                      <div className="text-xs text-slate-400">
                        {Number(s.latitude).toFixed(4)}, {Number(s.longitude).toFixed(4)}
                      </div>
                      <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                        {SAT_PARAMS.filter(p => s.parameters?.includes(p.key)).slice(0, 4).map(p => (
                          <div key={p.key} className="flex justify-between">
                            <span className="text-slate-500">{paramLabel(p)}</span>
                            <span className="font-mono" style={{ color: p.color }}>
                              {getParamValue(s, p.key) ?? '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MapClickHandler({ onClick }: { onClick: (e: any) => void }) {
  const map = useMap();
  useEffect(() => {
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [map, onClick]);
  return null;
}
