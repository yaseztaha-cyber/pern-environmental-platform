import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, SectionTitle, Btn } from '../components/ui';
import { Wind, Navigation, AlertTriangle, RefreshCw } from 'lucide-react';

interface TrajectoryPoint {
  hour: number; lat: number; lng: number; concentration: number;
}

interface TrajectoryData {
  origin: { lat: number; lng: number };
  pollutant: string;
  trajectory: TrajectoryPoint[];
}

interface WindForecast {
  latitude: number; longitude: number;
  hourly: { hour: number; wind_speed: number; wind_direction: number; temperature: number }[];
}

interface PlumeEvent {
  id: string; source_lat: number; source_lon: number;
  pollutant: string; severity: string;
  trajectory_path: TrajectoryPoint[];
  affected_regions: string[];
  detected_at: string;
}

function TrajectoryLayer({ data }: { data: TrajectoryData | null }) {
  const map = useMap();
  useEffect(() => {
    if (!data || !data.trajectory.length) return;
    const group = L.layerGroup();
    const coords = data.trajectory.map(p => [p.lat, p.lng] as [number, number]);

    L.polyline(coords, { color: '#ef4444', weight: 2, opacity: 0.6, dashArray: '5, 5' }).addTo(group);
    L.circleMarker([data.origin.lat, data.origin.lng], {
      radius: 8, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8,
    }).addTo(group).bindPopup(`Origin: ${data.pollutant}`);

    data.trajectory.filter(p => p.hour % 3 === 0).forEach(p => {
      const radius = Math.max(3, p.concentration / 10);
      L.circleMarker([p.lat, p.lng], {
        radius, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.3,
      }).addTo(group).bindPopup(`Hour ${p.hour}: ${p.concentration}% conc.`);
    });

    group.addTo(map);
    const bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [30, 30] });
    return () => { group.remove(); };
  }, [data, map]);
  return null;
}

function PlumeMarkers({ events }: { events: PlumeEvent[] }) {
  const map = useMap();
  useEffect(() => {
    if (!events.length) return;
    const group = L.layerGroup();
    events.forEach(ev => {
      L.circleMarker([ev.source_lat, ev.source_lon], {
        radius: 10, color: ev.severity === 'critical' ? '#ef4444' : '#f59e0b',
        fillColor: ev.severity === 'critical' ? '#ef4444' : '#f59e0b', fillOpacity: 0.4,
      }).addTo(group).bindPopup(`Plume: ${ev.pollutant} (${ev.severity})`);
    });
    group.addTo(map);
    return () => { group.remove(); };
  }, [events, map]);
  return null;
}

export default function PlumeMap() {
  const [trajectory, setTrajectory] = useState<TrajectoryData | null>(null);
  const [events, setEvents] = useState<PlumeEvent[]>([]);
  const [windData, setWindData] = useState<WindForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [originLat, setOriginLat] = useState('30.5');
  const [originLng, setOriginLng] = useState('31.5');
  const [pollutant, setPollutant] = useState('PM2.5');

  const loadData = useCallback(async (calcTrajectory = true) => {
    setLoading(true);
    try {
      const [wind, plumeEvents] = await Promise.all([
        fetch(`/api/v3/wind/forecast?lat=30.5&lng=31.5`).then(r => r.json()),
        fetch(`/api/v3/wind/plume-events`).then(r => r.json()),
      ]);
      setWindData(wind || null);
      setEvents(plumeEvents || []);
      if (calcTrajectory) {
        const traj = await fetch(`/api/v3/wind/trajectory?lat=${originLat}&lng=${originLng}&pollutant=${pollutant}&hours=24`)
          .then(r => r.json());
        setTrajectory(traj || null);
      }
    } catch { /* fallback */ }
    setLoading(false);
  }, [originLat, originLng, pollutant]);

  useEffect(() => { loadData(); }, []);

  const handleCalculate = () => loadData(true);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wind size={18} className="text-[var(--emerald)]" />
            Plume Tracker
          </h2>
          <p className="text-xs text-slate-500">
            Wind trajectory & pollution transport simulation
          </p>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => loadData(false)}>
          <RefreshCw size={14} />
        </Btn>
      </div>

      <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Latitude</label>
          <input value={originLat} onChange={e => setOriginLat(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-sm w-24" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Longitude</label>
          <input value={originLng} onChange={e => setOriginLng(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-sm w-24" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Pollutant</label>
          <select value={pollutant} onChange={e => setPollutant(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-sm">
            <option>PM2.5</option><option>PM10</option><option>NO2</option><option>SO2</option>
          </select>
        </div>
        <Btn variant="primary" size="sm" onClick={handleCalculate}>
          <Navigation size={14} /> Calculate Trajectory
        </Btn>
      </div>

      <div className="h-[450px] rounded-2xl overflow-hidden border border-white/10">
        {loading ? (
          <div className="h-full flex items-center justify-center bg-slate-900 text-slate-400">Loading plume data...</div>
        ) : (
          <MapContainer center={[30.5, 31.5]} zoom={6} className="h-full w-full" scrollWheelZoom={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <TrajectoryLayer data={trajectory} />
            <PlumeMarkers events={events} />
          </MapContainer>
        )}
      </div>

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <SectionTitle>Wind Forecast</SectionTitle>
            {windData ? (
              <div className="mt-2 space-y-1 text-xs text-slate-400 max-h-48 overflow-y-auto">
                {windData.hourly.slice(0, 12).map(h => (
                  <div key={h.hour} className="flex justify-between py-1 border-b border-white/5">
                    <span>+{h.hour}h</span>
                    <span>{h.wind_speed} km/h</span>
                    <span>{h.wind_direction}°</span>
                    <span>{h.temperature}°C</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 mt-2">No forecast data</p>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle>Active Plume Events</SectionTitle>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">No active plumes</p>
            ) : (
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {events.map(ev => (
                  <div key={ev.id} className="p-2 rounded-lg bg-white/5 border border-white/10 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={12} className={ev.severity === 'critical' ? 'text-red-400' : 'text-amber-400'} />
                      <span className="font-medium">{ev.pollutant}</span>
                      <span className="text-slate-500">{ev.severity}</span>
                    </div>
                    <div className="text-slate-500 mt-1">
                      {Number(ev.source_lat).toFixed(2)}°, {Number(ev.source_lon).toFixed(2)}° · {ev.affected_regions?.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle>Trajectory Stats</SectionTitle>
            {trajectory ? (
              <div className="mt-2 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Origin</span><span>{Number(trajectory.origin.lat).toFixed(2)}°, {Number(trajectory.origin.lng).toFixed(2)}°</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Pollutant</span><span>{trajectory.pollutant}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Trajectory Points</span><span>{trajectory.trajectory.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Max Concentration</span><span>{Math.max(...trajectory.trajectory.map(p => p.concentration))}%</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Affected Area Radius</span><span>~{Math.round(Math.max(...trajectory.trajectory.map(p => Math.abs(p.lat - trajectory.origin.lat))) * 111)} km</span></div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 mt-2">Calculate trajectory</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
