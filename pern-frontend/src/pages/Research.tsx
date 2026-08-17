import { useMemo, useState, useEffect } from 'react';
import { ComposedChart, Scatter, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, BarChart, Bar, ReferenceLine } from 'recharts';
import { ChartGrid, ChartTooltip, CHART_TICK } from '../components/charts';
import { Activity, BarChart3, TrendingUp, ArrowRightLeft, Download, Sigma, Clock } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES, type SensorType } from '../lib/constants';
import { useI18n } from '../lib/i18n';
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

/** Two-tailed p-value for Pearson's r (t-test on n-2 degrees of freedom). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
    const bt = Math.exp(
      (a * Math.log(x) + b * Math.log(1 - x)) -
      (Math.log(a) + Math.log(b) + (Math.log(a + b)))
    );
    if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function tTestP(r: number, n: number): number {
  if (n < 3 || !isFinite(r) || Math.abs(r) >= 1) return 1;
  const df = n - 2;
  const t = (r * Math.sqrt(df)) / Math.sqrt(1 - r * r);
  return betai(df / 2, 0.5, df / (df + t * t));
}

function significanceLabel(p: number, t: (k: string, f: string) => string): { label: string; tone: 'emerald' | 'cyan' | 'amber' | 'slate' } {
  if (p < 0.01) return { label: t('research.sig.highly', 'Highly significant (p < 0.01)'), tone: 'emerald' };
  if (p < 0.05) return { label: t('research.sig.significant', 'Significant (p < 0.05)'), tone: 'cyan' };
  if (p < 0.1) return { label: t('research.sig.marginal', 'Marginal (p < 0.10)'), tone: 'amber' };
  return { label: t('research.sig.notSignificant', 'Not significant'), tone: 'slate' };
}

/** OLS linear regression. Returns slope, intercept, r2 for paired [x, y]. */
function linreg(pairs: Array<{ x: number; y: number }>) {
  const n = pairs.length;
  if (n < 3) return { slope: 0, intercept: 0, r2: 0, n };
  const mx = pairs.reduce((s, p) => s + p.x, 0) / n;
  const my = pairs.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pairs) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return { slope: 0, intercept: my, r2: 0, n };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}

function laggedCorr(xs: number[], ys: number[], lag: number): number {
  const n = Math.min(xs.length, ys.length);
  if (n - Math.abs(lag) < 3) return 0;
  if (lag >= 0) return pearson(xs.slice(0, n - lag), ys.slice(lag));
  const k = -lag;
  return pearson(xs.slice(k), ys.slice(0, n - k));
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

function corrLabel(r: number, t: (k: string, f: string) => string): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return t('research.corrLabel.strong', 'Strong');
  if (abs >= 0.4) return t('research.corrLabel.moderate', 'Moderate');
  if (abs >= 0.2) return t('research.corrLabel.weak', 'Weak');
  return t('research.corrLabel.negligible', 'Negligible');
}

function stars(p: number): string {
  if (p < 0.01) return '***';
  if (p < 0.05) return '**';
  if (p < 0.1) return '*';
  return '';
}

