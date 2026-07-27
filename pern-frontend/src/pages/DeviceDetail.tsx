import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES } from '../lib/constants';
import { PageHeader, Pill, Card } from '../components/ui';
import { ArrowLeft, Wifi, Clock, Cpu, MapPin, Settings, Trash2 } from 'lucide-react';

export default function DeviceDetailPage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState<any>(null);
  const [readings, setReadings] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', status: '' });

  useEffect(() => {
    if (!deviceId) return;
    setLoading(true);
    Promise.all([
      apiClient.getDevice(deviceId).catch(() => null),
      apiClient.getDeviceReadings(deviceId).catch(() => []),
    ]).then(([dev, rds]) => {
      setDevice(dev);
      if (dev) setForm({ name: dev.name || dev.id, type: dev.type || '', status: dev.status || 'online' });
      setReadings(Array.isArray(rds) ? rds : []);
      if (dev?.metadata) setMetadata(dev.metadata);
    }).finally(() => setLoading(false));
  }, [deviceId]);

  const handleSave = async () => {
    if (!deviceId) return;
    await apiClient.updateDevice(deviceId, form);
    setEditing(false);
    const dev = await apiClient.getDevice(deviceId).catch(() => null);
    setDevice(dev);
  };

  const handleDelete = async () => {
    if (!deviceId || !confirm('Delete this device permanently?')) return;
    await apiClient.deleteDevice(deviceId);
    navigate('/devices');
  };

  if (loading) return <Card className="max-w-[900px] mx-auto mt-8 text-center py-16 text-[var(--text-disabled)]">Loading...</Card>;
  if (!device) return <Card className="max-w-[900px] mx-auto mt-8 text-center py-16">Device not found</Card>;

  const timeSince = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
    return `${Math.floor(ms / 86400000)}d ago`;
  };

  return (
    <div className="max-w-[900px] mx-auto">
      <button onClick={() => navigate('/devices')} className="flex items-center gap-2 text-sm text-[var(--text-disabled)] hover:text-[var(--text-primary)] mb-4">
        <ArrowLeft size={14} /> Back to Devices
      </button>

      <PageHeader
        title={device.name || device.id}
        subtitle={device.type}
        right={
          <div className="flex items-center gap-2">
            <Pill tone={device.status === 'online' ? 'emerald' : device.status === 'warning' ? 'amber' : 'rose'}>
              <Wifi size={12} /> {device.status}
            </Pill>
            <button onClick={() => setEditing(!editing)} className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--surface)] text-[var(--text-secondary)]">
              <Settings size={16} />
            </button>
            <button onClick={handleDelete} className="p-2 rounded-[var(--radius-sm)] hover:bg-red-500/20 text-red-400">
              <Trash2 size={16} />
            </button>
          </div>
        }
      />

      {editing ? (
        <Card className="mb-6">
          <div className="font-semibold mb-3">Edit Device</div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[10px] text-[var(--text-disabled)] uppercase mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-[var(--text-disabled)] uppercase mb-1">Type</label>
              <input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-[var(--text-disabled)] uppercase mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm">
                <option value="online">Online</option>
                <option value="warning">Warning</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            <button onClick={handleSave} className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--emerald)] text-white text-sm font-medium">Save</button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Device ID', value: device.id, icon: <Cpu size={14} /> },
          { label: 'Type', value: device.type, icon: <Cpu size={14} /> },
          { label: 'Status', value: device.status, icon: <Wifi size={14} /> },
          { label: 'Last Seen', value: timeSince(device.last_seen), icon: <Clock size={14} /> },
        ].map(({ label, value, icon }) => (
          <Card key={label}>
            <div className="flex items-center gap-2 text-[var(--text-disabled)] text-[10px] uppercase mb-1">{icon} {label}</div>
            <div className="font-semibold text-sm">{value}</div>
          </Card>
        ))}
      </div>

      {metadata && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 font-semibold mb-3"><MapPin size={14} /> Metadata</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {metadata.location_lat && <div><span className="text-[var(--text-disabled)]">Lat:</span> {metadata.location_lat}</div>}
            {metadata.location_lng && <div><span className="text-[var(--text-disabled)]">Lng:</span> {metadata.location_lng}</div>}
            {metadata.firmware_version && <div><span className="text-[var(--text-disabled)]">Firmware:</span> {metadata.firmware_version}</div>}
            {metadata.description && <div className="col-span-2"><span className="text-[var(--text-disabled)]">Description:</span> {metadata.description}</div>}
          </div>
        </Card>
      )}

      <Card>
        <div className="font-semibold mb-3">Recent Readings ({readings.length})</div>
        {readings.length === 0 ? (
          <div className="text-[var(--text-disabled)] text-sm py-4 text-center">No readings recorded yet</div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {readings.slice(0, 50).map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-[var(--radius-sm)] bg-[var(--surface)] text-xs">
                <span className="text-[var(--text-secondary)]">{new Date(r.recordedAt || r.recorded_at).toLocaleString()}</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {r.sensors && typeof r.sensors === 'object'
                    ? Object.entries(r.sensors).map(([k, v]) => {
                        const meta = SENSOR_TYPES[k as keyof typeof SENSOR_TYPES];
                        return `${meta?.name ?? k}: ${typeof v === 'number' ? v.toFixed(1) : v}${meta?.unit ? ' ' + meta.unit : ''}`;
                      }).join(' · ')
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
