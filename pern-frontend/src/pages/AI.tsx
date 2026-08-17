import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useI18n, type Interpolation } from '../lib/i18n';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartGrid, ChartTooltip, CHART_TICK } from '../components/charts';
import {
  Brain,
  Lightbulb,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Zap,
  Globe,
  BookOpen,
  Send,
  Sparkles,
  Activity,
  Wrench,
  Database,
  Cpu,
  Droplets,
  Wind,
  ThermometerSun,
  Sprout,
  ShieldCheck,
  Users,
  HeartPulse,
} from 'lucide-react';
import { useData } from '../lib/data-provider';
import { useDevice } from '../lib/device-context';
import { apiClient } from '../lib/api-client';
import { toChipLabel, type SourceReference } from '../lib/ai-references';
import {
  fetchHealthBriefing,
  fetchCopilotStream,
  runFullAIAnalysis,
  getLocalRecommendations,
  type HealthBriefing,
  type CopilotResponse,
  type CopilotStatus,
} from '../lib/ai-service';
import { runScientificAnalysis } from '../lib/scientific-core';
import { generateAnalysis, SENSOR_THRESHOLDS, evaluateSensorLevel, analyzeCurrentState, type AnalysisInsight } from '../lib/ai-analysis';
import { PageHeader, Card, Btn, Pill, SectionTitle, Gauge as HealthGauge } from '../components/ui';

interface Insight {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
  sensor?: string;
  sources?: SourceReference[];
}

interface Recommendation {
  id: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  sources?: SourceReference[];
  affectedGroups?: string[];
}

interface MaintenanceResult {
  overallHealth: 'good' | 'fair' | 'poor' | 'critical';
  issues: Array<{ sensor: string; issue: string; urgency: string }>;
  maintenanceSchedule: Array<{ task: string; dueIn: string; priority: string }>;
  predictedFailures: Array<{ component: string; probability: number; timeframe: string }>;
  recommendations: Array<{ title: string; description: string; priority: string }>;
}

interface AITelemetry {
  tools: string[];
  model: string;
  status: string;
  configured: boolean;
  usage: {
    calls: number;
    errors: number;
    promptTokens: number;
    completionTokens: number;
    avgLatencyMs: number;
    lastError?: string;
    model?: string;
  };
  cache: { size: number; max: number; hits: number; misses: number; hitRate: number };
}

const INSIGHT_ICONS: Record<string, any> = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
  error: AlertTriangle,
};

const PRIORITY_TONES: Record<string, 'rose' | 'amber' | 'emerald'> = {
  high: 'rose',
  medium: 'amber',
  low: 'emerald',
};

const BRIEFING_STATUS_TONES: Record<string, 'emerald' | 'amber' | 'rose' | 'slate'> = {
  good: 'emerald',
  fair: 'amber',
  poor: 'rose',
  critical: 'rose',
};

const STATUS_TONES: Record<string, 'emerald' | 'amber' | 'rose' | 'slate'> = {
  normal: 'emerald',
  warning: 'amber',
  critical: 'rose',
};

const CURRENT_STATE_TONES: Record<string, 'emerald' | 'amber' | 'rose'> = {
  good: 'emerald',
  fair: 'amber',
  poor: 'amber',
  critical: 'rose',
};

const MAINTENANCE_HEALTH_TONES: Record<string, 'emerald' | 'amber' | 'rose'> = {
  good: 'emerald',
  fair: 'amber',
  poor: 'rose',
  critical: 'rose',
};

const REC_CATEGORY_ICONS: Record<string, any> = {
  'Air Quality': Wind,
  'Indoor Air': Wind,
  'Water Quality': Droplets,
  'Thermal Comfort': ThermometerSun,
  'Agriculture': Sprout,
  'Safety': ShieldCheck,
  'Monitoring': Activity,
  'General': Lightbulb,
  'Health': HeartPulse,
};

const SUGGESTED_PROMPTS = [
  'What is the current air quality status?',
  'Are there any anomalies right now?',
  'Are we compliant with regulatory limits?',
  'Any recent alerts?',
  'What is trending upward?',
];

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  const color = tone === 'rose' ? 'var(--rose)' : tone === 'amber' ? 'var(--amber)' : tone === 'cyan' ? 'var(--cyan)' : 'var(--indigo)';
  return (
    <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)]">{label}</div>
      <div className="text-sm font-medium mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function SourceChips({ sources, tr }: { sources?: SourceReference[]; tr?: (k: string, fb?: string) => string }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  const shown = open ? sources : sources.slice(0, 2);
  const T = tr ?? ((_k: string, fb?: string) => fb || '');
  return (
    <div className="mt-2.5 pt-2 border-t border-[var(--border)]/60">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)] flex items-center gap-1 shrink-0">
          <BookOpen size={10} /> {T('ai.references', 'References')}
        </span>
        {shown.map(s => (
          <span
            key={s.id}
            className="px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[10px] text-[var(--text-tertiary)]"
            title={`${s.authors} — ${s.publisher}`}
          >
            {toChipLabel(s)}
          </span>
        ))}
        {sources.length > 2 && (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-[10px] text-[var(--emerald)] hover:underline font-medium"
          >
            {open ? T('ai.showLess', 'Show less') : T('ai.more', `+${sources.length - 2} more`)}
          </button>
        )}
      </div>
    </div>
  );
}

