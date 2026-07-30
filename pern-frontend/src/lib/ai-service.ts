import { apiClient } from './api-client';
import { runScientificAnalysis, type ScientificAnalysis, type SensorPrediction } from './scientific-core';
import { generateRecommendations, type Recommendation } from './recommendation-engine';
import { generateAnalysis, type AnalysisInsight } from './ai-analysis';

export type AIBackendStatus = 'online' | 'offline' | 'checking';

export interface AIAnalysisResult {
  analysis: ScientificAnalysis;
  insights: AnalysisInsight[];
  recommendations: Recommendation[];
  predictions: SensorPrediction[];
  backendStatus: AIBackendStatus;
}

let _backendStatus: AIBackendStatus = 'checking';
let _lastCheck = 0;
const CHECK_INTERVAL = 30000;

export async function checkAIStatus(): Promise<AIBackendStatus> {
  const now = Date.now();
  if (now - _lastCheck < CHECK_INTERVAL && _backendStatus !== 'checking') {
    return _backendStatus;
  }
  _lastCheck = now;
  _backendStatus = 'checking';
  try {
    await apiClient.get('/ai-tools/stats');
    _backendStatus = 'online';
  } catch {
    _backendStatus = 'offline';
  }
  return _backendStatus;
}

export function getCachedAIStatus(): AIBackendStatus {
  return _backendStatus;
}

export async function fetchBackendRecommendations(
  readings: Record<string, number>,
  ehi: number
): Promise<Recommendation[]> {
  try {
    const diag = await apiClient.diagnoseSensors({ sensorData: readings });
    if (Array.isArray(diag?.recommendations)) {
      return diag.recommendations.map((r: any, i: number) => ({
        id: `backend-${i}`,
        title: typeof r === 'string' ? r.slice(0, 80) : 'AI Recommendation',
        description: typeof r === 'string' ? r : JSON.stringify(r),
        priority: i === 0 ? 'high' : i < 3 ? 'medium' : 'low' as const,
        category: 'AI Diagnostics',
        source: 'Backend AI Model',
      }));
    }
  } catch { /* backend unavailable */ }
  return [];
}

export function getLocalRecommendations(
  readings: Record<string, number>,
  ehi: number,
  virtualSensors: Array<{ name: string; value: number; category: string }>,
  hasRealData?: Record<string, boolean>
): Recommendation[] {
  return generateRecommendations({
    ehi,
    pm25: readings.pm25 ?? 0,
    ph: readings.ph ?? 7,
    temperature: readings.tmp ?? 25,
    humidity: readings.hum ?? 50,
    co2: readings.co2 ?? 400,
    tds: readings.tds,
    dissolvedOxygen: readings.dO,
    virtualSensors,
    hasRealData,
  });
}

export async function runFullAIAnalysis(
  readings: Record<string, number>,
  history: Record<string, number[]> = {},
  lastUpdate: number = Date.now(),
): Promise<AIAnalysisResult> {
  const status = await checkAIStatus();
  const analysis = runScientificAnalysis(readings, history, lastUpdate);

  const insights = generateAnalysis(analysis, readings);

  const ehiValue = analysis.ehi?.score ?? 50;
  const virtualSensors = analysis.ehi?.subIndices.map(s => ({
    name: s.name,
    value: s.value,
    category: s.value >= 80 ? 'good' : s.value >= 60 ? 'fair' : s.value >= 40 ? 'moderate' : s.value >= 20 ? 'poor' : 'critical' as const,
  })) ?? [];
  const hasRealData = Object.fromEntries(Object.keys(readings).map(k => [k, true]));

  const localRecs = getLocalRecommendations(readings, ehiValue, virtualSensors, hasRealData);

  let backendRecs: Recommendation[] = [];
  if (status === 'online') {
    backendRecs = await fetchBackendRecommendations(readings, ehiValue);
  }

  const allRecs = [...backendRecs, ...localRecs];

  return {
    analysis,
    insights,
    recommendations: allRecs,
    predictions: analysis.predictions,
    backendStatus: status,
  };
}
