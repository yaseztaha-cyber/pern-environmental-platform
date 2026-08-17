const aiClient = require('../services/ai-confidence-client');
const trustEngine = require('../services/trust-engine');

describe('AI Confidence Client', () => {
  beforeEach(() => {
    aiClient.resetCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the learned score from pern-ai', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ score: 87.3, lower: 0.5, upper: 5.0, coverage: 0.9, model_version: 'v0.1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await aiClient.getConfidence('waqi', { source_id: 's1', latitude: 30.5, longitude: 31.2 });
    expect(result.score).toBe(87.3);
    expect(result.interval).toEqual([0.5, 5.0]);
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.feature_group).toBe('air');
    expect(callBody.latitude).toBe(30.5);
  });

  it('maps agriculture sources to the agriculture model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 90 }) });
    vi.stubGlobal('fetch', fetchMock);
    await aiClient.getConfidence('power', { latitude: 30, longitude: 31 });
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.feature_group).toBe('agriculture');
  });

  it('returns null on service failure (fallback path)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await aiClient.getConfidence('waqi', { source_id: 's1' });
    expect(result).toBeNull();
    expect(aiClient.getLastError()).toBeTruthy();
  });

  it('returns null when the model is unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ score: 0, method: 'unavailable', detail: 'no model artifact' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await aiClient.getConfidence('openaq', { source_id: 's1' });
    expect(result).toBeNull();
  });

  it('caches per source/reading', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ score: 75 }) });
    vi.stubGlobal('fetch', fetchMock);
    const reading = { source_id: 'sX', latitude: 30, longitude: 31 };
    await aiClient.getConfidence('waqi', reading);
    await aiClient.getConfidence('waqi', reading);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Trust Engine x AI', () => {
  it('computeConfidence stays on the heuristic (sync, unchanged factors)', () => {
    const { overall, factors } = trustEngine.computeConfidence('waqi', { source_id: 's1', parameters: { pm25: { value: 40 } } }, []);
    expect(overall).toBeGreaterThan(0);
    expect(overall).toBeLessThanOrEqual(0.98);
    expect(factors.baseTrust).toBe(0.85);
    expect(factors.historicalAccuracy).toBe(0.85);
    expect(factors.method).toBe('heuristic');
  });

  it('computeConfidenceWithAI blends the AI score as historical accuracy', async () => {
    const ai = { score: 95, interval: [0.1, 1.2], coverage: 0.9 };
    const { overall, factors } = await trustEngine.computeConfidenceWithAI(
      'waqi',
      { source_id: 's1', parameters: { pm25: { value: 40 } } },
      [],
      { aiOverride: ai }
    );
    expect(factors.historicalAccuracy).toBe(0.95);
    expect(factors.aiScore).toBe(95);
    expect(factors.method).toBe('ai');
    expect(overall).toBeGreaterThan(0);
  });

  it('computeConfidenceWithAI falls back to heuristic on AI failure', async () => {
    const { overall, factors } = await trustEngine.computeConfidenceWithAI(
      'waqi',
      { source_id: 's1', parameters: { pm25: { value: 40 } } },
      [],
      { aiOverride: null }
    );
    expect(factors.historicalAccuracy).toBe(0.85);
    expect(factors.method).toBe('heuristic');
    expect(overall).toBeGreaterThan(0);
  });

  it('an AI score above the heuristic raises the overall score', async () => {
    const base = await trustEngine.computeConfidenceWithAI('waqi', { source_id: 's1' }, [], { aiOverride: { score: 50 } });
    const boosted = await trustEngine.computeConfidenceWithAI('waqi', { source_id: 's1' }, [], { aiOverride: { score: 100 } });
    expect(boosted.overall).toBeGreaterThan(base.overall);
  });
});
