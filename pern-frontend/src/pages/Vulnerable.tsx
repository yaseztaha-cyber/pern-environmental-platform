import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES } from '../lib/constants';
import { useI18n } from '../lib/i18n';
import { PageHeader, Card, Pill, Btn, SectionTitle, fmt } from '../components/ui';
import { HeartPulse, AlertTriangle, Shield } from 'lucide-react';

const GROUPS = [
  { id: 'children', labelKey: 'vulnerable.group.children', label: 'Children (0-12)', thresholds: { pm25: 10, co2: 600, tmp: 32, hum: 70, no2: 15 } },
  { id: 'elderly', labelKey: 'vulnerable.group.elderly', label: 'Elderly (65+)', thresholds: { pm25: 12, co2: 800, tmp: 30, hum: 65, no2: 20 } },
  { id: 'pregnant', labelKey: 'vulnerable.group.pregnant', label: 'Pregnant Women', thresholds: { pm25: 10, co2: 700, tmp: 30, hum: 65, no2: 15 } },
  { id: 'respiratory', labelKey: 'vulnerable.group.respiratory', label: 'Respiratory Conditions', thresholds: { pm25: 8, co2: 500, tmp: 28, hum: 60, no2: 10 } },
  { id: 'cardiovascular', labelKey: 'vulnerable.group.cardiovascular', label: 'Cardiovascular Conditions', thresholds: { pm25: 10, co2: 700, tmp: 30, hum: 65, no2: 12 } },
  { id: 'immunocompromised', labelKey: 'vulnerable.group.immunocompromised', label: 'Immunocompromised', thresholds: { pm25: 8, co2: 600, tmp: 28, hum: 60, no2: 10 } },
  { id: 'general', labelKey: 'vulnerable.group.general', label: 'General Population', thresholds: { pm25: 25, co2: 1000, tmp: 35, hum: 75, no2: 30 } },
];

const RECOMMENDATIONS: Record<string, string[]> = {
  pm25: ['Close windows and use air purifiers', 'Avoid outdoor exercise during peak hours', 'Wear N95 masks outdoors'],
  co2: ['Open windows for ventilation', 'Reduce indoor occupancy if possible', 'Use CO₂ monitors to track levels'],
  tmp: ['Stay hydrated', 'Use fans or air conditioning', 'Avoid direct sun exposure during peak hours'],
  hum: ['Use dehumidifiers if humidity is high', 'Monitor for mold growth', 'Maintain HVAC systems regularly'],
  no2: ['Avoid areas with heavy traffic', 'Ensure proper ventilation for gas appliances', 'Monitor NO₂ levels near industrial zones'],
};

const RECOMMENDATION_KEYS: Record<string, string[]> = {
  pm25: ['vulnerable.reco.pm25.0', 'vulnerable.reco.pm25.1', 'vulnerable.reco.pm25.2'],
  co2: ['vulnerable.reco.co2.0', 'vulnerable.reco.co2.1', 'vulnerable.reco.co2.2'],
  tmp: ['vulnerable.reco.tmp.0', 'vulnerable.reco.tmp.1', 'vulnerable.reco.tmp.2'],
  hum: ['vulnerable.reco.hum.0', 'vulnerable.reco.hum.1', 'vulnerable.reco.hum.2'],
  no2: ['vulnerable.reco.no2.0', 'vulnerable.reco.no2.1', 'vulnerable.reco.no2.2'],
};

