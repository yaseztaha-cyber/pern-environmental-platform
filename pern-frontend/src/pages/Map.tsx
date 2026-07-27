import { useState, useEffect } from 'react';
import { useI18n } from '../lib/i18n';
import { apiClient } from '../lib/api-client';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { PageHeader, Card, Pill, SectionTitle } from '../components/ui';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface DeviceLocation {
  id: string;
  name: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  description: string;
  firmware: string;
  tags: string[];
}

const FALLBACK_LOCATIONS: DeviceLocation[] = [
  { id: 'giza', name: 'Giza', type: 'fallback', status: 'info', lat: 30.01, lng: 31.21, description: 'Fallback location', firmware: '', tags: [] },
  { id: 'cairo', name: 'Cairo', type: 'fallback', status: 'info', lat: 30.04, lng: 31.24, description: 'Fallback location', firmware: '', tags: [] },
  { id: 'alex', name: 'Alexandria', type: 'fallback', status: 'info', lat: 31.20, lng: 29.92, description: 'Fallback location', firmware: '', tags: [] },
  { id: 'aswan', name: 'Aswan', type: 'fallback', status: 'info', lat: 24.09, lng: 32.90, description: 'Fallback location', firmware: '', tags: [] },
  { id: 'luxor', name: 'Luxor', type: 'fallback', status: 'info', lat: 25.70, lng: 32.64, description: 'Fallback location', firmware: '', tags: [] },
];

function getStatusColor(status: string): string {
  switch (status) {
    case 'online': return 'var(--emerald)';
    case 'warning': return 'var(--amber)';
    case 'error': return 'var(--rose)';
    case 'offline': return 'var(--rose)';
    default: return 'var(--text-secondary)';
  }
}

function getStatusPill(status: string): 'emerald' | 'amber' | 'rose' | 'slate' {
  switch (status) {
    case 'online': return 'emerald';
    case 'warning': return 'amber';
    case 'error': return 'rose';
    case 'offline': return 'rose';
    default: return 'slate';
  }
}

export default function MapPage() {
  const { t } = useI18n();
  const [locations, setLocations] = useState<DeviceLocation[]>([]);
  const [selected, setSelected] = useState<DeviceLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getDeviceLocations().then(raw => {
      const mapped = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        id: r.id,
        name: r.name || r.id,
        type: r.type || 'unknown',
        status: r.status || 'unknown',
        lat: Number(r.lat),
        lng: Number(r.lng),
        description: r.description || '',
        firmware: r.firmware || '',
        tags: r.tags || [],
      }));
      setLocations(mapped.length > 0 ? mapped : FALLBACK_LOCATIONS);
    }).catch(() => setLocations(FALLBACK_LOCATIONS)).finally(() => setLoading(false));
  }, []);

  const onlineCount = locations.filter(l => l.status === 'online').length;

  return (
    <div>
      <PageHeader
        title={t('map.title')}
        subtitle={t('map.subtitle')}
        right={loading ? <Pill tone="slate">Loading...</Pill> : <Pill tone="emerald">{onlineCount} online</Pill>}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card hover={false} className="!p-0 overflow-hidden h-[580px]">
            <MapContainer
              center={[28.5, 31.5]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              className="rounded-[var(--radius-xl)]"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {locations.map((loc) => (
                <div key={loc.id}>
                  <Marker
                    position={[loc.lat, loc.lng]}
                    eventHandlers={{ click: () => setSelected(loc) }}
                  >
                    <Popup>
                      <div className="font-semibold">{loc.name}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{loc.type}</div>
                      {loc.description && <div className="text-xs mt-1">{loc.description}</div>}
                      <div className="text-xs mt-1" style={{ color: getStatusColor(loc.status) }}>{loc.status}</div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[loc.lat, loc.lng]}
                    radius={18000}
                    pathOptions={{
                      color: getStatusColor(loc.status),
                      fillColor: getStatusColor(loc.status),
                      fillOpacity: 0.15,
                    }}
                  />
                </div>
              ))}
            </MapContainer>
          </Card>
        </div>

        <Card hover={false}>
          <SectionTitle>{t('map.section.governoratesOverview')}</SectionTitle>
          <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
            {locations.map((loc) => (
              <div
                key={loc.id}
                onClick={() => setSelected(loc)}
                className={`p-3 rounded-[var(--radius-sm)] cursor-pointer transition-all flex justify-between items-center ${selected?.id === loc.id ? 'bg-[var(--emerald-dim)] border border-[var(--emerald-glow)]' : 'hover:bg-[var(--surface-hover)]'}`}
              >
                <div>
                  <div className="font-medium">{loc.name}</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{loc.type}</div>
                </div>
                <div className="text-right">
                  <div className="w-2 h-2 rounded-full" style={{ background: getStatusColor(loc.status) }} />
                  <Pill tone={getStatusPill(loc.status)}>{loc.status}</Pill>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {selected && (
        <Card className="mt-6">
          <div className="font-semibold text-lg">{selected.name}{t('map.detailViewSuffix')}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
            <div>Type: <span className="font-semibold">{selected.type}</span></div>
            <div>{t('map.label.status')}: <Pill tone={getStatusPill(selected.status)}>{selected.status}</Pill></div>
            <div>Lat: <span className="font-mono">{selected.lat}</span></div>
            <div>Lng: <span className="font-mono">{selected.lng}</span></div>
            {selected.firmware && <div>Firmware: <span className="font-mono">{selected.firmware}</span></div>}
            {selected.tags.length > 0 && <div>Tags: <span>{selected.tags.join(', ')}</span></div>}
          </div>
        </Card>
      )}
    </div>
  );
}
