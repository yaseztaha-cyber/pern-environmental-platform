import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { apiClient } from '../lib/api-client';
import { PageHeader, Pill, Card, Btn, ProgressRing } from '../components/ui';
import { Cpu, Search, Wifi, Clock, CircleSlash, Plus, Trash2, Server } from 'lucide-react';

const statusMeta: Record<string, { tone: 'emerald' | 'amber' | 'rose'; icon: ReactNode; label: string }> = {
  online: { tone: 'emerald', icon: <Wifi size={13} />, label: 'online' },
  warning: { tone: 'amber', icon: <Clock size={13} />, label: 'warning' },
  offline: { tone: 'rose', icon: <CircleSlash size={13} />, label: 'offline' },
};

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  last_seen: string;
  metadata?: any;
}

export default function DevicesPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'warning' | 'offline'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newDevice, setNewDevice] = useState({ id: '', name: '', type: 'Generic' });

  const loadDevices = () => {
    setLoading(true);
    apiClient.getDevices().then(raw => {
      const mapped = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        id: r.id,
        name: r.name || r.id,
        type: r.type || 'Generic',
        status: r.status || 'online',
        last_seen: r.last_seen || r.lastSeen || new Date().toISOString(),
        metadata: r.metadata,
      }));
      setDevices(mapped);
    }).catch(() => setDevices([])).finally(() => setLoading(false));
  };

  useEffect(() => { loadDevices(); }, []);

  const filteredDevices = devices
    .filter(d => d.id.toLowerCase().includes(search.toLowerCase()) || d.name.toLowerCase().includes(search.toLowerCase()))
    .filter(d => filter === 'all' || d.status === filter);

  const online = devices.filter(d => d.status === 'online').length;
  const offline = devices.filter(d => d.status === 'offline').length;
  const uptimePct = devices.length > 0 ? Math.round((online / devices.length) * 100) : 0;

  const handleCreate = async () => {
    if (!newDevice.id) return;
    await apiClient.saveDevice({ id: newDevice.id, name: newDevice.name || newDevice.id, type: newDevice.type, status: 'online' });
    setNewDevice({ id: '', name: '', type: 'Generic' });
    setShowCreate(false);
    loadDevices();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(`Delete device ${id}?`)) return;
    await apiClient.deleteDevice(id);
    loadDevices();
  };

  const timeSince = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
    return `${Math.floor(ms / 86400000)}d ago`;
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Device Management"
        subtitle="Real connected device fleet"
        right={
          <div className="flex items-center gap-2">
            <Pill tone="emerald"><Wifi size={12} /> {online} online</Pill>
            <Pill tone={offline > 0 ? 'rose' : 'slate'}>{offline} offline</Pill>
            <Btn variant="primary" size="sm" onClick={() => setShowCreate(!showCreate)}>
              <Plus size={14} /> Add Device
            </Btn>
          </div>
        }
      />

      {/* Fleet Summary */}
      <div className="grid grid-cols-3 gap-3 mb-8 grid-entrance">
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--emerald-dim)] border-l-[3px] border-l-[var(--emerald)]">
          <div className="section-label">Fleet Uptime</div>
          <div className="flex items-center gap-3 mt-2">
            <ProgressRing value={uptimePct} size={44} strokeWidth={4} accent="emerald" />
            <div className="text-2xl font-bold stat-number text-[var(--emerald)]">{uptimePct}%</div>
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--cyan-dim)] border-l-[3px] border-l-[var(--cyan)]">
          <div className="section-label">Total Devices</div>
          <div className="text-2xl font-bold stat-number text-[var(--cyan)] mt-2">{devices.length}</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[rgba(167,139,250,0.08)] border-l-[3px] border-l-[var(--violet)]">
          <div className="section-label">Device Types</div>
          <div className="text-2xl font-bold stat-number text-[var(--violet)] mt-2">
            {new Set(devices.map(d => d.type)).size}
          </div>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <div className="font-semibold mb-3">Register New Device</div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[10px] text-[var(--text-disabled)] uppercase mb-1">Device ID *</label>
              <input value={newDevice.id} onChange={e => setNewDevice({ ...newDevice, id: e.target.value })}
                placeholder="esp32-room-001" className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-[var(--text-disabled)] uppercase mb-1">Name</label>
              <input value={newDevice.name} onChange={e => setNewDevice({ ...newDevice, name: e.target.value })}
                placeholder="Living Room Sensor" className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-[var(--text-disabled)] uppercase mb-1">Type</label>
              <select value={newDevice.type} onChange={e => setNewDevice({ ...newDevice, type: e.target.value })}
                className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm">
                <option>Generic</option><option>ESP32</option><option>NodeMCU</option><option>RPi</option><option>Arduino</option>
              </select>
            </div>
            <button onClick={handleCreate} className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--emerald)] text-white text-sm font-medium">Create</button>
          </div>
        </Card>
      )}

      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
          <input type="text" placeholder="Search devices…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-[var(--radius-sm)] text-sm" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          className="px-4 py-2.5 rounded-[var(--radius-sm)] text-sm">
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="warning">Warning</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {loading ? (
        <Card className="text-center py-16 text-[var(--text-disabled)]">Loading devices...</Card>
      ) : devices.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-[var(--text-secondary)] text-lg font-medium mb-1">No devices registered</div>
          <p className="text-[var(--text-disabled)] text-sm max-w-md mx-auto">
            Devices auto-register when they send MQTT data, or you can add one manually above.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 grid-entrance">
          {filteredDevices.map((d) => (
            <div key={d.id} onClick={() => navigate(`/devices/${d.id}`)}
              className="card hover:border-[var(--emerald-glow)] cursor-pointer transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--emerald-dim)] text-[var(--emerald)] flex items-center justify-center">
                    <Cpu size={20} />
                  </div>
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{d.type}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={statusMeta[d.status]?.tone || 'slate'}>
                    {statusMeta[d.status]?.icon} {statusMeta[d.status]?.label || d.status}
                  </Pill>
                  <button onClick={(e) => handleDelete(e, d.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-400 transition-opacity">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span className="px-2.5 py-1 rounded-lg bg-[var(--surface)]">ID: {d.id}</span>
                <span>Last seen: {timeSince(d.last_seen)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
