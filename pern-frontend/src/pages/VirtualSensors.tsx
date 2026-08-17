import { useMemo, useState, useEffect } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useData } from '../lib/data-provider';
import { useI18n } from '../lib/i18n';
import { PageHeader, Card, Pill, Gauge, Badge, StatCard, SourceChips, LoadingState, Btn } from '../components/ui';
import { AnimatedGauge, ModelPipeline } from '../components/ModelExplainability';
import { ChartGrid, CHART_TICK, ChartTooltip } from '../components/charts';
import { SENSOR_TYPES } from '../lib/constants';
import { computeEstimatedSensors, validateEstimates, ALL_ESTIMATORS, ESTIMATOR_METADATA, ESTIMATE_REAL_KEY, type EstimatedSensor } from '../lib/virtual-sensor-estimators';
import { type VirtualSensorResult } from '../lib/virtual-sensors';
import { toCitation, type SourceReference } from '../lib/ai-references';
import { apiClient } from '../lib/api-client';
import {
  Wind, Droplet, Thermometer, Waves, Beaker, FlaskConical,
  Sprout, Cloud, Flame, AlertTriangle, ThermometerSun,
  Activity, Sigma, Cpu, Sun, ThermometerSnowflake, Umbrella,
  Gauge as GaugeIcon, Lightbulb, Wheat, Thermometer as ThermometerIcon,
  Home, Shield, Users, Lock, CheckCircle2, BrainCircuit, ShieldCheck, BookOpen,
  History, Sliders, RotateCcw, Play, Target,
} from 'lucide-react';
import type { ComponentType } from 'react';

const COMPUTED_ICONS: Record<string, ComponentType<any>> = {
  aqi: Wind, wqi: Droplet, risk: AlertTriangle, thermal: ThermometerSun,
  indoor: Home, corrosion: Shield, bod: FlaskConical, agri: Sprout,
  eutro: Waves, exposure: Users,
};

const SENSOR_ICONS: Record<string, ComponentType<any>> = {
  ph: Droplet, tds: Beaker, wT: Thermometer, dO: Wind, tb: Waves,
  pm25: Wind, mq: Flame, tmp: ThermometerSun, hum: Droplet,
  co2: Cloud, nh3: AlertTriangle, voc: FlaskConical, sm: Sprout,
  light: Sun,
};

const EST_FALLBACK: Record<string, ComponentType<any>> = {
  vno2: Flame, vpm10: Wind, vpm25: Wind, vdp: ThermometerSnowflake,
  vhi: Sun, vvpd: Umbrella, vepd: Activity, vwbgt: ThermometerIcon,
  vuv: Sun, vsolar: Lightbulb, vet: Wheat, vaqi: Gauge, vppfd: Sun,
};

const CATEGORY_PILL: Record<string, { tone: 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate'; color: string }> = {
  excellent: { tone: 'emerald', color: 'var(--emerald)' },
  good:      { tone: 'cyan', color: 'var(--cyan)' },
  moderate:  { tone: 'amber', color: 'var(--amber)' },
  poor:      { tone: 'rose', color: 'var(--orange)' },
  critical:  { tone: 'rose', color: 'var(--rose)' },
};

const TIER_META: Record<number, { label: string; icon: ComponentType<any>; desc: string; needs: string[]; unlocked: (keys: string[]) => boolean }> = {
  1: { label: 'Temp + Humidity', icon: ThermometerSun, desc: 'Requires temperature & humidity only — highest confidence', needs: ['tmp', 'hum'], unlocked: (k) => k.includes('tmp') && k.includes('hum') },
  2: { label: '+ MQ-135 Gas', icon: Flame, desc: 'Add an MQ-135 gas sensor to unlock air quality estimates', needs: ['mq'], unlocked: (k) => k.includes('mq') },
  3: { label: '+ Light Sensor', icon: Lightbulb, desc: 'Add a light sensor to unlock UV, solar radiation & evapotranspiration', needs: ['light'], unlocked: (k) => k.includes('light') },
  4: { label: 'Water Sensors', icon: Droplet, desc: 'Add water sensors (pH, TDS, DO, Water Temp) for aquatic estimates', needs: ['ph', 'tds', 'wT', 'dO'], unlocked: (k) => k.includes('ph') || k.includes('tds') || k.includes('wT') || k.includes('dO') },
};

const TIER_SENSORS: Record<number, string[]> = {
  1: ['tmp', 'hum'],
  2: ['mq'],
  3: ['light'],
  4: ['ph', 'tds', 'wT', 'dO', 'tb'],
};

