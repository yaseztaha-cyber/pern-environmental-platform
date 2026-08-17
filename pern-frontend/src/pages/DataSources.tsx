import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Card, StatCard, SectionTitle, Btn, Pill, ProgressRing } from '../components/ui';
import { Globe, Activity, RefreshCw, Radio, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis } from 'recharts';
import { ChartGrid, ChartTooltip, CHART_TICK, CHART_CURSOR, CHART_PALETTE } from '../components/charts';
import { useI18n, type Interpolation } from '../lib/i18n';

interface DataSource {
  id: string; name: string; type: string; active: boolean;
  base_trust: number; frequency_minutes: number; priority: number;
  last_fetch: string | null; created_at: string;
}

interface IngestionStats {
  total_readings: number; registered_sources: number;
  by_source: Record<string, number>; last_run: string;
}

const genMockReadings = (total: number, t: (key: string, fallback?: string, params?: Interpolation) => string) => {
  const hours = [6, 5, 4, 3, 2, 1, 0];
  const base = Math.max(total, 10);
  return hours.map((h, i) => {
    const factor = (hours.length - i) / hours.length;
    return { label: h === 0 ? t('dataSources.now', 'Now') : t('dataSources.hoursAgo', '{hours}h ago', { hours: h }), readings: Math.round(base * factor * (0.8 + Math.random() * 0.4)) };
  });
};

export default function DataSources() {
  const { t } = useI18n();
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
      await fetch('/api/v3/ingestion/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 30.5, lng: 31.5 }),
      }).then(r => r.json());
      await loadData();
    } catch { /* ignore */ }
    setScanning(false);
  };

  const pieData = stats ? Object.entries(stats.by_source).map(([k, v], i) => ({
    name: k, value: v, color: CHART_PALETTE[i % CHART_PALETTE.length],
  })) : [];

  const readingsOverTime = useMemo(() => genMockReadings(stats?.total_readings || 0, t), [stats?.total_readings, t]);

  const activeCount = sources.filter(s => s.active).length;
  const inactiveCount = sources.length - activeCount;
  const healthPercent = sources.length > 0 ? Math.round((activeCount / sources.length) * 100) : 0;
  const allHealthy = sources.length > 0 && inactiveCount === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.dataSources', 'Data Sources')}
        subtitle={t('dataSources.subtitle', 'Global data ingestion pipeline management')}
        right={<Btn variant="primary" size="sm" loading={scanning} onClick={handleScan}>
          <RefreshCw size={14} /> {t('dataSources.runGlobalScan', 'Run Global Scan')}
        </Btn>}
      />

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">{t('dataSources.loading', 'Loading data sources...')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t('dataSources.stat.sources', 'Sources')} value={stats?.registered_sources || sources.length} accent="emerald" icon={<Radio size={18} />} />
            <StatCard label={t('dataSources.stat.totalReadings', 'Total Readings')} value={stats?.total_readings || 0} accent="cyan" icon={<Activity size={18} />} />
            <StatCard label={t('dataSources.stat.activeSources', 'Active Sources')} value={activeCount} accent="violet" icon={<Globe size={18} />} />
            <StatCard label={t('dataSources.stat.lastScan', 'Last Scan')} value={stats?.last_run ? new Date(stats.last_run).toLocaleTimeString() : '—'} accent="blue" icon={<BarChart3 size={18} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <SectionTitle>{t('dataSources.readingsOverTime', 'Readings Over Time')}</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={readingsOverTime} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <ChartGrid />
                  <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                  <Line type="monotone" dataKey="readings" name={t('dataSources.chart.readings', 'Readings')} stroke="var(--emerald)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: 'var(--emerald)' }} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4">
              <SectionTitle>{t('dataSources.sourceHealth', 'Source Health')}</SectionTitle>
              {sources.length > 0 ? (
                <div className="flex items-center gap-6 mt-2">
                  <ProgressRing value={healthPercent} size={80} strokeWidth={6} accent={allHealthy ? 'emerald' : 'amber'} />
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--emerald)]" />
                      <span className="text-slate-400">{t('dataSources.active', 'Active')}</span>
                      <span className="font-semibold">{activeCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--rose)]" />
                      <span className="text-slate-400">{t('dataSources.inactive', 'Inactive')}</span>
                      <span className="font-semibold">{inactiveCount}</span>
                    </div>
                    <div className="pt-1">
                      <Pill tone={allHealthy ? 'emerald' : 'amber'}>{allHealthy ? t('dataSources.allHealthy', 'All healthy') : t(inactiveCount > 1 ? 'dataSources.sourcesDown' : 'dataSources.sourceDown', inactiveCount > 1 ? '{count} sources down' : '{count} source down', { count: inactiveCount })}</Pill>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">{t('dataSources.noSources', 'No sources registered')}</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <SectionTitle>{t('dataSources.sourceRegistry', 'Source Registry')}</SectionTitle>
              <div className="mt-3 space-y-2">
                {sources.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">{t('dataSources.noSources', 'No sources registered')}</p>
                ) : (
                  sources.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                      <div>
                        <div className="text-sm font-medium capitalize">{s.name || s.id}</div>
                        <div className="text-[10px] text-slate-500">
                          {t('dataSources.trustEvery', 'Trust: {pct}% · Every {minutes}min', { pct: Math.round(s.base_trust * 100), minutes: s.frequency_minutes })}
                        </div>
                      </div>
                      <Pill tone={s.active ? 'emerald' : 'rose'}>{s.active ? t('dataSources.active', 'Active') : t('dataSources.inactive', 'Inactive')}</Pill>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle>{t('dataSources.readingsBySource', 'Readings by Source')}</SectionTitle>
              {pieData.length > 0 ? (
                <div className="flex items-center gap-4 mt-3">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={60} dataKey="value" paddingAngle={2}>
                        {pieData.map((_, i) => <Cell key={i} fill={_.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
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
                <p className="text-sm text-slate-500 mt-3 text-center py-8">{t('dataSources.noReadingsYet', 'No readings yet — run a scan')}</p>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle>{t('dataSources.recentReadings', 'Recent Readings')}</SectionTitle>
              <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                {readings.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">{t('dataSources.noReadings', 'No readings')}</p>
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
