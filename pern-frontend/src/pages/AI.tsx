import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
} from 'recharts';
import {
  Brain,
  Lightbulb,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  TrendingUp,
  Zap,
  Globe,
  Gauge,
} from 'lucide-react';
import { useData } from '../lib/data-provider';
import { useToast } from '../components/Toast';
import { apiClient } from '../lib/api-client';
import { generateAdvancedPrediction } from '../lib/prediction-engine';
import { epaAQIMulti, aqiCategory, WHO_GUIDELINES } from '../lib/epa-standards';
import { PageHeader, Card, Btn, Pill, SectionTitle } from '../components/ui';

interface Insight {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
  sensor?: string;
}

interface Recommendation {
  id: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

const INSIGHT_ICONS: Record<string, any> = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
  error: AlertTriangle,
};

const INSIGHT_TONES: Record<string, 'amber' | 'cyan' | 'emerald' | 'rose'> = {
  warning: 'amber',
  info: 'cyan',
  success: 'emerald',
  error: 'rose',
};

const PRIORITY_TONES: Record<string, 'rose' | 'amber' | 'emerald'> = {
  high: 'rose',
  medium: 'amber',
  low: 'emerald',
};

const KEY_SENSORS = ['pm25', 'co2', 'tmp', 'hum', 'no2'] as const;