export default function ResearchPage() {
  const { t } = useI18n();
  const [readings, setReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedX, setSelectedX] = useState<SensorType>('tmp');
  const [selectedY, setSelectedY] = useState<SensorType>('hum');
  const [maxLag, setMaxLag] = useState(8);

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

  /** Time-aligned pairs for the selected X/Y (both present at same reading index). */
  const alignedPairs = useMemo(() => {
    const pairs: Array<{ x: number; y: number }> = [];
    for (const reading of readings) {
      const sensors = typeof reading.sensors === 'string' ? (() => { try { return JSON.parse(reading.sensors); } catch { return {}; } })() : (reading.sensors || {});
      const xv = Number(sensors[selectedX]);
      const yv = Number(sensors[selectedY]);
      if (!isNaN(xv) && !isNaN(yv) && sensors[selectedX] != null && sensors[selectedY] != null) {
        pairs.push({ x: xv, y: yv });
      }
    }
    return pairs;
  }, [readings, selectedX, selectedY]);

  const corrMatrix = useMemo(() => {
    const keys = availableKeys;
    const n = keys.length;
    const matrix: Array<{ r: number; p: number }> = Array.from({ length: n * n }, () => ({ r: 0, p: 1 }));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const r = pearson(sensorValues[keys[i]], sensorValues[keys[j]]);
        const m = Math.min(sensorValues[keys[i]].length, sensorValues[keys[j]].length);
        matrix[i * n + j] = { r, p: tTestP(r, m) };
      }
    }
    return { keys, matrix, n };
  }, [availableKeys, sensorValues]);

  const statsTable = useMemo(() => {
    return availableKeys.map(k => ({
      key: k,
      name: SENSOR_TYPES[k]?.name ?? k,
      unit: SENSOR_TYPES[k]?.unit ?? '',
      ...stats(sensorValues[k]),
    }));
  }, [availableKeys, sensorValues]);

  const regression = useMemo(() => linreg(alignedPairs), [alignedPairs]);

  const scatterData = useMemo(() => alignedPairs, [alignedPairs]);

  const regressionLine = useMemo(() => {
    if (scatterData.length < 3) return [];
    const xs = scatterData.map(p => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return [
      { x: minX, y: regression.intercept + regression.slope * minX },
      { x: maxX, y: regression.intercept + regression.slope * maxX },
    ];
  }, [scatterData, regression]);

  const currentCorr = pearson(
    alignedPairs.map(p => p.x),
    alignedPairs.map(p => p.y),
  );
  const currentP = tTestP(currentCorr, alignedPairs.length);
  const sig = significanceLabel(currentP, t);

  const lagSeries = useMemo(() => {
    const xs = alignedPairs.map(p => p.x);
    const ys = alignedPairs.map(p => p.y);
    const series: Array<{ lag: number; r: number }> = [];
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      series.push({ lag, r: laggedCorr(xs, ys, lag) });
    }
    return series;
  }, [alignedPairs, maxLag]);

  const bestLag = useMemo(() => {
    let best = lagSeries[0] ?? { lag: 0, r: 0 };
    for (const s of lagSeries) if (Math.abs(s.r) > Math.abs(best.r)) best = s;
    return best;
  }, [lagSeries]);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    const keys = corrMatrix.keys;
    const { matrix, n } = corrMatrix;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const cell = matrix[i * n + j];
        if (Math.abs(cell.r) >= 0.7 && cell.p < 0.05) {
          const a = SENSOR_TYPES[keys[i]]?.name ?? keys[i];
          const b = SENSOR_TYPES[keys[j]]?.name ?? keys[j];
          const dir = cell.r > 0 ? t('research.reco.positive', 'positive') : t('research.reco.negative', 'negative');
          recs.push(t('research.reco.strong', 'Strong {dir} correlation (r={r}, p={p}) between {a} and {b}. Consider cross-validating these sensors.', {
            dir,
            r: cell.r.toFixed(2),
            p: cell.p.toFixed(4),
            a,
            b,
          }));
        }
      }
    }
    if (Math.abs(bestLag.r) >= 0.4) {
      const a = SENSOR_TYPES[selectedX]?.name ?? selectedX;
      const b = SENSOR_TYPES[selectedY]?.name ?? selectedY;
      const dir = bestLag.lag > 0 ? t('research.reco.leads', '{a} leads {b}', { a, b }) : bestLag.lag < 0 ? t('research.reco.leadsBy', '{b} leads {a}', { a, b }) : t('research.reco.noLeadLag', 'no lead-lag');
      recs.push(t('research.reco.lagged', 'Lagged analysis: strongest relationship at lag {lag} (r={r}), meaning {lead}. Useful for predictive modeling.', {
        lag: bestLag.lag,
        r: bestLag.r.toFixed(2),
        lead: dir,
      }));
    }
    if (recs.length === 0 && availableKeys.length > 2) {
      recs.push(t('research.reco.none', 'No strong, statistically significant correlations detected. More data points over time will improve correlation analysis.'));
    }
    return recs;
  }, [corrMatrix, availableKeys, bestLag, selectedX, selectedY, t]);

  const hasData = availableKeys.length >= 2;

  if (loading) {
    return (
      <div className="max-w-[1300px] mx-auto">
        <PageHeader title={t('research.loadingTitle', 'Sensor Correlation Analysis')} subtitle={t('research.loadingSubtitle', 'Loading real data from database...')} />
        <Card hover={false}>
          <LoadingState label={t('research.loadingLabel', 'Loading sensor data…')} />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader
        title={t('research.title', 'Sensor Correlation Analysis')}
        subtitle={t('research.subtitle', 'Pearson coefficients · Regression · Lag analysis · Statistical significance')}
        right={<div className="flex items-center gap-2">
          {readings.length === 0 ? <Pill tone="amber">{t('research.noData', 'No data')}</Pill> : <Pill tone="emerald">{readings.length} {t('research.readings', 'readings')}</Pill>}
          <Btn variant="ghost" size="sm" onClick={() => apiClient.downloadCSV(apiClient.exportReadingsCSV(), 'readings.csv').catch(() => {})}>
            <Download size={12} /> {t('research.export', 'Export')}
          </Btn>
        </div>}
      />

      {!hasData ? (
        <EmptyState
          icon={<Activity size={24} />}
          title={t('research.empty.title', 'Insufficient sensor data')}
          message={t('research.empty.message', 'Connect a device and switch to Live Mode to stream real sensor readings for correlation analysis. At least 3 readings per sensor are needed.')}
        />
      ) : (
        <div className="space-y-6 animate-fade-in">
          <Card hover={false}>
            <SectionTitle>
              <ArrowRightLeft size={14} className="inline mr-2 text-[var(--emerald)]" />
              {t('research.section.matrix', 'Correlation Matrix ({count} parameters)', { count: corrMatrix.keys.length })}
            </SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="p-2 text-left rtl:text-right text-[var(--text-disabled)] font-medium">{t('research.variable', 'Variable')}</th>
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
                        const cell = corrMatrix.matrix[i * corrMatrix.n + j];
                        const isDiag = i === j;
                        return (
                          <td key={colKey}
                            className="p-2 text-center font-mono font-medium whitespace-nowrap"
                            style={{ color: isDiag ? 'var(--text-disabled)' : corrColor(cell.r), background: isDiag ? 'transparent' : corrBg(cell.r) }}>
                            {isDiag ? '—' : `${cell.r.toFixed(2)}${stars(cell.p)}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--text-disabled)]">
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--emerald)' }} />{t('research.legend.strongPos', 'Strong positive (r ≥ 0.7)')}</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--cyan)' }} />{t('research.legend.moderatePos', 'Moderate positive (0.4–0.7)')}</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--amber)' }} />{t('research.legend.moderateNeg', 'Moderate negative (-0.4 to -0.7)')}</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: 'var(--rose)' }} />{t('research.legend.strongNeg', 'Strong negative (r ≤ -0.7)')}</span>
              <span className="ml-2">{t('research.legend.significance', 'Significance: * p<0.10 · ** p<0.05 · *** p<0.01')}</span>
            </div>
          </Card>

          <Card hover={false}>
            <SectionTitle>
              <BarChart3 size={14} className="inline mr-2 text-[var(--cyan)]" />
              {t('research.section.scatter', 'Scatter Plot — Parameter Pair with Regression')}
            </SectionTitle>
            <div className="flex flex-wrap gap-3 mb-4">
              <div>
                <label className="block text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1">{t('research.xAxis', 'X Axis')}</label>
                <select value={selectedX} onChange={e => setSelectedX(e.target.value as SensorType)}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--emerald)] transition-colors">
                  {availableKeys.map(k => <option key={k} value={k}>{SENSOR_TYPES[k]?.name ?? k}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1">{t('research.yAxis', 'Y Axis')}</label>
                <select value={selectedY} onChange={e => setSelectedY(e.target.value as SensorType)}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--emerald)] transition-colors">
                  {availableKeys.map(k => <option key={k} value={k}>{SENSOR_TYPES[k]?.name ?? k}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2 ml-auto flex-wrap">
                <Pill tone={Math.abs(currentCorr) >= 0.7 ? (currentCorr > 0 ? 'emerald' : 'rose') : Math.abs(currentCorr) >= 0.4 ? (currentCorr > 0 ? 'cyan' : 'amber') : 'slate'}>
                  r = {currentCorr.toFixed(3)} · {corrLabel(currentCorr, t)}
                </Pill>
                <Pill tone={sig.tone}>
                  <Sigma size={10} className="inline mr-1" />p = {currentP.toFixed(4)} · {sig.label}
                </Pill>
                {scatterData.length >= 3 && (
                  <Pill tone="violet">
                    <TrendingUp size={10} className="inline mr-1" />y = {regression.slope.toFixed(3)}x {regression.intercept >= 0 ? '+' : '-'} {Math.abs(regression.intercept).toFixed(2)} · R² = {regression.r2.toFixed(3)}
                  </Pill>
                )}
              </div>
            </div>
            {scatterData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <ChartGrid />
                    <XAxis dataKey="x" type="number" name={SENSOR_TYPES[selectedX]?.name ?? selectedX} tick={CHART_TICK} axisLine={false} tickLine={false}
                      label={{ value: SENSOR_TYPES[selectedX]?.name ?? selectedX, position: 'insideBottom', offset: -5, fill: 'var(--text-disabled)', fontSize: 10 }} />
                    <YAxis dataKey="y" type="number" name={SENSOR_TYPES[selectedY]?.name ?? selectedY} tick={CHART_TICK} axisLine={false} tickLine={false}
                      label={{ value: SENSOR_TYPES[selectedY]?.name ?? selectedY, angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--text-disabled)', fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--text-disabled)' }}
                      formatter={((_: number, name: string) => [_, name]) as any} />
                    <Scatter data={scatterData} fill={currentCorr >= 0 ? 'var(--emerald)' : 'var(--rose)'} fillOpacity={0.6} name={SENSOR_TYPES[selectedY]?.name ?? selectedY}>
                      {scatterData.map((_, idx) => <Cell key={idx} />)}
                    </Scatter>
                    {regressionLine.length === 2 && (
                      <Line dataKey="y" data={regressionLine} stroke="var(--violet)" strokeWidth={2} dot={false} name={t('research.olsRegression', 'OLS regression')} strokeDasharray="6 3" />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-[var(--text-disabled)] text-sm">{t('research.noPoints', 'No data points for the selected parameter pair.')}</div>
            )}
            {scatterData.length >= 3 && (
              <div className="mt-2 text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                {t('research.fitSummary', 'Ordinary-least-squares fit: slope = {slope} · intercept = {intercept} · R² = {r2} over n = {n} aligned pairs. R² measures the fraction of variance in Y explained by X.', {
                  slope: regression.slope.toFixed(4),
                  intercept: regression.intercept.toFixed(2),
                  r2: regression.r2.toFixed(4),
                  n: regression.n,
                })}
              </div>
            )}
          </Card>

          <Card hover={false}>
            <SectionTitle>
              <Clock size={14} className="inline mr-2 text-[var(--amber)]" />
              {t('research.section.lag', 'Lagged Correlation — Cross-Correlation vs Time Lag')}
            </SectionTitle>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-3">
                <label className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider">{t('research.maxLag', 'Max lag')}</label>
                <input type="range" min={1} max={25} value={maxLag} onChange={e => setMaxLag(Number(e.target.value))}
                  className="accent-[var(--emerald)] w-40" />
                <span className="text-xs font-mono text-[var(--text-primary)]">±{maxLag}</span>
              </div>
              <div className="flex items-end gap-2 ml-auto">
                <Pill tone="emerald">
                  {t('research.bestLag', 'Best lag {lag} · r = {r}', { lag: bestLag.lag > 0 ? `+${bestLag.lag}` : bestLag.lag, r: bestLag.r.toFixed(3) })}
                </Pill>
              </div>
            </div>
            {lagSeries.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lagSeries} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                    <ChartGrid />
                    <XAxis dataKey="lag" tick={CHART_TICK} axisLine={false} tickLine={false}
                      label={{ value: t('research.lagAxis', 'Lag (reading steps)'), position: 'insideBottom', offset: -5, fill: 'var(--text-disabled)', fontSize: 10 }} />
                    <YAxis dataKey="r" domain={[-1, 1]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                    <ReferenceLine y={0} stroke="var(--text-disabled)" strokeDasharray="3 3" />
                    <ReferenceLine x={bestLag.lag} stroke="var(--violet)" strokeDasharray="3 3" />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[var(--surface)] border border-white/10 rounded px-2.5 py-1.5 text-xs shadow-lg">
                          <span className="text-[var(--text-disabled)]">{t('research.lagLabel', 'Lag:')}</span> <span className="text-[var(--text-primary)] font-mono">{d.lag}</span>
                          <span className="ml-2 text-[var(--text-disabled)]">{t('research.rLabel', 'r:')}</span> <span className="font-mono" style={{ color: corrColor(d.r) }}>{d.r.toFixed(3)}</span>
                        </div>
                      );
                    }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="r" radius={[2, 2, 0, 0]}>
                      {lagSeries.map((s, i) => <Cell key={i} fill={Math.abs(s.r) >= 0.7 ? (s.r > 0 ? 'var(--emerald)' : 'var(--rose)') : Math.abs(s.r) >= 0.4 ? (s.r > 0 ? 'var(--cyan)' : 'var(--amber)') : 'rgba(148,163,184,0.35)'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-[var(--text-disabled)] text-sm">{t('research.insufficientLag', 'Insufficient paired data for lag analysis.')}</div>
            )}
            <div className="mt-3 text-xs text-[var(--text-tertiary)] leading-relaxed">
              {t('research.lagNote', 'Positive lag = X leads Y (X today predicts Y in lag steps).')} {Math.abs(bestLag.r) >= 0.4
                ? t('research.lagFound', 'For the selected pair, the strongest coupling occurs at lag {lag} (r={r}), which can inform lead-time in predictive models.', { lag: bestLag.lag, r: bestLag.r.toFixed(2) })
                : t('research.lagNone', 'No meaningful lead-lag relationship detected at the tested lags.')}
            </div>
          </Card>

          <Card hover={false}>
            <SectionTitle>
              <TrendingUp size={14} className="inline mr-2 text-[var(--amber)]" />
              {t('research.section.summary', 'Statistical Summary')}
            </SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="p-2.5 text-left rtl:text-right text-[var(--text-disabled)] font-medium">{t('references.sensor', 'Sensor')}</th>
                    <th className="p-2.5 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('references.count', 'Count')}</th>
                    <th className="p-2.5 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('research.mean', 'Mean')}</th>
                    <th className="p-2.5 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('research.min', 'Min')}</th>
                    <th className="p-2.5 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('research.max', 'Max')}</th>
                    <th className="p-2.5 text-right rtl:text-left text-[var(--text-disabled)] font-medium">{t('research.stdDev', 'Std Dev')}</th>
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
              {t('research.section.recommendations', 'Analysis & Recommendations')}
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
              {t('research.note', 'Note: Correlation and regression are computed from {count} real time-series readings stored in PostgreSQL. Significance via two-tailed t-test (n−2 d.f.); R² via ordinary least squares. More data improves accuracy.', { count: readings.length })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
