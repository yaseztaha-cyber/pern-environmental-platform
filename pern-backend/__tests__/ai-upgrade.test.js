/**
 * AI Core Upgrade Tests
 * Covers: analysis engine, response cache, LLM JSON extraction,
 * AI analysis fallbacks (deterministic), and the health briefing.
 */

describe('Analysis Engine', () => {
  const {
    SENSOR_THRESHOLDS,
    assessSensorStatus,
    computeSeriesStats,
    linearTrend,
    zScoreAnomaly,
    deriveRiskLevel,
    computeHealthScore,
    buildReadingMatrix,
    latestReadings,
  } = require('../services/analysis-engine');

  it('exposes thresholds for core sensors', () => {
    expect(SENSOR_THRESHOLDS.pm25.warn).toBe(35);
    expect(SENSOR_THRESHOLDS.co2.crit).toBe(2000);
  });

  it('assesses normal values as normal', () => {
    const r = assessSensorStatus('pm25', 10);
    expect(r.level).toBe('normal');
    expect(r.status).toBe('normal');
    expect(r.sensor).toBe('pm25');
  });

  it('assesses warning values', () => {
    expect(assessSensorStatus('pm25', 45).level).toBe('warning');
    expect(assessSensorStatus('co2', 1500).level).toBe('warning');
  });

  it('assesses critical values', () => {
    expect(assessSensorStatus('pm25', 60).level).toBe('critical');
    expect(assessSensorStatus('dO', 2).level).toBe('critical');
  });

  it('handles range checks (pH)', () => {
    expect(assessSensorStatus('ph', 7).level).toBe('normal');
    expect(assessSensorStatus('ph', 6.0).level).toBe('warning');
    expect(assessSensorStatus('ph', 9.6).level).toBe('critical');
  });

  it('returns null for unknown or non-numeric sensors', () => {
    expect(assessSensorStatus('unknown_sensor', 5)).toBeNull();
    expect(assessSensorStatus('pm25', 'abc')).toBeNull();
  });

  it('computes series statistics', () => {
    const s = computeSeriesStats([10, 20, 30]);
    expect(s.avg).toBe(20);
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
    expect(s.direction).toBe('increasing');
  });

  it('returns null for empty series', () => {
    expect(computeSeriesStats([])).toBeNull();
    expect(computeSeriesStats([NaN])).toBeNull();
  });

  it('fits a linear trend', () => {
    const fit = linearTrend([1, 2, 3, 4, 5]);
    expect(fit.direction).toBe('rising');
    expect(fit.slope).toBeGreaterThan(0);
    expect(fit.r2).toBeGreaterThan(0.9);
  });

  it('detects z-score anomalies', () => {
    const window = [10, 11, 10, 12, 11, 10, 11, 10, 12, 11, 10];
    expect(zScoreAnomaly(11, window).isAnomaly).toBe(false);
    expect(zScoreAnomaly(30, window).isAnomaly).toBe(true);
  });

  it('requires 10+ points for z-score', () => {
    expect(zScoreAnomaly(50, [1, 2, 3])).toBeNull();
  });

  it('derives risk levels', () => {
    expect(deriveRiskLevel({ worstStatus: 'normal' })).toBe('low');
    expect(deriveRiskLevel({ worstStatus: 'warning' })).toBe('high');
    expect(deriveRiskLevel({ worstStatus: 'critical' })).toBe('critical');
    expect(deriveRiskLevel({ worstStatus: 'warning', trendDirection: 'increasing' })).toBe('critical');
  });

  it('computes health scores', () => {
    expect(computeHealthScore([{ level: 'normal' }, { level: 'normal' }])).toBe(100);
    expect(computeHealthScore([{ level: 'warning' }])).toBe(85);
    expect(computeHealthScore([{ level: 'critical' }])).toBe(65);
    expect(computeHealthScore([])).toBeNull();
  });

  it('builds a reading matrix from rows', () => {
    const matrix = buildReadingMatrix([
      { sensors: { pm25: 10, co2: 500 }, recorded_at: 't1' },
      { sensors: { pm25: 12 }, recorded_at: 't2' },
    ]);
    expect(matrix.pm25).toEqual([10, 12]);
    expect(matrix.co2).toEqual([500]);
  });

  it('flattens latest readings', () => {
    const latest = latestReadings([
      { sensors: { pm25: 10, co2: 400 }, recorded_at: 't1' },
      { sensors: { pm25: 12 }, recorded_at: 't2' },
    ]);
    expect(latest.pm25).toBe(12);
    expect(latest.co2).toBe(400);
  });
});

