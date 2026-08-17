import { useState, useEffect, useMemo } from 'react';
import { useData } from '../lib/data-provider';
import { apiClient } from '../lib/api-client';
import { useDevice } from '../lib/device-context';
import { useI18n } from '../lib/i18n';
import { SENSOR_TYPES } from '../lib/constants';
import { PageHeader, SectionTitle, Card, Pill, Btn, fmt } from '../components/ui';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, Legend
} from 'recharts';
import { ChartGrid, ChartTooltip, CHART_CURSOR, CHART_TICK } from '../components/charts';
import { Download, Globe } from 'lucide-react';

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-72 flex items-center justify-center text-center text-[var(--text-disabled)] text-sm px-6">
      {message}
    </div>
  );
}

const DAY_RANGES = [7, 14, 30] as const;

export default function AnalyticsPage() {
  const { data, isLive, hasRealData } = useData();
  const { selectedDevice } = useDevice();
  const { t } = useI18n();
  const [ehiHistory, setEhiHistory] = useState<Array<{ ehi: number; recordedAt: string }>>([]);
  const [complianceTrends, setComplianceTrends] = useState<Array<{ country: string; compliance: number; framework: string }>>([]);
  const [days, setDays] = useState<number>(7);
  const noRealData = isLive && !hasRealData;

  useEffect(() => {
    const from = new Date(Date.now() - days * 86400000).toISOString();
    apiClient.getEHIHistory(selectedDevice?.id, from).then(raw => {
      const mapped = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        ehi: Number(r.ehi ?? 0),
        recordedAt: r.recordedAt || r.recorded_at,
      }));
      setEhiHistory(mapped);
    }).catch(() => setEhiHistory([]));
  }, [selectedDevice?.id, days]);

  useEffect(() => {
    apiClient.get('/v3/compliance/trends').then((r: any) => {
      if (Array.isArray(r)) setComplianceTrends(r);
    }).catch(() => {});
  }, []);

  const trendData = useMemo(() => {
    if (ehiHistory.length < 2) return [];
    return ehiHistory.map((r, i) => ({
      t: new Date(r.recordedAt).toLocaleTimeString(),
      ehi: r.ehi,
      idx: i,
    }));
  }, [ehiHistory]);

  const radarData = useMemo(() => {
    return (data.virtualSensors || []).map(vs => {
      const cfg = SENSOR_TYPES[vs.id as keyof typeof SENSOR_TYPES];
      const [lo, hi] = cfg?.safeRange ?? [0, 100];
      const span = Math.max(hi - lo, 1e-9);
      const pct = Math.min(100, Math.max(0, ((Number(vs.value) - lo) / span) * 100));
      return {
        subject: vs.name.length > 12 ? vs.name.substring(0, 10) + '…' : vs.name,
        value: Math.round(pct * 10) / 10,
        fullMark: 100,
      };
    });
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

  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader
        title={t('analytics.title', 'Advanced Analytics')}
        subtitle={t('analytics.subtitle', 'Trends • Radar • Distribution • Correlations')}
        right={<div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-[var(--border)]">
            {DAY_RANGES.map(d => (
              <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${days === d ? 'bg-[var(--emerald)] text-white shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>{d}d</button>
            ))}
          </div>
          {noRealData ? <Pill tone="amber">{t('analytics.awaitingRealData', 'Awaiting real data')}</Pill> : undefined}
          <Btn variant="ghost" size="sm" onClick={() => apiClient.downloadCSV(apiClient.exportReadingsCSV(500, selectedDevice?.id), 'readings.csv').catch(() => {})} aria-label={t('analytics.exportAria', 'Export analytics data')}>
            <Download size={12} /> {t('analytics.exportCsv', 'Export CSV')}
          </Btn>
        </div>}
      />

      <div className="grid lg:grid-cols-2 gap-6 grid-entrance">
        <Card>
          <SectionTitle>{t('analytics.chart.ehiTrendTitle', 'Environmental Health Index Trend (12h)')}</SectionTitle>
          {trendData.length >= 2 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <ChartGrid />
                  <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                  <Line type="natural" dataKey="ehi" name="EHI" stroke="var(--emerald)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message={noRealData ? t('analytics.empty.ehiAwaiting', 'Awaiting real EHI data from connected devices…') : t('analytics.empty.ehiHistory', 'Not enough history yet — keep Live Mode running to build the trend.')} />
          )}
        </Card>

        <Card>
          <SectionTitle>{t('analytics.chart.virtualSensorProfile', 'Virtual Sensor Profile')}</SectionTitle>
          {radarData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" strokeOpacity={0.5} />
                  <PolarAngleAxis dataKey="subject" stroke="var(--text-secondary)" tick={CHART_TICK} />
                  <PolarRadiusAxis domain={[0, 100]} stroke="var(--border)" tick={CHART_TICK} />
                  <Tooltip content={<ChartTooltip />} />
                  <Radar name={t('analytics.radarValue', 'Value')} dataKey="value" stroke="var(--emerald)" fill="var(--emerald)" fillOpacity={0.35} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message={noRealData ? t('analytics.empty.radarAwaiting', 'No virtual sensors yet — connect a device sending real readings.') : t('analytics.empty.radarEmpty', 'No virtual sensor data available.')} />
          )}
        </Card>

        {stats && (
          <Card className="lg:col-span-2">
            <SectionTitle>{t('analytics.realDataStats', 'Real Data Statistics ({days} days)', { days })}</SectionTitle>
            <div className="grid grid-cols-5 gap-4 text-center">
              {[
                { label: t('analytics.stat.readings', 'Readings'), value: String(stats.count) },
                { label: t('analytics.meanEhi', 'Mean EHI'), value: stats.mean },
                { label: t('analytics.stat.min', 'Min'), value: stats.min },
                { label: t('analytics.stat.max', 'Max'), value: stats.max },
                { label: t('analytics.stat.stdDev', 'Std Dev'), value: stats.std },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider">{s.label}</div>
                  <div className="text-xl font-semibold font-mono mt-1">{fmt(s.value)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Compliance Trends */}
        {complianceTrends.length > 0 && (
          <Card className="lg:col-span-2">
            <SectionTitle><span className="flex items-center gap-2"><Globe size={16} className="text-[var(--violet)]" />{t('analytics.complianceByCountry', 'Compliance Trends by Country')}</span></SectionTitle>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={complianceTrends} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                  <ChartGrid />
                  <XAxis dataKey="country" tick={CHART_TICK} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={40} />
                  <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="compliance" name={t('analytics.compliancePct', 'Compliance %')} fill="var(--violet)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card className="lg:col-span-2" hover={false}>
          <SectionTitle>{t('analytics.realOnlyTitle', 'Computed from real inputs only')}</SectionTitle>
          <div className="h-20 flex items-center justify-center text-center text-[var(--text-disabled)] text-sm px-6">
            {t('analytics.realOnlyBody', 'All analytics above are computed exclusively from real sensor inputs. No simulated or estimated values are shown in Live Mode.')}
          </div>
        </Card>
      </div>
    </div>
  );
}
