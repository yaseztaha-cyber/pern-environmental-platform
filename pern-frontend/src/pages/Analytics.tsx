import { useState, useEffect, useMemo } from 'react';
import { useData } from '../lib/data-provider';
import { apiClient } from '../lib/api-client';
import { useDevice } from '../lib/device-context';
import { useI18n } from '../lib/i18n';
import { PageHeader, SectionTitle, Card, Pill, Btn, fmt } from '../components/ui';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Download } from 'lucide-react';

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-72 flex items-center justify-center text-center text-[var(--text-disabled)] text-sm px-6">
      {message}
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isLive, hasRealData } = useData();
  const { selectedDevice } = useDevice();
  const { t } = useI18n();
  const [ehiHistory, setEhiHistory] = useState<Array<{ ehi: number; recordedAt: string }>>([]);
  const noRealData = isLive && !hasRealData;

  useEffect(() => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    apiClient.getEHIHistory(selectedDevice?.id, from).then(raw => {
      const mapped = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        ehi: Number(r.ehi ?? 0),
        recordedAt: r.recordedAt || r.recorded_at,
      }));
      setEhiHistory(mapped);
    }).catch(() => setEhiHistory([]));
  }, [selectedDevice?.id]);

  const trendData = useMemo(() => {
    if (ehiHistory.length < 2) return [];
    return ehiHistory.map((r, i) => ({
      t: new Date(r.recordedAt).toLocaleTimeString(),
      ehi: r.ehi,
      idx: i,
    }));
  }, [ehiHistory]);

  const radarData = useMemo(() => {
    return (data.virtualSensors || []).map(vs => ({
      subject: vs.name.length > 12 ? vs.name.substring(0, 10) + '…' : vs.name,
      value: vs.value,
      fullMark: 100,
    }));
  }, [data.virtualSensors]);

  const stats = useMemo(() => {
    if (ehiHistory.length === 0) return null;
    const values = ehiHistory.map(r => r.ehi);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return { mean: mean.toFixed(1), min: min.toFixed(1), max: max.toFixed(1), std: Math.sqrt(variance).toFixed(1), count: values.length };
  }, [ehiHistory]);

  const tooltipStyle = {
    background: 'var(--bg-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        right={<div className="flex items-center gap-2">
          {noRealData ? <Pill tone="amber">Awaiting real data</Pill> : undefined}
          <Btn variant="ghost" size="sm" onClick={() => apiClient.exportReadingsCSV()} aria-label="Export analytics data">
            <Download size={12} /> Export CSV
          </Btn>
        </div>}
      />

      <div className="grid lg:grid-cols-2 gap-6 grid-entrance">
        <Card>
          <SectionTitle>{t('analytics.chart.ehiTrendTitle')}</SectionTitle>
          {trendData.length >= 2 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="t" stroke="var(--text-tertiary)" tick={false} />
                  <YAxis domain={[0, 100]} stroke="var(--text-tertiary)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="natural" dataKey="ehi" stroke="var(--emerald)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message={noRealData ? 'Awaiting real EHI data from connected devices…' : 'Not enough history yet — keep Live Mode running to build the trend.'} />
          )}
        </Card>

        <Card>
          <SectionTitle>{t('analytics.chart.virtualSensorProfile')}</SectionTitle>
          {radarData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="subject" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} stroke="var(--border)" />
                  <Radar name="Value" dataKey="value" stroke="var(--emerald)" fill="var(--emerald)" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message={noRealData ? 'No virtual sensors yet — connect a device sending real readings.' : 'No virtual sensor data available.'} />
          )}
        </Card>

        {stats && (
          <Card className="lg:col-span-2">
            <SectionTitle>Real Data Statistics (7 days)</SectionTitle>
            <div className="grid grid-cols-5 gap-4 text-center">
              {[
                { label: 'Readings', value: String(stats.count) },
                { label: 'Mean EHI', value: stats.mean },
                { label: 'Min', value: stats.min },
                { label: 'Max', value: stats.max },
                { label: 'Std Dev', value: stats.std },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider">{s.label}</div>
                  <div className="text-xl font-semibold font-mono mt-1">{fmt(s.value)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2" hover={false}>
          <SectionTitle>Computed from real inputs only</SectionTitle>
          <div className="h-20 flex items-center justify-center text-center text-[var(--text-disabled)] text-sm px-6">
            All analytics above are computed exclusively from real sensor inputs. No simulated or estimated values are shown in Live Mode.
          </div>
        </Card>
      </div>
    </div>
  );
}