export default function AI() {
  const { t } = useI18n();
  const { data } = useData();
  const toast = useToast();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [aiStatus, setAiStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [ehiHistory, setEhiHistory] = useState<number[]>([]);
  const [complianceData, setComplianceData] = useState<Array<{ country: string; compliance: number; framework: string }>>([]);

  const physicalRef = useRef(data.physical);
  physicalRef.current = data.physical;

  const checkAIStatus = async () => {
    setAiStatus('checking');
    try {
      await apiClient.get('/ai-tools/stats');
      setAiStatus('online');
    } catch {
      setAiStatus('offline');
    }
  };

  const generateInsights = useCallback(async () => {
    setLoading(true);
    try {
      const newInsights: Insight[] = [];
      const ts = new Date().toISOString();

      const physical = physicalRef.current;
      const temp = physical.tmp;
      if (temp !== undefined && temp > 30) {
        newInsights.push({
          id: `temp-high-${Date.now()}`,
          type: 'warning',
          title: 'High Temperature Detected',
          message: `Temperature reading of ${temp}°C exceeds comfortable threshold (30°C). Consider increasing ventilation.`,
          timestamp: ts,
          sensor: 'temperature',
        });
      }
      const co2 = physical.co2;
      if (co2 !== undefined && co2 > 1000) {
        newInsights.push({
          id: `co2-high-${Date.now()}`,
          type: 'warning',
          title: 'Elevated CO₂ Levels',
          message: `CO₂ at ${co2} ppm exceeds recommended levels (1000 ppm). Ventilation needed.`,
          timestamp: ts,
          sensor: 'co2',
        });
      }
      const pm25 = physical.pm25;
      if (pm25 !== undefined && pm25 > 35) {
        newInsights.push({
          id: `pm25-high-${Date.now()}`,
          type: 'error',
          title: 'Poor Air Quality',
          message: `PM2.5 at ${pm25} µg/m³ exceeds WHO guideline (35 µg/m³). Health risk for sensitive groups.`,
          timestamp: ts,
          sensor: 'pm25',
        });
      }

      if (newInsights.length === 0) {
        newInsights.push({
          id: 'all-normal',
          type: 'success',
          title: 'All Systems Normal',
          message: 'All sensor readings are within acceptable ranges. No immediate action required.',
          timestamp: new Date().toISOString(),
        });
      }

      setInsights(newInsights);
      setLastRefresh(new Date());
    } catch {
      toast.toast('Failed to generate insights', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const generateRecommendations = useCallback(async () => {
    if (aiStatus !== 'online') return;
    const recs: Recommendation[] = [];
    let id = 0;

    try {
      const diag = await apiClient.diagnoseSensors({ sensorData: physicalRef.current });
      if (Array.isArray(diag?.recommendations)) {
        for (const r of diag.recommendations) {
          recs.push({
            id: `diag-${++id}`,
            category: 'Diagnostics',
            priority: id <= 1 ? 'high' : 'medium',
            title: typeof r === 'string' ? r.slice(0, 80) : 'Recommendation',
            description: typeof r === 'string' ? r : JSON.stringify(r),
          });
        }
      }
    } catch { /* AI unavailable */ }

    for (const sensor of KEY_SENSORS) {
      if (physicalRef.current[sensor] === undefined) continue;
      try {
        const trend = await apiClient.analyzeTrend({ sensor, period: '24h' });
        if (Array.isArray(trend?.recommendations)) {
          for (const r of trend.recommendations) {
            recs.push({
              id: `trend-${sensor}-${++id}`,
              category: `${sensor.toUpperCase()} Trend`,
              priority: 'medium',
              title: typeof r === 'string' ? r.slice(0, 80) : `${sensor} recommendation`,
              description: typeof r === 'string' ? r : JSON.stringify(r),
            });
          }
        }
      } catch { /* skip */ }
      if (recs.length >= 10) break;
    }

    setRecommendations(recs);
  }, [aiStatus]);

  useEffect(() => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    apiClient.getEHIHistory(undefined, from).then((raw: any) => {
      const values = (Array.isArray(raw) ? raw : []).map((r: any) => Number(r.ehi ?? 0)).filter((v: number) => v > 0);
      setEhiHistory(values);
    }).catch(() => setEhiHistory([]));
  }, []);

  useEffect(() => {
    apiClient.get('/v3/compliance/trends').then((r: any) => {
      if (Array.isArray(r)) setComplianceData(r);
    }).catch(() => {});
    checkAIStatus();
  }, []);

  useEffect(() => {
    generateInsights();
  }, [data.ehi, generateInsights]);

  useEffect(() => {
    generateRecommendations();
  }, [aiStatus, generateRecommendations]);

  const chartData = useMemo(() => {
    if (ehiHistory.length === 0) {
      return [{ time: 'Now', ehi: data.ehi || 0, predicted: null as number | null }];
    }

    const historical = ehiHistory.map((v, i) => ({
      time: `T-${ehiHistory.length - i}`,
      ehi: v,
      predicted: null as number | null,
    }));

    if (ehiHistory.length >= 3) {
      const pred = generateAdvancedPrediction(ehiHistory, 6);
      for (let i = 1; i <= 6; i++) {
        historical.push({
          time: `T+${i}`,
          ehi: Math.round((pred.value + (i / 6) * (pred.upperBound - pred.value) * 0.5) * 10) / 10,
          predicted: Math.round((pred.value + (i / 6) * (pred.upperBound - pred.value) * 0.5) * 10) / 10,
        });
      }
    }

    return historical;
  }, [ehiHistory, data.ehi]);

  const aiStatusTone = aiStatus === 'online' ? 'emerald' : aiStatus === 'offline' ? 'rose' : 'slate' as const;

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <PageHeader
        title={t('ai.title', 'AI Intelligence Center')}
        subtitle={t('ai.subtitle', 'Real-time AI-powered environmental analysis and recommendations')}
        right={
          <div className="flex items-center gap-3">
            <Pill tone={aiStatusTone}>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${aiStatus === 'online' ? 'bg-[var(--emerald)]' : aiStatus === 'offline' ? 'bg-[var(--rose)]' : 'bg-[var(--text-tertiary)] animate-pulse'}`} />
                AI {aiStatus === 'online' ? 'Online' : aiStatus === 'offline' ? 'Offline' : 'Checking...'}
              </span>
            </Pill>
            <Btn
              variant="primary"
              size="sm"
              loading={loading}
              onClick={() => { generateInsights(); generateRecommendations(); }}
            >
              <RefreshCw size={14} /> Refresh
            </Btn>
          </div>
        }
      />

      <Card hover={false}>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <TrendingUp size={18} />
            EHI Trend & Forecast
            {ehiHistory.length === 0 && <span className="text-xs font-normal text-[var(--text-tertiary)] ml-2">Awaiting real EHI data</span>}
          </span>
        </SectionTitle>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip />
            {ehiHistory.length >= 3 && (
              <ReferenceLine x={`T+1`} stroke="var(--indigo)" strokeDasharray="3 3" label={{ value: 'Forecast →', position: 'insideTopRight', fontSize: 10 }} />
            )}
            <Area type="monotone" dataKey="ehi" stroke="var(--indigo)" fill="var(--indigo)" fillOpacity={0.2} strokeWidth={2} connectNulls={false} />
            <Area type="monotone" dataKey="predicted" stroke="var(--violet)" fill="var(--violet)" fillOpacity={0.1} strokeWidth={2} strokeDasharray="5 5" connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Zap size={18} />
            Live Insights
            <span className="text-xs font-normal text-[var(--text-tertiary)] ml-2">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          </span>
        </SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight) => {
            const Icon = INSIGHT_ICONS[insight.type] || Info;
            return (
              <Card key={insight.id} hover={false}>
                <div className="flex items-start gap-3">
                  <Icon size={20} className="shrink-0 mt-0.5 text-[var(--text-tertiary)]" />
                  <div>
                    <div className="font-medium text-sm text-[var(--text-primary)]">{insight.title}</div>
                    <p className="text-xs mt-1 text-[var(--text-secondary)]">{insight.message}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-tertiary)]">
                      <span>{new Date(insight.timestamp).toLocaleString()}</span>
                      {insight.sensor && <span>• {insight.sensor}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Card hover={false}>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Lightbulb size={18} className="text-[var(--amber)]" />
            AI Recommendations
          </span>
        </SectionTitle>
        {aiStatus === 'offline' ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text-secondary)]">AI recommendations require the backend to be online with OPENROUTER_API_KEY configured.</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Configure the API key in pern-backend/.env and restart the server.</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
                <Loader2 size={14} className="animate-spin" /> Generating recommendations…
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">No recommendations yet. Click Refresh to analyze current sensor data.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div key={rec.id} className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-1">
                  <Pill tone={PRIORITY_TONES[rec.priority]}>
                    {rec.priority.toUpperCase()}
                  </Pill>
                  <span className="text-xs text-[var(--text-secondary)]">{rec.category}</span>
                </div>
                <div className="font-medium text-sm text-[var(--text-primary)]">{rec.title}</div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{rec.description}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Compliance Analysis */}
      {complianceData.length > 0 && (
        <Card hover={false}>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Globe size={18} className="text-[var(--violet)]" />
              Compliance Analysis by Country
            </span>
          </SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={complianceData} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="country" stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} stroke="var(--text-tertiary)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }} />
                <Bar dataKey="compliance" name="Compliance %" fill="var(--violet)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {complianceData.map(cd => (
              <div key={cd.country} className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{cd.country}</span>
                  <Pill tone={cd.compliance >= 80 ? 'emerald' : cd.compliance >= 60 ? 'amber' : 'rose'}>{cd.compliance}%</Pill>
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">{cd.framework}</div>
                <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cd.compliance}%`, background: cd.compliance >= 80 ? 'var(--emerald)' : cd.compliance >= 60 ? 'var(--amber)' : 'var(--rose)' }} />
                </div>
                <div className="mt-2 text-[10px] text-[var(--text-disabled)]">
                  {cd.compliance >= 80 ? 'Within guidelines' : cd.compliance >= 60 ? 'Partial compliance' : 'Attention needed'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
