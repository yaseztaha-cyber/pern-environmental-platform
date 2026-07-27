import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES } from '../lib/constants';
import { PageHeader, Card, Pill, Btn, SectionTitle, fmt } from '../components/ui';
import { HeartPulse, AlertTriangle, Shield } from 'lucide-react';

const GROUPS = [
  { id: 'children', label: 'Children (0-12)', thresholds: { pm25: 10, co2: 600, tmp: 32, hum: 70, no2: 15 } },
  { id: 'elderly', label: 'Elderly (65+)', thresholds: { pm25: 12, co2: 800, tmp: 30, hum: 65, no2: 20 } },
  { id: 'pregnant', label: 'Pregnant Women', thresholds: { pm25: 10, co2: 700, tmp: 30, hum: 65, no2: 15 } },
  { id: 'respiratory', label: 'Respiratory Conditions', thresholds: { pm25: 8, co2: 500, tmp: 28, hum: 60, no2: 10 } },
  { id: 'cardiovascular', label: 'Cardiovascular Conditions', thresholds: { pm25: 10, co2: 700, tmp: 30, hum: 65, no2: 12 } },
  { id: 'immunocompromised', label: 'Immunocompromised', thresholds: { pm25: 8, co2: 600, tmp: 28, hum: 60, no2: 10 } },
  { id: 'general', label: 'General Population', thresholds: { pm25: 25, co2: 1000, tmp: 35, hum: 75, no2: 30 } },
];

const RECOMMENDATIONS: Record<string, string[]> = {
  pm25: ['Close windows and use air purifiers', 'Avoid outdoor exercise during peak hours', 'Wear N95 masks outdoors'],
  co2: ['Open windows for ventilation', 'Reduce indoor occupancy if possible', 'Use CO₂ monitors to track levels'],
  tmp: ['Stay hydrated', 'Use fans or air conditioning', 'Avoid direct sun exposure during peak hours'],
  hum: ['Use dehumidifiers if humidity is high', 'Monitor for mold growth', 'Maintain HVAC systems regularly'],
  no2: ['Avoid areas with heavy traffic', 'Ensure proper ventilation for gas appliances', 'Monitor NO₂ levels near industrial zones'],
};

export default function VulnerablePage() {
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
      const s = typeof r.sensors === 'string' ? JSON.parse(r.sensors) : (r.sensors || {});
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
  const riskLabel = riskLevel === 'high' ? 'HIGH RISK' : riskLevel === 'medium' ? 'MEDIUM RISK' : 'LOW RISK';

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Vulnerable Population Protection"
        subtitle={`Dynamic risk assessment for ${GROUPS.length} risk groups based on real sensor data`}
        right={<Pill tone={riskColor}>{riskLabel}</Pill>}
      />

      <div className="flex gap-2 mb-6 flex-wrap" role="group" aria-label="Select vulnerable group">
        {GROUPS.map(g => (
          <Btn key={g.id} variant={selectedGroup === g.id ? 'primary' : 'ghost'} onClick={() => setSelectedGroup(g.id)}>
            {g.label}
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 grid-entrance">
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1"><Shield size={16} className="text-[var(--emerald)]" /></div>
          <div className="text-2xl font-bold text-[var(--emerald)]">{violations.filter(v => !v.violated).length}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">Within Limits</div>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1"><AlertTriangle size={16} className="text-[var(--amber)]" /></div>
          <div className="text-2xl font-bold text-[var(--amber)]">{violations.filter(v => v.severity === 'warning').length}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">Warning</div>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1"><HeartPulse size={16} className="text-[var(--rose)]" /></div>
          <div className="text-2xl font-bold text-[var(--rose)]">{violations.filter(v => v.severity === 'critical').length}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">Critical</div>
        </Card>
      </div>

      {loading ? (
        <Card className="text-center py-12 text-[var(--text-disabled)]" hover={false}>Loading sensor data…</Card>
      ) : (
        <>
          <Card className="mb-6" hover={false}>
            <SectionTitle>Risk Assessment — {group.label}</SectionTitle>
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
                    <span className="text-xs text-[var(--text-disabled)]">Threshold: {v.limit} {SENSOR_TYPES[v.key as keyof typeof SENSOR_TYPES]?.unit ?? ''}</span>
                    <span className={`text-xs font-mono ${v.severity === 'safe' ? 'text-[var(--emerald)]' : v.severity === 'warning' ? 'text-[var(--amber)]' : 'text-[var(--rose)]'}`}>
                      {fmt(v.value)} {SENSOR_TYPES[v.key as keyof typeof SENSOR_TYPES]?.unit ?? ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card hover={false}>
            <SectionTitle>Health Recommendations</SectionTitle>
            <div className="space-y-3">
              {violations.filter(v => v.violated).map(v => (
                <div key={v.key}>
                  <div className="text-sm font-medium mb-1">{SENSOR_TYPES[v.key as keyof typeof SENSOR_TYPES]?.name ?? v.key} — above {group.label.toLowerCase()} threshold</div>
                  <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                    {(RECOMMENDATIONS[v.key] || ['Monitor levels closely']).map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[var(--text-disabled)]">•</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {violations.filter(v => v.violated).length === 0 && (
                <div className="text-sm text-[var(--text-disabled)]">All parameters are within safe limits for {group.label.toLowerCase()}. Continue monitoring.</div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