function computeLocalMaintenance(readings: Record<string, number>, tr: (key: string, fallback?: string, params?: Interpolation) => string): MaintenanceResult {
  const issues: MaintenanceResult['issues'] = [];
  const failures: MaintenanceResult['predictedFailures'] = [];
  let normalCount = 0;
  let totalCount = 0;
  for (const [key, value] of Object.entries(readings)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    totalCount++;
    const level = evaluateSensorLevel(key, value);
    if (level === 'normal') {
      normalCount++;
    } else {
      const t = SENSOR_THRESHOLDS[key];
      issues.push({
        sensor: key,
        issue: tr('ai.maint.issue', '{label} out of range ({value}{unit})', { label: t?.label || key.toUpperCase(), value, unit: t?.unit || '' }),
        urgency: level === 'critical' ? 'high' : 'medium',
      });
      if (level === 'critical') {
        failures.push({ component: key, probability: 0.7, timeframe: tr('ai.maint.timeframe.1to4Weeks', '1–4 weeks') });
      }
    }
  }
  const score = totalCount > 0 ? Math.round((normalCount / totalCount) * 100) : 70;
  const hasHigh = issues.some(i => i.urgency === 'high');
  return {
    overallHealth: score >= 80 ? 'good' : score >= 60 ? 'fair' : score >= 40 ? 'poor' : 'critical',
    issues,
    maintenanceSchedule: hasHigh
      ? [{ task: tr('ai.maint.task.recalibrate', 'Recalibrate out-of-range sensors'), dueIn: tr('ai.maint.due.1week', 'within 1 week'), priority: 'high' }]
      : issues.length > 0
        ? [{ task: tr('ai.maint.task.inspect', 'Inspect flagged sensors'), dueIn: tr('ai.maint.due.2weeks', 'within 2 weeks'), priority: 'medium' }]
        : [],
    predictedFailures: failures,
    recommendations: [],
  };
}

function mapInsight(i: AnalysisInsight): Insight {
  return {
    id: i.id,
    type: i.type === 'improvement' ? 'success' : i.severity === 'critical' ? 'error' : i.severity === 'warning' ? 'warning' : 'info',
    title: i.title,
    message: i.message,
    timestamp: new Date(i.timestamp).toISOString(),
    sensor: i.sensor,
    sources: i.references,
  };
}

function mapRec(r: { id: string; category: string; priority: 'high' | 'medium' | 'low'; title: string; description: string; references?: SourceReference[]; affectedGroups?: string[] }, i: number): Recommendation {
  return {
    id: r.id || `rec-${i}`,
    category: r.category,
    priority: r.priority,
    title: r.title,
    description: r.description,
    sources: r.references,
    affectedGroups: r.affectedGroups,
  };
}

