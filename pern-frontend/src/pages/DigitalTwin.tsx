import { useState, useMemo, useEffect, useRef } from 'react';
import { PageHeader, Card, Pill, Btn, SectionTitle, fmt } from '../components/ui';
import { calculateScientificEHI } from '../lib/scientific-ehi';
import { calculateAQI, calculateWQI } from '../lib/virtual-sensors';
import { ThermometerSun, Droplet, Wind, Cloud, Beaker, Waves, Eye, Volume2, Gauge, RotateCcw, Save } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useData } from '../lib/data-provider';

const SENSORS = [
  { key: 'pm25', label: 'PM2.5', icon: Wind, range: [0, 150], step: 0.5, unit: 'µg/m³' },
  { key: 'ph', label: 'pH', icon: Droplet, range: [4, 10], step: 0.05, unit: '' },
  { key: 'tmp', label: 'Temperature', icon: ThermometerSun, range: [-5, 55], step: 0.5, unit: '°C' },
  { key: 'hum', label: 'Humidity', icon: Droplet, range: [5, 100], step: 0.5, unit: '%' },
  { key: 'co2', label: 'CO₂', icon: Cloud, range: [300, 2500], step: 5, unit: 'ppm' },
  { key: 'pm10', label: 'PM10', icon: Wind, range: [0, 300], step: 0.5, unit: 'µg/m³' },
  { key: 'no2', label: 'NO₂', icon: Cloud, range: [0, 200], step: 0.5, unit: 'µg/m³' },
  { key: 'so2', label: 'SO₂', icon: Cloud, range: [0, 100], step: 0.5, unit: 'µg/m³' },
  { key: 'o3', label: 'O₃', icon: Eye, range: [0, 200], step: 0.5, unit: 'µg/m³' },
  { key: 'noise', label: 'Noise', icon: Volume2, range: [30, 120], step: 1, unit: 'dB' },
  { key: 'dO', label: 'Dissolved O₂', icon: Beaker, range: [0, 18], step: 0.1, unit: 'mg/L' },
  { key: 'tds', label: 'TDS', icon: Waves, range: [0, 1500], step: 5, unit: 'mg/L' },
  { key: 'mq', label: 'Methane', icon: Gauge, range: [0, 3], step: 0.01, unit: 'ppm' },
];

const PRESETS = [
  { name: 'Urban Cairo', values: { pm25: 45, ph: 7.2, tmp: 33, hum: 55, co2: 520, pm10: 75, no2: 40, so2: 15, o3: 60, noise: 75, dO: 7.5, tds: 220, mq: 0.4 } },
  { name: 'Clean Delta', values: { pm25: 8, ph: 7.0, tmp: 26, hum: 60, co2: 400, pm10: 15, no2: 5, so2: 3, o3: 35, noise: 40, dO: 9.0, tds: 150, mq: 0.2 } },
  { name: 'Industrial', values: { pm25: 95, ph: 6.8, tmp: 30, hum: 45, co2: 800, pm10: 180, no2: 120, so2: 65, o3: 90, noise: 95, dO: 5.5, tds: 450, mq: 1.2 } },
];

interface Scenario { name: string; values: Record<string, number>; ehi: number; timestamp: number; }

