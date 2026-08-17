import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import { useData } from '../lib/data-provider';
import { apiClient } from '../lib/api-client';
import { useDevice } from '../lib/device-context';
import { generateAdvancedPrediction, doubleExponentialSmoothing, detectAnomalies, detectTrendDirection } from '../lib/prediction-engine';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { backtestPrediction, calculateAverageError, calculateAccuracyScore } from '../lib/prediction-validation';
import { PageHeader, Card, Pill, SectionTitle, ProgressRing, LoadingState, fmt } from '../components/ui';
import { ModelExplainabilityPanel, TrendBadge } from '../components/ModelExplainability';
import { Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Area, ComposedChart } from 'recharts';
import { ChartGrid, ChartTooltip, CHART_CURSOR, CHART_TICK, ChartAreaGradient } from '../components/charts';
import { TrendingUp, Target, BarChart3, Activity, CalendarDays } from 'lucide-react';

export default function PredictionsPage() {
  return (
    <PageErrorBoundary pageName="Predictions">
      <PredictionsContent />
    </PageErrorBoundary>
  );
}

function PredictionsContent() {
  const { t } = useI18n();
  const { data, isLive, hasRealData } = useData();
  const { selectedDevice } = useDevice();
  const [history, setHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    setLoading(true);
    apiClient.getEHIHistory(selectedDevice?.id, from).then(raw => {
      const values = (Array.isArray(raw) ? raw : []).map((r: any) => Number(r.ehi ?? 0));
      setHistory(values);
    }).catch(() => setHistory([])).finally(() => setLoading(false));
  }, [selectedDevice?.id]);

  const noRealData = isLive && !hasRealData;
  const usingRealData = history.length >= 6;

  // Compute predictions once, shared by chart + cards
  const pred24 = useMemo(() => usingRealData ? generateAdvancedPrediction(history, 24) : null, [history, usingRealData]);
  const pred48 = useMemo(() => usingRealData ? generateAdvancedPrediction(history, 48) : null, [history, usingRealData]);
  const pred7d = useMemo(() => usingRealData ? generateAdvancedPrediction(history, 168) : null, [history, usingRealData]);
  const pred30d = useMemo(() => usingRealData ? generateAdvancedPrediction(history, 720) : null, [history, usingRealData]);

  // Build chart data with actual values + predictions
  const chartData = useMemo(() => {
    if (!usingRealData || !pred24) return [];

    // Historical data points
    const historical: Array<{ time: number; actual: number | null; predicted: number | null; upper: number | null; lower: number | null }> = history.map((v, i) => ({
      time: i + 1,
      actual: v,
      predicted: null as number | null,
      upper: null as number | null,
      lower: null as number | null,
    }));

    // Add smoothed prediction line using Holt's
    const smoothed = doubleExponentialSmoothing(history);
    const lastSmoothed = smoothed.length > 0 ? smoothed[smoothed.length - 1] : history[history.length - 1];

    // Extend predictions into the chart
    for (let i = 1; i <= 12; i++) {
      const horizonFactor = i / 12;
      const predicted = lastSmoothed + (pred24.value - history[history.length - 1]) * horizonFactor;
      const uncertainty = (pred24.upperBound - pred24.value) * (1 + horizonFactor);
      historical.push({
        time: history.length + i,
        actual: null as number | null,
        predicted: Math.round(predicted * 10) / 10,
        upper: Math.round((predicted + uncertainty) * 10) / 10,
        lower: Math.round((predicted - uncertainty) * 10) / 10,
      });
    }

    return historical;
  }, [history, usingRealData, pred24]);

  // 30-day daily outlook — interpolate from the last actual to the 30-day
  // forecast with an expanding uncertainty band (grows with sqrt(day)).
  const monthlyData = useMemo(() => {
    if (!usingRealData || !pred30d || history.length === 0) return [];
    const lastActual = history[history.length - 1];
    const halfBand = (pred30d.upperBound - pred30d.lowerBound) / 2;
    const points = [];
    for (let day = 1; day <= 30; day++) {
      const f = day / 30;
      const center = lastActual + (pred30d.value - lastActual) * f;
      const band = halfBand * Math.sqrt(day / 30);
      points.push({
        day,
        predicted: Math.round(center * 10) / 10,
        upper: Math.round((center + band) * 10) / 10,
        lower: Math.round((center - band) * 10) / 10,
      });
    }
    return points;
  }, [history, usingRealData, pred30d]);

  const trendInfo = useMemo(() => history.length >= 3 ? detectTrendDirection(history) : null, [history]);
  const anomalyIdx = useMemo(() => detectAnomalies(history), [history]);

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <PageHeader title={t('predictions.title')} subtitle={t('predictions.loading', 'Loading real data from database...')} />
        <Card hover={false}><LoadingState /></Card>
      </div>
    );
  }

  if (!usingRealData) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <PageHeader title={t('predictions.title')} subtitle={t('predictions.subtitle')} />
        <Card hover={false} className="flex flex-col items-center justify-center text-center py-16 gap-3">
          <div className="text-[var(--text-secondary)] text-lg font-medium">{t('predictions.empty.title', 'Awaiting real device history')}</div>
          <p className="text-[var(--text-tertiary)] text-sm max-w-md leading-relaxed">
            {noRealData
              ? t('predictions.empty.noRealData', 'Predictions are built only from real EHI readings stored in PostgreSQL. Keep Live Mode running with a connected device for at least 6 readings to generate forecasts.')
              : t('predictions.empty.insufficient', 'Need at least 6 real EHI readings to train the forecast models. Currently have {count}. They are recorded automatically in Live Mode.', { count: history.length })}
          </p>
        </Card>
      </div>
    );
  }

  const predictions = [
    { horizon: t('predictions.horizon.24h', '24 Hours'), icon: <Target size={14} />, ...(pred24 ?? { value: 0, upperBound: 0, lowerBound: 0, confidence: 0, rSquared: 0 }) },
    { horizon: t('predictions.horizon.48h', '48 Hours'), icon: <TrendingUp size={14} />, ...(pred48 ?? { value: 0, upperBound: 0, lowerBound: 0, confidence: 0, rSquared: 0 }) },
    { horizon: t('predictions.horizon.7d', '7 Days'), icon: <BarChart3 size={14} />, ...(pred7d ?? { value: 0, upperBound: 0, lowerBound: 0, confidence: 0, rSquared: 0 }) },
    { horizon: t('predictions.horizon.30d', '30 Days'), icon: <CalendarDays size={14} />, ...(pred30d ?? { value: 0, upperBound: 0, lowerBound: 0, confidence: 0, rSquared: 0 }) },
  ].map(p => ({ ...p, uncertainty: Math.round((p.upperBound - p.lowerBound) / 2) }));

  const validationResults = history.length >= 10 ? backtestPrediction(history, 5, 24) : [];
  const avgError = validationResults.length > 0 ? calculateAverageError(validationResults) : null;
  const accuracyScore = validationResults.length > 0 ? calculateAccuracyScore(validationResults) : null;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader title={t('predictions.title')} subtitle={t('predictions.subtitle')} />

      {/* Prediction Chart */}
      <Card hover={false} className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>{t('predictions.chart.title', 'EHI Forecast Visualization')}</SectionTitle>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--emerald)]" /> {t('predictions.chart.actual', 'Actual')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--cyan)]" /> {t('predictions.chart.predicted', 'Predicted')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 bg-[var(--cyan)]/20 rounded" /> {t('predictions.chart.confidence', 'Confidence')}</span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <ChartAreaGradient id="predGradient" from="#06b6d4" to="#06b6d4" />
              <ChartGrid />
              <XAxis dataKey="time" tick={CHART_TICK} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
              <Tooltip
                content={<ChartTooltip />}
                cursor={CHART_CURSOR}
                formatter={((value: number, name: string) => {
                  if (value == null) return ['—', name];
                  return [fmt(value), name];
                }) as any}
              />
              <ReferenceLine x={history.length} stroke="var(--text-disabled)" strokeDasharray="5 5" label={{ value: t('predictions.chart.now', 'Now'), fill: 'var(--text-tertiary)', fontSize: 10 }} />
              {anomalyIdx.map(idx => (
                <ReferenceDot key={idx} x={idx + 1} y={history[idx]} r={4.5} fill="var(--rose)" stroke="var(--bg-0)" strokeWidth={1.5} />
              ))}
              <Line type="natural" dataKey="actual" stroke="#10b981" strokeWidth={2.5} dot={false} connectNulls={false} name={t('predictions.chart.actual', 'Actual')} />
              <Line type="natural" dataKey="predicted" stroke="#06b6d4" strokeWidth={2.5} strokeDasharray="5 5" dot={false} connectNulls={false} name={t('predictions.chart.predicted', 'Predicted')} />
              <Area type="natural" dataKey="upper" stroke="none" fill="url(#predGradient)" connectNulls={false} />
              <Area type="natural" dataKey="lower" stroke="none" fill="var(--bg-0)" connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Prediction Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 grid-entrance">
        {predictions.map((pred, idx) => (
          <Card key={idx} hover={false}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">{pred.icon}{pred.horizon}</div>
              <Pill tone="emerald">{t('predictions.badge.forecast', 'Forecast')}</Pill>
            </div>
            <div className="flex items-center gap-4">
              <ProgressRing value={pred.confidence} size={56} strokeWidth={5} accent="emerald" />
              <div className="flex items-baseline gap-2">
                <div className="text-5xl font-bold tabular-nums tracking-tighter">{fmt(pred.value)}</div>
                <div className="text-lg text-[var(--emerald)] font-semibold">EHI</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[var(--text-secondary)]">{t('predictions.label.confidence')}</span>
                <span className="font-mono text-[var(--emerald)] font-semibold">{fmt(pred.confidence)}%</span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ background: 'linear-gradient(90deg, var(--emerald), var(--cyan))', width: `${pred.confidence}%` }}
                />
              </div>
              <div className="text-xs text-[var(--text-tertiary)] mt-2">
                ±{fmt(pred.uncertainty)} {t('predictions.label.uncertainty')}
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                <span>{t('predictions.method.ensemble')}</span>
                <span>{t('predictions.r2', 'R²: {value}', { value: fmt(pred.rSquared || 0) })}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 30-Day Outlook Chart */}
      {monthlyData.length > 0 && (
        <Card hover={false} className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <CalendarDays size={18} className="text-[var(--violet)]" />
                {t('predictions.outlook.title', '30-Day EHI Outlook')}
              </span>
            </SectionTitle>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-1 rounded-full bg-[var(--violet)]" /> {t('predictions.outlook.projection', 'Daily projection')}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[var(--violet)]/20" /> {t('predictions.outlook.confidence', 'Expanding confidence')}</span>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <ChartAreaGradient id="monthlyGrad" from="#8b5cf6" to="#8b5cf6" />
                <ChartGrid />
                <XAxis dataKey="day" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={(d: number) => `D+${d}`} />                <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={CHART_CURSOR}
                  formatter={((value: number, name: string) => {
                    if (value == null) return ['—', name];
                    return [fmt(value), name];
                  }) as any}
                  labelFormatter={((d: number) => t('predictions.outlook.day', 'Day {day}', { day: String(d) })) as any}
                />                <Area type="monotone" dataKey="upper" stroke="none" fill="url(#monthlyGrad)" fillOpacity={0.25} connectNulls={false} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="var(--bg-0)" connectNulls={false} />
                <Line type="monotone" dataKey="predicted" stroke="#8b5cf6" strokeWidth={2.5} dot={false} connectNulls={false} name={t('predictions.series.ehi', 'EHI')} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[10px] text-[var(--text-tertiary)]">
            {t('predictions.outlook.note', '30-day projection trained on {count} real EHI readings. Confidence narrows near-term and widens with horizon — treat month-end values as a directional trend, not an exact number.', { count: history.length })}
          </p>
        </Card>
      )}

      <ModelExplainabilityPanel
        history={history}
        horizon={24}
        confidence={pred24?.confidence}
        rSquared={pred24?.rSquared}
        method={pred24?.method}
        accuracyScore={accuracyScore}
        avgError={avgError}
        anomalyCount={anomalyIdx.length}
        trend={trendInfo ?? undefined}
      />

      <Card hover={false} className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <div className="text-[var(--text-secondary)]">
            {t('predictions.label.currentEhi')}{' '}
            <span className="font-bold text-[var(--emerald)]">{fmt(data.ehi)}</span> →{' '}
            {t('predictions.summary.models', 'Models predict based on {count} real readings from PostgreSQL.', { count: history.length })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {trendInfo && <TrendBadge direction={trendInfo.direction} magnitude={trendInfo.magnitude} />}
            {anomalyIdx.length > 0 && <Pill tone="rose"><Activity size={11} /> {anomalyIdx.length} {anomalyIdx.length > 1 ? t('predictions.anomalies', 'anomalies') : t('predictions.anomaly', 'anomaly')}</Pill>}
            <Pill tone="emerald">{t('predictions.badge.realData')}</Pill>
          </div>
        </div>
      </Card>

      {validationResults.length > 0 && (
        <Card hover={false} className="mt-5">
          <SectionTitle>{t('predictions.accuracy.title')}</SectionTitle>
          <div className="grid md:grid-cols-3 gap-4 text-sm grid-entrance">
            <div>
              <div className="text-[var(--text-tertiary)]">{t('predictions.label.averageError')}</div>
              <div className="text-2xl font-bold tracking-tighter mt-1">{fmt(avgError)}</div>
            </div>
            <div>
              <div className="text-[var(--text-tertiary)]">{t('predictions.label.accuracyScore')}</div>
              <div className="text-2xl font-bold tracking-tighter mt-1 text-[var(--emerald)]">{fmt(accuracyScore)}%</div>
            </div>
            <div>
              <div className="text-[var(--text-tertiary)]">{t('predictions.label.testsRun')}</div>
              <div className="text-2xl font-bold tracking-tighter mt-1">{fmt(validationResults.length)}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
