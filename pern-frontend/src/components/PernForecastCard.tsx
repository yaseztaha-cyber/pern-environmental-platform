/**
 * PERN v4.0 — Forecast Engine Card
 * Shows the calibrated multi-horizon (1/7/30-day) temperature forecast from
 * the pern-ai ForecastEngine, proxied through the backend. Each row is a
 * conditional-conformal interval: center, [lower, upper] band, method, nominal
 * coverage and confidence score. Degrades to a short "unavailable" note when
 * the engine is offline (pern-ai not running / not yet promoted).
 */
import { useEffect, useState } from 'react';
import { Loader2, Thermometer, Info } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { apiClient } from '../lib/api-client';
import { buildForecastPayload, formatForecastRow, FORECAST_HORIZONS, type PernForecastHorizon } from '../lib/pern-forecast';
import { Card, SectionTitle, Pill } from './ui';

interface PernForecastCardProps {
  temperature?: number;
  latitude?: number;
  longitude?: number;
}

const METHOD_TONES: Record<string, 'violet' | 'cyan' | 'slate'> = {
  nwp_mos: 'violet',
  anomaly: 'cyan',
  persistence: 'slate',
};

export function PernForecastCard({ temperature, latitude = 30.0, longitude = 31.5 }: PernForecastCardProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<PernForecastHorizon[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    Promise.all(FORECAST_HORIZONS.map(h => apiClient.pernForecast(buildForecastPayload(h, latitude, longitude, temperature)).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        const ok = results.filter(Boolean).length > 0;
        setRows(results.filter((r): r is PernForecastHorizon => Boolean(r)));
        setState(ok ? 'ready' : 'offline');
      })
      .catch(() => {
        if (!cancelled) setState('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, temperature]);

  return (
    <Card hover={false}>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Thermometer size={18} className="text-[var(--violet)]" />
          {t('pern.forecast.title', 'Temperature Forecast (PERN)')}
          {state === 'ready' && (
            <Pill tone="violet" className="ms-2">{t('pern.forecast.calibrated', 'calibrated')}</Pill>
          )}
        </span>
      </SectionTitle>

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" /> {t('pern.forecast.loading', 'Running forecast engine…')}
        </div>
      )}

      {state === 'offline' && (
        <div className="py-6 text-center text-sm text-[var(--text-secondary)]">
          {t('pern.forecast.offline', 'Calibrated forecast engine unavailable. Heuristic forecast shown above.')}
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
            {rows.map(r => {
              const f = formatForecastRow(r);
              return (
                <div key={r.horizon_days} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{f.label}</span>
                    <Pill tone={METHOD_TONES[r.method] ?? 'slate'}>{f.method}</Pill>
                  </div>
                  <div className="text-lg font-semibold mt-1 text-[var(--text-primary)]">{f.center}°C</div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    [{f.low}, {f.high}]°C · ±{f.halfWidth}°C
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[var(--text-tertiary)]">
                    <Info size={11} />
                    {t('pern.forecast.coverage', 'coverage')} {f.coveragePct}% · {t('pern.forecast.confidence', 'confidence')} {f.confidence}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
            {t('pern.forecast.footnote', 'Daily-mean temperature, calibrated conditional-conformal intervals (accuracy plan §4).')}
          </p>
        </>
      )}
    </Card>
  );
}
