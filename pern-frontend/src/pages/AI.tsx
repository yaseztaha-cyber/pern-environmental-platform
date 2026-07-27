import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Brain,
  Lightbulb,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useData } from '../lib/data-provider';
import { useToast } from '../components/Toast';
import { apiClient } from '../lib/api-client';
import { generateAdvancedPrediction } from '../lib/prediction-engine';

interface Insight {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
  sensor?: string;
}

interface Recommendation {
  id: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

const INSIGHT_ICONS: Record<string, any> = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
  error: AlertTriangle,
};

const INSIGHT_COLORS: Record<string, string> = {
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 bg-red-50 dark:bg-red-900/20',
  medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',
  low: 'text-green-600 bg-green-50 dark:bg-green-900/20',
};

const KEY_SENSORS = ['pm25', 'co2', 'tmp', 'hum', 'no2'] as const;

export default function AI() {
  const { t } = useI18n();
  const { data } = useData();
  const toast = useToast();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [aiStatus, setAiStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [ehiHistory, setEhiHistory] = useState<number[]>([]);

  const physicalRef = useRef(data.physical);
  physicalRef.current = data.physical;

  const checkAIStatus = async () => {
    setAiStatus('checking');
    try {
      await apiClient.get('/ai-tools/stats');
      setAiStatus('online');
    } catch {
      setAiStatus('offline');
    }
  };

  const generateInsights = useCallback(async () => {
    setLoading(true);
    try {
      const newInsights: Insight[] = [];
      const ts = new Date().toISOString();

      const physical = physicalRef.current;
      const temp = physical.tmp;
      if (temp !== undefined && temp > 30) {
        newInsights.push({
          id: `temp-high-${Date.now()}`,
          type: 'warning',
          title: 'High Temperature Detected',
          message: `Temperature reading of ${temp}°C exceeds comfortable threshold (30°C). Consider increasing ventilation.`,
          timestamp: ts,
          sensor: 'temperature',
        });
      }
      const co2 = physical.co2;
      if (co2 !== undefined && co2 > 1000) {
        newInsights.push({
          id: `co2-high-${Date.now()}`,
          type: 'warning',
          title: 'Elevated CO₂ Levels',
          message: `CO₂ at ${co2} ppm exceeds recommended levels (1000 ppm). Ventilation needed.`,
          timestamp: ts,
          sensor: 'co2',
        });
      }
      const pm25 = physical.pm25;
      if (pm25 !== undefined && pm25 > 35) {
        newInsights.push({
          id: `pm25-high-${Date.now()}`,
          type: 'error',
          title: 'Poor Air Quality',
          message: `PM2.5 at ${pm25} µg/m³ exceeds WHO guideline (35 µg/m³). Health risk for sensitive groups.`,
          timestamp: ts,
          sensor: 'pm25',
        });
      }

      if (newInsights.length === 0) {
        newInsights.push({
          id: 'all-normal',
          type: 'success',
          title: 'All Systems Normal',
          message: 'All sensor readings are within acceptable ranges. No immediate action required.',
          timestamp: new Date().toISOString(),
        });
      }

      setInsights(newInsights);
      setLastRefresh(new Date());
    } catch {
      toast.toast('Failed to generate insights', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const generateRecommendations = useCallback(async () => {
    if (aiStatus !== 'online') return;
    const recs: Recommendation[] = [];
    let id = 0;

    try {
      const diag = await apiClient.diagnoseSensors({ sensorData: physicalRef.current });
      if (Array.isArray(diag?.recommendations)) {
        for (const r of diag.recommendations) {
          recs.push({
            id: `diag-${++id}`,
            category: 'Diagnostics',
            priority: id <= 1 ? 'high' : 'medium',
            title: typeof r === 'string' ? r.slice(0, 80) : 'Recommendation',
            description: typeof r === 'string' ? r : JSON.stringify(r),
          });
        }
      }
    } catch { /* AI unavailable */ }

    for (const sensor of KEY_SENSORS) {
      if (physicalRef.current[sensor] === undefined) continue;
      try {
        const trend = await apiClient.analyzeTrend({ sensor, period: '24h' });
        if (Array.isArray(trend?.recommendations)) {
          for (const r of trend.recommendations) {
            recs.push({
              id: `trend-${sensor}-${++id}`,
              category: `${sensor.toUpperCase()} Trend`,
              priority: 'medium',
              title: typeof r === 'string' ? r.slice(0, 80) : `${sensor} recommendation`,
              description: typeof r === 'string' ? r : JSON.stringify(r),
            });
          }
        }
      } catch { /* skip */ }
      if (recs.length >= 10) break;
    }

    setRecommendations(recs);
  }, [aiStatus]);

  useEffect(() => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    apiClient.getEHIHistory(undefined, from).then((raw: any) => {
      const values = (Array.isArray(raw) ? raw : []).map((r: any) => Number(r.ehi ?? 0)).filter((v: number) => v > 0);
      setEhiHistory(values);
    }).catch(() => setEhiHistory([]));
  }, []);

  useEffect(() => {
    checkAIStatus();
  }, []);

  useEffect(() => {
    generateInsights();
  }, [data.ehi, generateInsights]);

  useEffect(() => {
    generateRecommendations();
  }, [aiStatus, generateRecommendations]);

  const chartData = useMemo(() => {
    if (ehiHistory.length === 0) {
      return [{ time: 'Now', ehi: data.ehi || 0, predicted: null as number | null }];
    }

    const historical = ehiHistory.map((v, i) => ({
      time: `T-${ehiHistory.length - i}`,
      ehi: v,
      predicted: null as number | null,
    }));

    if (ehiHistory.length >= 3) {
      const pred = generateAdvancedPrediction(ehiHistory, 6);
      for (let i = 1; i <= 6; i++) {
        historical.push({
          time: `T+${i}`,
          ehi: Math.round((pred.value + (i / 6) * (pred.upperBound - pred.value) * 0.5) * 10) / 10,
          predicted: Math.round((pred.value + (i / 6) * (pred.upperBound - pred.value) * 0.5) * 10) / 10,
        });
      }
    }

    return historical;
  }, [ehiHistory, data.ehi]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="text-purple-600" size={28} />
            {t('ai.title', 'AI Intelligence Center')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('ai.subtitle', 'Real-time AI-powered environmental analysis and recommendations')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            aiStatus === 'online' ? 'bg-green-50 text-green-700' : aiStatus === 'offline' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              aiStatus === 'online' ? 'bg-green-500' : aiStatus === 'offline' ? 'bg-red-500' : 'bg-gray-400 animate-pulse'
            }`} />
            AI {aiStatus === 'online' ? 'Online' : aiStatus === 'offline' ? 'Offline' : 'Checking...'}
          </div>
          <button onClick={() => { generateInsights(); generateRecommendations(); }} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp size={18} />
          EHI Trend & Forecast
          {ehiHistory.length === 0 && <span className="text-xs font-normal text-gray-400 ml-2">Awaiting real EHI data</span>}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip />
            {ehiHistory.length >= 3 && (
              <ReferenceLine x={`T+1`} stroke="#8b5cf6" strokeDasharray="3 3" label={{ value: 'Forecast →', position: 'insideTopRight', fontSize: 10 }} />
            )}
            <Area type="monotone" dataKey="ehi" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} connectNulls={false} />
            <Area type="monotone" dataKey="predicted" stroke="#c084fc" fill="#c084fc" fillOpacity={0.1} strokeWidth={2} strokeDasharray="5 5" connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Zap size={18} />
          Live Insights
          <span className="text-xs font-normal text-gray-400 ml-2">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight) => {
            const Icon = INSIGHT_ICONS[insight.type] || Info;
            return (
              <div key={insight.id} className={`p-4 rounded-xl border ${INSIGHT_COLORS[insight.type]}`}>
                <div className="flex items-start gap-3">
                  <Icon size={20} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">{insight.title}</div>
                    <p className="text-xs mt-1 opacity-80">{insight.message}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] opacity-50">
                      <span>{new Date(insight.timestamp).toLocaleString()}</span>
                      {insight.sensor && <span>• {insight.sensor}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Lightbulb size={18} className="text-yellow-500" />
          AI Recommendations
        </h3>
        {aiStatus === 'offline' ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">AI recommendations require the backend to be online with OPENROUTER_API_KEY configured.</p>
            <p className="text-xs text-gray-400 mt-1">Configure the API key in pern-backend/.env and restart the server.</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" /> Generating recommendations…
              </div>
            ) : (
              <p className="text-sm text-gray-500">No recommendations yet. Click Refresh to analyze current sensor data.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div key={rec.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[rec.priority]}`}>
                    {rec.priority.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">{rec.category}</span>
                </div>
                <div className="font-medium text-sm">{rec.title}</div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{rec.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
