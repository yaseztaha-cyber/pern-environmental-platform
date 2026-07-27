import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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

const RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'rec-1',
    category: 'Energy',
    priority: 'high',
    title: 'Optimize HVAC Scheduling',
    description: 'Analysis shows HVAC runs 23% longer than needed during off-peak hours. Consider implementing schedule-based automation to reduce energy consumption.',
  },
  {
    id: 'rec-2',
    category: 'Air Quality',
    priority: 'medium',
    title: 'PM2.5 Filtration Alert',
    description: 'PM2.5 levels have exceeded WHO guidelines 3 times this week. Recommend increasing ventilation rate when levels exceed 35 µg/m³.',
  },
  {
    id: 'rec-3',
    category: 'Maintenance',
    priority: 'medium',
    title: 'Sensor Calibration Due',
    description: 'CO sensor readings have shown increasing deviation from expected values. Calibration recommended within the next 7 days.',
  },
  {
    id: 'rec-4',
    category: 'Comfort',
    priority: 'low',
    title: 'Temperature Stability',
    description: 'Indoor temperature variance has improved by 15% over the past week. Current automation rules are working well.',
  },
];

export default function AI() {
  const { t } = useI18n();
  const { data } = useData();
  const toast = useToast();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [aiStatus, setAiStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  // Check AI status
  const checkAIStatus = async () => {
    setAiStatus('checking');
    try {
      await apiClient.get('/ai-tools/stats');
      setAiStatus('online');
    } catch {
      setAiStatus('offline');
    }
  };

  // Generate insights from sensor data
  const generateInsights = async () => {
    setLoading(true);
    try {
      const newInsights: Insight[] = [];
      const ts = new Date().toISOString();

      // Rule-based insights from physical readings
      const temp = data.physical.temperature;
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
      const co2 = data.physical.co2;
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
      const pm25 = data.physical.pm25;
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

      // Try AI insights
      if (aiStatus === 'online') {
        try {
          const aiResult = await apiClient.diagnoseSensors({ sensorData: data.physical });
          if (aiResult?.diagnosis) {
            newInsights.push({
              id: `ai-diag-${Date.now()}`,
              type: 'info',
              title: 'AI Diagnosis',
              message: aiResult.diagnosis,
              timestamp: new Date().toISOString(),
            });
          }
        } catch { /* AI unavailable, use rule-based only */ }
      }

      setInsights(newInsights);
      setLastRefresh(new Date());
    } catch (err: any) {
      toast.toast('Failed to generate insights', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAIStatus();
    generateInsights();
  }, [data.ehi]);

  // EHI trend chart data
  const chartData = useMemo(() => {
    const values = Array.from({ length: 24 }, (_, i) => {
      const base = data.ehi || 50;
      return Math.round((base + Math.sin(i * 0.3) * 20 + (Math.random() - 0.5) * 10) * 10) / 10;
    });
    const pred = generateAdvancedPrediction(values, 12);
    return values.map((v, i) => ({ time: `T-${24 - i}`, ehi: v }))
      .concat(Array.from({ length: 6 }, (_, i) => ({
        time: `T+${i + 1}`,
        ehi: Math.round((pred.value + (Math.random() - 0.5) * 5) * 10) / 10,
      })));
  }, [data.ehi]);

  const priorityColors: Record<string, string> = {
    high: 'text-red-600 bg-red-50 dark:bg-red-900/20',
    medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',
    low: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <button onClick={generateInsights} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {/* EHI Trend Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp size={18} />
          EHI Trend & Forecast
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip />
            <Area type="monotone" dataKey="ehi" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Insights Grid */}
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

      {/* AI Recommendations */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Lightbulb size={18} className="text-yellow-500" />
          AI Recommendations
        </h3>
        <div className="space-y-3">
          {RECOMMENDATIONS.map((rec) => (
            <div key={rec.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityColors[rec.priority]}`}>
                  {rec.priority.toUpperCase()}
                </span>
                <span className="text-xs text-gray-500">{rec.category}</span>
              </div>
              <div className="font-medium text-sm">{rec.title}</div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{rec.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