describe('AI Response Cache', () => {
  const { withCache, cacheKey, getCacheStats, clearCache } = require('../services/ai-cache');

  beforeEach(() => clearCache());

  it('caches results and marks them cached', async () => {
    let calls = 0;
    const fn = async () => { calls++; return { answer: 42 }; };
    const key = 'test-key-1';

    const first = await withCache(key, 60000, fn);
    const second = await withCache(key, 60000, fn);

    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.answer).toBe(42);
  });

  it('respects TTL expiry', async () => {
    let calls = 0;
    const fn = async () => { calls++; return { v: calls }; };
    const key = 'test-key-ttl';

    await withCache(key, 100, fn);
    await withCache(key, 100, fn);
    expect(calls).toBe(1);

    await new Promise(r => setTimeout(r, 300));
    await withCache(key, 100, fn);
    expect(calls).toBe(2);
  });

  it('generates stable keys regardless of property order', () => {
    expect(cacheKey(['a', { x: 1, y: 2 }])).toBe(cacheKey(['a', { y: 2, x: 1 }]));
    expect(cacheKey(['a', { x: 1 }])).not.toBe(cacheKey(['a', { x: 2 }]));
  });

  it('exposes cache stats', async () => {
    await withCache('stats-key', 60000, async () => ({ ok: true }));
    const stats = getCacheStats();
    expect(typeof stats.size).toBe('number');
    expect(typeof stats.hitRate).toBe('number');
  });
});

describe('LLM JSON Extraction', () => {
  const { extractJSON } = require('../services/llm-client');

  it('parses plain JSON', () => {
    expect(extractJSON('{"a":1}').a).toBe(1);
  });

  it('parses fenced JSON blocks', () => {
    expect(extractJSON('```json\n{"a":2}\n```').a).toBe(2);
  });

  it('extracts JSON from leading prose', () => {
    expect(extractJSON('Here you go: {"a":3} thanks').a).toBe(3);
  });

  it('returns null for invalid input', () => {
    expect(extractJSON('not json at all')).toBeNull();
    expect(extractJSON(null)).toBeNull();
  });
});

describe('AI Analysis (deterministic fallback)', () => {
  const aiAnalysis = require('../services/ai-analysis');

  it('analyzeTrend returns insufficient data result', async () => {
    const result = await aiAnalysis.analyzeTrend({ sensor: 'pm25' });
    expect(result).toHaveProperty('insight');
    expect(result).toHaveProperty('dataPoints');
    expect(result).toHaveProperty('riskLevel');
  });

  it('explainAnomaly returns a full fallback result without an LLM key', async () => {
    const result = await aiAnalysis.explainAnomaly({ sensor: 'pm25', value: 60, previousValue: 20 });
    expect(result).toHaveProperty('explanation');
    expect(result).toHaveProperty('severity');
    expect(result.possibleCauses.length).toBeGreaterThan(0);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('riskLevel');
    expect(result).toHaveProperty('references');
  });

  it('diagnoseSensors handles no readings gracefully', async () => {
    const result = await aiAnalysis.diagnoseSensors({ readings: {} });
    expect(result).toHaveProperty('diagnosis');
    expect(result).toHaveProperty('sensorStatus');
  });

  it('diagnoseSensors evaluates readings deterministically', async () => {
    const result = await aiAnalysis.diagnoseSensors({ readings: { pm25: 45, co2: 1500, tmp: 25 } });
    const warn = result.sensorStatus.filter(s => s.status === 'warning');
    expect(warn.length).toBeGreaterThanOrEqual(1);
  });
});

describe('AI Health Briefing', () => {
  const { getBriefing } = require('../services/ai-briefing');

  it('returns a structured briefing with deterministic fallback', async () => {
    const briefing = await getBriefing({});
    expect(briefing).toHaveProperty('summary');
    expect(briefing).toHaveProperty('headline');
    expect(briefing).toHaveProperty('healthScore');
    expect(briefing).toHaveProperty('riskLevel');
    expect(briefing).toHaveProperty('status');
    expect(briefing).toHaveProperty('generatedAt');
    expect(Array.isArray(briefing.assessments)).toBe(true);
    expect(Array.isArray(briefing.references)).toBe(true);
    expect(briefing).toHaveProperty('deterministic');
  });

  it('caches subsequent briefings', async () => {
    const a = await getBriefing({ deviceId: 'cache-check' });
    const b = await getBriefing({ deviceId: 'cache-check' });
    expect(b.cached).toBe(true);
    expect(a.generatedAt).toBeDefined();
  });
});

describe('AI Tools Route', () => {
  it('mounts the health-briefing route and enriched stats', () => {
    const router = require('../routes/ai-tools');
    expect(typeof router).toBe('function');
  });

  it('exposes telemetry from llm-client and cache', () => {
    const llmClient = require('../services/llm-client');
    const aiCache = require('../services/ai-cache');
    expect(typeof llmClient.getUsage).toBe('function');
    expect(llmClient.getUsage().calls).toBeGreaterThanOrEqual(0);
    expect(typeof aiCache.getCacheStats().hitRate).toBe('number');
  });
});