export default function VulnerablePage() {
  const { t } = useI18n();
  const [readings, setReadings] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('children');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getSensorReadings(50).then((data: any) => {
      setReadings(Array.isArray(data) ? data : []);
    }).catch(() => setReadings([])).finally(() => setLoading(false));
  }, []);

  const latestSensors = useMemo(() => {
    const sensors: Record<string, number> = {};
    for (const r of readings.slice(0, 20)) {
      const s = typeof r.sensors === 'string' ? (() => { try { return JSON.parse(r.sensors); } catch { return {}; } })() : (r.sensors || {});
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'number' && !sensors[k]) sensors[k] = v;
      }
    }
    return sensors;
  }, [readings]);

  const group = GROUPS.find(g => g.id === selectedGroup)!;
  const violations = Object.entries(group.thresholds).map(([key, limit]) => {
    const val = latestSensors[key];
    if (val === undefined) return { key, limit, value: null, violated: false, severity: 'safe' as const };
    const violated = key === 'hum' ? val > limit || val < 30 : val > limit;
    const severity = violated ? (val > limit * 1.5 ? 'critical' as const : 'warning' as const) : 'safe' as const;
    return { key, limit, value: val, violated, severity };
  });

  const riskLevel = violations.filter(v => v.severity === 'critical').length > 0 ? 'high' :
    violations.filter(v => v.severity === 'warning').length > 0 ? 'medium' : 'low';

  const riskColor = riskLevel === 'high' ? 'rose' : riskLevel === 'medium' ? 'amber' : 'emerald';
  const riskLabel = riskLevel === 'high' ? t('vulnerable.risk.high', 'HIGH RISK') : riskLevel === 'medium' ? t('vulnerable.risk.medium', 'MEDIUM RISK') : t('vulnerable.risk.low', 'LOW RISK');
  const groupLabel = t(group.labelKey, group.label);

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('vulnerable.title', 'Vulnerable Population Protection')}
        subtitle={t('vulnerable.subtitle', 'Dynamic risk assessment for {count} risk groups based on real sensor data', { count: GROUPS.length })}
        right={<Pill tone={riskColor}>{riskLabel}</Pill>}
      />

      <div className="flex gap-2 mb-6 flex-wrap" role="group" aria-label={t('vulnerable.selectGroup', 'Select vulnerable group')}>
        {GROUPS.map(g => (
          <Btn key={g.id} variant={selectedGroup === g.id ? 'primary' : 'ghost'} onClick={() => setSelectedGroup(g.id)}>
            {t(g.labelKey, g.label)}
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 grid-entrance">
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1"><Shield size={16} className="text-[var(--emerald)]" /></div>
          <div className="text-2xl font-bold text-[var(--emerald)]">{violations.filter(v => !v.violated).length}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">{t('vulnerable.stat.withinLimits', 'Within Limits')}</div>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1"><AlertTriangle size={16} className="text-[var(--amber)]" /></div>
          <div className="text-2xl font-bold text-[var(--amber)]">{violations.filter(v => v.severity === 'warning').length}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">{t('vulnerable.stat.warning', 'Warning')}</div>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1"><HeartPulse size={16} className="text-[var(--rose)]" /></div>
          <div className="text-2xl font-bold text-[var(--rose)]">{violations.filter(v => v.severity === 'critical').length}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">{t('vulnerable.stat.critical', 'Critical')}</div>
        </Card>
      </div>

      {loading ? (
        <Card className="text-center py-12 text-[var(--text-disabled)]" hover={false}>{t('vulnerable.loading', 'Loading sensor data…')}</Card>
      ) : (
        <>
          <Card className="mb-6" hover={false}>
            <SectionTitle>{t('vulnerable.section.riskAssessment', 'Risk Assessment — {group}', { group: groupLabel })}</SectionTitle>
            <div className="space-y-2">
              {violations.map(v => (
                <div key={v.key} className="flex items-center justify-between py-3 px-3 rounded-[var(--radius-sm)] bg-[var(--surface)] text-sm">
                  <div className="flex items-center gap-3">
                    {v.severity === 'safe' ? <Shield size={16} className="text-[var(--emerald)]" /> :
                     v.severity === 'warning' ? <AlertTriangle size={16} className="text-[var(--amber)]" /> :
                     <HeartPulse size={16} className="text-[var(--rose)]" />}
                    <span className="font-medium">{SENSOR_TYPES[v.key as keyof typeof SENSOR_TYPES]?.name ?? v.key}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[var(--text-disabled)]">{t('vulnerable.label.threshold', 'Threshold: {limit} {unit}', { limit: v.limit, unit: SENSOR_TYPES[v.key as keyof typeof SENSOR_TYPES]?.unit ?? '' })}</span>
                    <span className={`text-xs font-mono ${v.severity === 'safe' ? 'text-[var(--emerald)]' : v.severity === 'warning' ? 'text-[var(--amber)]' : 'text-[var(--rose)]'}`}>
                      {fmt(v.value)} {SENSOR_TYPES[v.key as keyof typeof SENSOR_TYPES]?.unit ?? ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card hover={false}>
            <SectionTitle>{t('vulnerable.section.recommendations', 'Health Recommendations')}</SectionTitle>
            <div className="space-y-3">
              {violations.filter(v => v.violated).map(v => (
                <div key={v.key}>
                  <div className="text-sm font-medium mb-1">{t('vulnerable.aboveThreshold', '{sensor} — above {group} threshold', { sensor: SENSOR_TYPES[v.key as keyof typeof SENSOR_TYPES]?.name ?? v.key, group: groupLabel.toLowerCase() })}</div>
                  <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                    {(RECOMMENDATIONS[v.key] || ['Monitor levels closely']).map((fallback, i) => {
                      const rk = RECOMMENDATION_KEYS[v.key]?.[i] ?? 'vulnerable.reco.default';
                      return (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[var(--text-disabled)]">•</span> {t(rk, fallback)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {violations.filter(v => v.violated).length === 0 && (
                <div className="text-sm text-[var(--text-disabled)]">{t('vulnerable.allSafe', 'All parameters are within safe limits for {group}. Continue monitoring.', { group: groupLabel.toLowerCase() })}</div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
