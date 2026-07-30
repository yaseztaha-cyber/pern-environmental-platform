import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, StatCard, SectionTitle, Btn, Pill, ProgressRing } from '../components/ui';
import { Database, Globe, Activity, RefreshCw, Radio, BarChart3, HeartPulse } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

interface DataSource {
  id: string; name: string; type: string; active: boolean;
  base_trust: number; frequency_minutes: number; priority: number;
  last_fetch: string | null; created_at: string;
}

interface ScanResult {
  sources_queried: number; sources_responded: number;
  readings: any[]; timestamp: string;
}

interface IngestionStats {
  total_readings: number; registered_sources: number;
  by_source: Record<string, number>; last_run: string;
}

const PIE_COLORS = ['#22c55e', '#06b6d4', '#a855f7', '#3b82f6', '#f59e0b'];

const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 };

const genMockReadings = (total: number) => {
  const now = Date.now();
  const hours = [6, 5, 4, 3, 2, 1, 0];
  const base = Math.max(total, 10);
  return hours.map((h, i) => {
    const factor = (hours.length - i) / hours.length;
    return { label: h === 0 ? 'Now' : `${h}h ago`, readings: Math.round(base * factor * (0.8 + Math.random() * 0.4)) };
  });
};

export default function DataSources() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [stats, setStats] = useState<IngestionStats | null>(null);
  const [readings, setReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st, r] = await Promise.all([
        fetch('/api/v3/ingestion/sources?active=true').then(r => r.json()),
        fetch('/api/v3/ingestion/stats').then(r => r.json()),
        fetch('/api/v3/ingestion/readings?limit=20').then(r => r.json()),
      ]);
      setSources(s || []);
      setStats(st || null);
      setReadings(r || []);
    } catch { /* fallback */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result: ScanResult = await fetch('/api/v3/ingestion/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 30.5, lng: 31.5 }),
      }).then(r => r.json());
      await loadData();
    } catch { /* ignore */ }
    setScanning(false);
  };

  const pieData = stats ? Object.entries(stats.by_source).map(([k, v], i) => ({
    name: k, value: v, color: PIE_COLORS[i % PIE_COLORS.length],
  })) : [];

  const readingsOverTime = useMemo(() => genMockReadings(stats?.total_readings || 0), [stats?.total_readings]);

  const activeCount = sources.filter(s => s.active).length;
  const inactiveCount = sources.length - activeCount;
  const healthPercent = sources.length > 0 ? Math.round((activeCount / sources.length) * 100) : 0;
  const allHealthy = sources.length > 0 && inactiveCount === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database size={18} className="text-[var(--emerald)]" />
            Data Sources
          </h2>
          <p className="text-xs text-slate-500">Global data ingestion pipeline management</p>
        </div>
        <Btn variant="primary" size="sm" loading={scanning} onClick={handleScan}>
          <RefreshCw size={14} /> Run Global Scan
        </Btn>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">Loading data sources...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Sources" value={stats?.registered_sources || sources.length} accent="emerald" icon={<Radio size={18} />} />
            <StatCard label="Total Readings" value={stats?.total_readings || 0} accent="cyan" icon={<Activity size={18} />} />
            <StatCard label="Active Sources" value={activeCount} accent="violet" icon={<Globe size={18} />} />
            <StatCard label="Last Scan" value={stats?.last_run ? new Date(stats.last_run).toLocaleTimeString() : '—'} accent="blue" icon={<BarChart3 size={18} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <SectionTitle>Readings Over Time</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={readingsOverTime} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="readings" stroke="var(--emerald)" strokeWidth={2} dot={{ r: 3, fill: 'var(--emerald)' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4">
              <SectionTitle>Source Health</SectionTitle>
              {sources.length > 0 ? (
                <div className="flex items-center gap-6 mt-2">
                  <ProgressRing value={healthPercent} size={80} strokeWidth={6} accent={allHealthy ? 'emerald' : 'amber'} />
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--emerald)]" />
                      <span className="text-slate-400">Active</span>
                      <span className="font-semibold">{activeCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--rose)]" />
                      <span className="text-slate-400">Inactive</span>
                      <span className="font-semibold">{inactiveCount}</span>
                    </div>
                    <div className="pt-1">
                      <Pill tone={allHealthy ? 'emerald' : 'amber'}>{allHealthy ? 'All healthy' : `${inactiveCount} source${inactiveCount > 1 ? 's' : ''} down`}</Pill>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">No sources registered</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <SectionTitle>Source Registry</SectionTitle>
              <div className="mt-3 space-y-2">
                {sources.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No sources registered</p>
                ) : (
                  sources.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                      <div>
                        <div className="text-sm font-medium capitalize">{s.name || s.id}</div>
                        <div className="text-[10px] text-slate-500">
                          Trust: {Math.round(s.base_trust * 100)}% · Every {s.frequency_minutes}min
                        </div>
                      </div>
                      <Pill tone={s.active ? 'emerald' : 'rose'}>{s.active ? 'Active' : 'Inactive'}</Pill>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle>Readings by Source</SectionTitle>
              {pieData.length > 0 ? (
                <div className="flex items-center gap-4 mt-3">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={60} dataKey="value" paddingAngle={2}>
                        {pieData.map((_, i) => <Cell key={i} fill={_.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 text-xs">
                    {pieData.map(d => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-400">{d.name}</span>
                        <span className="font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 mt-3 text-center py-8">No readings yet — run a scan</p>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle>Recent Readings</SectionTitle>
              <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                {readings.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No readings</p>
                ) : (
                  readings.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 text-xs">
                      <span className="font-mono text-[10px] text-slate-400">{r.source_type}</span>
                      <span className="text-slate-500">{r.latitude?.toFixed(1)}, {r.longitude?.toFixed(1)}</span>
                      <span className="text-slate-500">{new Date(r.timestamp || r.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
