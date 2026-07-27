import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import { useData } from '../lib/data-provider';
import { apiClient } from '../lib/api-client';
import { useDevice } from '../lib/device-context';
import { generateAdvancedPrediction, doubleExponentialSmoothing } from '../lib/prediction-engine';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { backtestPrediction, calculateAverageError, calculateAccuracyScore } from '../lib/prediction-validation';
import { PageHeader, Card, Pill, Btn, SectionTitle, ProgressRing, LoadingState, fmt } from '../components/ui';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { TrendingUp, Target, BarChart3 } from 'lucide-react';

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

  // Build chart data with actual values + predictions
  const chartData = useMemo(() => {
    if (!usingRealData) return [];

    // Historical data points
    const historical = history.map((v, i) => ({
      time: i + 1,
      actual: v,
      predicted: null as number | null,
      upper: null as number | null,
      lower: null as number | null,
    }));

    // Generate predictions extending from last data point
    const pred24 = generateAdvancedPrediction(history, 24);
    const pred48 = generateAdvancedPrediction(history, 48);
    const pred7d = generateAdvancedPrediction(history, 168);

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
  }, [history, usingRealData]);

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <PageHeader title={t('predictions.title')} subtitle="Loading real data from database..." />
        <Card hover={false}><LoadingState /></Card>
      </div>
    );
  }

  if (!usingRealData) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <PageHeader title={t('predictions.title')} subtitle={t('predictions.subtitle')} />
        <Card hover={false} className="flex flex-col items-center justify-center text-center py-16 gap-3">
          <div className="text-[var(--text-secondary)] text-lg font-medium">Awaiting real device history</div>
          <p className="text-[var(--text-tertiary)] text-sm max-w-md leading-relaxed">
            {noRealData
              ? 'Predictions are built only from real EHI readings stored in PostgreSQL. Keep Live Mode running with a connected device for at least 6 readings to generate forecasts.'
              : `Need at least 6 real EHI readings to train the forecast models. Currently have ${history.length}. They are recorded automatically in Live Mode.`}
          </p>
        </Card>
      </div>
    );
  }

  const predictions = [
    { horizon: '24 Hours', icon: <Target size={14} />, ...generateAdvancedPrediction(history, 24) },
    { horizon: '48 Hours', icon: <TrendingUp size={14} />, ...generateAdvancedPrediction(history, 48) },
    { horizon: '7 Days', icon: <BarChart3 size={14} />, ...generateAdvancedPrediction(history, 168) },
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
          <SectionTitle>EHI Forecast Visualization</SectionTitle>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--emerald)]" /> Actual</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--cyan)]" /> Predicted</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 bg-[var(--cyan)]/20 rounded" /> Confidence</span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="predGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" stroke="var(--text-disabled)" fontSize={10} />
              <YAxis domain={[0, 100]} stroke="var(--text-disabled)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  if (value == null) return ['—', name];
                  return [fmt(value), name];
                }}
              />
              <ReferenceLine x={history.length} stroke="var(--text-disabled)" strokeDasharray="5 5" label={{ value: 'Now', fill: 'var(--text-disabled)', fontSize: 10 }} />
              <Line type="natural" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="natural" dataKey="predicted" stroke="#06b6d4" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
              <Area type="natural" dataKey="upper" stroke="none" fill="url(#predGradient)" connectNulls={false} />
              <Area type="natural" dataKey="lower" stroke="none" fill="var(--bg-0)" connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Prediction Cards */}
      <div className="grid md:grid-cols-3 gap-5 grid-entrance">
        {predictions.map((pred, idx) => (
          <Card key={idx} hover={false}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">{pred.icon}{pred.horizon}</div>
              <Pill tone="emerald">Forecast</Pill>
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
                <span>R²: {fmt(pred.rSquared || 0)}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card hover={false} className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <div className="text-[var(--text-secondary)]">
            {t('predictions.label.currentEhi')}{' '}
            <span className="font-bold text-[var(--emerald)]">{fmt(data.ehi)}</span> →{' '}
            Models predict based on {history.length} real readings from PostgreSQL.
          </div>
          <Pill tone="emerald">{t('predictions.badge.realData')}</Pill>
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
