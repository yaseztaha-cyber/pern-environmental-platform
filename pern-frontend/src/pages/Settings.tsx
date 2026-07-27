import { useState, useEffect, useCallback } from 'react';
import { testNtfyNotification } from '../lib/ntfy';
import { isLogtoConfigured } from '../lib/auth';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n';
import { PageHeader, Card, Pill, Btn, SectionTitle, Toggle } from '../components/ui';
import type { UserRole } from '../lib/roles';
import { ROLE_LABELS } from '../lib/roles';
import {
  Shield, Bell, Wifi, User, Palette, Database, Zap, Server,
  Sun, Moon, MonitorSmartphone, RotateCcw, BarChart3, Timer,
  Volume2, VolumeX, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

type ThemeChoice = 'dark' | 'light' | 'system';
type ChartChoice = 'line' | 'bar' | 'area';

const REFRESH_OPTIONS = [
  { value: 10, labelKey: 'settings.refresh.10s' },
  { value: 30, labelKey: 'settings.refresh.30s' },
  { value: 60, labelKey: 'settings.refresh.60s' },
  { value: 300, labelKey: 'settings.refresh.300s' },
];
const CHART_OPTIONS: ChartChoice[] = ['line', 'bar', 'area'];
const COOLDOWN_OPTIONS = [
  { value: 30, labelKey: 'settings.cooldown.30s' },
  { value: 60, labelKey: 'settings.cooldown.60s' },
  { value: 300, labelKey: 'settings.cooldown.300s' },
  { value: 600, labelKey: 'settings.cooldown.600s' },
];

function SectionIcon({ icon: Icon, bg }: { icon: React.ComponentType<{ size?: number; className?: string }>; bg: string }) {
  return (
    <div className={`w-8 h-8 rounded-[var(--radius-sm)] ${bg} flex items-center justify-center`}>
      <Icon size={14} className="text-current" />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-[var(--radius-xs)] bg-[var(--surface)]">
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
      {children}
    </div>
  );
}

function Select({
  value, onChange, options,
}: {
  value: string | number; onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[var(--surface)] px-3 py-2 rounded-[var(--radius-xs)] text-xs font-medium border border-[var(--border)] focus:outline-none focus:border-[var(--emerald)] cursor-pointer"
    >
      {options.map(o => (
        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();

  // ── Appearance ──
  const [theme, setTheme] = useState<ThemeChoice>(() => ls('pern_theme', 'dark'));
  const [compact, setCompact] = useState(() => ls('pern_compact', false));
  const [animations, setAnimations] = useState(() => ls('pern_animations', true));

  // ── User Role ──
  const [currentRole, setCurrentRole] = useState<UserRole>(
    (localStorage.getItem('pern_user_role') as UserRole) || 'supervisor'
  );

  // ── Data Preferences ──
  const [refreshInterval, setRefreshInterval] = useState(() => ls('pern_refresh_interval', 30));
  const [chartType, setChartType] = useState<ChartChoice>(() => ls('pern_chart_type', 'line'));
  const [maxDataPoints, setMaxDataPoints] = useState(() => ls('pern_max_data_points', 100));
  const [dataRetention, setDataRetention] = useState(() => ls('pern_data_retention', 30));

  // ── ntfy ──
  const [ntfyTopic, setNtfyTopic] = useState(localStorage.getItem('pern_ntfy_topic') || 'pern-platform-alerts-2026');
  const [testResult, setTestResult] = useState('');

  // ── Alert Preferences ──
  const [alertCooldown, setAlertCooldown] = useState(() => ls('pern_alert_cooldown', 60));
  const [soundAlerts, setSoundAlerts] = useState(() => ls('pern_sound_alerts', true));
  const [autoAck, setAutoAck] = useState(() => ls('pern_auto_ack', false));

  // ── System Info ──
  const [health, setHealth] = useState<{ db: string; mqtt: boolean; status: string } | null>(null);
  const [uptime, setUptime] = useState<number>(0);

  useEffect(() => {
    fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json())
      .then(d => { setHealth(d); setUptime(d.uptime || 0); })
      .catch(() => setHealth(null));
    const iv = setInterval(() => {
      fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json())
        .then(d => { setHealth(d); setUptime(d.uptime || 0); })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  // ── Persistence helpers ──
  const save = useCallback((key: string, value: unknown) => { lsSet(key, value); }, []);

  const changeTheme = (v: ThemeChoice) => {
    setTheme(v); save('pern_theme', v);
    document.documentElement.setAttribute('data-theme', v === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : v);
  };
  const toggleCompact = (v: boolean) => { setCompact(v); save('pern_compact', v); };
  const toggleAnimations = (v: boolean) => { setAnimations(v); save('pern_animations', v); };
  const changeRefresh = (v: string) => { const n = Number(v); setRefreshInterval(n); save('pern_refresh_interval', n); };
  const changeChart = (v: string) => { setChartType(v as ChartChoice); save('pern_chart_type', v); };
  const changeMaxPoints = (v: string) => { const n = Number(v); setMaxDataPoints(n); save('pern_max_data_points', n); };
  const changeRetention = (v: string) => { const n = Number(v); setDataRetention(n); save('pern_data_retention', n); };
  const changeCooldown = (v: string) => { const n = Number(v); setAlertCooldown(n); save('pern_alert_cooldown', n); };

  const saveNtfyTopic = () => {
    localStorage.setItem('pern_ntfy_topic', ntfyTopic);
    setTestResult(t('settings.toast.topicSaved'));
    setTimeout(() => setTestResult(''), 2000);
  };

  const handleTestNtfy = async () => {
    setTestResult(t('settings.toast.sendingTest'));
    const success = await testNtfyNotification();
    setTestResult(success ? t('settings.toast.testSuccess') : t('settings.toast.testFailed'));
    setTimeout(() => setTestResult(''), 4000);
  };

  const changeRole = (role: UserRole) => {
    setCurrentRole(role);
    localStorage.setItem('pern_user_role', role);
  };

  const dbOk = health?.db === 'ok';
  const mqttOk = health?.mqtt === true;
  const apiOk = health?.status === 'ok';
  const sysAll = dbOk && mqttOk && apiOk;

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        right={
          sysAll ? (
            <Pill tone="emerald"><CheckCircle2 size={11} /> All Systems Operational</Pill>
          ) : (
            <Pill tone="amber"><AlertTriangle size={11} /> Degraded</Pill>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── 1. Appearance ── */}
        <Card hover={false}>
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={Palette} bg="bg-[var(--violet)]/10" />
            <SectionTitle>{t('settings.section.appearance')}</SectionTitle>
          </div>
          <div className="space-y-2.5">
            <Row label={t('settings.label.theme')}>
              <div className="flex gap-1">
                {([
                  { v: 'dark', icon: Moon },
                  { v: 'light', icon: Sun },
                  { v: 'system', icon: MonitorSmartphone },
                ] as const).map(({ v, icon: Ic }) => (
                  <Btn
                    key={v}
                    onClick={() => changeTheme(v)}
                    variant={theme === v ? 'primary' : 'ghost'}
                    size="sm"
                    title={t(`settings.theme.${v}`)}
                  >
                    <Ic size={14} />
                  </Btn>
                ))}
              </div>
            </Row>
            <Row label={t('settings.label.compactMode')}>
              <Toggle checked={compact} onChange={toggleCompact} />
            </Row>
            <Row label={t('settings.label.animations')}>
              <Toggle checked={animations} onChange={toggleAnimations} />
            </Row>
          </div>
        </Card>

        {/* ── 2. User Role ── */}
        <Card hover={false}>
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={User} bg="bg-[var(--cyan-dim)]" />
            <SectionTitle>{t('settings.section.userRole')}</SectionTitle>
          </div>
          <div className="space-y-1.5">
            {Object.keys(ROLE_LABELS).map((role) => (
              <Btn
                key={role}
                onClick={() => changeRole(role as UserRole)}
                variant={currentRole === role ? 'primary' : 'ghost'}
                className="w-full justify-start text-left"
              >
                {ROLE_LABELS[role as UserRole]}
              </Btn>
            ))}
          </div>
          <div className="text-[10px] text-[var(--text-disabled)] mt-2">{t('settings.role.description')}</div>
        </Card>

        {/* ── 3. Data Preferences ── */}
        <Card hover={false}>
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={BarChart3} bg="bg-[var(--blue-dim)]" />
            <SectionTitle>{t('settings.section.dataPreferences')}</SectionTitle>
          </div>
          <div className="space-y-2.5">
            <Row label={t('settings.label.refreshInterval')}>
              <Select
                value={refreshInterval}
                onChange={changeRefresh}
                options={REFRESH_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) }))}
              />
            </Row>
            <Row label={t('settings.label.chartType')}>
              <div className="flex gap-1">
                {CHART_OPTIONS.map(c => (
                  <Btn
                    key={c}
                    onClick={() => changeChart(c)}
                    variant={chartType === c ? 'primary' : 'ghost'}
                    size="sm"
                  >
                    {t(`settings.chart.${c}`)}
                  </Btn>
                ))}
              </div>
            </Row>
            <Row label={t('settings.label.maxDataPoints')}>
              <Select
                value={maxDataPoints}
                onChange={changeMaxPoints}
                options={[
                  { value: 50, label: '50' },
                  { value: 100, label: '100' },
                  { value: 200, label: '200' },
                  { value: 500, label: '500' },
                ]}
              />
            </Row>
            <Row label={t('settings.label.dataRetention')}>
              <Select
                value={dataRetention}
                onChange={changeRetention}
                options={[
                  { value: 7, label: '7 days' },
                  { value: 14, label: '14 days' },
                  { value: 30, label: '30 days' },
                  { value: 90, label: '90 days' },
                  { value: 365, label: '1 year' },
                ]}
              />
            </Row>
          </div>
        </Card>

        {/* ── 4. Push Notifications ── */}
        <Card hover={false}>
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={Bell} bg="bg-[var(--amber-dim)]" />
            <SectionTitle>{t('settings.section.pushNotifications')}</SectionTitle>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[var(--text-disabled)] uppercase tracking-wider">{t('settings.label.notificationTopic')}</label>
              <div className="flex gap-2 mt-1.5">
                <input
                  value={ntfyTopic}
                  onChange={e => setNtfyTopic(e.target.value)}
                  className="flex-1 bg-[var(--surface)] px-3 py-2.5 rounded-[var(--radius-xs)] text-sm font-mono border border-[var(--border)] focus:outline-none focus:border-[var(--emerald)]"
                />
                <Btn onClick={saveNtfyTopic} variant="primary" size="sm">
                  {t('settings.button.save')}
                </Btn>
              </div>
              <div className="text-[10px] mt-1.5 text-[var(--text-disabled)]">
                {t('settings.label.subscribe')}<span className="font-mono">https://ntfy.sh/{ntfyTopic}</span>
              </div>
            </div>
            <Btn onClick={handleTestNtfy} variant="ghost" className="w-full">
              {t('settings.button.sendTestNotification')}
            </Btn>
            {testResult && <div className="text-xs text-center text-[var(--emerald)]">{testResult}</div>}
          </div>
        </Card>

        {/* ── 5. Alert Preferences ── */}
        <Card hover={false}>
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={Zap} bg="bg-[var(--rose-dim)]" />
            <SectionTitle>{t('settings.section.alertPreferences')}</SectionTitle>
          </div>
          <div className="space-y-2.5">
            <Row label={t('settings.label.alertCooldown')}>
              <Select
                value={alertCooldown}
                onChange={changeCooldown}
                options={COOLDOWN_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) }))}
              />
            </Row>
            <Row label={t('settings.label.soundAlerts')}>
              <Toggle
                checked={soundAlerts}
                onChange={v => { setSoundAlerts(v); save('pern_sound_alerts', v); }}
              />
            </Row>
            <Row label={t('settings.label.autoAcknowledge')}>
              <Toggle
                checked={autoAck}
                onChange={v => { setAutoAck(v); save('pern_auto_ack', v); }}
              />
            </Row>
          </div>
        </Card>

        {/* ── 6. MQTT & IoT ── */}
        <Card hover={false}>
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={Wifi} bg="bg-[var(--indigo)]/10" />
            <SectionTitle>{t('settings.section.mqttIot')}</SectionTitle>
          </div>
          <div className="space-y-2.5 text-xs">
            <Row label={t('settings.label.broker')}>
              <span className="font-mono text-[var(--emerald)]">ws://localhost:9001</span>
            </Row>
            <Row label={t('settings.label.topics')}>
              <span className="font-mono">pern/sensors/+/data</span>
            </Row>
            <Row label={t('settings.label.status')}>
              <Pill tone={mqttOk ? 'emerald' : 'rose'}>
                {mqttOk ? t('settings.status.healthy') : t('settings.status.down')}
              </Pill>
            </Row>
          </div>
        </Card>

        {/* ── 7. Authentication ── */}
        <Card hover={false}>
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={Shield} bg="bg-[var(--emerald-dim)]" />
            <SectionTitle>{t('settings.section.authentication')}</SectionTitle>
          </div>
          <div className="space-y-2.5 text-xs">
            <Row label="Provider">
              <Pill tone={isLogtoConfigured ? 'emerald' : 'slate'}>
                {isLogtoConfigured ? 'Logto OIDC' : 'Demo Mode'}
              </Pill>
            </Row>
            <Row label="Status">
              <span className="text-[var(--text-secondary)] font-medium">
                {user ? `${user.name || user.email || user.id}` : 'Not authenticated'}
              </span>
            </Row>
            <Row label="Mode">
              <span className="text-[var(--text-secondary)]">
                {isLogtoConfigured ? 'Real authentication required' : 'Demo login (no backend auth)'}
              </span>
            </Row>
          </div>
        </Card>

        {/* ── 8. System Info ── */}
        <Card hover={false} className="lg:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <SectionIcon icon={Server} bg="bg-[var(--surface)]" />
            <SectionTitle>{t('settings.section.systemInfo')}</SectionTitle>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="py-3 px-4 rounded-[var(--radius-sm)] bg-[var(--surface)] text-center">
              <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1.5">{t('settings.label.version')}</div>
              <Pill tone="emerald">v2.7</Pill>
            </div>
            <div className="py-3 px-4 rounded-[var(--radius-sm)] bg-[var(--surface)] text-center">
              <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1.5">{t('settings.label.uptime')}</div>
              <span className="text-sm font-semibold">{health ? formatUptime(uptime) : '—'}</span>
            </div>
            <div className="py-3 px-4 rounded-[var(--radius-sm)] bg-[var(--surface)] text-center">
              <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1.5">{t('settings.label.dbStatus')}</div>
              <Pill tone={dbOk ? 'emerald' : 'rose'}>
                {dbOk ? t('settings.status.healthy') : t('settings.status.down')}
              </Pill>
            </div>
            <div className="py-3 px-4 rounded-[var(--radius-sm)] bg-[var(--surface)] text-center">
              <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1.5">{t('settings.label.apiStatus')}</div>
              <Pill tone={apiOk ? 'emerald' : 'rose'}>
                {apiOk ? t('settings.status.healthy') : t('settings.status.down')}
              </Pill>
            </div>
            <div className="py-3 px-4 rounded-[var(--radius-sm)] bg-[var(--surface)] text-center">
              <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1.5">{t('settings.label.mqttStatus')}</div>
              <Pill tone={mqttOk ? 'emerald' : 'rose'}>
                {mqttOk ? t('settings.status.healthy') : t('settings.status.down')}
              </Pill>
            </div>
            <div className="py-3 px-4 rounded-[var(--radius-sm)] bg-[var(--surface)] text-center">
              <div className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider mb-1.5">Overall</div>
              <Pill tone={sysAll ? 'emerald' : 'amber'}>
                {sysAll
                  ? <><CheckCircle2 size={10} /> {t('settings.status.healthy')}</>
                  : <><AlertTriangle size={10} /> {t('settings.status.degraded')}</>
                }
              </Pill>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
