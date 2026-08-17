import { useState } from 'react';
import { PageHeader, Card, Btn, Pill, LiveBadge } from '../components/ui';
import { API_BASE } from '../lib/constants';
import { useI18n, type Interpolation } from '../lib/i18n';
import { CheckCircle2, XCircle, Loader2, Activity, Zap } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'TIMEOUT';
  latency: number | null;
  detail?: string;
}

interface TestDef {
  name: string;
  url: string;
  check: (data: any) => boolean;
  detail?: (data: any) => string;
}

const getTests = (t: (key: string, fallback?: string, params?: Interpolation) => string): TestDef[] => [
  { name: t('connectionTest.test.backendApi', 'Backend API'), url: `${API_BASE}/health`, check: d => d?.status === 'ok', detail: d => d?.mqtt ? t('connectionTest.detail.mqttLinked', 'MQTT linked') : t('connectionTest.detail.mqttDown', 'MQTT down') },
  { name: t('connectionTest.test.mqttBroker', 'MQTT Broker'), url: `${API_BASE}/health`, check: d => d?.mqtt === true },
  { name: t('connectionTest.test.postgresql', 'PostgreSQL'), url: `${API_BASE}/sensors`, check: () => true },
  { name: t('connectionTest.test.protocolAdapters', 'Protocol Adapters'), url: `${API_BASE}/protocols/status`, check: d => Object.values(d?.protocols || {}).every(Boolean), detail: d => Object.entries(d?.protocols || {}).map(([k, v]) => `${k}:${v ? '✓' : '✗'}`).join(' ') },
  { name: t('connectionTest.test.automationEngine', 'Automation Engine'), url: `${API_BASE}/automation/rules`, check: () => true },
  { name: t('connectionTest.test.chatbotService', 'Chatbot Service'), url: `${API_BASE}/chatbot/health`, check: () => true },
];

const STATUS_KEYS: Record<string, string> = {
  PASS: 'connectionTest.status.pass',
  FAIL: 'connectionTest.status.fail',
  TIMEOUT: 'connectionTest.status.timeout',
};

export default function ConnectionTest() {
  const { t } = useI18n();
  const tests = getTests(t);
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    const out: TestResult[] = [];
    for (const td of tests) {
      const start = performance.now();
      try {
        const res = await fetch(td.url);
        const data = await res.json().catch(() => ({}));
        const ok = res.ok && td.check(data);
        out.push({ name: td.name, status: ok ? 'PASS' : 'FAIL', latency: Math.round(performance.now() - start), detail: td.detail?.(data) });
      } catch {
        out.push({ name: td.name, status: 'FAIL', latency: null });
      }
      setResults([...out]);
      await new Promise(r => setTimeout(r, 120));
    }
    setRunning(false);
  };

  const passed = results.filter(r => r.status === 'PASS').length;
  const allDone = results.length === tests.length && results.length > 0;
  const allPass = allDone && passed === tests.length;

  return (
    <div className="max-w-[900px] mx-auto">
      <PageHeader
        title={t('connectionTest.title', 'Connection Test Suite')}
        subtitle={t('connectionTest.subtitle', 'Live connectivity diagnostics across all services')}
        right={
          <LiveBadge on={allPass} label={allPass ? t('connectionTest.badge.allSystemsGo', 'ALL SYSTEMS GO') : allDone ? t('connectionTest.badge.issuesFound', 'ISSUES FOUND') : t('connectionTest.badge.idle', 'IDLE')} />
        }
      />

      <Card hover={false} className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-[var(--emerald)]" />
          <div>
            <div className="font-semibold">{t('connectionTest.serviceHealth', 'Service Health')}</div>
            <div className="text-xs text-[var(--text-tertiary)]">
              {results.length === 0 ? t('connectionTest.runHint', 'Run the suite to verify connections') : t('connectionTest.servicesReachable', '{passed}/{total} services reachable', { passed, total: tests.length })}
            </div>
          </div>
        </div>
        <Btn variant="primary" onClick={runTests} disabled={running}>
          {running ? <><Loader2 size={16} className="animate-spin" /> {t('connectionTest.running', 'Running…')}</> : <><Zap size={16} /> {t('connectionTest.runAll', 'Run All Tests')}</>}
        </Btn>
      </Card>

      <div className="grid-entrance space-y-3">
        {results.map((test, i) => (
          <Card key={i} className="flex justify-between items-center hover:border-[var(--emerald-glow)]">
            <div className="flex items-center gap-3">
              {test.status === 'PASS'
                ? <CheckCircle2 size={20} className="text-[var(--emerald)]" />
                : <XCircle size={20} className="text-[var(--rose)]" />}
              <div>
                <div className="font-medium">{test.name}</div>
                {test.detail && <div className="text-xs text-[var(--text-tertiary)] font-mono">{test.detail}</div>}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="font-mono text-[var(--text-tertiary)]">{test.latency !== null ? `${test.latency}ms` : '—'}</span>
              <Pill tone={test.status === 'PASS' ? 'emerald' : 'rose'}>{t(STATUS_KEYS[test.status] ?? '', test.status)}</Pill>
            </div>
          </Card>
        ))}
        {results.length === 0 && !running && (
          <Card hover={false} className="text-center text-[var(--text-tertiary)] text-sm py-10">{t('connectionTest.noTests', 'No tests run yet')}</Card>
        )}
      </div>
    </div>
  );
}