export default function DigitalTwinPage() {
  const { data, isLive, hasRealData } = useData();
  const [sensors, setSensors] = useState<Record<string, number>>({ pm25: 25, ph: 7.1, tmp: 28, hum: 55, co2: 450, pm10: 40, no2: 20, so2: 10, o3: 50, noise: 60, dO: 8.0, tds: 200, mq: 0.35 });
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [simHistory, setSimHistory] = useState<{ time: number; ehi: number }[]>([]);
  const initializedRef = useRef(false);

  // When live sensor data arrives, seed the sliders with real values
  useEffect(() => {
    if (isLive && hasRealData && data.physical && Object.keys(data.physical).length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      setSensors(prev => {
        const next = { ...prev };
        Object.keys(data.physical).forEach(key => {
          if (key in next) next[key] = data.physical[key];
        });
        return next;
      });
    }
    if (!isLive) {
      initializedRef.current = false;
    }
  }, [isLive, hasRealData, data.physical]);

  const updateSensor = (key: string, value: number) => {
    setSensors(prev => {
      const next = { ...prev, [key]: value };
      return next;
    });
  };

  const ehi = useMemo(() => {
    const scientific = calculateScientificEHI(sensors);
    if (!scientific) return 0;
    // Blend scientific EHI with contributions from sensors not covered by
    // the scientific model (pm10, no2, so2, o3, noise) so every slider has
    // a visible effect in the Digital Twin "what-if" scenario.
    let bonus = 0;
    if (sensors.pm10 > 150) bonus -= (sensors.pm10 - 150) * 0.08;
    if (sensors.pm10 > 250) bonus -= (sensors.pm10 - 250) * 0.12;
    if (sensors.no2 > 100) bonus -= (sensors.no2 - 100) * 0.06;
    if (sensors.so2 > 50)  bonus -= (sensors.so2 - 50) * 0.08;
    if (sensors.o3 > 120)  bonus -= (sensors.o3 - 120) * 0.05;
    if (sensors.noise > 85) bonus -= (sensors.noise - 85) * 0.2;
    return Math.round(Math.max(5, Math.min(98, scientific.score + bonus)));
  }, [sensors]);

  const aqi = useMemo(() => calculateAQI(sensors), [sensors]);
  const wqi = useMemo(() => calculateWQI(sensors), [sensors]);

  const saveScenario = () => {
    const name = `Scenario ${scenarios.length + 1}`;
    const entry = { name, values: { ...sensors }, ehi: +ehi.toFixed(1), timestamp: Date.now() };
    setScenarios(prev => [...prev, entry]);
    setSimHistory(prev => [...prev.slice(-49), { time: Date.now(), ehi: +ehi.toFixed(1) }]);
  };

  const loadPreset = (preset: typeof PRESETS[0]) => setSensors(preset.values);
  const resetAll = () => setSensors(PRESETS[1].values);

  const ehiColor = ehi >= 70 ? 'var(--emerald)' : ehi >= 40 ? 'var(--amber)' : 'var(--rose)';
  const ehiColorHex = ehi >= 70 ? '#10b981' : ehi >= 40 ? '#f59e0b' : '#ef4444';
  const ehiLabel = ehi >= 70 ? 'Good' : ehi >= 40 ? 'Moderate' : 'Poor';
  const ehiPillTone = ehi >= 70 ? 'emerald' as const : ehi >= 40 ? 'amber' as const : 'rose' as const;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader title="Digital Twin Simulator" subtitle="Adjust sensor values to see real-time impact on EHI"
        right={
          <div className="flex items-center gap-2">
            <Pill tone={ehiPillTone}>{ehiLabel} — EHI {fmt(ehi)}</Pill>
            <Btn onClick={resetAll} size="sm" aria-label="Reset to defaults"><RotateCcw size={14} /></Btn>
            <Btn onClick={saveScenario} variant="primary" size="sm" aria-label="Save current scenario"><Save size={12} /> Save</Btn>
          </div>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 grid-entrance">
        <Card className="text-center" hover={false}>
          <div className="text-2xl font-bold" style={{ color: ehiColor }}>{fmt(ehi)}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">EHI Score</div>
        </Card>
        <Card className="text-center" hover={false}>
          <div className="text-2xl font-bold text-[var(--cyan)]">{fmt(aqi?.value)}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">AQI</div>
        </Card>
        <Card className="text-center" hover={false}>
          <div className="text-2xl font-bold text-[var(--cyan)]">{fmt(wqi?.value)}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">WQI</div>
        </Card>
        <Card className="text-center" hover={false}>
          <div className="text-2xl font-bold">{scenarios.length}</div>
          <div className="text-[10px] text-[var(--text-disabled)] uppercase">Scenarios Saved</div>
        </Card>
      </div>

      <SectionTitle>Quick Presets</SectionTitle>
      <div className="flex gap-2 mb-6 flex-wrap grid-entrance" role="group" aria-label="Quick presets">
        {PRESETS.map(p => (
          <Btn key={p.name} onClick={() => loadPreset(p)} variant="ghost" size="sm">
            {p.name}
          </Btn>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 grid-entrance">
        <div className="lg:col-span-2 space-y-2">
          {SENSORS.map(s => (
            <Card key={s.key} hover={false} className="py-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <s.icon size={14} className="text-[var(--emerald)]" />
                  {s.label}
                </div>
                <span className="font-mono text-xs text-[var(--text-secondary)]">{fmt(sensors[s.key])} {s.unit}</span>
              </div>
              <input type="range" min={s.range[0]} max={s.range[1]} step={s.step} value={sensors[s.key] || 0}
                onChange={e => updateSensor(s.key, parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[var(--surface)] rounded-full appearance-none cursor-pointer accent-[var(--emerald)]"
                aria-label={`${s.label} slider`} />
              <div className="flex justify-between text-[9px] text-[var(--text-disabled)] mt-1">
                <span>{fmt(s.range[0])}</span><span>{fmt(s.range[1])} {s.unit}</span>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          {simHistory.length > 1 && (
            <Card hover={false}>
              <SectionTitle>EHI Over Time</SectionTitle>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={simHistory.map(h => ({ t: new Date(h.time).toLocaleTimeString(), ehi: h.ehi }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="ehi" stroke={ehiColorHex} fill={ehiColorHex} fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {scenarios.length > 0 && (
            <Card hover={false}>
              <SectionTitle>Saved Scenarios</SectionTitle>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {scenarios.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-2 rounded text-xs hover:bg-[var(--surface)]">
                    <span className="text-[var(--text-secondary)]">{s.name}</span>
                    <Pill tone={s.ehi >= 70 ? 'emerald' : s.ehi >= 40 ? 'amber' : 'rose'}>EHI {fmt(s.ehi)}</Pill>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
