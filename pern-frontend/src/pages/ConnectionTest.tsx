import { useState } from 'react';
import { PageHeader, Card, Btn, Pill, LiveBadge } from '../components/ui';
import { API_BASE } from '../lib/constants';
import { CheckCircle2, XCircle, Loader2, Activity, Zap } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'TIMEOUT';
  latency: number | null;
  detail?: string;
}

const TESTS: { name: string; url: string; check: (data: any) => boolean; detail?: (data: any) => string }[] = [
  { name: 'Backend API', url: `${API_BASE}/health`, check: d => d?.status === 'ok', detail: d => d?.mqtt ? 'MQTT linked' : 'MQTT down' },
  { name: 'MQTT Broker', url: `${API_BASE}/health`, check: d => d?.mqtt === true },
  { name: 'PostgreSQL', url: `${API_BASE}/sensors`, check: () => true },
  { name: 'Protocol Adapters', url: `${API_BASE}/protocols/status`, check: d => Object.values(d?.protocols || {}).every(Boolean), detail: d => Object.entries(d?.protocols || {}).map(([k, v]) => `${k}:${v ? '✓' : '✗'}`).join(' ') },
  { name: 'Automation Engine', url: `${API_BASE}/automation/rules`, check: () => true },
  { name: 'Chatbot Service', url: `${API_BASE}/chatbot/health`, check: () => true },
];

export default function ConnectionTest() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    const out: TestResult[] = [];
    for (const t of TESTS) {
      const start = performance.now();
      try {
        const res = await fetch(t.url);
        const data = await res.json().catch(() => ({}));
        const ok = res.ok && t.check(data);
        out.push({ name: t.name, status: ok ? 'PASS' : 'FAIL', latency: Math.round(performance.now() - start), detail: t.detail?.(data) });
      } catch {
        out.push({ name: t.name, status: 'FAIL', latency: null });
      }
      setResults([...out]);
      await new Promise(r => setTimeout(r, 120));
    }
    setRunning(false);
  };

  const passed = results.filter(r => r.status === 'PASS').length;
  const allDone = results.length === TESTS.length && results.length > 0;
  const allPass = allDone && passed === TESTS.length;

  return (
    <div className="max-w-[900px] mx-auto">
      <PageHeader
        title="Connection Test Suite"
        subtitle="Live connectivity diagnostics across all services"
        right={
          <LiveBadge on={allPass} label={allPass ? 'ALL SYSTEMS GO' : allDone ? 'ISSUES FOUND' : 'IDLE'} />
        }
      />

      <Card hover={false} className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-[var(--emerald)]" />
          <div>
            <div className="font-semibold">Service Health</div>
            <div className="text-xs text-[var(--text-tertiary)]">
              {results.length === 0 ? 'Run the suite to verify connections' : `${passed}/${TESTS.length} services reachable`}
            </div>
          </div>
        </div>
        <Btn variant="primary" onClick={runTests} disabled={running}>
          {running ? <><Loader2 size={16} className="animate-spin" /> Running…</> : <><Zap size={16} /> Run All Tests</>}
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
              <Pill tone={test.status === 'PASS' ? 'emerald' : 'rose'}>{test.status}</Pill>
            </div>
          </Card>
        ))}
        {results.length === 0 && !running && (
          <Card hover={false} className="text-center text-[var(--text-tertiary)] text-sm py-10">No tests run yet</Card>
        )}
      </div>
    </div>
  );
}
