import { useState, useCallback, useMemo } from 'react';
import { PageHeader, Card, SectionTitle, Btn, Pill, StatCard } from '../components/ui';
import { Code2, Send, Copy, Check, BookOpen, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from '../components/charts';
import { useI18n } from '../lib/i18n';

interface ApiEndpoint {
  method: string; path: string; description: string; params?: string;
}

interface HistoryEntry {
  method: string;
  path: string;
  status: number;
  timing: number;
}

const ENDPOINTS: ApiEndpoint[] = [
  { method: 'GET', path: '/api/v3/virtual-sensors', description: 'List all virtual sensors', params: '?region=&type=' },
  { method: 'POST', path: '/api/v3/virtual-sensors', description: 'Create virtual sensor at GPS pin', params: '{ lat, lng, name }' },
  { method: 'GET', path: '/api/v3/virtual-sensors/:id', description: 'Get virtual sensor details' },
  { method: 'DELETE', path: '/api/v3/virtual-sensors/:id', description: 'Delete virtual sensor' },
  { method: 'POST', path: '/api/v3/virtual-sensors/schedule', description: 'Schedule regional scan', params: '{ bounds, interval }' },
  { method: 'GET', path: '/api/v3/virtual-sensors/coverage', description: 'Show satellite coverage' },
  { method: 'GET', path: '/api/v3/ingestion/sources', description: 'List data sources', params: '?active=true' },
  { method: 'POST', path: '/api/v3/ingestion/scan', description: 'Run global scan', params: '{ lat, lng }' },
  { method: 'GET', path: '/api/v3/ingestion/readings', description: 'Get stored readings', params: '?source=&limit=' },
  { method: 'GET', path: '/api/v3/ingestion/stats', description: 'Get ingestion statistics' },
  { method: 'GET', path: '/api/v3/trust/scores', description: 'List all confidence scores' },
  { method: 'GET', path: '/api/v3/trust/scores/:sourceType', description: 'Get score by source type' },
  { method: 'GET', path: '/api/v3/trust/anomalies', description: 'List anomalies', params: '?limit=' },
  { method: 'POST', path: '/api/v3/trust/recalibrate', description: 'Trigger recalibration', params: '{ readings }' },
  { method: 'GET', path: '/api/v3/compliance/frameworks', description: 'List all compliance frameworks' },
  { method: 'POST', path: '/api/v3/compliance/detect', description: 'Detect country from GPS', params: '{ lat, lng }' },
  { method: 'POST', path: '/api/v3/compliance/report', description: 'Generate compliance report', params: '{ orgId, lat, lng, readings }' },
  { method: 'GET', path: '/api/v3/compliance/stats', description: 'Compliance statistics' },
  { method: 'GET', path: '/api/v3/compliance/trends', description: 'Compliance trends', params: '?country=&days=' },
  { method: 'GET', path: '/api/v3/wind/forecast', description: 'Wind forecast', params: '?lat=&lng=' },
  { method: 'GET', path: '/api/v3/wind/trajectory', description: 'Plume trajectory', params: '?lat=&lng=&pollutant=&hours=' },
  { method: 'GET', path: '/api/v3/wind/plume-events', description: 'Active plume events' },
  { method: 'POST', path: '/api/ai-tools/forecast', description: 'Calibrated 1/7/30-day temperature forecast (PERN engine)', params: '{ latitude, longitude, horizon, target_date, obs_temperature, nwp_temperature }' },
];

const METHOD_COLORS: Record<string, 'emerald' | 'blue' | 'amber' | 'rose'> = {
  GET: 'emerald', POST: 'blue', PUT: 'amber', DELETE: 'rose',
};

const CHART_COLORS: Record<string, string> = {
  GET: 'var(--emerald)', POST: 'var(--blue)', DELETE: 'var(--rose)', PUT: 'var(--amber)',
};

export default function ApiConsole() {
  const { t } = useI18n();
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [requestBody, setRequestBody] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const handleSend = useCallback(async () => {
    if (!selectedEndpoint) return;
    setLoading(true); setError(null); setResponse(null);
    const start = performance.now();
    try {
      const options: RequestInit = { method: selectedEndpoint.method };
      if (selectedEndpoint.method === 'POST' && requestBody) {
        options.headers = { 'Content-Type': 'application/json' };
        try { options.body = JSON.stringify(JSON.parse(requestBody)); }
        catch { options.body = requestBody; }
      }
      const res = await fetch(selectedEndpoint.path.replace(/:id/, 'demo').replace(/:sourceType/, 'waqi'), options);
      const data = await res.json();
      const timing = Math.round(performance.now() - start);
      setResponse({ status: res.status, data });
      setHistory(prev => [{ method: selectedEndpoint.method, path: selectedEndpoint.path, status: res.status, timing }, ...prev].slice(0, 10));
    } catch (e: any) {
      const timing = Math.round(performance.now() - start);
      setError(e.message || t('apiConsole.requestFailed', 'Request failed'));
      setHistory(prev => [{ method: selectedEndpoint.method, path: selectedEndpoint.path, status: 0, timing }, ...prev].slice(0, 10));
    }
    setLoading(false);
  }, [selectedEndpoint, requestBody, t]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const generateCurl = (ep: ApiEndpoint) => {
    let cmd = `curl -X ${ep.method} http://localhost:3000${ep.path.replace(/:id/, 'demo')}`;
    if (ep.method === 'POST' && requestBody) {
      cmd += ` -H "Content-Type: application/json" -d '${requestBody}'`;
    }
    return cmd;
  };

  const methodData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of history) {
      counts[h.method] = (counts[h.method] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: CHART_COLORS[name] || '#6b7280' }));
  }, [history]);

  const totalRequests = history.length;
  const uniqueEndpoints = new Set(history.map(h => h.path)).size;
  const successRate = totalRequests > 0 ? Math.round((history.filter(h => h.status >= 200 && h.status < 400).length / totalRequests) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.apiConsole', 'API Console')} subtitle={t('apiConsole.subtitle', 'Interactive explorer for PERN v3 Global Intelligence API')} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1 max-h-[500px] overflow-y-auto">
          <SectionTitle>{t('apiConsole.endpoints', 'Endpoints')}</SectionTitle>
          <div className="mt-3 space-y-1">
            {ENDPOINTS.map(ep => (
              <button key={`${ep.method}-${ep.path}`} onClick={() => { setSelectedEndpoint(ep); setResponse(null); setError(null); }}
                className={`w-full text-left p-2 rounded-lg text-xs transition flex items-center gap-2 ${
                  selectedEndpoint?.path === ep.path && selectedEndpoint?.method === ep.method
                    ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5 border border-transparent'
                }`}>
                <Pill tone={METHOD_COLORS[ep.method] || 'slate'}>{ep.method}</Pill>
                <span className="truncate font-mono text-[10px]">{ep.path}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          {selectedEndpoint ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Pill tone={METHOD_COLORS[selectedEndpoint.method] || 'slate'}>{selectedEndpoint.method}</Pill>
                  <span className="font-mono text-sm">{selectedEndpoint.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => handleCopy(generateCurl(selectedEndpoint))}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </Btn>
                  <Btn variant="primary" size="sm" loading={loading} onClick={handleSend}>
                    <Send size={14} /> {t('apiConsole.send', 'Send')}
                  </Btn>
                </div>
              </div>

              <p className="text-xs text-slate-400 mb-4">{t(`apiConsole.api.desc.${ENDPOINTS.indexOf(selectedEndpoint)}`, selectedEndpoint.description)}</p>

              {selectedEndpoint.params && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 block mb-1">{t('apiConsole.parameters', 'Parameters')}</label>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-slate-400">
                    {selectedEndpoint.params}
                  </div>
                </div>
              )}

              {selectedEndpoint.method === 'POST' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 block mb-1">{t('apiConsole.requestBody', 'Request Body (JSON)')}</label>
                  <textarea value={requestBody} onChange={e => setRequestBody(e.target.value)}
                    className="w-full h-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-slate-300 resize-none"
                    placeholder='{"key": "value"}' />
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs text-slate-400 block mb-1">{t('apiConsole.curl', 'cURL')}</label>
                <div className="relative">
                  <pre className="p-3 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-400 overflow-x-auto">
                    {generateCurl(selectedEndpoint)}
                  </pre>
                  <button onClick={() => handleCopy(generateCurl(selectedEndpoint))}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 text-slate-500">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {error}
                </div>
              )}

              {response && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-slate-400">{t('apiConsole.response', 'Response')}</span>
                    <Pill tone={response.status < 400 ? 'emerald' : 'rose'}>{response.status}</Pill>
                  </div>
                  <pre className="p-3 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-300 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <BookOpen size={32} className="mb-2 opacity-50" />
              <p className="text-sm">{t('apiConsole.selectEndpoint', 'Select an endpoint from the list')}</p>
              <p className="text-xs mt-1">{t('apiConsole.endpointsAvailable', '22 endpoints available')}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label={t('apiConsole.stat.totalRequests', 'Total Requests')} value={totalRequests} accent="blue" icon={<Send size={18} />} />
        <StatCard label={t('apiConsole.stat.uniqueEndpoints', 'Unique Endpoints')} value={uniqueEndpoints} accent="violet" icon={<Code2 size={18} />} />
        <StatCard label={t('apiConsole.stat.successRate', 'Success Rate')} value={totalRequests > 0 ? `${successRate}%` : '—'} accent={successRate >= 80 ? 'emerald' : successRate >= 50 ? 'amber' : 'rose'} icon={<Check size={18} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle>{t('apiConsole.methodDistribution', 'Method Distribution')}</SectionTitle>
          {methodData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={150}>
                <PieChart>
                  <Pie data={methodData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                    {methodData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 text-xs">
                {methodData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-400">{d.name}</span>
                    <span className="font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-8">{t('apiConsole.noRequests', 'No requests sent yet')}</p>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>{t('apiConsole.requestHistory', 'Request History')}</SectionTitle>
          {history.length > 0 ? (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-white/[0.03]">
                  <Pill tone={METHOD_COLORS[h.method] || 'slate'}>{h.method}</Pill>
                  <span className="font-mono text-[10px] truncate flex-1">{h.path}</span>
                  <Pill tone={h.status && h.status < 400 ? 'emerald' : 'rose'}>{h.status || t('apiConsole.statusErr', 'ERR')}</Pill>
                  <span className="text-slate-500 flex items-center gap-0.5"><Clock size={10} />{h.timing}ms</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-8">{t('apiConsole.noRequests', 'No requests sent yet')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
