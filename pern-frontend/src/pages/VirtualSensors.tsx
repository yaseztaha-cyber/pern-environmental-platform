import { useMemo } from 'react';
import { useData } from '../lib/data-provider';
import { PageHeader, Card, Pill } from '../components/ui';
import { SENSOR_TYPES } from '../lib/constants';
import { computeEstimatedSensors, type EstimatedSensor } from '../lib/virtual-sensor-estimators';
import {
  Wind, Droplet, Thermometer, Waves, Beaker, FlaskConical,
  Sprout, Cloud, Flame, AlertTriangle, ThermometerSun,
  Activity, Sigma, Cpu, Sun, ThermometerSnowflake, Umbrella,
  Gauge, Lightbulb, Wheat, Thermometer as ThermometerIcon,
  Lock, CheckCircle2, LucideIcon,
} from 'lucide-react';

const SENSOR_ICONS: Record<string, LucideIcon> = {
  ph: Droplet, tds: Beaker, wT: Thermometer, dO: Wind, tb: Waves,
  pm25: Wind, mq: Flame, tmp: ThermometerSun, hum: Droplet,
  co2: Cloud, nh3: AlertTriangle, voc: FlaskConical, sm: Sprout,
  light: Sun,
};

const EST_FALLBACK: Record<string, LucideIcon> = {
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

const TIER_META: Record<number, { label: string; icon: LucideIcon; desc: string; needs: string[]; unlocked: (keys: string[]) => boolean }> = {
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
            style={{ background: isPhysical ? 'var(--emerald-dim)' : `${cat?.color}15` || 'var(--cyan-dim)' }}>
            <Icon size={17} style={{ color: valColor }} />
          </div>
          <div>
            <div className="text-sm font-semibold">{s.name}</div>
            {s.unit && <div className="text-[10px] text-[var(--text-tertiary)] font-medium">{s.unit}</div>}
          </div>
        </div>
        <Pill tone={isPhysical ? 'emerald' : (cat?.tone || 'cyan')}>
          {isPhysical ? 'Physical' : s.category}
        </Pill>
      </div>

      <div className="text-3xl font-bold mb-3" style={{ color: valColor }}>
        {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
        {s.unit && <span className="text-sm font-normal text-[var(--text-tertiary)] ml-1">{s.unit}</span>}
      </div>

      {!isPhysical && s.confidence !== undefined && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-[var(--text-tertiary)]">Confidence</span>
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
            <span>{s.confidence >= 70 ? 'High' : s.confidence >= 50 ? 'Medium' : 'Low'}</span>
            {s.citation && <span>R² data</span>}
          </div>
        </div>
      )}

      {s.formula && !isPhysical && (
        <div className="text-[10px] text-[var(--text-tertiary)] leading-relaxed mb-3 p-2 rounded-[var(--radius-xs)] bg-[var(--surface-hover)]">
          <Sigma size={10} className="inline mr-1 opacity-60" />
          {s.formula}
        </div>
      )}

      {s.inputs && s.inputs.length > 0 && !isPhysical && (
        <div className="mt-auto">
          <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">Inputs</div>
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
          <span>{s.realSensor.startsWith('\u2014') ? s.realSensor.slice(2).trim() : `Real sensor: ${s.realSensor}`}</span>
        </div>
      )}

      {s.citation && !isPhysical && (
        <div className="mt-2 text-[9px] text-[var(--text-disabled)] italic leading-tight">
          {s.citation}
        </div>
      )}

      {!isPhysical && s.tier && (
        <div className="mt-2.5 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase">Tier {s.tier}</span>
            <span className="text-[9px] text-[var(--text-disabled)]">{s.tierLabel}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function VirtualSensorsPage() {
  const { data, isLive, mqttConnected, hasRealData } = useData();
  const physical = data.physical;
  const physicalKeys = Object.keys(physical);

  const result = useMemo(() => computeEstimatedSensors(physical), [physical]);
  const estimated = result.all;
  const byTier = result.byTier;
  const summary = result.summary;

  const hasAnyData = physicalKeys.length > 0 || estimated.length > 0;
  const avgConf = estimated.length > 0
    ? Math.round(estimated.reduce((s, e) => s + e.confidence, 0) / estimated.length)
    : 0;
  const hiConf = estimated.filter(e => e.confidence >= 70).length;

  const tierOrder = [1, 2, 3, 4];

  const sensorCoverage = tierOrder.map(t => {
    const meta = TIER_META[t];
    const active = meta.unlocked(physicalKeys);
    return { tier: t, active, label: meta.label, icon: meta.icon };
  });

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title="Virtual Sensor Estimation"
        subtitle="Estimate missing sensor values from available measurements using scientifically-validated models"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--emerald-dim)] border-l-[3px] border-l-[var(--emerald)]">
          <div className="section-label">Physical Sensors</div>
          <div className="text-2xl font-bold text-[var(--emerald)]">{physicalKeys.length}</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--cyan-dim)] border-l-[3px] border-l-[var(--cyan)]">
          <div className="section-label">Estimated Sensors</div>
          <div className="text-2xl font-bold text-[var(--cyan)]">{estimated.length}</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[rgba(34,211,238,0.08)] border-l-[3px] border-l-[var(--cyan)]">
          <div className="section-label">Avg Confidence</div>
          <div className="text-2xl font-bold text-[var(--cyan)]">{avgConf}%</div>
        </div>
        <div className="rounded-[var(--radius-md)] p-4 bg-[var(--emerald-dim)] border-l-[3px] border-l-[var(--emerald)]">
          <div className="section-label">High Confidence (≥70%)</div>
          <div className="text-2xl font-bold text-[var(--emerald)]">{hiConf}/{estimated.length}</div>
        </div>
      </div>

      {/* Coverage bar */}
      <Card className="mb-6 overflow-hidden" hover={false}>
        <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Sensor Coverage</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sensorCoverage.map(c => {
            const meta = TIER_META[c.tier];
            const Icon = c.icon;
            const isUnlocked = c.active;
            const tierCount = byTier[c.tier]?.length || 0;
            const maxForTier: Record<number, number> = { 1: 4, 2: 5, 3: 4, 4: 4 };
            return (
              <div key={c.tier}
                className={`rounded-[var(--radius-sm)] p-3 border transition-all duration-300 ${isUnlocked ? '' : 'opacity-50'}`}
                style={{ borderColor: isUnlocked ? 'var(--emerald)' : 'var(--border)', background: isUnlocked ? 'var(--emerald-dim)' : 'transparent' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={13} style={{ color: isUnlocked ? 'var(--emerald)' : 'var(--text-disabled)' }} />
                  <span className="text-xs font-semibold" style={{ color: isUnlocked ? 'var(--emerald)' : 'var(--text-disabled)' }}>
                    Tier {c.tier}: {meta.label}
                  </span>
                  {isUnlocked
                    ? <CheckCircle2 size={12} className="ml-auto" style={{ color: 'var(--emerald)' }} />
                    : <Lock size={12} className="ml-auto" style={{ color: 'var(--text-disabled)' }} />
                  }
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  {isUnlocked
                    ? `${tierCount}/${maxForTier[c.tier]} estimates active`
                    : `Needs: ${TIER_SENSORS[c.tier].join(', ')}`
                  }
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {!hasAnyData && (
        <Card className="text-center py-12" hover={false}>
          <Cpu size={32} className="mx-auto mb-3 text-[var(--text-disabled)]" />
          <h3 className="font-semibold mb-1">No sensor data</h3>
          <p className="text-sm text-[var(--text-tertiary)] max-w-md mx-auto">
            Connect a device or toggle Live Mode to see physical sensors and estimated virtual values.
          </p>
        </Card>
      )}

      {hasAnyData && (
        <>
          <div className="flex items-center gap-2 mb-6">
            <Pill tone={isLive && mqttConnected ? 'emerald' : 'slate'}>
              {isLive && mqttConnected ? 'Live from device' : isLive ? 'Connecting...' : 'Simulation'}
            </Pill>
            {hasRealData && <Pill tone="emerald">Device connected</Pill>}
            <div className="text-[11px] text-[var(--text-tertiary)]">{data.location}</div>
          </div>

          {physicalKeys.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={14} className="text-[var(--emerald)]" />
                <h3 className="text-sm font-semibold">Physical sensors present</h3>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
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
                <Gauge size={14} className="text-[var(--cyan)]" />
                <h3 className="text-sm font-semibold">Estimated by sensor tier</h3>
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
                          <span className="text-sm font-semibold">Tier {tier}: {meta.label}</span>
                          <Pill tone={tier <= 2 ? 'emerald' : tier <= 3 ? 'cyan' : 'slate'}>{items.length}</Pill>
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">{meta.desc}</div>
                      </div>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                    <h3 className="text-sm font-semibold text-[var(--text-disabled)]">Locked tiers — add sensors to unlock</h3>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                                <div className="text-sm font-semibold text-[var(--text-disabled)]">Tier {tier}: {meta.label}</div>
                              </div>
                            </div>
                            <Pill tone="slate">Locked</Pill>
                          </div>
                          <div className="text-sm text-[var(--text-tertiary)] mb-auto">
                            <p className="mb-2">{meta.desc}</p>
                            <div className="text-[11px] mt-3 space-y-1">
                              <div className="font-semibold text-[var(--text-secondary)]">Required sensors:</div>
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
        </>
      )}
    </div>
  );
}
