import { apiClient } from './api-client';
import { runScientificAnalysis, type ScientificAnalysis, type SensorPrediction } from './scientific-core';
import { generateRecommendations, type Recommendation } from './recommendation-engine';
import { generateAnalysis, type AnalysisInsight } from './ai-analysis';

export type AIBackendStatus = 'online' | 'offline' | 'checking';

export interface HealthBriefing {
  generatedAt: string;
  status: 'good' | 'fair' | 'poor' | 'critical';
  headline: string;
  summary: string;
  healthScore: number | null;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  assessments: Array<{ sensor: string; status: string; level: string; value: number; unit: string; label: string; detail: string }>;
  anomalies: Array<{ sensor: string; zScore: number; mean: number; stdDev: number; value: number }>;
  risingSensors: Array<{ sensor: string; trend: string; volatility: string; avg: number; latest: number }>;
  compliance: { country: string; framework: string; authority: string; compliant: boolean; exceedances: Array<{ parameter: string; value: number; limit: number; unit: string; averaging: string; exceeded_by: number }> };
  confidence: { overall: number; source: string; note: string };
  highlights: string[];
  concerns: string[];
  recommendedActions: Array<{ title: string; description: string; priority: string }>;
  dataQuality: { readings: number; sensors: number };
  references: Array<{ id: string; title: string; authors: string; year: number; publisher: string }>;
  cached?: boolean;
  deterministic?: boolean;
}

export interface AIAnalysisResult {
  analysis: ScientificAnalysis;
  insights: AnalysisInsight[];
  recommendations: Recommendation[];
  predictions: SensorPrediction[];
  backendStatus: AIBackendStatus;
}

export interface CopilotStatus {
  sensor: string;
  label: string;
  level: 'normal' | 'warning' | 'critical' | string;
  value: number;
  unit: string;
}

export interface CopilotResponse {
  generatedAt: string;
  question: string;
  answer: string;
  confidence?: number;
  grounded: boolean;
  deterministic?: boolean;
  error?: string;
  tools: Array<{ id: string; name: string; description: string }>;
  followups?: string[];
  context: {
    deviceCount: number;
    readingCount: number;
    healthScore: number;
    riskLevel: string;
    anomalies: number;
    statuses: CopilotStatus[];
    compliance: { framework: string; compliant: boolean; exceedances: Array<{ parameter: string; value: number; limit: number }> };
    recentAlerts: Array<{ title?: string; sensor?: string; detail?: string; severity?: string }>;
  };
  cited: string[];
  references: string[];
}

let _copilotCache: { key: string; at: number; data: CopilotResponse | null } = { key: '', at: 0, data: null };
const COPILOT_CACHE_MS = 60000;

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
  _ehi: number
): Promise<Recommendation[]> {
  try {
    const diag = await apiClient.diagnoseSensors({ sensorData: readings });
    if (Array.isArray(diag?.recommendations)) {
      return diag.recommendations.map((r: any, i: number) => {
        const structured = typeof r === 'object' && r !== null;
        const title = structured ? (r.title || 'AI Recommendation') : String(r).slice(0, 80);
        return {
          id: `backend-${i}`,
          title,
          description: structured ? (r.description || JSON.stringify(r)) : '',
          priority: (structured ? r.priority : i === 0 ? 'high' : i < 3 ? 'medium' : 'low') || 'medium',
          category: 'AI Diagnostics',
          source: 'Backend AI Model',
        };
      });
    }
  } catch { /* backend unavailable */ }
  return [];
}

let _briefingCache: { at: number; data: HealthBriefing | null } = { at: 0, data: null };
const BRIEFING_CACHE_MS = 60000;

export async function fetchHealthBriefing(
  readings: Record<string, number>,
  opts: { deviceId?: string; force?: boolean } = {}
): Promise<HealthBriefing | null> {
  const now = Date.now();
  if (!opts.force && _briefingCache.data && now - _briefingCache.at < BRIEFING_CACHE_MS) {
    return _briefingCache.data;
  }
  try {
    const briefing = await apiClient.getHealthBriefing({ readings, deviceId: opts.deviceId });
    _briefingCache = { at: now, data: briefing };
    return briefing;
  } catch {
    return null;
  }
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
    pm10: readings.pm10,
    turbidity: readings.tb,
    voc: readings.voc,
    gas: readings.mq,
    soilMoisture: readings.sm,
    light: readings.light,
    ammonia: readings.nh3,
    virtualSensors,
    hasRealData,
  });
}

export async function fetchCopilotAnswer(
  question: string,
  opts: { deviceId?: string; force?: boolean } = {}
): Promise<CopilotResponse | null> {
  const now = Date.now();
  const key = `${opts.deviceId || ''}|${question.trim().toLowerCase()}`;
  if (!opts.force && _copilotCache.data && _copilotCache.key === key && now - _copilotCache.at < COPILOT_CACHE_MS) {
    return _copilotCache.data;
  }
  try {
    const res = await apiClient.askCopilot({ question, deviceId: opts.deviceId });
    _copilotCache = { key, at: now, data: res };
    return res;
  } catch {
    return null;
  }
}

export interface CopilotStreamHandlers {
  onChunk?: (partial: string) => void;
  onResult?: (res: CopilotResponse) => void;
  onError?: (message: string) => void;
  deviceId?: string;
  signal?: AbortSignal;
}

/**
 * Stream a copilot answer over SSE. The backend emits `start`, `chunk`
 * (deterministic partial text), then `done` with the full response payload.
 */
export async function fetchCopilotStream(
  question: string,
  { onChunk, onResult, onError, deviceId, signal }: CopilotStreamHandlers = {}
): Promise<void> {
  const API_BASE = import.meta.env.VITE_API_URL || '/api';
  let token = '';
  try {
    token = sessionStorage.getItem('pern_auth_token') || '';
  } catch { /* ignore */ }

  try {
    const response = await fetch(`${API_BASE}/ai-tools/copilot/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question, deviceId }),
      signal,
    });

    if (!response.ok || !response.body) {
      onError?.('Copilot request failed — try again.');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const raw of events) {
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          let payload: any;
          try { payload = JSON.parse(line.slice(6)); } catch { continue; }
          if (payload.type === 'chunk' && typeof payload.content === 'string') {
            onChunk?.(payload.content);
          } else if (payload.type === 'done' && payload.result) {
            onResult?.(payload.result as CopilotResponse);
          } else if (payload.type === 'error') {
            onError?.(payload.error || 'Copilot stream failed.');
          }
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    onError?.(err?.message || 'Copilot request failed — try again.');
  }
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
