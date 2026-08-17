import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/api-client';
import { useI18n } from '../lib/i18n';
import { PageHeader, Card, Pill, Btn, ProgressRing } from '../components/ui';
import { CheckCircle2, XCircle, AlertTriangle, Download, Globe, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartGrid, ChartTooltip, CHART_TICK } from '../components/charts';
import type { ComplianceStandard, ComplianceCheck, ComplianceStats, ComplianceTrend } from '../lib/types';

const STANDARDS: ComplianceStandard[] = [
  { id: 'who-pm25-24h', body: 'WHO', param: 'PM2.5', limit: 15, unit: 'µg/m³', period: '24-hour', sensorKey: 'pm25' },
  { id: 'epa-pm25-24h', body: 'EPA', param: 'PM2.5', limit: 35, unit: 'µg/m³', period: '24-hour', sensorKey: 'pm25' },
  { id: 'egypt-pm25-24h', body: 'Egypt', param: 'PM2.5', limit: 50, unit: 'µg/m³', period: '24-hour', sensorKey: 'pm25' },
  { id: 'who-pm10-24h', body: 'WHO', param: 'PM10', limit: 45, unit: 'µg/m³', period: '24-hour', sensorKey: 'pm10' },
  { id: 'who-no2-annual', body: 'WHO', param: 'NO₂', limit: 10, unit: 'µg/m³', period: 'Annual', sensorKey: 'no2' },
  { id: 'who-so2-24h', body: 'WHO', param: 'SO₂', limit: 40, unit: 'µg/m³', period: '24-hour', sensorKey: 'so2' },
  { id: 'who-o3-8h', body: 'WHO', param: 'O₃', limit: 100, unit: 'µg/m³', period: '8-hour', sensorKey: 'o3' },
  { id: 'who-co-8h', body: 'WHO', param: 'CO', limit: 4, unit: 'mg/m³', period: '8-hour', sensorKey: 'co' },
  { id: 'who-ph', body: 'WHO', param: 'pH', limit: '6.5-8.5', unit: '', period: 'Continuous', sensorKey: 'ph', min: 6.5, max: 8.5 },
  { id: 'who-tds', body: 'WHO', param: 'TDS', limit: 500, unit: 'mg/L', period: 'Continuous', sensorKey: 'tds' },
  { id: 'who-do', body: 'WHO', param: 'Dissolved O₂', limit: 5, unit: 'mg/L', period: 'Continuous', sensorKey: 'dO', minVal: 5 },
  { id: 'egypt-pm10-24h', body: 'Egypt', param: 'PM10', limit: 70, unit: 'µg/m³', period: '24-hour', sensorKey: 'pm10' },
];

const BODIES = ['all', 'WHO', 'EPA', 'Egypt'] as const;

