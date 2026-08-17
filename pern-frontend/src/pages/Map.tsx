import { useState, useEffect, useCallback, Fragment } from 'react';
import { useI18n } from '../lib/i18n';
import { apiClient } from '../lib/api-client';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { PageHeader, Card, Pill, SectionTitle, Btn, Toggle } from '../components/ui';
import { showToast } from '../components/Toast';
import { MapPin, Crosshair, AlertTriangle, Layers } from 'lucide-react';
import type { ComplianceTrend } from '../lib/types';

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
  lat: number | null;
  lng: number | null;
  description: string;
  firmware: string;
  tags: string[];
  hasCoordinates: boolean;
  latestReading: Record<string, number> | null;
}

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

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapPage() {
  const { t } = useI18n();
  const [locations, setLocations] = useState<DeviceLocation[]>([]);
  const [selected, setSelected] = useState<DeviceLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingLocation, setSettingLocation] = useState<string | null>(null);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showCompliance, setShowCompliance] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [complianceTrends, setComplianceTrends] = useState<ComplianceTrend[]>([]);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await apiClient.getDeviceLocations();
      const mapped: DeviceLocation[] = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        id: r.id,
        name: r.name || r.id,
        type: r.type || 'unknown',
        status: r.status || 'unknown',
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        description: r.description || '',
        firmware: r.firmware || '',
        tags: r.tags || [],
        hasCoordinates: r.hasCoordinates || false,
        latestReading: r.latestReading || null,
      }));
      setLocations(mapped);
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  useEffect(() => {
    apiClient.get('/v3/compliance/trends').then((r: any) => {
      if (Array.isArray(r)) setComplianceTrends(r);
    }).catch(() => {});
  }, []);

  const onlineCount = locations.filter(l => l.status === 'online').length;
  const locatedCount = locations.filter(l => l.hasCoordinates).length;
  const unlocated = locations.filter(l => !l.hasCoordinates);

  const handleSetLocation = async (deviceId: string) => {
    if (!pickedCoords) return;
    try {
      await apiClient.saveDeviceLocation(deviceId, pickedCoords.lat, pickedCoords.lng);
      setSettingLocation(null);
      setPickedCoords(null);
      await loadLocations();
    } catch (err) {
      console.error('Failed to save location:', err);
      showToast(t('map.saveLocationFailed', 'Failed to save device location.'), 'error');
    }
  };

  // Calculate map center based on located devices
  const locatedDevices = locations.filter(l => l.hasCoordinates && l.lat != null && l.lng != null);
  const center: [number, number] = locatedDevices.length > 0
    ? [locatedDevices.reduce((s, d) => s + d.lat!, 0) / locatedDevices.length, locatedDevices.reduce((s, d) => s + d.lng!, 0) / locatedDevices.length]
    : [30.04, 31.24]; // Default: Cairo

  return (
    <div>
      <PageHeader
        title={t('map.title', 'Environmental Map')}
        subtitle={t('map.subtitleStats', '{located} located · {total} total devices', { located: locatedCount, total: locations.length })}
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-2 text-xs text-[var(--text-tertiary)]">
              <Layers size={12} />
              <Toggle checked={showCompliance} onChange={setShowCompliance} label={t('map.complianceToggle', 'Compliance')} />
              <Toggle checked={showHeat} onChange={setShowHeat} label={t('map.heatToggle', 'Heat')} />
            </div>
            {loading ? <Pill tone="slate">{t('common.loading', 'Loading...')}</Pill> : <Pill tone="emerald">{t('map.onlineCount', '{count} online', { count: onlineCount })}</Pill>}
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card hover={false} className="!p-0 overflow-hidden h-[580px]">
            {locatedDevices.length > 0 ? (
              <MapContainer
                center={center}
                zoom={locatedDevices.length === 1 ? 12 : 6}
                style={{ height: '100%', width: '100%' }}
                className="rounded-[var(--radius-xl)]"
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {settingLocation && (
                  <MapClickHandler onPick={(lat, lng) => setPickedCoords({ lat, lng })} />
                )}
                {locatedDevices.map((loc) => (
                  <Fragment key={loc.id}>
                    <Marker
                      position={[loc.lat!, loc.lng!]}
                      eventHandlers={{ click: () => setSelected(loc) }}
                    >
                      <Popup>
                        <div style={{ fontFamily: 'system-ui' }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{loc.name}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>{loc.type} • {loc.firmware || t('map.na', 'N/A')}</div>
                          <div style={{ fontSize: 11, marginTop: 4, color: loc.status === 'online' ? '#10b981' : '#ef4444' }}>
                            {loc.status}
                          </div>
                          {loc.latestReading && (
                            <div style={{ fontSize: 11, marginTop: 4, borderTop: '1px solid #eee', paddingTop: 4 }}>
                              {Object.entries(loc.latestReading).slice(0, 5).map(([k, v]) => (
                                <div key={k}>{k}: <strong>{typeof v === 'number' ? v.toFixed(1) : v}</strong></div>
                              ))}
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                    <Circle
                      center={[loc.lat!, loc.lng!]}
                      radius={15000}
                      pathOptions={{
                        color: getStatusColor(loc.status),
                        fillColor: getStatusColor(loc.status),
                        fillOpacity: 0.15,
                      }}
                    />
                  </Fragment>
                ))}
                {/* Compliance overlay (example circles) */}
                {showCompliance && locations.filter(l => l.hasCoordinates).map(loc => (
                  <Circle
                    key={`comp-${loc.id}`}
                    center={[loc.lat!, loc.lng!]}
                    radius={25000}
                    pathOptions={{
                      color: loc.status === 'online' ? '#10b981' : '#ef4444',
                      fillColor: loc.status === 'online' ? '#10b981' : '#ef4444',
                      fillOpacity: 0.08,
                      weight: 1,
                      dashArray: '4 4',
                    }}
                  />
                ))}
                {/* Heat overlay using PM2.5 values */}
                {showHeat && locations.filter(l => l.hasCoordinates && l.latestReading?.pm25).map(loc => {
                  const pm25 = loc.latestReading!.pm25 as number;
                  const radius = 15000 + pm25 * 300;
                  const opacity = Math.min(0.3, pm25 / 200);
                  return (
                    <Circle
                      key={`heat-${loc.id}`}
                      center={[loc.lat!, loc.lng!]}
                      radius={Math.min(60000, radius)}
                      pathOptions={{
                        color: pm25 > 35 ? '#ef4444' : pm25 > 15 ? '#f59e0b' : '#10b981',
                        fillColor: pm25 > 35 ? '#ef4444' : pm25 > 15 ? '#f59e0b' : '#10b981',
                        fillOpacity: opacity,
                        weight: 0,
                      }}
                    />
                  );
                })}
                {settingLocation && pickedCoords && (
                  <Marker position={[pickedCoords.lat, pickedCoords.lng]} />
                )}
              </MapContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] gap-3">
                <MapPin size={32} className="opacity-40" />
                <div className="text-sm font-medium">{t('map.noCoordinates', 'No devices with coordinates yet')}</div>
                <div className="text-xs">{t('map.noCoordinatesHint', 'Set a device location from the sidebar to place it on the map')}</div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
        {complianceTrends.length > 0 && (
          <Card hover={false}>
            <SectionTitle>{t('map.complianceOverview', 'Compliance Overview')}</SectionTitle>
            <div className="space-y-2">
              {complianceTrends.slice(0, 5).map(ct => (
                <div key={ct.country} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">{ct.country}</span>
                  <Pill tone={ct.compliance >= 80 ? 'emerald' : ct.compliance >= 60 ? 'amber' : 'rose'}>{ct.compliance}%</Pill>
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card hover={false}>
          <SectionTitle>{t('map.devicesCount', 'Devices ({count})', { count: locations.length })}</SectionTitle>
          {unlocated.length > 0 && (
            <div className="mb-3 p-2 rounded-[var(--radius-sm)] bg-[var(--amber-dim)] border border-[rgba(251,191,36,0.25)] text-xs text-[var(--amber)] flex items-center gap-2">
              <AlertTriangle size={12} />
              {t('map.needCoordinates', '{count} device(s) need coordinates', { count: unlocated.length })}
            </div>
          )}
          <div className="space-y-2 max-h-[480px] overflow-auto pr-2">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className={`p-3 rounded-[var(--radius-sm)] transition-all ${selected?.id === loc.id ? 'bg-[var(--emerald-dim)] border border-[var(--emerald-glow)]' : 'border border-transparent hover:bg-[var(--surface-hover)]'}`}
              >
                <div className="flex justify-between items-start cursor-pointer" onClick={() => setSelected(loc)}>
                  <div>
                    <div className="font-medium text-sm">{loc.name}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {loc.type} {loc.firmware && `• ${loc.firmware}`}
                    </div>
                    {loc.hasCoordinates && (
                      <div className="text-[10px] text-[var(--text-disabled)] font-mono mt-0.5">
                        {loc.lat?.toFixed(4)}, {loc.lng?.toFixed(4)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Pill tone={getStatusPill(loc.status)}>{loc.status}</Pill>
                    {!loc.hasCoordinates && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSettingLocation(loc.id); setPickedCoords(null); }}
                        className="text-[10px] text-[var(--emerald)] hover:underline flex items-center gap-1"
                      >
                        <Crosshair size={10} /> {t('map.setLocation', 'Set location')}
                      </button>
                    )}
                  </div>
                </div>
                {settingLocation === loc.id && (
                  <div className="mt-2 p-2 rounded bg-black/20 text-xs space-y-2">
                    <div className="text-[var(--text-tertiary)]">
                      {pickedCoords
                        ? t('map.picked', 'Picked: {lat}, {lng}', { lat: pickedCoords.lat.toFixed(4), lng: pickedCoords.lng.toFixed(4) })
                        : t('map.clickToPick', 'Click on the map to pick a location')}
                    </div>
                    <div className="flex gap-2">
                      <Btn variant="primary" size="sm" disabled={!pickedCoords} onClick={() => handleSetLocation(loc.id)}>
                        {t('common.save', 'Save')}
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => { setSettingLocation(null); setPickedCoords(null); }}>
                        {t('common.cancel', 'Cancel')}
                      </Btn>
                    </div>
                  </div>
                )}
                {loc.latestReading && selected?.id === loc.id && (
                  <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-3 gap-1.5 text-[10px]">
                    {Object.entries(loc.latestReading).slice(0, 6).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-[var(--text-tertiary)]">{k}</span>{' '}
                        <span className="font-mono text-[var(--text-secondary)]">{typeof v === 'number' ? v.toFixed(1) : v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
        </div>
      </div>

      {selected && selected.hasCoordinates && selected.lat && selected.lng && (
        <Card className="mt-6">
          <div className="font-semibold text-lg">{selected.name}{t('map.detailViewSuffix', ' — Detailed View')}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
            <div>{t('map.typeLabel', 'Type: ')}<span className="font-semibold">{selected.type}</span></div>
            <div>{t('map.label.status', 'Status: ')}: <Pill tone={getStatusPill(selected.status)}>{selected.status}</Pill></div>
            <div>{t('map.latLabel', 'Lat: ')}<span className="font-mono">{selected.lat}</span></div>
            <div>{t('map.lngLabel', 'Lng: ')}<span className="font-mono">{selected.lng}</span></div>
            {selected.firmware && <div>{t('map.firmwareLabel', 'Firmware: ')}<span className="font-mono">{selected.firmware}</span></div>}
            {selected.tags.length > 0 && <div>{t('map.tagsLabel', 'Tags: ')}<span>{selected.tags.join(', ')}</span></div>}
          </div>
          {selected.latestReading && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="section-label mb-2">{t('map.latestReading', 'Latest Sensor Reading')}</div>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-3 text-xs">
                {Object.entries(selected.latestReading).map(([k, v]) => (
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
