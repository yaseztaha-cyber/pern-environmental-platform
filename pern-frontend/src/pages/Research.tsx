import { useMemo, useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity, BarChart3, TrendingUp, ArrowRightLeft, Download } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES, type SensorType } from '../lib/constants';
import { PageHeader, Card, Pill, SectionTitle, EmptyState, LoadingState, Btn } from '../components/ui';

const SENSOR_KEYS: SensorType[] = ['pm25', 'co2', 'tmp', 'hum', 'ph', 'tds', 'dO', 'nh3', 'voc', 'mq', 'wT', 'tb', 'sm'];

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i] - mx;
    const yi = y[i] - my;
    num += xi * yi;
    dx += xi * xi;
    dy += yi * yi;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

function stats(arr: number[]) {
  if (arr.length === 0) return { mean: 0, min: 0, max: 0, std: 0, count: 0 };
  const n = arr.length;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, min, max, std: Math.sqrt(variance), count: n };
}

function corrColor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? 'var(--emerald)' : 'var(--rose)';
  if (abs >= 0.4) return r > 0 ? 'var(--cyan)' : 'var(--amber)';
  return 'var(--text-disabled)';
}

function corrBg(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(251,113,113,0.15)';
  if (abs >= 0.4) return r > 0 ? 'rgba(34,211,238,0.10)' : 'rgba(251,191,36,0.10)';
  return 'transparent';
}

function corrLabel(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return 'Strong';
  if (abs >= 0.4) return 'Moderate';
  if (abs >= 0.2) return 'Weak';
  return 'Negligible';
}