function SensorCard({ s, source }: { s: EstimatedSensor; source: 'physical' | 'estimated' }) {
  const { t } = useI18n();
  const isPhysical = source === 'physical';
  const iconKey = isPhysical ? s.id : (s.id.startsWith('v') ? s.id : `v${s.id}`);
  const Icon = isPhysical
    ? SENSOR_ICONS[s.id as keyof typeof SENSOR_ICONS] || Activity
    : EST_FALLBACK[iconKey as keyof typeof EST_FALLBACK] || Activity;
  const cat = isPhysical ? undefined : CATEGORY_PILL[s.category] || CATEGORY_PILL.moderate;
  const valColor = isPhysical ? 'var(--emerald)' : cat?.color || 'var(--cyan)';

  return (
    <Card className="flex flex-col" hover={false}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center"
            style={{ background: isPhysical ? 'var(--emerald-dim)' : (cat?.color ? `${cat.color}15` : 'var(--cyan-dim)') }}>
            <Icon size={17} style={{ color: valColor }} />
          </div>
          <div>
            <div className="text-sm font-semibold">{s.name}</div>
            {s.unit && <div className="text-[10px] text-[var(--text-tertiary)] font-medium">{s.unit}</div>}
          </div>
        </div>
        <Pill tone={isPhysical ? 'emerald' : (cat?.tone || 'cyan')}>
          {isPhysical ? t('virtualSensors.physical', 'Physical') : t(`virtualSensors.category.${s.category}`, s.category)}
        </Pill>
      </div>

      <div className="text-3xl font-bold mb-3" style={{ color: valColor }}>
        {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
        {s.unit && <span className="text-sm font-normal text-[var(--text-tertiary)] ml-1 rtl:mr-1">{s.unit}</span>}
      </div>

      {!isPhysical && s.confidence !== undefined && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-[var(--text-tertiary)]">{t('virtualSensors.confidence', 'Confidence')}</span>
            <span className="font-semibold" style={{ color: s.confidence >= 70 ? 'var(--emerald)' : s.confidence >= 50 ? 'var(--amber)' : 'var(--rose)' }}>
              {s.confidence}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${s.confidence}%`,
                background: `linear-gradient(90deg, ${s.confidence >= 70 ? 'var(--emerald)' : s.confidence >= 50 ? 'var(--amber)' : 'var(--rose)'}, ${s.confidence >= 70 ? '#34d399' : s.confidence >= 50 ? '#fbbf24' : '#fb7185'})`
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-[var(--text-disabled)] mt-0.5">
            <span>{s.confidence >= 70 ? t('virtualSensors.confidenceHigh', 'High') : s.confidence >= 50 ? t('virtualSensors.confidenceMedium', 'Medium') : t('virtualSensors.confidenceLow', 'Low')}</span>
            {s.references && s.references.length > 0
              ? <span>{t('virtualSensors.refCount', '{count} refs', { count: s.references.length })} · R²</span>
              : <span>{t('virtualSensors.r2Data', 'R² data')}</span>}
          </div>
        </div>
      )}

      {s.formula && !isPhysical && (
        <div className="text-[10px] text-[var(--text-tertiary)] leading-relaxed mb-3 p-2 rounded-[var(--radius-xs)] bg-[var(--surface-hover)]">
          <Sigma size={10} className="inline mr-1 rtl:ml-1 opacity-60" />
          {s.formula}
        </div>
      )}

      {s.inputs && s.inputs.length > 0 && !isPhysical && (
        <div className="mt-auto">
          <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">{t('virtualSensors.inputs', 'Inputs')}</div>
          <div className="flex flex-wrap gap-1">
            {s.inputs.map((inp, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'var(--surface-hover)', color: 'var(--text-secondary)' }}>
                {inp.key} <span className="opacity-50">{(inp.weight * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {s.realSensor && !isPhysical && (
        <div className="mt-2 text-[9px] text-[var(--text-tertiary)] leading-tight flex items-start gap-1">
          <span className="opacity-50 mt-[1px]">\u2192</span>
          <span>{s.realSensor.startsWith('\u2014') ? s.realSensor.slice(2).trim() : t('virtualSensors.realSensorLabel', 'Real sensor: {value}', { value: s.realSensor })}</span>
        </div>
      )}

      {s.citation && !isPhysical && (
        <div className="mt-2 text-[9px] text-[var(--text-disabled)] italic leading-tight">
          {s.citation}
        </div>
      )}

      {s.references && s.references.length > 0 && (
        <SourceChips sources={s.references} className="mt-2.5" />
      )}

      {!isPhysical && s.tier && (
        <div className="mt-2.5 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase">{t('virtualSensors.tier', 'Tier {tier}', { tier: s.tier })}</span>
            <span className="text-[9px] text-[var(--text-disabled)]">{t(`virtualSensors.tierLabel.${s.tier}`, s.tierLabel)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function ComputedSensorCard({ s }: { s: VirtualSensorResult }) {
  const { t } = useI18n();
  const Icon = COMPUTED_ICONS[s.id as keyof typeof COMPUTED_ICONS] || Activity;
  return (
    <Card className="flex flex-col" hover={false}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: `${s.color}15` }}>
            <Icon size={17} style={{ color: s.color }} />
          </div>
          <div>
            <div className="text-sm font-semibold">{s.name}</div>
            {s.unit && <div className="text-[10px] text-[var(--text-tertiary)] font-medium">{s.unit}</div>}
          </div>
        </div>
        <Badge category={s.category}>{t(`virtualSensors.category.${s.category}`, s.category)}</Badge>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <AnimatedGauge value={s.value} min={0} max={s.id === 'bod' ? 18 : s.id === 'agri' ? 100 : s.id === 'indoor' ? 100 : 500} size={72} />
        <div className="text-3xl font-bold" style={{ color: s.color }}>
          {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
          {s.unit && <span className="text-sm font-normal text-[var(--text-tertiary)] ml-1 rtl:mr-1">{s.unit}</span>}
        </div>
      </div>
      {/* Confidence Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-[var(--text-tertiary)]">{t('virtualSensors.confidence', 'Confidence')}</span>
          <span className="font-semibold" style={{ color: s.confidence >= 70 ? 'var(--emerald)' : s.confidence >= 50 ? 'var(--amber)' : 'var(--rose)' }}>
            {s.confidence}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{
            width: `${s.confidence}%`,
            background: `linear-gradient(90deg, ${s.confidence >= 70 ? 'var(--emerald)' : s.confidence >= 50 ? 'var(--amber)' : 'var(--rose)'}, ${s.confidence >= 70 ? '#34d399' : s.confidence >= 50 ? '#fbbf24' : '#fb7185'})`
          }} />
        </div>
      </div>
      {s.formula && (
        <div className="text-[10px] text-[var(--text-tertiary)] leading-relaxed mb-3 p-2 rounded-[var(--radius-xs)] bg-[var(--surface-hover)]">
          <Sigma size={10} className="inline mr-1 rtl:ml-1 opacity-60" />
          {s.formula}
        </div>
      )}
      {s.inputs.length > 0 && (
        <div className="mt-auto">
          <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">{t('virtualSensors.inputs', 'Inputs')}</div>
          <div className="flex flex-wrap gap-1">
            {s.inputs.map((inp, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'var(--surface-hover)', color: 'var(--text-secondary)' }}>
                {inp.sensorType} <span className="opacity-50">{(inp.weight * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function VirtualSensorsPage() {
  const { t } = useI18n();
  const { data, isLive, mqttConnected, hasRealData } = useData();
  const physical = data.physical;
  const physicalKeys = Object.keys(physical);
  const computed = data.virtualSensors;

  const result = useMemo(() => computeEstimatedSensors(physical), [physical]);
  const estimated = result.all;
  const byTier = result.byTier;

  // — Historical validation & trend state —
  const [history, setHistory] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [selectedEstId, setSelectedEstId] = useState<string>(Object.keys(ESTIMATE_REAL_KEY)[0] || 'vco2');
  const [scenarioOverrides, setScenarioOverrides] = useState<Record<string, string>>({});
  const [scenarioName, setScenarioName] = useState(t('virtualSensors.liveValues', 'Live values'));

  useEffect(() => {
    apiClient.getSensorReadings(500).then(raw => {
      setHistory(Array.isArray(raw) ? raw : []);
    }).catch(() => setHistory([])).finally(() => setHistLoading(false));
  }, []);

  const parsedHistory = useMemo(() => {
    const out: Array<Record<string, number>> = [];
    for (const reading of history) {
      const sensors = typeof reading.sensors === 'string' ? (() => { try { return JSON.parse(reading.sensors); } catch { return {}; } })() : (reading.sensors || {});
      const rec: Record<string, number> = {};
      for (const [k, v] of Object.entries(sensors)) {
        const n = Number(v);
        if (v !== null && v !== undefined && !isNaN(n)) rec[k] = n;
      }
      if (Object.keys(rec).length > 0) out.push(rec);
    }
    return out;
  }, [history]);

  const validation = useMemo(() => validateEstimates(parsedHistory), [parsedHistory]);
  const validatedCount = validation.filter(r => r.sufficient).length;

  const bestValidated = useMemo(() => {
    let best: (typeof validation)[number] | null = null;
    for (const r of validation) if (r.sufficient && (!best || r.r2 > best.r2)) best = r;
    return best;
  }, [validation]);

  const realKeyFor = ESTIMATE_REAL_KEY[selectedEstId];

  const trendData = useMemo(() => {
    if (!realKeyFor) return [];
    const points: Array<{ index: number; estimate: number | null; actual: number | null }> = [];
    parsedHistory.forEach((r, i) => {
      const stripped = { ...r };
      delete stripped[realKeyFor];
      const est = ALL_ESTIMATORS.find(e => e(stripped)?.id === selectedEstId);
      const estimate = est ? est(stripped) : null;
      const actual = r[realKeyFor] !== undefined ? r[realKeyFor] : null;
      if (estimate && typeof estimate.value === 'number') points.push({ index: i, estimate: estimate.value, actual });
      else if (actual !== null) points.push({ index: i, estimate: null, actual });
    });
    return points;
  }, [parsedHistory, selectedEstId, realKeyFor]);

  const simulatedReadings = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(physical)) {
      if (typeof v === 'number') out[k] = v;
    }
    for (const [k, v] of Object.entries(scenarioOverrides)) {
      const n = Number(v);
      if (v !== '' && !isNaN(n)) out[k] = n;
    }
    return out;
  }, [physical, scenarioOverrides]);

  const simResult = useMemo(() => computeEstimatedSensors(simulatedReadings), [simulatedReadings]);
  const liveById = useMemo(() => Object.fromEntries(estimated.map(e => [e.id, e])), [estimated]);

  const simChanges = useMemo(() => {
    const out: Array<{ id: string; name: string; unit: string; live: number; sim: number; delta: number }> = [];
    for (const e of simResult.all) {
      const live = liveById[e.id];
      if (live && typeof live.value === 'number' && typeof e.value === 'number' && live.value !== e.value) {
        out.push({ id: e.id, name: e.name, unit: e.unit, live: live.value, sim: e.value, delta: e.value - live.value });
      }
    }
    return out;
  }, [simResult, liveById]);

  const scenarioKeys = useMemo(() => {
    const required = new Set<string>();
    for (const m of ESTIMATOR_METADATA) for (const k of m.requiredInputs) required.add(k);
    const present = new Set<string>();
    for (const k of Object.keys(simulatedReadings)) present.add(k);
    return Array.from(required).filter(k => present.has(k)).sort();
  }, [simulatedReadings]);

  const applyPreset = (name: string, values: Record<string, number>) => {
    setScenarioName(name);
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (Object.prototype.hasOwnProperty.call(simulatedReadings, k)) next[k] = String(v);
    }
    setScenarioOverrides(next);
  };

  const hasAnyData = physicalKeys.length > 0 || estimated.length > 0 || computed.length > 0;
  const avgConf = estimated.length > 0
    ? Math.round(estimated.reduce((s, e) => s + e.confidence, 0) / estimated.length)
    : 0;
  const hiConf = estimated.filter(e => e.confidence >= 70).length;
  const medConf = estimated.filter(e => e.confidence >= 50 && e.confidence < 70).length;
  const loConf = estimated.filter(e => e.confidence < 50).length;

  const activeRefs = useMemo(() => {
    const seen = new Set<string>();
    const out: SourceReference[] = [];
    for (const e of estimated) {
      for (const r of e.references || []) {
        if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
      }
    }
    return out;
  }, [estimated]);

  const tierOrder = [1, 2, 3, 4];

  const sensorCoverage = tierOrder.map(t => {
    const meta = TIER_META[t];
    const active = meta.unlocked(physicalKeys);
    return { tier: t, active, label: meta.label, icon: meta.icon };
  });

  const pctOf = (n: number) => (estimated.length > 0 ? Math.round((n / estimated.length) * 100) : 0);

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title={t('virtualSensors.title', 'Virtual Sensor Estimation')}
        subtitle={t('virtualSensors.subtitle', 'Estimate missing sensor values from available measurements using scientifically-validated models')}
      />

      {/* Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3 mb-6 grid-entrance">
        <StatCard label={t('virtualSensors.stat.physical', 'Physical Sensors')} value={physicalKeys.length} accent="emerald" icon={<Cpu size={16} />} />
        <StatCard label={t('virtualSensors.stat.computed', 'Computed (AI)')} value={computed.length} accent="violet" icon={<BrainCircuit size={16} />} />
        <StatCard label={t('virtualSensors.stat.estimated', 'Estimated')} value={estimated.length} accent="cyan" icon={<GaugeIcon size={16} />} />
        <StatCard label={t('virtualSensors.stat.avgConf', 'Avg Confidence')} value={avgConf} unit="%" accent="cyan" icon={<ShieldCheck size={16} />} />
        <StatCard label={t('virtualSensors.stat.highConf', 'High Confidence')} value={hiConf} accent="emerald" trend={t('virtualSensors.stat.highConfTrend', 'of {count} estimated', { count: estimated.length })} icon={<CheckCircle2 size={16} />} />
      </div>

      {/* Fusion pipeline — how virtual sensors are born */}
      <div className="glass-panel rounded-2xl p-5 mb-6 animate-fade-slide-up">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <GaugeIcon size={14} className="text-[var(--cyan)]" />
          <h3 className="text-sm font-semibold">{t('virtualSensors.howBorn', 'How virtual sensors are born')}</h3>
          <div className="h-px flex-1 bg-[var(--border)]" />
          <Pill tone="cyan">{t('virtualSensors.inputsOutputs', '{inputs} inputs → {outputs} outputs', { inputs: physicalKeys.length, outputs: estimated.length + computed.length })}</Pill>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-3xl leading-relaxed">
          {t('virtualSensors.howBornDesc', 'Missing sensor values are fused from the available physical measurements through tiered, evidence-based estimators — each tier adds a physical sensor and unlocks a new family of virtual readings.')}
        </p>
        <ModelPipeline
          steps={[
            { label: t('virtualSensors.step.physical', 'Physical inputs'), sub: t('virtualSensors.step.physicalSub', '{count} sensors', { count: physicalKeys.length }), tone: 'emerald' },
            { label: t('virtualSensors.tier', 'Tier {tier}', { tier: 1 }), sub: t('virtualSensors.pipe.sub.1', 'temp + humidity'), tone: 'cyan' },
            { label: t('virtualSensors.tier', 'Tier {tier}', { tier: 2 }), sub: t('virtualSensors.pipe.sub.2', '+ MQ-135 gas'), tone: 'blue' },
            { label: t('virtualSensors.tier', 'Tier {tier}', { tier: 3 }), sub: t('virtualSensors.pipe.sub.3', '+ light sensor'), tone: 'violet' },
            { label: t('virtualSensors.tier', 'Tier {tier}', { tier: 4 }), sub: t('virtualSensors.pipe.sub.4', 'water sensors'), tone: 'amber' },
            { label: t('virtualSensors.step.virtual', 'Virtual sensors'), sub: t('virtualSensors.step.live', '{count} live', { count: estimated.length + computed.length }), tone: 'emerald', pulse: true },
          ]}
        />
      </div>

      {/* Confidence distribution */}
      {estimated.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 mb-6 animate-fade-slide-up">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{t('virtualSensors.confidenceDist', 'Confidence distribution')}</div>
            <Pill tone={avgConf >= 70 ? 'emerald' : avgConf >= 50 ? 'amber' : 'rose'}>{t('virtualSensors.avgConfPill', 'avg {pct}%', { pct: avgConf })}</Pill>
          </div>
          <div className="h-3 rounded-full bg-[var(--surface-hover)] overflow-hidden flex">
            {hiConf > 0 && (
              <div className="h-full transition-all duration-700" style={{ width: `${pctOf(hiConf)}%`, background: 'linear-gradient(90deg, #059669, #34d399)' }} title={t('virtualSensors.highRange', 'High (≥70%): {count}', { count: hiConf })} />
            )}
            {medConf > 0 && (
              <div className="h-full transition-all duration-700" style={{ width: `${pctOf(medConf)}%`, background: 'linear-gradient(90deg, #d97706, #fbbf24)' }} title={t('virtualSensors.medRange', 'Medium (50–69%): {count}', { count: medConf })} />
            )}
            {loConf > 0 && (
              <div className="h-full transition-all duration-700" style={{ width: `${pctOf(loConf)}%`, background: 'linear-gradient(90deg, #e11d48, #fb7185)' }} title={t('virtualSensors.lowRange', 'Low (<50%): {count}', { count: loConf })} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[10px] text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#34d399]" /> {t('virtualSensors.legendHigh', 'High ≥70% ({count})', { count: hiConf })}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#fbbf24]" /> {t('virtualSensors.legendMed', 'Medium 50–69% ({count})', { count: medConf })}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#fb7185]" /> {t('virtualSensors.legendLow', 'Low <50% ({count})', { count: loConf })}</span>
          </div>
        </div>
      )}

      {/* Coverage */}
      <div className="glass-panel rounded-2xl p-5 mb-6 animate-fade-slide-up">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{t('virtualSensors.coverage', 'Sensor coverage')}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">{t('virtualSensors.tiersUnlocked', '{count}/4 tiers unlocked', { count: sensorCoverage.filter(c => c.active).length })}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sensorCoverage.map(c => {
            const meta = TIER_META[c.tier];
            const Icon = c.icon;
            const isUnlocked = c.active;
            const tierCount = byTier[c.tier]?.length || 0;
            const maxForTier: Record<number, number> = { 1: 8, 2: 5, 3: 4, 4: 4 };
            const fillPct = Math.min(100, Math.round((tierCount / maxForTier[c.tier]) * 100));
            return (
              <div key={c.tier}
                className={`rounded-[var(--radius-md)] p-3 border transition-all duration-300 ${isUnlocked ? 'hover:-translate-y-0.5' : 'opacity-50'}`}
                style={{ borderColor: isUnlocked ? 'rgba(16,185,129,0.35)' : 'var(--border)', background: isUnlocked ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon size={13} className={isUnlocked ? 'animate-breathe' : ''} style={{ color: isUnlocked ? 'var(--emerald)' : 'var(--text-disabled)' }} />
                  <span className="text-xs font-semibold" style={{ color: isUnlocked ? 'var(--emerald)' : 'var(--text-disabled)' }}>
                    {t('virtualSensors.tier', 'Tier {tier}', { tier: c.tier })}: {t(`virtualSensors.tier.title.${c.tier}`, meta.label)}
                  </span>
                  {isUnlocked
                    ? <CheckCircle2 size={12} className="ml-auto rtl:mr-auto animate-scale-in" style={{ color: 'var(--emerald)' }} />
                    : <Lock size={12} className="ml-auto rtl:mr-auto" style={{ color: 'var(--text-disabled)' }} />
                  }
                </div>
                {isUnlocked ? (
                  <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden mb-1.5">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${fillPct}%`, background: 'linear-gradient(90deg, var(--emerald), var(--cyan))' }} />
                  </div>
                ) : (
                  <div className="h-1.5 mb-1.5" />
                )}
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  {isUnlocked
                    ? t('virtualSensors.estimatesActive', '{count}/{max} estimates active', { count: tierCount, max: maxForTier[c.tier] })
                    : t('virtualSensors.needs', 'Needs: {keys}', { keys: TIER_SENSORS[c.tier].join(', ') })
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical validation — leave-one-out */}
      <div className="glass-panel rounded-2xl p-5 mb-6 animate-fade-slide-up">
        <div className="flex items-center gap-2 mb-1">
          <Target size={14} className="text-[var(--violet)]" />
          <h3 className="text-sm font-semibold">{t('virtualSensors.validationTitle', 'Estimator validation (leave-one-out)')}</h3>
          <div className="h-px flex-1 bg-[var(--border)]" />
          <Pill tone={validatedCount > 0 ? 'emerald' : 'amber'}>{t('virtualSensors.validatedCount', '{count}/{total} validated', { count: validatedCount, total: validation.length })}</Pill>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-3xl leading-relaxed">
          {t('virtualSensors.validationParagraph', 'For each historical reading containing both an estimator\'s inputs and the corresponding real sensor value, the real value is masked, the estimate is recomputed, then compared against the recorded value. Requires at least 3 samples per estimator. Metrics: MAE, RMSE, MBE (bias) and R².')}
        </p>
        {histLoading ? (
          <LoadingState label={t('virtualSensors.loadingHistorical', 'Loading historical readings…')} />
        ) : validation.length === 0 ? (
          <div className="text-sm text-[var(--text-tertiary)]">{t('virtualSensors.noValidation', 'No estimator / real-sensor pairs available in history yet.')}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {validation.map(v => {
              const meta = ESTIMATOR_METADATA.find(m => m.id === v.id);
              const r2Color = v.r2 >= 0.8 ? 'var(--emerald)' : v.r2 >= 0.6 ? 'var(--amber)' : 'var(--rose)';
              return (
                <div key={v.id} className={`rounded-[var(--radius-md)] p-3 border ${v.sufficient ? 'bg-white/[0.03]' : 'bg-white/[0.01] opacity-60'}`} style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">{v.name}</div>
                    {v.sufficient
                      ? <Pill tone="emerald">{t('virtualSensors.samples', '{count} samples', { count: v.n })}</Pill>
                      : <Pill tone="amber">{t('virtualSensors.needsSamples', 'needs ≥3 samples')}</Pill>}
                  </div>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-2xl font-bold font-mono" style={{ color: v.sufficient ? r2Color : 'var(--text-disabled)' }}>
                      {v.sufficient ? v.r2.toFixed(3) : '—'}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] mb-1">{v.sufficient ? t('virtualSensors.reportedR2', 'R² (reported {r2})', { r2: meta?.rSquared ?? '—' }) : 'R²'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[9px] text-[var(--text-disabled)] uppercase">{t('virtualSensors.metric.mae', 'MAE')}</div>
                      <div className="text-xs font-mono text-[var(--text-secondary)]">{v.sufficient ? v.mae : '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--text-disabled)] uppercase">{t('virtualSensors.metric.rmse', 'RMSE')}</div>
                      <div className="text-xs font-mono text-[var(--text-secondary)]">{v.sufficient ? v.rmse : '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--text-disabled)] uppercase">{t('virtualSensors.metric.mbe', 'MBE')}</div>
                      <div className="text-xs font-mono" style={{ color: v.sufficient ? (Math.abs(v.mbe) < v.rmse / 2 ? 'var(--emerald)' : 'var(--amber)') : 'var(--text-disabled)' }}>{v.sufficient ? v.mbe : '—'}</div>
                    </div>
                  </div>
                  {v.sufficient && (
                    <div className="mt-2 text-[9px] text-[var(--text-tertiary)]">{t('virtualSensors.observedRange', 'Observed range {min}–{max} {unit}', { min: v.min, max: v.max, unit: v.unit })}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historical trend — estimate vs actual */}
      <div className="glass-panel rounded-2xl p-5 mb-6 animate-fade-slide-up">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <History size={14} className="text-[var(--cyan)]" />
          <h3 className="text-sm font-semibold">{t('virtualSensors.trendTitle', 'Historical trend — estimate vs real sensor')}</h3>
          <div className="h-px flex-1 bg-[var(--border)]" />
          <select value={selectedEstId} onChange={e => setSelectedEstId(e.target.value)}
            className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--emerald)] transition-colors">
            {Object.entries(ESTIMATE_REAL_KEY).map(([id, realKey]) => {
              const meta = ESTIMATOR_METADATA.find(m => m.id === id);
              return <option key={id} value={id}>{meta?.name || id} → {SENSOR_TYPES[realKey as keyof typeof SENSOR_TYPES]?.name || realKey}</option>;
            })}
          </select>
          {bestValidated && (
            <Btn variant="ghost" size="sm" onClick={() => setSelectedEstId(bestValidated.id)}>
              {t('virtualSensors.bestR2', 'Best R² ({r2})', { r2: bestValidated.r2.toFixed(2) })}
            </Btn>
          )}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-3xl leading-relaxed">
          {t('virtualSensors.trendDesc', 'The estimator is recomputed on every historical reading with the real {sensor} value masked, then compared against the recorded value.', { sensor: SENSOR_TYPES[realKeyFor as keyof typeof SENSOR_TYPES]?.name || realKeyFor })}
        </p>
        {histLoading ? (
          <LoadingState label={t('virtualSensors.loadingHistorical', 'Loading historical readings…')} />
        ) : trendData.length === 0 ? (
          <div className="text-sm text-[var(--text-tertiary)] text-center py-8">{t('virtualSensors.noTrend', 'No historical readings available for this estimator yet.')}</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                <ChartGrid />
                <XAxis dataKey="index" type="number" tick={CHART_TICK} axisLine={false} tickLine={false}
                  label={{ value: t('virtualSensors.readingIndex', 'Reading index'), position: 'insideBottom', offset: -5, fill: 'var(--text-disabled)', fontSize: 10 }} />
                <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--text-disabled)' }} />
                <Line dataKey="estimate" name={t('virtualSensors.estimate', 'Estimate')} stroke="var(--cyan)" strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="actual" name={t('virtualSensors.actual', 'Actual')} stroke="var(--emerald)" strokeWidth={2} dot={false} connectNulls strokeDasharray="6 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {trendData.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[var(--text-tertiary)]">
            <span><span className="inline-block w-3 h-0.5 align-middle mr-1 rtl:ml-1" style={{ background: 'var(--cyan)' }} />{t('virtualSensors.legendEstimate', 'Estimate (real value masked)')}</span>
            <span><span className="inline-block w-3 h-0.5 align-middle mr-1 rtl:ml-1" style={{ background: 'var(--emerald)' }} />{t('virtualSensors.legendActual', 'Recorded real value')}</span>
          </div>
        )}
      </div>

      {/* Scenario simulation */}
      <div className="glass-panel rounded-2xl p-5 mb-6 animate-fade-slide-up">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Sliders size={14} className="text-[var(--amber)]" />
          <h3 className="text-sm font-semibold">{t('virtualSensors.scenario', 'Scenario simulation')}</h3>
          <div className="h-px flex-1 bg-[var(--border)]" />
          <Pill tone={Object.keys(scenarioOverrides).length > 0 ? 'emerald' : 'slate'}>{scenarioName}</Pill>
          {Object.keys(scenarioOverrides).length > 0 && (
            <Btn variant="ghost" size="sm" onClick={() => { setScenarioOverrides({}); setScenarioName(t('virtualSensors.liveValues', 'Live values')); }}>
              <RotateCcw size={12} /> {t('virtualSensors.reset', 'Reset')}
            </Btn>
          )}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-3xl leading-relaxed">
          {t('virtualSensors.scenarioDesc', 'Override any input sensor value to preview how virtual estimates react before deploying a real scenario.')}
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <Btn variant="ghost" size="sm" onClick={() => applyPreset(t('virtualSensors.preset.heatwave', 'Heatwave'), { tmp: (physical.tmp ?? 25) + 5, hum: (physical.hum ?? 50) - 15 })}><Play size={12} /> {t('virtualSensors.preset.heatwave', 'Heatwave')}</Btn>
          <Btn variant="ghost" size="sm" onClick={() => applyPreset(t('virtualSensors.preset.coldNight', 'Cold night'), { tmp: (physical.tmp ?? 25) - 8 })}><Play size={12} /> {t('virtualSensors.preset.coldNight', 'Cold night')}</Btn>
          <Btn variant="ghost" size="sm" onClick={() => applyPreset(t('virtualSensors.preset.humidDay', 'Humid day'), { tmp: 30, hum: 90 })}><Play size={12} /> {t('virtualSensors.preset.humidDay', 'Humid day')}</Btn>
          <Btn variant="ghost" size="sm" onClick={() => applyPreset(t('virtualSensors.preset.highPollution', 'High pollution'), { mq: Math.min(1, (physical.mq ?? 0.3) * 1.5), hum: (physical.hum ?? 50) + 5 })}><Play size={12} /> {t('virtualSensors.preset.highPollution', 'High pollution')}</Btn>
          <Btn variant="ghost" size="sm" onClick={() => applyPreset(t('virtualSensors.preset.waterQuality', 'Water quality'), { ph: 7.8, tds: 350, wT: 24, dO: 6.5 })}><Play size={12} /> {t('virtualSensors.preset.waterQuality', 'Water quality')}</Btn>
        </div>
        {scenarioKeys.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {scenarioKeys.map(k => {
              const meta = SENSOR_TYPES[k as keyof typeof SENSOR_TYPES];
              const current = simulatedReadings[k];
              const overridden = scenarioOverrides[k] !== undefined;
              return (
                <label key={k} className={`block rounded-[var(--radius-sm)] border p-2 transition-colors ${overridden ? 'border-[var(--emerald-glow)] bg-[var(--emerald-dim)]' : 'border-[var(--border)] bg-white/[0.02]'}`}>
                  <span className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">{meta?.name || k}{meta?.unit ? ` (${meta.unit})` : ''}</span>
                  <input
                    type="number" step="any"
                    value={scenarioOverrides[k] ?? (typeof current === 'number' ? current : '')}
                    onChange={e => setScenarioOverrides(prev => {
                      const next = { ...prev };
                      next[k] = e.target.value;
                      return next;
                    })}
                    className="w-full bg-transparent border-b border-[var(--border)] text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--emerald)]"
                  />
                </label>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-[var(--text-tertiary)] mb-4">{t('virtualSensors.noScenarioInputs', 'No simulatble inputs available — connect sensors first.')}</div>
        )}
        {simChanges.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="p-2 text-left rtl:text-right text-[var(--text-disabled)] font-medium">{t('virtualSensors.tbl.virtualSensor', 'Virtual sensor')}</th>
                  <th className="p-2 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('virtualSensors.tbl.live', 'Live')}</th>
                  <th className="p-2 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('virtualSensors.tbl.simulated', 'Simulated')}</th>
                  <th className="p-2 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('virtualSensors.tbl.delta', 'Delta')}</th>
                </tr>
              </thead>
              <tbody>
                {simChanges.map(c => (
                  <tr key={c.id} className="border-b border-white/[0.03]">
                    <td className="p-2 text-left rtl:text-right text-[var(--text-secondary)] font-medium">{c.name}</td>
                    <td className="p-2 text-right rtl:text-left font-mono text-[var(--text-tertiary)]">{c.live.toFixed(2)} {c.unit}</td>
                    <td className="p-2 text-right rtl:text-left font-mono text-[var(--text-primary)]">{c.sim.toFixed(2)} {c.unit}</td>
                    <td className="p-2 text-right rtl:text-left font-mono font-semibold" style={{ color: c.delta > 0 ? 'var(--amber)' : 'var(--cyan)' }}>
                      {c.delta > 0 ? '+' : ''}{c.delta.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {Object.keys(scenarioOverrides).length > 0 && simChanges.length === 0 && (
          <div className="text-xs text-[var(--text-tertiary)]">{t('virtualSensors.noChanges', 'No estimator values changed with this scenario.')}</div>
        )}
      </div>

      {!hasAnyData && (
        <Card className="text-center py-12" hover={false}>
          <Cpu size={32} className="mx-auto mb-3 text-[var(--text-disabled)]" />
          <h3 className="font-semibold mb-1">{t('virtualSensors.noData', 'No sensor data')}</h3>
          <p className="text-sm text-[var(--text-tertiary)] max-w-md mx-auto">
            {t('virtualSensors.noDataMsg', 'Connect a device or toggle Live Mode to see physical sensors and estimated virtual values.')}
          </p>
        </Card>
      )}

      {hasAnyData && (
        <>
          <div className="flex items-center gap-2 mb-6">
            <Pill tone={isLive && mqttConnected ? 'emerald' : 'slate'}>
              {isLive && mqttConnected ? t('virtualSensors.liveFromDevice', 'Live from device') : isLive ? t('virtualSensors.connecting', 'Connecting...') : t('virtualSensors.simulation', 'Simulation')}
            </Pill>
            {hasRealData && <Pill tone="emerald">{t('virtualSensors.deviceConnected', 'Device connected')}</Pill>}
            <div className="text-[11px] text-[var(--text-tertiary)]">{data.location}</div>
          </div>

          {/* Computed Virtual Sensors */}
          {computed.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <GaugeIcon size={14} className="text-[var(--violet)]" />
                <h3 className="text-sm font-semibold">{t('virtualSensors.computedTitle', 'Computed virtual sensors')}</h3>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-entrance mb-10">
                {computed.map((vs, i) => (
                  <ComputedSensorCard key={vs.id || i} s={vs} />
                ))}
              </div>
            </>
          )}

          {physicalKeys.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={14} className="text-[var(--emerald)]" />
                <h3 className="text-sm font-semibold">{t('virtualSensors.physicalTitle', 'Physical sensors present')}</h3>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-entrance mb-10">
                {physicalKeys.map(key => (
                  <SensorCard
                    key={key}
                    source="physical"
                    s={{
                      id: key,
                      name: SENSOR_TYPES[key as keyof typeof SENSOR_TYPES]?.name || key,
                      unit: SENSOR_TYPES[key as keyof typeof SENSOR_TYPES]?.unit || '',
                      value: physical[key],
                      inputs: [], formula: '', citation: '', category: 'excellent',
                      confidence: 95, tier: 1, tierLabel: '', realSensor: '',
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {estimated.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <GaugeIcon size={14} className="text-[var(--cyan)]" />
                <h3 className="text-sm font-semibold">{t('virtualSensors.estimatedTitle', 'Estimated by sensor tier')}</h3>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              {tierOrder.map(tier => {
                const items = byTier[tier];
                if (!items || items.length === 0) return null;
                const meta = TIER_META[tier];
                return (
                  <div key={tier} className="mb-8">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center"
                        style={{ background: tier <= 2 ? 'var(--emerald-dim)' : tier <= 3 ? 'var(--cyan-dim)' : 'var(--surface-hover)' }}>
                        {<meta.icon size={14} style={{ color: tier <= 2 ? 'var(--emerald)' : tier <= 3 ? 'var(--cyan)' : 'var(--text-tertiary)' }} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{t('virtualSensors.tier', 'Tier {tier}', { tier })}: {t(`virtualSensors.tier.title.${tier}`, meta.label)}</span>
                          <Pill tone={tier <= 2 ? 'emerald' : tier <= 3 ? 'cyan' : 'slate'}>{items.length}</Pill>
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">{t(`virtualSensors.tier.desc.${tier}`, meta.desc)}</div>
                      </div>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-entrance">
                      {items.map(es => (
                        <SensorCard key={es.id} source="estimated" s={es} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Locked tiers preview */}
              {tierOrder.filter(t => !TIER_META[t].unlocked(physicalKeys) && physicalKeys.length > 0).length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <Lock size={14} className="text-[var(--text-disabled)]" />
                    <h3 className="text-sm font-semibold text-[var(--text-disabled)]">{t('virtualSensors.lockedTiers', 'Locked tiers — add sensors to unlock')}</h3>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 grid-entrance">
                    {tierOrder.filter(t => !TIER_META[t].unlocked(physicalKeys)).map(tier => {
                      const meta = TIER_META[tier];
                      return (
                        <Card key={tier} className="flex flex-col opacity-50 grayscale" hover={false}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--surface-hover)]">
                                <Lock size={17} className="text-[var(--text-disabled)]" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-[var(--text-disabled)]">{t('virtualSensors.tier', 'Tier {tier}', { tier })}: {t(`virtualSensors.tier.title.${tier}`, meta.label)}</div>
                              </div>
                            </div>
                            <Pill tone="slate">{t('virtualSensors.locked', 'Locked')}</Pill>
                          </div>
                          <div className="text-sm text-[var(--text-tertiary)] mb-auto">
                            <p className="mb-2">{t(`virtualSensors.tier.desc.${tier}`, meta.desc)}</p>
                            <div className="text-[11px] mt-3 space-y-1">
                              <div className="font-semibold text-[var(--text-secondary)]">{t('virtualSensors.requiredSensors', 'Required sensors:')}</div>
                              <div className="flex flex-wrap gap-1">
                                {TIER_SENSORS[tier].map(sk => {
                                  const has = physicalKeys.includes(sk);
                                  return (
                                    <span key={sk}
                                      className="text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1"
                                      style={{ background: 'var(--surface-hover)', color: has ? 'var(--emerald)' : 'var(--text-disabled)' }}>
                                      {has
                                        ? <CheckCircle2 size={9} style={{ color: 'var(--emerald)' }} />
                                        : <Lock size={9} />
                                      }
                                      {SENSOR_TYPES[sk as keyof typeof SENSOR_TYPES]?.name || sk}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Scientific standards & sources */}
          {estimated.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 mb-8 animate-fade-slide-up">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={14} className="text-[var(--emerald)]" />
                <h3 className="text-sm font-semibold">{t('virtualSensors.scientificTitle', 'Scientific standards & sources')}</h3>
                <div className="h-px flex-1 bg-[var(--border)]" />
                <Pill tone="emerald">{t('virtualSensors.references', '{count} references', { count: activeRefs.length })}</Pill>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-3xl leading-relaxed">
                {t('virtualSensors.scientificDesc', 'Every estimate above is backed by curated standards, guidelines and peer-reviewed methods. Reported confidence reflects model fidelity (R²), input coverage, and the strength of the underlying evidence base.')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {activeRefs.map(r => (
                  <div key={r.id} className="flex items-start gap-2 p-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] border border-[var(--border)] transition-colors hover:border-[var(--emerald-glow)]">
                    <Pill tone={r.kind === 'standard' ? 'blue' : r.kind === 'guideline' ? 'cyan' : r.kind === 'research' ? 'violet' : 'emerald'}>{t(`virtualSensors.kind.${r.kind}`, r.kind)}</Pill>
                    <span className="text-[10px] font-medium text-[var(--text-primary)] leading-snug">{toCitation(r)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
