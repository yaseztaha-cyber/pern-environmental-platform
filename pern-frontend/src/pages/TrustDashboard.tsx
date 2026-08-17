import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, StatCard, SectionTitle, Btn, Pill } from '../components/ui';
import { AlertTriangle, RefreshCw, Activity, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ChartTooltip, CHART_TICK } from '../components/charts';
import { useI18n } from '../lib/i18n';

interface ConfidenceScore {
  overall: number;
  factors: { baseTrust: number; freshness: number; spatialConsistency: number; historicalAccuracy: number; calibrationStatus: number };
  evaluated_at: string;
}

interface Anomaly {
  id: string; source_type: string; source_id: string;
  latitude: number; longitude: number;
  parameter: string; reason: string; severity: string; detected_at: string;
}

const SOURCE_COLORS: Record<string, string> = {
  physical: '#22c55e', sentinel_5p: '#06b6d4', waqi: '#a855f7',
  openaq: '#3b82f6', nasa_firms: '#f59e0b', sensor_community: '#ec4899', virtual: '#94a3b8',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6',
};

export default function TrustDashboard() {
  const { t } = useI18n();
  const [scores, setScores] = useState<Record<string, ConfidenceScore>>({});
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [calibrating, setCalibrating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [scoresData, anomaliesData] = await Promise.all([
        fetch('/api/v3/trust/scores').then(r => r.json()),
        fetch('/api/v3/trust/anomalies').then(r => r.json()),
      ]);
      setScores(scoresData || {});
      setAnomalies(anomaliesData || []);
    } catch { /* fallback */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRecalibrate = async () => {
    setCalibrating(true);
    try {
      await fetch('/api/v3/trust/recalibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readings: [] }),
      }).then(r => r.json());
      await loadData();
    } catch { /* ignore */ }
    setCalibrating(false);
  };

  const chartData = Object.entries(scores).map(([key, val]) => ({
    name: key, score: Math.round(val.overall * 100),
    fill: SOURCE_COLORS[key] || '#94a3b8',
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('trust.title', 'Trust & Calibration Dashboard')}
        subtitle={t('trust.subtitle', 'Spatial cross-validation confidence scores for all data sources')}
        right={<Btn variant="primary" size="sm" loading={calibrating} onClick={handleRecalibrate}>
          <RefreshCw size={14} /> {t('trust.recalibrate', 'Recalibrate')}
        </Btn>}
      />

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">{t('trust.loading', 'Loading trust data...')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t('trust.stat.sourceTypes', 'Source Types')} value={Object.keys(scores).length} accent="emerald" icon={<Activity size={18} />} />
            <StatCard label={t('trust.stat.anomalies', 'Anomalies')} value={anomalies.length} accent={anomalies.length > 0 ? 'rose' : 'emerald'} icon={<AlertTriangle size={18} />} />
            <StatCard label={t('trust.stat.avgTrustScore', 'Avg Trust Score')} value={chartData.length ? Math.round(chartData.reduce((a, b) => a + b.score, 0) / chartData.length) : 0} unit="%" accent="cyan" icon={<BarChart3 size={18} />} />
            <StatCard label={t('trust.stat.lastEvaluation', 'Last Evaluation')} value={Object.values(scores)[0]?.evaluated_at ? new Date(Object.values(scores)[0].evaluated_at).toLocaleTimeString() : '—'} accent="blue" icon={<RefreshCw size={18} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <SectionTitle>{t('trust.section.bySource', 'Confidence Scores by Source')}</SectionTitle>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} width={90} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={_.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4">
              <SectionTitle>{t('trust.section.sourceDetails', 'Source Details')}</SectionTitle>
              <div className="mt-2 space-y-2 max-h-[250px] overflow-y-auto">
                {Object.entries(scores).length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">{t('trust.noScores', 'No scores yet — run recalibration')}</p>
                ) : (
                  Object.entries(scores).map(([key, val]) => (
                    <div key={key} className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                        <Pill tone={val.overall > 0.8 ? 'emerald' : val.overall > 0.6 ? 'amber' : 'rose'}>
                          {Math.round(val.overall * 100)}%
                        </Pill>
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-[10px] text-slate-500">
                        <div>{t('trust.factor.base', 'Base:')} {(val.factors.baseTrust * 100).toFixed(0)}%</div>
                        <div>{t('trust.factor.freshness', 'Fresh:')} {(val.factors.freshness * 100).toFixed(0)}%</div>
                        <div>{t('trust.factor.spatial', 'Space:')} {(val.factors.spatialConsistency * 100).toFixed(0)}%</div>
                        <div>{t('trust.factor.historical', 'Hist:')} {(val.factors.historicalAccuracy * 100).toFixed(0)}%</div>
                        <div>{t('trust.factor.calibration', 'Cal:')} {(val.factors.calibrationStatus * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <SectionTitle>{t('trust.section.anomalies', 'Detected Anomalies')}</SectionTitle>
            {anomalies.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">{t('trust.noAnomalies', 'No anomalies detected')}</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {anomalies.map(a => (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: SEVERITY_COLORS[a.severity] || '#94a3b8' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{a.parameter}</span>
                        <Pill tone={a.severity === 'critical' ? 'rose' : a.severity === 'warning' ? 'amber' : 'slate'}>{a.severity}</Pill>
                        <span className="text-xs text-slate-500">{a.source_type}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{a.reason}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {a.latitude?.toFixed(2)}, {a.longitude?.toFixed(2)} · {new Date(a.detected_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
