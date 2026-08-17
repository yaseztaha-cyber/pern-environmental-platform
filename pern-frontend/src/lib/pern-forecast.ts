/**
 * PERN v4.0 — Forecast Engine helpers
 * Pure functions shared by the PernForecastCard UI: build the pern-ai
 * /v1/forecast payload for the three served horizons and format a raw engine
 * response into display fields. Kept side-effect free so it is unit-testable.
 */

export interface PernForecastHorizon {
  horizon_days: number;
  method: string;
  center: number;
  lower: number;
  upper: number;
  width: number;
  coverage: number;
  confidence: number;
  site_index: number;
  bin_key: string;
}

export const FORECAST_HORIZONS = [1, 7, 30];

export function buildForecastPayload(
  h: number,
  latitude: number,
  longitude: number,
  temperature?: number,
  targetDate = new Date().toISOString().slice(0, 10),
) {
  return {
    latitude,
    longitude,
    horizon: h,
    target_date: targetDate,
    obs_temperature: temperature,
  };
}

export function formatForecastRow(r: PernForecastHorizon) {
  return {
    label: r.horizon_days === 1 ? '24 h' : `${r.horizon_days} d`,
    center: r.center.toFixed(1),
    low: r.lower.toFixed(1),
    high: r.upper.toFixed(1),
    halfWidth: (r.width / 2).toFixed(1),
    coveragePct: (r.coverage * 100).toFixed(0),
    confidence: r.confidence.toFixed(0),
    method: r.method,
  };
}
