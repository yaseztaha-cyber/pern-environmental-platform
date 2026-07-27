import { useState, useEffect } from 'react';
import { useData } from '../lib/data-provider';
import { apiClient } from '../lib/api-client';
import { useDevice } from '../lib/device-context';
import { PageHeader, Card, Pill, Btn, SectionTitle } from '../components/ui';
import { Download } from 'lucide-react';
import { exportTimeSeriesCSV, exportTimeSeriesExcel, type TimeSeriesRow } from '../lib/export-utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type RangeKey = '24h' | '7d' | '30d';
const RANGE_MS: Record<RangeKey, number> = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };

export default function HistoryPage() {
  const { data, isLive } = useData();
  const { selectedDevice } = useDevice();
  const [timeRange, setTimeRange] = useState<RangeKey>('24h');
  const [rows, setRows] = useState<Array<{ ehi: number; category?: string; recordedAt: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const from = new Date(Date.now() - RANGE_MS[timeRange]).toISOString();
    setLoading(true);
    apiClient.getEHIHistory(selectedDevice?.id, from).then(raw => {
      const mapped = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        ehi: Number(r.ehi ?? r.ehiValue ?? 0),
        category: r.category,
        recordedAt: r.recordedAt || r.recorded_at || new Date().toISOString(),
      }));
      setRows(mapped);
    }).catch(() => setRows([])).finally(() => setLoading(false));
  }, [selectedDevice?.id, timeRange]);

  const chartData = rows.map((r, i) => ({
    t: new Date(r.recordedAt).toLocaleString(),
    ehi: r.ehi,
    idx: i,
  }));

  const exportRows: TimeSeriesRow[] = rows.map(r => ({
    ehi: r.ehi,
    recordedAt: typeof r.recordedAt === 'string' ? r.recordedAt : new Date(r.recordedAt).toISOString(),
    device: selectedDevice?.id || 'global',
  }));

  const tooltipStyle = {
    background: 'var(--bg-3)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-primary)',
  };

  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader
        title="Historical Data"
        subtitle="Real EHI time-series from connected devices"
        right={
          <div className="flex items-center gap-2">
            {rows.length >= 2 && (
              <div className="flex items-center gap-2">
                <Btn variant="ghost" disabled={exportRows.length < 2}
                  onClick={() => exportTimeSeriesCSV(exportRows, 'pern-ehi-history')}>
                  <Download size={14} /> .csv
                </Btn>
                <Btn variant="ghost" disabled={exportRows.length < 2}
                  onClick={() => exportTimeSeriesExcel(exportRows, 'pern-ehi-history')}>
                  <Download size={14} /> .xls
                </Btn>
              </div>
            )}
          </div>
        }
      />

      <div className="flex justify-between items-center mb-6">
        <div className="flex bg-[var(--surface)] rounded-[var(--radius-sm)] p-1">
          {(['24h', '7d', '30d'] as const).map(range => (
            <button key={range} onClick={() => setTimeRange(range)}
              aria-pressed={timeRange === range}
              className={`px-5 py-1.5 rounded-[var(--radius-md)] text-sm font-medium transition-all ${timeRange === range ? 'bg-[var(--emerald)] text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'}`}>
              {range}
            </button>
          ))}
        </div>
        <Pill tone="slate">{rows.length} readings</Pill>
      </div>

      <Card hover={false}>
        <SectionTitle>EHI Trend ({timeRange})</SectionTitle>
        {loading ? (
          <div className="h-80 flex items-center justify-center text-[var(--text-disabled)] text-sm">Loading...</div>
        ) : chartData.length >= 2 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" />
                <XAxis dataKey="t" tick={false} />
                <YAxis domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="natural" dataKey="ehi" stroke="var(--emerald)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-center text-[var(--text-disabled)] text-sm px-6">
            No EHI history for this range. Start Live Mode to accumulate readings.
          </div>
        )}
      </Card>

      <Card hover={false} className="mt-6">
        <p className="text-sm text-[var(--text-tertiary)]">
          This view shows real Environmental Health Index readings queried from PostgreSQL with server-side date filtering.
        </p>
      </Card>
    </div>
  );
}
