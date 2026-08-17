import { describe, it, expect } from 'vitest';
import {
  buildForecastPayload,
  formatForecastRow,
  FORECAST_HORIZONS,
  type PernForecastHorizon,
} from './pern-forecast';

describe('pern-forecast helpers', () => {
  it('builds payloads for the three served horizons with the given date', () => {
    const p = buildForecastPayload(7, 30.0, 31.5, 29.5, '2026-08-14');
    expect(p).toEqual({
      latitude: 30.0,
      longitude: 31.5,
      horizon: 7,
      target_date: '2026-08-14',
      obs_temperature: 29.5,
    });
  });

  it('omits the observation when temperature is undefined', () => {
    const p = buildForecastPayload(30, 30.0, 31.5, undefined, '2026-08-14');
    expect(p.obs_temperature).toBeUndefined();
  });

  it('covers 1, 7 and 30 day horizons', () => {
    expect(FORECAST_HORIZONS).toEqual([1, 7, 30]);
  });

  it('formats a raw engine row into display fields', () => {
    const row: PernForecastHorizon = {
      horizon_days: 7,
      method: 'anomaly',
      center: 26.43,
      lower: 21.31,
      upper: 31.55,
      width: 10.24,
      coverage: 0.93,
      confidence: 82.4,
      site_index: 0,
      bin_key: 'm08|v0|a1',
    };
    expect(formatForecastRow(row)).toEqual({
      label: '7 d',
      center: '26.4',
      low: '21.3',
      high: '31.6',
      halfWidth: '5.1',
      coveragePct: '93',
      confidence: '82',
      method: 'anomaly',
    });
  });

  it('labels the 24 h horizon specially', () => {
    const row: PernForecastHorizon = {
      horizon_days: 1,
      method: 'anomaly',
      center: 30.0,
      lower: 28.0,
      upper: 32.0,
      width: 4.0,
      coverage: 0.91,
      confidence: 80.0,
      site_index: 0,
      bin_key: 'm08|v0|a0',
    };
    expect(formatForecastRow(row).label).toBe('24 h');
  });
});
