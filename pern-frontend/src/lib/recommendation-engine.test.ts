import { describe, it, expect } from 'vitest';
import { generateRecommendations } from '../lib/recommendation-engine';

describe('recommendation-engine (evidence-based, real-data only)', () => {
  const base = {
    ehi: 80,
    pm25: 10,
    ph: 7.2,
    temperature: 25,
    humidity: 50,
    co2: 420,
    virtualSensors: [] as Array<{ name: string; value: number; category: string }>,
  };

  it('returns no recommendations when all parameters are healthy', () => {
    const recs = generateRecommendations(base);
    expect(recs).toEqual([]);
  });

  it('flags high PM2.5 as a high-priority air-quality recommendation', () => {
    const recs = generateRecommendations({ ...base, pm25: 80 });
    const air = recs.find(r => r.id === 'air-1');
    expect(air).toBeDefined();
    expect(air!.priority).toBe('high');
    expect(air!.affectedGroups).toContain('Children');
  });

  it('flags out-of-range pH', () => {
    const recs = generateRecommendations({ ...base, ph: 5.5 });
    expect(recs.find(r => r.id === 'water-1')).toBeDefined();
  });

  it('flags heat stress when hot and humid', () => {
    const recs = generateRecommendations({ ...base, temperature: 35, humidity: 80 });
    expect(recs.find(r => r.id === 'comfort-1')).toBeDefined();
  });

  it('sorts recommendations by priority (high first)', () => {
    const recs = generateRecommendations({
      ...base,
      pm25: 80,
      temperature: 35,
      humidity: 80,
      ehi: 40,
    });
    expect(recs.length).toBeGreaterThan(1);
    const order = recs.map(r => r.priority);
    const rank = { high: 3, medium: 2, low: 1 } as Record<string, number>;
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i - 1]]).toBeGreaterThanOrEqual(rank[order[i]]);
    }
  });
});