export default function ResearchPage() {
  const [readings, setReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedX, setSelectedX] = useState<SensorType>('tmp');
  const [selectedY, setSelectedY] = useState<SensorType>('hum');

  useEffect(() => {
    apiClient.getSensorReadings(500).then(raw => {
      setReadings(Array.isArray(raw) ? raw : []);
    }).catch(() => setReadings([])).finally(() => setLoading(false));
  }, []);

  const sensorValues = useMemo(() => {
    const out: Record<string, number[]> = {};
    SENSOR_KEYS.forEach(k => { out[k] = []; });
    for (const reading of readings) {
      const sensors = typeof reading.sensors === 'string' ? (() => { try { return JSON.parse(reading.sensors); } catch { return {}; } })() : (reading.sensors || {});
      for (const k of SENSOR_KEYS) {
        if (sensors[k] !== undefined && sensors[k] !== null) {
          const v = Number(sensors[k]);
          if (!isNaN(v)) out[k].push(v);
        }
      }
    }
    return out;
  }, [readings]);

  const availableKeys = useMemo(() => {
    return SENSOR_KEYS.filter(k => sensorValues[k].length >= 3);
  }, [sensorValues]);

  const corrMatrix = useMemo(() => {
    const keys = availableKeys;
    const n = keys.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        matrix[i][j] = pearson(sensorValues[keys[i]], sensorValues[keys[j]]);
      }
    }
    return { keys, matrix };
  }, [availableKeys, sensorValues]);

  const statsTable = useMemo(() => {
    return availableKeys.map(k => ({
      key: k,
      name: SENSOR_TYPES[k]?.name ?? k,
      unit: SENSOR_TYPES[k]?.unit ?? '',
      ...stats(sensorValues[k]),
    }));
  }, [availableKeys, sensorValues]);

  const scatterData = useMemo(() => {
    const xArr = sensorValues[selectedX] ?? [];
    const yArr = sensorValues[selectedY] ?? [];
    const n = Math.min(xArr.length, yArr.length);
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      points.push({ x: xArr[i], y: yArr[i] });
    }
    return points;
  }, [selectedX, selectedY, sensorValues]);

  const currentCorr = pearson(sensorValues[selectedX] ?? [], sensorValues[selectedY] ?? []);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    const keys = corrMatrix.keys;
    const matrix = corrMatrix.matrix;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const r = matrix[i][j];
        if (Math.abs(r) >= 0.7) {
          const a = SENSOR_TYPES[keys[i]]?.name ?? keys[i];
          const b = SENSOR_TYPES[keys[j]]?.name ?? keys[j];
          recs.push(`Strong ${r > 0 ? 'positive' : 'negative'} correlation (r=${r.toFixed(2)}) between ${a} and ${b}. Consider cross-validating these sensors.`);
        }
      }
    }
    if (recs.length === 0 && availableKeys.length > 2) {
      recs.push('No strong correlations detected. More data points over time will improve correlation analysis.');
    }
    return recs;
  }, [corrMatrix, availableKeys]);

  const hasData = availableKeys.length >= 2;

  if (loading) {
    return (
      <div className="max-w-[1300px] mx-auto">
        <PageHeader title="Sensor Correlation Analysis" subtitle="Loading real data from database..." />
        <Card hover={false}>
          <LoadingState label="Loading sensor data…" />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader
        title="Sensor Correlation Analysis"
        subtitle={`Pearson coefficients · ${readings.length} readings · Statistical summaries`}
        right={<div className="flex items-center gap-2">
          {readings.length === 0 ? <Pill tone="amber">No data</Pill> : <Pill tone="emerald">{readings.length} readings</Pill>}
          <Btn variant="ghost" size="sm" onClick={() => { const url = apiClient.exportReadingsCSV(); const a = document.createElement('a'); a.href = url; a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}>
            <Download size={12} /> Export
          </Btn>
        </div>}
      />

      {!hasData ? (
        <EmptyState
          icon={<Activity size={24} />}
          title="Insufficient sensor data"
          message="Connect a device and switch to Live Mode to stream real sensor readings for correlation analysis. At least 3 readings per sensor are needed."
        />
      ) : (
        <div className="space-y-6 animate-fade-in">
          <Card hover={false}>
            <SectionTitle>
              <ArrowRightLeft size={14} className="inline mr-2 text-[var(--emerald)]" />
              Correlation Matrix ({corrMatrix.keys.length} parameters)
            </SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-[var(--text-disabled)] font-medium">Variable</th>
                    {corrMatrix.keys.map(k => (
                      <th key={k} className="p-2 text-center text-[var(--text-disabled)] font-medium whitespace-nowrap">
                        {SENSOR_TYPES[k]?.name ?? k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corrMatrix.keys.map((rowKey, i) => (
                    <tr key={rowKey}>
                      <td className="p-2 text-[var(--text-secondary)] font-medium whitespace-nowrap">
                        {SENSOR_TYPES[rowKey]?.name ?? rowKey}
                      </td>
                      {corrMatrix.keys.map((colKey, j) => {
                        const r = corrMatrix.matrix[i][j];
                        const isDiag = i === j;
                        return (
                          <td key={colKey}
                            className="p-2 text-center font-mono font-medium whitespace-nowrap"
                            style={{ color: isDiag ? 'var(--text-disabled)' : corrColor(r), background: isDiag ? 'transparent' : corrBg(r) }}>
                            {isDiag ? '—' : r.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--text-disabled)]">
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--emerald)' }} />Strong positive (r ≥ 0.7)</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--cyan)' }} />Moderate positive (0.4–0.7)</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--amber)' }} />Moderate negative (-0.4 to -0.7)</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--rose)' }} />Strong negative (r ≤ -0.7)</span>
            </div>
          </Card>

          <Card hover={false}>
            <SectionTitle>
              <BarChart3 size={14} className="inline mr-2 text-[var(--cyan)]" />
              Scatter Plot — Parameter Pair
            </SectionTitle>
            <div className="flex flex-wrap gap-3 mb-4">
              <div>
                <label className="block text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1">X Axis</label>
                <select value={selectedX} onChange={e => setSelectedX(e.target.value as SensorType)}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--emerald)] transition-colors">
                  {availableKeys.map(k => <option key={k} value={k}>{SENSOR_TYPES[k]?.name ?? k}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1">Y Axis</label>
                <select value={selectedY} onChange={e => setSelectedY(e.target.value as SensorType)}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--emerald)] transition-colors">
                  {availableKeys.map(k => <option key={k} value={k}>{SENSOR_TYPES[k]?.name ?? k}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2 ml-auto">
                <Pill tone={Math.abs(currentCorr) >= 0.7 ? (currentCorr > 0 ? 'emerald' : 'rose') : Math.abs(currentCorr) >= 0.4 ? (currentCorr > 0 ? 'cyan' : 'amber') : 'slate'}>
                  r = {currentCorr.toFixed(3)} · {corrLabel(currentCorr)}
                </Pill>
              </div>
            </div>
            {scatterData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="x" name={SENSOR_TYPES[selectedX]?.name ?? selectedX} stroke="var(--text-disabled)" fontSize={10}
                      label={{ value: SENSOR_TYPES[selectedX]?.name ?? selectedX, position: 'insideBottom', offset: -5, fill: 'var(--text-disabled)', fontSize: 10 }} />
                    <YAxis dataKey="y" name={SENSOR_TYPES[selectedY]?.name ?? selectedY} stroke="var(--text-disabled)" fontSize={10}
                      label={{ value: SENSOR_TYPES[selectedY]?.name ?? selectedY, angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--text-disabled)', fontSize: 10 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{ background: 'var(--bg-2, #0e1528)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-primary)' }}
                      formatter={(_: number, name: string) => [_, name]} />
                    <Scatter data={scatterData} fill={currentCorr >= 0 ? 'var(--emerald)' : 'var(--rose)'} fillOpacity={0.7}>
                      {scatterData.map((_, idx) => <Cell key={idx} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-[var(--text-disabled)] text-sm">No data points for the selected parameter pair.</div>
            )}
          </Card>

          <Card hover={false}>
            <SectionTitle>
              <TrendingUp size={14} className="inline mr-2 text-[var(--amber)]" />
              Statistical Summary
            </SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="p-2.5 text-left text-[var(--text-disabled)] font-medium">Sensor</th>
                    <th className="p-2.5 text-right text-[var(--text-disabled)] font-medium">Count</th>
                    <th className="p-2.5 text-right text-[var(--text-disabled)] font-medium">Mean</th>
                    <th className="p-2.5 text-right text-[var(--text-disabled)] font-medium">Min</th>
                    <th className="p-2.5 text-right text-[var(--text-disabled)] font-medium">Max</th>
                    <th className="p-2.5 text-right text-[var(--text-disabled)] font-medium">Std Dev</th>
                  </tr>
                </thead>
                <tbody>
                  {statsTable.map(s => (
                    <tr key={s.key} className="border-b border-[var(--border)] hover:bg-white/[0.02] transition-colors">
                      <td className="p-2.5 text-[var(--text-secondary)] font-medium">{s.name}</td>
                      <td className="p-2.5 text-right text-[var(--text-tertiary)] font-mono">{s.count}</td>
                      <td className="p-2.5 text-right text-[var(--text-primary)] font-mono">{s.mean.toFixed(2)} <span className="text-[var(--text-disabled)]">{s.unit}</span></td>
                      <td className="p-2.5 text-right text-[var(--text-tertiary)] font-mono">{s.min.toFixed(2)} <span className="text-[var(--text-disabled)]">{s.unit}</span></td>
                      <td className="p-2.5 text-right text-[var(--text-tertiary)] font-mono">{s.max.toFixed(2)} <span className="text-[var(--text-disabled)]">{s.unit}</span></td>
                      <td className="p-2.5 text-right text-[var(--text-tertiary)] font-mono">{s.std.toFixed(2)} <span className="text-[var(--text-disabled)]">{s.unit}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card hover={false}>
            <SectionTitle>
              <Activity size={14} className="inline mr-2 text-[var(--emerald)]" />
              Analysis & Recommendations
            </SectionTitle>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-[var(--emerald)]" />
                  {rec}
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-[var(--text-disabled)]">
              Note: Correlation analysis is computed from {readings.length} real time-series readings stored in PostgreSQL. More data improves accuracy.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