export default function AI() {
  const { t } = useI18n();
  const { data } = useData();
  const { selectedDevice } = useDevice();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [aiStatus, setAiStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [complianceData, setComplianceData] = useState<Array<{ country: string; compliance: number; framework: string }>>([]);
  const [briefing, setBriefing] = useState<HealthBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotResult, setCopilotResult] = useState<CopilotResponse | null>(null);
  const [copilotStream, setCopilotStream] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceResult | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<AITelemetry | null>(null);

  const physicalRef = useRef(data.physical);
  physicalRef.current = data.physical;
  const virtualRef = useRef(data.virtualSensors);
  virtualRef.current = data.virtualSensors;
  const historyRef = useRef<Record<string, number[]>>({});
  const deviceId = selectedDevice?.id || undefined;

  const checkAIStatus = useCallback(async () => {
    setAiStatus('checking');
    try {
      await apiClient.get('/ai-tools/stats');
      setAiStatus('online');
    } catch {
      setAiStatus('offline');
    }
  }, []);

  const fetchSensorHistory = useCallback(async () => {
    try {
      const rows = await apiClient.getSensorReadings(80, deviceId);
      const history: Record<string, number[]> = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        const sensors = row?.sensors || {};
        for (const [k, v] of Object.entries(sensors)) {
          if (typeof v === 'number' && Number.isFinite(v)) {
            (history[k] = history[k] || []).push(v);
          }
        }
      }
      historyRef.current = history;
    } catch { /* history optional */ }
  }, [deviceId]);

  const refreshLocal = useCallback(() => {
    const physical = physicalRef.current;
    const history = historyRef.current;
    const lastUpdate = Date.now();
    const analysis = runScientificAnalysis(physical, history, lastUpdate);
    const aiInsights = generateAnalysis(analysis, physical);
    setInsights(aiInsights.map(mapInsight));

    const ehiValue = analysis.ehi?.score ?? 50;
    const virtualSensors = (analysis.ehi?.subIndices ?? []).map(s => ({
      name: s.name,
      value: s.value,
      category: s.value >= 80 ? 'good' : s.value >= 60 ? 'fair' : s.value >= 40 ? 'moderate' : s.value >= 20 ? 'poor' : 'critical' as string,
    }));
    const hasRealData = Object.fromEntries(Object.keys(physical).map(k => [k, true]));
    setRecommendations(getLocalRecommendations(physical, ehiValue, virtualSensors, hasRealData).map(mapRec));
    setLastRefresh(new Date());
  }, []);

  const refreshFull = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runFullAIAnalysis(physicalRef.current, historyRef.current, Date.now());
      setAiStatus(result.backendStatus);
      setInsights(result.insights.map(mapInsight));
      setRecommendations(result.recommendations.map(mapRec));
      setLastRefresh(new Date());
    } catch {
      refreshLocal();
    } finally {
      setLoading(false);
    }
  }, [refreshLocal]);

  const fetchBriefing = useCallback(async (force = false) => {
    setBriefingLoading(true);
    try {
      const result = await fetchHealthBriefing(physicalRef.current, { force, deviceId });
      setBriefing(result);
    } catch {
      setBriefing(null);
    } finally {
      setBriefingLoading(false);
    }
  }, [deviceId]);

  const fetchMaintenance = useCallback(async () => {
    setMaintenanceLoading(true);
    try {
      const res = await apiClient.predictMaintenance({ deviceId, sensorHealth: physicalRef.current });
      if (res && res.overallHealth && Array.isArray(res.issues)) {
        setMaintenance(res);
      } else {
        setMaintenance(computeLocalMaintenance(physicalRef.current, t));
      }
    } catch {
      setMaintenance(computeLocalMaintenance(physicalRef.current, t));
    } finally {
      setMaintenanceLoading(false);
    }
  }, [deviceId]);

  const fetchTelemetry = useCallback(async () => {
    try {
      const stats = await apiClient.getAIStats();
      if (stats && stats.usage) setTelemetry(stats);
    } catch { /* telemetry optional */ }
  }, []);

  const copilotAbortRef = useRef<AbortController | null>(null);

  const askCopilot = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || copilotLoading) return;
    copilotAbortRef.current?.abort();
    const controller = new AbortController();
    copilotAbortRef.current = controller;
    setCopilotInput(q);
    setCopilotLoading(true);
    setCopilotError(null);
    setCopilotStream('');
    setCopilotResult(null);
    await fetchCopilotStream(q, {
      deviceId,
      signal: controller.signal,
      onChunk: (c) => setCopilotStream(prev => prev + c),
      onResult: (res) => {
        setCopilotResult(res);
        setCopilotStream('');
      },
      onError: (msg) => setCopilotError(msg),
    });
    setCopilotLoading(false);
  }, [copilotLoading, deviceId]);

  useEffect(() => {
    if (aiStatus === 'online') fetchBriefing();
  }, [aiStatus, fetchBriefing]);

  useEffect(() => {
    apiClient.get('/v3/compliance/trends').then((r: any) => {
      if (Array.isArray(r)) setComplianceData(r);
    }).catch(() => {});
    checkAIStatus();
    fetchSensorHistory();
    fetchTelemetry();
  }, [checkAIStatus, fetchSensorHistory, fetchTelemetry]);

  useEffect(() => {
    if (aiStatus === 'online') refreshFull();
    else refreshLocal();
    fetchMaintenance();
  }, [aiStatus, refreshFull, refreshLocal, fetchMaintenance]);

  useEffect(() => {
    const timer = setTimeout(() => refreshLocal(), 400);
    return () => clearTimeout(timer);
  }, [data.ehi, refreshLocal]);

  const sensorMatrix = useMemo(() => {
    const rows: Array<{ key: string; label: string; value: number; unit: string; level: 'normal' | 'warning' | 'critical' }> = [];
    for (const [key, value] of Object.entries(data.physical)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const t = SENSOR_THRESHOLDS[key];
      rows.push({
        key,
        label: t?.label || key.toUpperCase(),
        value,
        unit: t?.unit || '',
        level: evaluateSensorLevel(key, value),
      });
    }
    const rank = { critical: 0, warning: 1, normal: 2 };
    return rows.sort((a, b) => rank[a.level] - rank[b.level]);
  }, [data.physical]);

  const matrixCounts = useMemo(() => ({
    normal: sensorMatrix.filter(s => s.level === 'normal').length,
    warning: sensorMatrix.filter(s => s.level === 'warning').length,
    critical: sensorMatrix.filter(s => s.level === 'critical').length,
  }), [sensorMatrix]);

  const currentState = useMemo(() => analyzeCurrentState(data.physical), [data.physical]);

  const statusesFromContext: CopilotStatus[] = copilotResult?.context?.statuses ?? [];

  const aiStatusTone = aiStatus === 'online' ? 'emerald' : aiStatus === 'offline' ? 'rose' : 'slate' as const;

  const runAll = () => {
    refreshFull();
    fetchBriefing(true);
    fetchMaintenance();
    fetchTelemetry();
  };

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
                AI {aiStatus === 'online' ? t('ai.status.online', 'Online') : aiStatus === 'offline' ? t('ai.status.offline', 'Offline') : t('ai.status.checking', 'Checking…')}
              </span>
            </Pill>
            <Btn
              variant="primary"
              size="sm"
              loading={loading}
              onClick={runAll}
            >
              <RefreshCw size={14} /> {t('ai.refresh', 'Refresh')}
            </Btn>
          </div>
        }
      />

      <Card hover={false}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <SectionTitle className="mb-0">
            <span className="flex items-center gap-2">
              <Activity size={18} className="text-[var(--indigo)]" />
              {t('ai.currentState.title', 'What is happening right now')}
              {currentState.attentionCount === 0 && (
                <span className="text-xs font-normal text-[var(--text-tertiary)] ms-2">{t('ai.currentState.nominal', 'All parameters nominal')}</span>
              )}
            </span>
          </SectionTitle>
          {data.physical && Object.keys(data.physical).length > 0 && (
            <Pill tone={CURRENT_STATE_TONES[currentState.status]}>
              {currentState.status.toUpperCase()}
            </Pill>
          )}
        </div>

        {!data.physical || Object.keys(data.physical).length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--text-secondary)]">{t('ai.currentState.empty', 'No live sensor readings yet — start Live Mode or connect a device.')}</div>
        ) : currentState.facts.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]">
            <div className="w-10 h-10 rounded-full bg-[var(--emerald-dim)] flex items-center justify-center shrink-0">
              <CheckCircle size={20} className="text-[var(--emerald)]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">{t('ai.currentState.headlineGood', 'Everything looks good.')}</div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {t('ai.currentState.goodText', 'All monitored sensors are inside WHO/EPA recommended ranges. Keep monitoring — conditions can change quickly.')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`p-4 rounded-lg border ${currentState.status === 'critical' ? 'border-[var(--rose)]/40 bg-[var(--rose-dim)]' : 'border-[var(--amber)]/40 bg-[var(--amber-dim)]'}`}>
              <div className={`text-sm font-medium ${currentState.status === 'critical' ? 'text-[var(--rose)]' : 'text-[var(--amber)]'}`}>
                <span className="me-2">{currentState.status === 'critical' ? '⚠' : '⚠'}</span>
                {currentState.headline}
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1.5">
                {t('ai.currentState.subhead', 'The AI is reading live sensor data — these are the conditions detected right now:')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {currentState.facts.map(fact => (
                <div key={fact.key} className={`p-3 rounded-lg border flex items-start gap-3 ${fact.level === 'critical' ? 'border-[var(--rose)]/40 bg-[var(--rose-dim)]' : 'border-[var(--amber)]/40 bg-[var(--amber-dim)]'}`}>
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${fact.level === 'critical' ? 'bg-[var(--rose)]' : 'bg-[var(--amber)]'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{fact.label}</span>
                      <span className="text-xs font-mono text-[var(--text-secondary)]">{fact.value}{fact.unit}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">{fact.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Sensor status matrix */}
      <Card hover={false}>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Activity size={18} className="text-[var(--indigo)]" />
            {t('ai.matrix.title', 'Sensor Status Matrix')}
            <span className="text-xs font-normal text-[var(--text-tertiary)] ms-2">
              {matrixCounts.normal > 0 && <span className="text-[var(--emerald)]">{matrixCounts.normal} {t('ai.matrix.normal', 'OK')}</span>}
              {matrixCounts.warning > 0 && <span className="ms-2 text-[var(--amber)]">{matrixCounts.warning} {t('ai.matrix.warning', 'warn')}</span>}
              {matrixCounts.critical > 0 && <span className="ms-2 text-[var(--rose)]">{matrixCounts.critical} {t('ai.matrix.critical', 'crit')}</span>}
            </span>
          </span>
        </SectionTitle>
        {sensorMatrix.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--text-secondary)]">{t('ai.matrix.empty', 'No sensor readings available yet.')}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {sensorMatrix.map(s => (
              <div key={s.key} className={`p-3 rounded-lg border ${s.level === 'critical' ? 'border-[var(--rose)]/40 bg-[var(--rose-dim)]' : s.level === 'warning' ? 'border-[var(--amber)]/40 bg-[var(--amber-dim)]' : 'border-[var(--border)] bg-[var(--bg-tertiary)]'}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] truncate">{s.label}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.level === 'critical' ? 'bg-[var(--rose)]' : s.level === 'warning' ? 'bg-[var(--amber)]' : 'bg-[var(--emerald)]'}`} />
                </div>
                <div className={`text-base font-semibold mt-1 ${s.level === 'critical' ? 'text-[var(--rose)]' : s.level === 'warning' ? 'text-[var(--amber)]' : 'text-[var(--text-primary)]'}`}>
                  {s.value}
                  <span className="text-[10px] font-normal text-[var(--text-tertiary)] ms-0.5">{s.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {statusesFromContext.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {statusesFromContext.map(s => (
              <Pill key={s.sensor} tone={STATUS_TONES[s.level] ?? 'slate'}>
                {s.label || s.sensor}: {s.value}{s.unit ? ` ${s.unit}` : ''}
              </Pill>
            ))}
          </div>
        )}
      </Card>

      {/* Predictive maintenance */}
      <Card hover={false}>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Wrench size={18} className="text-[var(--amber)]" />
            {t('ai.maint.title', 'Predictive Maintenance')}
            {deviceId && <Pill tone="cyan" className="ms-2">{deviceId}</Pill>}
          </span>
        </SectionTitle>
        {maintenanceLoading && !maintenance ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
            <Loader2 size={14} className="animate-spin" /> {t('ai.maint.loading', 'Analyzing sensor health…')}
          </div>
        ) : !maintenance ? (
          <div className="py-6 text-center text-sm text-[var(--text-secondary)]">{t('ai.maint.unavailable', 'Maintenance analysis unavailable.')}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MiniStat label={t('ai.maint.overallHealth', 'Overall health')} value={maintenance.overallHealth.toUpperCase()} tone={MAINTENANCE_HEALTH_TONES[maintenance.overallHealth] === 'emerald' ? 'cyan' : MAINTENANCE_HEALTH_TONES[maintenance.overallHealth]} />
              <MiniStat label={t('ai.maint.issues', 'Issues')} value={String(maintenance.issues.length)} tone="rose" />
              <MiniStat label={t('ai.maint.schedule', 'Schedule')} value={String(maintenance.maintenanceSchedule.length)} tone="amber" />
              <MiniStat label={t('ai.maint.failures', 'Predicted failures')} value={String(maintenance.predictedFailures.length)} tone="violet" />
            </div>

            {maintenance.issues.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('ai.maint.issues', 'Issues')}</div>
                {maintenance.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                    <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${issue.urgency === 'high' ? 'text-[var(--rose)]' : 'text-[var(--amber)]'}`} />
                    <div className="text-xs text-[var(--text-secondary)]">
                      <span className="font-medium text-[var(--text-primary)]">{issue.sensor}</span> — {issue.issue}
                    </div>
                    <Pill tone={issue.urgency === 'high' ? 'rose' : 'amber'} className="ms-auto">{issue.urgency.toUpperCase()}</Pill>
                  </div>
                ))}
              </div>
            )}

            {maintenance.maintenanceSchedule.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('ai.maint.schedule', 'Maintenance schedule')}</div>
                {maintenance.maintenanceSchedule.map((task, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                    <CheckCircle size={14} className="shrink-0 text-[var(--emerald)]" />
                    <div className="text-xs text-[var(--text-secondary)] flex-1">{task.task}</div>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{task.dueIn}</span>
                    <Pill tone={PRIORITY_TONES[task.priority] || 'amber'}>{task.priority.toUpperCase()}</Pill>
                  </div>
                ))}
              </div>
            )}

            {maintenance.predictedFailures.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('ai.maint.predicted', 'Predicted failures')}</div>
                {maintenance.predictedFailures.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                    <Cpu size={14} className="shrink-0 text-[var(--rose)]" />
                    <div className="text-xs text-[var(--text-secondary)] flex-1">{f.component}</div>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{t('ai.maint.timeframe', 'timeframe')}: {f.timeframe}</span>
                    <Pill tone="rose">{(f.probability * 100).toFixed(0)}%</Pill>
                  </div>
                ))}
              </div>
            )}

            {maintenance.issues.length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)] text-xs text-[var(--emerald)]">
                <CheckCircle size={14} /> {t('ai.maint.noIssues', 'All sensors healthy — no maintenance required.')}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* LLM telemetry */}
      <Card hover={false}>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Database size={18} className="text-[var(--violet)]" />
            {t('ai.telemetry.title', 'LLM Telemetry')}
          </span>
        </SectionTitle>
        {!telemetry ? (
          <div className="py-6 text-center text-sm text-[var(--text-secondary)]">{t('ai.telemetry.unavailable', 'Telemetry unavailable.')}</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
              <Globe size={12} />
              <span className="font-mono">{telemetry.model}</span>
              <Pill tone={telemetry.configured ? 'emerald' : 'amber'}>
                {telemetry.configured ? t('ai.telemetry.configured', 'configured') : t('ai.telemetry.unconfigured', 'no API key')}
              </Pill>
              <Pill tone="slate">{telemetry.status}</Pill>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <MiniStat label={t('ai.telemetry.calls', 'Calls')} value={String(telemetry.usage.calls)} tone="indigo" />
              <MiniStat label={t('ai.telemetry.errors', 'Errors')} value={String(telemetry.usage.errors)} tone={telemetry.usage.errors > 0 ? 'rose' : 'emerald'} />
              <MiniStat label={t('ai.telemetry.latency', 'Avg latency')} value={`${telemetry.usage.avgLatencyMs}ms`} tone="cyan" />
              <MiniStat label={t('ai.telemetry.tokens', 'Tokens')} value={String((telemetry.usage.promptTokens || 0) + (telemetry.usage.completionTokens || 0))} tone="violet" />
              <MiniStat label={t('ai.telemetry.cache', 'Cache hit rate')} value={`${telemetry.cache?.hitRate ?? 0}%`} tone="amber" />
            </div>
            {telemetry.cache && (
              <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-tertiary)]">
                <span>{t('ai.telemetry.cacheSize', 'Cache size')}: {telemetry.cache.size}/{telemetry.cache.max}</span>
                <span>{t('ai.telemetry.cacheHits', 'hits')}: {telemetry.cache.hits}</span>
                <span>{t('ai.telemetry.cacheMisses', 'misses')}: {telemetry.cache.misses}</span>
                {telemetry.usage.lastError && <span className="text-[var(--rose)]">{t('ai.telemetry.lastError', 'last error')}: {telemetry.usage.lastError}</span>}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card hover={false}>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Brain size={18} className="text-[var(--indigo)]" />
            {t('ai.briefing.title', 'AI Health Briefing')}
            {briefing && (
              <span className="flex items-center gap-2 ms-auto">
                <Pill tone={BRIEFING_STATUS_TONES[briefing.status]}>{briefing.status.toUpperCase()}</Pill>
                <Pill tone={PRIORITY_TONES[briefing.riskLevel]}>{briefing.riskLevel.toUpperCase()} {t('ai.briefing.risk', 'RISK')}</Pill>
              </span>
            )}
          </span>
        </SectionTitle>
        {briefingLoading && !briefing ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
            <Loader2 size={14} className="animate-spin" /> {t('ai.briefing.compiling', 'Compiling health briefing…')}
          </div>
        ) : !briefing ? (
          <div className="py-6 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              {aiStatus === 'online'
                ? t('ai.briefing.unavailable', 'Health briefing unavailable.')
                : t('ai.briefing.offline', 'Backend AI is offline — health briefing requires the backend.')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-center">
              <div className="flex flex-col items-center">
                {briefing.healthScore != null && (
                  <HealthGauge value={briefing.healthScore} size={140} label={t('ai.briefing.health', 'Health')} unit="/ 100" />
                )}
                <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                  {t('ai.briefing.confidence', 'Confidence')} {(briefing.confidence?.overall ?? 0) * 100}% · {briefing.dataQuality?.readings ?? 0} {t('ai.briefing.readings', 'readings')}
                  {briefing.cached && ` · ${t('ai.briefing.cached', 'cached')}`}
                </div>
              </div>
              <div>
                <div className="font-medium text-sm text-[var(--text-primary)]">{briefing.headline}</div>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">{briefing.summary}</p>
                {briefing.highlights && briefing.highlights.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {briefing.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--emerald)]">
                        <CheckCircle size={12} className="shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                )}
                {briefing.concerns && briefing.concerns.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {briefing.concerns.map((c, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--amber)]">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {briefing.recommendedActions && briefing.recommendedActions.length > 0 && (
              <div className="space-y-2">
                {briefing.recommendedActions.map((a, i) => (
                  <div key={i} className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-1">
                      <Pill tone={PRIORITY_TONES[a.priority] || 'amber'}>{String(a.priority || 'medium').toUpperCase()}</Pill>
                      <span className="text-xs font-medium text-[var(--text-primary)]">{a.title}</span>
                    </div>
                    {a.description && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{a.description}</p>}
                  </div>
                ))}
              </div>
            )}

            {briefing.compliance && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                <Globe size={12} />
                <span>
                  {briefing.compliance.compliant
                    ? t('ai.briefing.compliant', 'No regulatory exceedances under {framework} ({authority}).', { framework: briefing.compliance.framework, authority: briefing.compliance.authority })
                    : t('ai.briefing.exceedances', '{count} regulatory exceedance(s) under {framework} ({authority}).', { count: briefing.compliance.exceedances.length, framework: briefing.compliance.framework, authority: briefing.compliance.authority })}
                </span>
              </div>
            )}

            {briefing.references && briefing.references.length > 0 && (
              <SourceChips sources={briefing.references as SourceReference[]} tr={t} />
            )}
          </div>
        )}
      </Card>

      <Card hover={false}>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--violet)]" />
            {t('ai.copilot.title', 'AI Copilot')}
          </span>
        </SectionTitle>

        {copilotResult && (
          <div className="space-y-3 mb-4">
            <div className="flex justify-end">
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm rtl:rounded-bl-sm rtl:rounded-br-2xl bg-[var(--indigo-dim)] border border-[var(--indigo)]/40 text-sm text-[var(--text-primary)]">
                {copilotResult.question}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-[var(--violet-dim)] border border-[var(--violet)]/40 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={13} className="text-[var(--violet)]" />
              </div>
              <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tl-sm rtl:rounded-tr-sm rtl:rounded-tl-2xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] leading-relaxed">
                {copilotLoading ? (
                  copilotStream ? (
                    <span>{copilotStream}<span className="inline-block w-1.5 h-4 align-middle bg-[var(--violet)] animate-pulse ms-0.5" /></span>
                  ) : (
                    <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Loader2 size={14} className="animate-spin" /> {t('ai.copilot.analyzing', 'Analyzing live data…')}
                    </span>
                  )
                ) : copilotResult.answer}
                {!copilotLoading && (
                  <div className="mt-2 pt-2 border-t border-[var(--border)]/60 flex flex-wrap items-center gap-1.5">
                    <Pill tone={copilotResult.grounded ? 'emerald' : 'slate'}>
                      {copilotResult.grounded ? t('ai.copilot.grounded', 'grounded in live data') : t('ai.copilot.notGrounded', 'no live data')}
                    </Pill>
                    {copilotResult.deterministic && <Pill tone="cyan">{t('ai.copilot.deterministic', 'deterministic (no LLM)')}</Pill>}
                    {typeof copilotResult.confidence === 'number' && (
                      <Pill tone="slate">{t('ai.copilot.confidence', 'confidence')} {(copilotResult.confidence * 100).toFixed(0)}%</Pill>
                    )}
                    {copilotResult.tools && copilotResult.tools.length > 0 && (
                      <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                        <Zap size={10} /> {copilotResult.tools.length} {t('ai.copilot.tools', 'tools')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {copilotResult.context && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                <MiniStat label={t('ai.copilot.healthScore', 'Health score')} value={copilotResult.context.healthScore != null ? `${copilotResult.context.healthScore}/100` : '—'} tone="indigo" />
                <MiniStat label={t('ai.copilot.riskLevel', 'Risk level')} value={String(copilotResult.context.riskLevel || '—').toUpperCase()} tone="amber" />
                <MiniStat label={t('ai.copilot.devices', 'Devices')} value={String(copilotResult.context.deviceCount ?? '—')} tone="cyan" />
                <MiniStat label={t('ai.copilot.anomalies', 'Anomalies')} value={String(copilotResult.context.anomalies ?? '—')} tone="rose" />
              </div>
            )}

            {copilotResult.followups && copilotResult.followups.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)] mb-1.5">{t('ai.copilot.followups', 'Suggested follow-ups')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {copilotResult.followups.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => askCopilot(f)}
                      disabled={copilotLoading}
                      className="px-3 py-1.5 rounded-full text-[11px] border border-[var(--violet)]/40 bg-[var(--violet-dim)] text-[var(--violet)] hover:bg-[var(--violet)]/15 transition disabled:opacity-50"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {copilotResult.cited && copilotResult.cited.length > 0 && (
              <div className="pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)] flex items-center gap-1 shrink-0">
                    <BookOpen size={10} /> {t('ai.references', 'References')}
                  </span>
                  {copilotResult.cited.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[10px] text-[var(--text-tertiary)]">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {copilotError && (
          <div className="mb-3 p-3 rounded-[var(--radius-md)] bg-[var(--rose-dim)] border border-[var(--rose-dim)] text-xs text-[var(--rose)]">
            {copilotError}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTED_PROMPTS.map((p, i) => (
            <button
              key={p}
              onClick={() => askCopilot(p)}
              disabled={copilotLoading}
              className="px-3 py-1.5 rounded-full text-[11px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--violet)] hover:text-[var(--violet)] transition disabled:opacity-50"
            >
              {t(`ai.copilot.prompt.${i}`, p)}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); askCopilot(copilotInput); }}
          className="flex items-center gap-2"
        >
          <input
            value={copilotInput}
            onChange={e => setCopilotInput(e.target.value)}
            placeholder={t('ai.copilot.placeholder', 'Ask about live conditions, trends, anomalies or compliance…')}
            className="flex-1 px-4 py-2.5 rounded-[var(--radius-sm)] text-sm"
          />
          <Btn variant="primary" size="sm" type="submit" loading={copilotLoading} disabled={!copilotInput.trim()}>
            <Send size={14} /> {t('ai.copilot.ask', 'Ask')}
          </Btn>
        </form>
      </Card>

      <div>
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Zap size={18} />
            {t('ai.insights.title', 'Live Insights')}
            <span className="text-xs font-normal text-[var(--text-tertiary)] ms-2">
              {t('ai.insights.updated', 'Last updated')}: {lastRefresh.toLocaleTimeString()}
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
                    <SourceChips sources={insight.sources} tr={t} />
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
            {t('ai.recs.title', 'AI Recommendations')}
            {recommendations.length > 0 && (
              <span className="text-xs font-normal text-[var(--text-tertiary)] ms-2">
                {t('ai.recs.count', '{count} actionable', { count: recommendations.length })}
              </span>
            )}
          </span>
        </SectionTitle>
        {recommendations.length === 0 ? (
          <div className="text-center py-8">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
                <Loader2 size={14} className="animate-spin" /> {t('ai.recs.generating', 'Generating recommendations…')}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">{t('ai.recs.none', 'No recommendations — all monitored parameters are within WHO/EPA guideline ranges.')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {aiStatus === 'offline' && (
              <div className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-2 px-1">
                <Globe size={12} className="shrink-0" />
                {t('ai.recs.offline', 'Backend AI is offline — showing evidence-based recommendations cited from WHO, EPA, ASHRAE and ISO standards.')}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-1">
              {(['high', 'medium', 'low'] as const).map(p => {
                const n = recommendations.filter(r => r.priority === p).length;
                if (n === 0) return null;
                return (
                  <Pill key={p} tone={PRIORITY_TONES[p]} className="text-[10px]">
                    {n} {p}
                  </Pill>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {recommendations.map((rec) => {
                const CatIcon = REC_CATEGORY_ICONS[rec.category] || Lightbulb;
                return (
                  <div key={rec.id} className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${rec.priority === 'high' ? 'bg-[var(--rose-dim)]' : rec.priority === 'medium' ? 'bg-[var(--amber-dim)]' : 'bg-[var(--emerald-dim)]'}`}>
                        <CatIcon size={16} className={rec.priority === 'high' ? 'text-[var(--rose)]' : rec.priority === 'medium' ? 'text-[var(--amber)]' : 'text-[var(--emerald)]'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={PRIORITY_TONES[rec.priority]}>
                            {rec.priority.toUpperCase()}
                          </Pill>
                          <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{rec.category}</span>
                          {rec.affectedGroups && rec.affectedGroups.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] ms-auto">
                              <Users size={11} />
                              {rec.affectedGroups.slice(0, 3).join(' · ')}
                              {rec.affectedGroups.length > 3 && ` +${rec.affectedGroups.length - 3}`}
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-sm text-[var(--text-primary)] mt-1.5">{rec.title}</div>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{rec.description}</p>
                        <SourceChips sources={rec.sources} tr={t} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Compliance Analysis */}
      {complianceData.length > 0 && (
        <Card hover={false}>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <Globe size={18} className="text-[var(--violet)]" />
              {t('ai.compliance.title', 'Compliance Analysis by Country')}
            </span>
          </SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={complianceData} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                <ChartGrid />
                <XAxis dataKey="country" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                <Bar dataKey="compliance" name={t('ai.compliance.series', 'Compliance %')} fill="var(--violet)" radius={[4, 4, 0, 0]} />
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
                  {cd.compliance >= 80 ? t('ai.compliance.within', 'Within guidelines') : cd.compliance >= 60 ? t('ai.compliance.partial', 'Partial compliance') : t('ai.compliance.attention', 'Attention needed')}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