export default function CompliancePage() {
  const { t } = useI18n();
  const [readings, setReadings] = useState<any[]>([]);
  const [filterBody, setFilterBody] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [geoStats, setGeoStats] = useState<ComplianceStats | null>(null);
  const [trends, setTrends] = useState<ComplianceTrend[]>([]);

  useEffect(() => {
    apiClient.getSensorReadings(500).then((data: any) => {
      setReadings(Array.isArray(data) ? data : []);
    }).catch(() => setReadings([])).finally(() => setLoading(false));
    apiClient.get('/v3/compliance/stats').then((r: any) => {
      if (r) setGeoStats({ countries: r.countries ?? 0, frameworks: r.frameworks ?? 0, overallPct: r.overallPct ?? r.averageCompliance ?? 0 });
    }).catch(() => {});
    apiClient.get('/v3/compliance/trends').then((r: any) => {
      if (Array.isArray(r)) setTrends(r);
    }).catch(() => {});
  }, []);

  const latestSensors: Record<string, number> = useMemo(() => {
    const latest: Record<string, number> = {};
    for (const r of readings.slice(0, 50)) {
      const sensors = typeof r.sensors === 'string' ? (() => { try { return JSON.parse(r.sensors); } catch { return {}; } })() : (r.sensors || {});
      for (const [k, v] of Object.entries(sensors)) {
        if (typeof v === 'number' && !latest[k]) latest[k] = v;
      }
    }
    return latest;
  }, [readings]);

  const checks: ComplianceCheck[] = useMemo(() => STANDARDS.map(s => {
    const val = latestSensors[s.sensorKey];
    if (val === undefined) return { ...s, current: null, pass: null, status: 'no-data' as const };
    let pass = false;
    if (s.min !== undefined && s.max !== undefined) pass = val >= s.min && val <= s.max;
    else if (s.minVal !== undefined) pass = val >= s.minVal;
    else pass = val <= Number(s.limit);
    return { ...s, current: val, pass, status: pass ? 'pass' as const : 'fail' as const };
  }).filter(c => filterBody === 'all' || c.body === filterBody), [latestSensors, filterBody]);

  const periodLabel = (p: string): string => {
    switch (p) {
      case '24-hour': return t('compliance.period.24h', '24-hour');
      case 'Annual': return t('compliance.period.annual', 'Annual');
      case '8-hour': return t('compliance.period.8h', '8-hour');
      case 'Continuous': return t('compliance.period.continuous', 'Continuous');
      default: return p;
    }
  };

  const passed = checks.filter(c => c.pass === true).length;
  const failed = checks.filter(c => c.pass === false).length;
  const noData = checks.filter(c => c.pass === null).length;
  const score = checks.length > 0 ? Math.round((checks.filter(c => c.pass === true).length / checks.length) * 100) : 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('compliance.title', 'Environmental Compliance')}
        subtitle={t('compliance.subtitle', 'WHO / EPA / Egypt regulatory thresholds')}
        right={
          <div className="flex items-center gap-3">
            <ProgressRing value={score} size={44} strokeWidth={4} accent={score >= 80 ? 'emerald' : score >= 50 ? 'amber' : 'rose'} />
            <Pill tone={score >= 80 ? 'emerald' : score >= 50 ? 'amber' : 'rose'}>{t('compliance.compliant', '{score}% compliant', { score })}</Pill>
            <Btn variant="ghost" size="sm" onClick={() => apiClient.downloadCSV(apiClient.exportReadingsCSV(), 'readings.csv').catch(() => {})}>
              <Download size={14} /> {t('common.export', 'Export')}
            </Btn>
          </div>
        }
      />

      <div className="flex gap-2 mb-6 flex-wrap" role="group" aria-label={t('compliance.filterAriaLabel', 'Filter by regulatory body')}>
        {BODIES.map(b => (
          <Btn key={b} variant={filterBody === b ? 'primary' : 'ghost'} size="sm"
            onClick={() => setFilterBody(b)} aria-pressed={filterBody === b}>
            {b === 'all' ? t('compliance.allStandards', 'All Standards') : b}
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 grid-entrance">
        <Card hover={false} className="text-center">
          <div className="text-2xl font-bold text-[var(--emerald)]">{passed}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-1">{t('compliance.passing', 'Passing')}</div>
        </Card>
        <Card hover={false} className="text-center">
          <div className="text-2xl font-bold text-[var(--rose)]">{failed}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-1">{t('compliance.exceeding', 'Exceeding')}</div>
        </Card>
        <Card hover={false} className="text-center">
          <div className="text-2xl font-bold text-[var(--amber)]">{noData}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-1">{t('compliance.noDataStat', 'No Data')}</div>
        </Card>
        <Card hover={false} className="text-center">
          <div className="text-2xl font-bold text-[var(--text-primary)]">{checks.length}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-1">{t('compliance.filteredStandards', 'Filtered Standards')}</div>
        </Card>
      </div>

      {geoStats && (
        <Card hover={false} className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            <Globe size={14} /> {t('compliance.geoOverview', 'Geo-Compliance Overview')}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--emerald)]">{geoStats.countries}</div>
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase">{t('compliance.countries', 'Countries')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--cyan)]">{geoStats.frameworks}</div>
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase">{t('compliance.frameworks', 'Frameworks')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--violet)]">{geoStats.overallPct}%</div>
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase">{t('compliance.avgCompliance', 'Avg Compliance')}</div>
            </div>
          </div>
        </Card>
      )}

      {trends.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-[var(--violet)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{t('compliance.byCountry', 'Compliance by Country')}</span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends}>
                <ChartGrid />
                <XAxis dataKey="country" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                <Bar dataKey="compliance" name={t('compliance.chart.compliancePct', 'Compliance %')} fill="var(--violet)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {loading ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-tertiary)]">{t('compliance.loading', 'Loading sensor data...')}</Card>
      ) : (
        <Card hover={false}>
          <div className="space-y-1">
            {checks.map(c => (
              <div key={c.id} className="flex items-center justify-between py-3 px-3 rounded-[var(--radius-sm)] hover:bg-[var(--surface)] transition-colors text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  {c.pass === true ? <CheckCircle2 size={16} className="text-[var(--emerald)] shrink-0" /> :
                   c.pass === false ? <XCircle size={16} className="text-[var(--rose)] shrink-0" /> :
                   <AlertTriangle size={16} className="text-[var(--amber)] shrink-0" />}
                  <div className="min-w-0">
                    <span className="font-medium text-[var(--text-primary)]">{c.param === 'Dissolved O₂' ? t('compliance.param.dissolvedO2', 'Dissolved O₂') : c.param}</span>
                    <span className="text-[var(--text-tertiary)] ml-2 rtl:ml-0 rtl:mr-2 text-xs">({c.body} {periodLabel(c.period)})</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-[var(--text-tertiary)]">{t('compliance.limit', 'Limit: {limit} {unit}', { limit: c.limit, unit: c.unit })}</span>
                  <span className={`text-xs font-mono ${c.pass === true ? 'text-[var(--emerald)]' : c.pass === false ? 'text-[var(--rose)]' : 'text-[var(--amber)]'}`}>
                    {c.current !== null ? `${c.current} ${c.unit}` : t('compliance.na', 'N/A')}
                  </span>
                  <Pill tone={c.pass === true ? 'emerald' : c.pass === false ? 'rose' : 'amber'}>
                    {c.pass === true ? t('compliance.status.pass', 'PASS') : c.pass === false ? t('compliance.status.fail', 'FAIL') : t('compliance.na', 'N/A')}
                  </Pill>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
