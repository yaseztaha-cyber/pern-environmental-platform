import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth-context';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Pill, Btn, Toggle } from '../components/ui';
import { showToast } from '../components/Toast';
import {
  Bell, BellRing, Mail, MessageSquare, Smartphone, Radio, Send, Trash2, Clock, Check, X, RefreshCw,
} from 'lucide-react';

interface ChannelState {
  configured: boolean;
}

interface DispatchEntry {
  id: string;
  title: string;
  message: string;
  severity: string;
  channels: string[];
  results: Array<{ channel: string; sent: boolean; reason?: string }>;
  dispatched_at: string;
}

interface Preference {
  id?: number;
  user_id: string;
  channel: string;
  alert_types: string[] | string;
  enabled: boolean;
}

const CHANNEL_META: Record<string, { icon: React.ReactNode; labelKey: string; key: string }> = {
  'in-app': { icon: <Bell size={18} />, labelKey: 'notifications.channel.inApp', key: 'inApp' },
  ntfy: { icon: <Radio size={18} />, labelKey: 'notifications.channel.ntfy', key: 'ntfy' },
  email: { icon: <Mail size={18} />, labelKey: 'notifications.channel.email', key: 'email' },
  slack: { icon: <MessageSquare size={18} />, labelKey: 'notifications.channel.slack', key: 'slack' },
  sms: { icon: <Smartphone size={18} />, labelKey: 'notifications.channel.sms', key: 'sms' },
};

const ALL_CHANNELS = ['in-app', 'ntfy', 'email', 'slack', 'sms'];

export default function NotificationsCenter() {
  const { t } = useI18n();
  const { user } = useAuth();
  const userId = user?.id || 'demo-user';

  const [tab, setTab] = useState<'channels' | 'preferences' | 'history'>('channels');
  const [channels, setChannels] = useState<Record<string, ChannelState>>({});
  const [clients, setClients] = useState(0);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [history, setHistory] = useState<DispatchEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [testTitle, setTestTitle] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testSeverity, setTestSeverity] = useState('info');
  const [testChannels, setTestChannels] = useState<string[]>(['in-app', 'ntfy']);

  const loadStatus = useCallback(() => {
    apiClient.getNotificationStatus().then((res) => {
      if (res && res.channels) setChannels(res.channels);
      if (typeof res?.clients === 'number') setClients(res.clients);
    }).catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    apiClient.getNotificationLog(50).then((res) => {
      setHistory(Array.isArray(res?.entries) ? res.entries : []);
    }).catch(() => setHistory([]));
  }, []);

  const loadPrefs = useCallback(() => {
    apiClient.getNotificationPreferences(userId).then((rows) => {
      setPrefs(Array.isArray(rows) ? rows : []);
    }).catch(() => setPrefs([]));
  }, [userId]);

  useEffect(() => {
    loadStatus();
    loadHistory();
    loadPrefs();
  }, [loadStatus, loadHistory, loadPrefs]);

  const configuredCount = useMemo(() => Object.values(channels).filter(c => c.configured).length, [channels]);

  const sendTest = async () => {
    setSending(true);
    try {
      const res = await apiClient.sendTestNotification({
        title: testTitle.trim() || t('notifications.test.title', 'PERN test notification'),
        message: testMessage.trim() || t('notifications.test.message', 'This is a test from the Notification Center.'),
        severity: testSeverity,
        channels: testChannels,
      });
      const ok = Array.isArray(res?.results) && res.results.some((r: { sent?: boolean }) => r.sent);
      showToast(t(ok ? 'notifications.test.toast.sent' : 'notifications.test.toast.failed'), ok ? 'success' : 'error');
      loadHistory();
    } catch {
      showToast(t('notifications.test.toast.failed'), 'error');
    } finally {
      setSending(false);
    }
  };

  const toggleChannel = (channel: string) => {
    setTestChannels(prev => prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]);
  };

  const savePreference = async (pref: Preference) => {
    try {
      await apiClient.saveNotificationPreferences(userId, {
        channel: pref.channel,
        alert_types: pref.alert_types || ['critical', 'warning', 'info'],
        enabled: pref.enabled,
      });
      showToast(t('notifications.savePref'), 'success');
      loadPrefs();
    } catch {
      showToast(t('notifications.test.toast.failed'), 'error');
    }
  };

  const removePreference = async (channel: string) => {
    try {
      await apiClient.deleteNotificationPreference(userId, channel);
      loadPrefs();
    } catch {
      /* noop */
    }
  };

  const tabs = [
    { id: 'channels' as const, label: t('notifications.tab.channels'), icon: <Radio size={13} /> },
    { id: 'preferences' as const, label: t('notifications.tab.preferences'), icon: <BellRing size={13} /> },
    { id: 'history' as const, label: t('notifications.tab.history'), icon: <Clock size={13} /> },
  ];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        right={
          <button onClick={() => { loadStatus(); loadHistory(); loadPrefs(); }} className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] text-xs flex items-center gap-1.5 border border-[var(--border)]" aria-label={t('notifications.refresh', 'Refresh')}>
            <RefreshCw size={12} /> {t('notifications.refresh', 'Refresh')}
          </button>
        }
      />

      <div className="flex gap-1 mb-6 p-1 rounded-[var(--radius-md)] bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
        {tabs.map(tb => (
          <Btn key={tb.id} onClick={() => setTab(tb.id)} variant="ghost" size="sm" className={`whitespace-nowrap ${tab === tb.id ? '!bg-[var(--emerald)]/15 !text-[var(--emerald)]' : ''}`}>
            <span className="flex items-center gap-1.5">{tb.icon}{tb.label}</span>
          </Btn>
        ))}
      </div>

      <div className="animate-fade-in">
        {tab === 'channels' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 grid-entrance">
              <StatCardLite label={t('notifications.stat.channels', 'Channels')} value={`${configuredCount}/${ALL_CHANNELS.length}`} accent="violet" icon={<Radio size={16} />} />
              <StatCardLite label={t('notifications.clients')} value={clients} accent="emerald" icon={<Bell size={16} />} />
              <StatCardLite label={t('notifications.tab.preferences')} value={prefs.length} accent="amber" icon={<BellRing size={16} />} />
              <StatCardLite label={t('notifications.tab.history')} value={history.length} accent="cyan" icon={<Clock size={16} />} />
            </div>

            <Card hover={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ALL_CHANNELS.map(channel => {
                  const meta = CHANNEL_META[channel];
                  const cfg = channels[channel] || { configured: false };
                  return (
                    <div key={channel} className={`rounded-[var(--radius-md)] p-4 border transition-colors ${cfg.configured ? 'border-[var(--emerald-glow)] bg-[var(--emerald-dim)]/10' : 'border-[var(--border)] bg-white/[0.02]'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`p-2.5 rounded-[var(--radius-sm)] ${cfg.configured ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'bg-white/[0.05] text-[var(--text-disabled)]'}`}>
                          {meta.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{t(meta.labelKey)}</div>
                          <div className="text-[10px] font-mono text-[var(--text-disabled)]">{channel}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        {cfg.configured
                          ? <Pill tone="emerald"><Check size={10} /> {t('notifications.channel.configured')}</Pill>
                          : <Pill tone="slate"><X size={10} /> {t('notifications.channel.notConfigured')}</Pill>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card hover={false}>
              <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Send size={14} className="text-[var(--emerald)]" /> {t('notifications.sendTest')}
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{t('notifications.dispatch.title')}</span>
                    <input value={testTitle} onChange={e => setTestTitle(e.target.value)} placeholder={t('notifications.test.title', 'PERN test notification')} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{t('notifications.dispatch.severity')}</span>
                    <select value={testSeverity} onChange={e => setTestSeverity(e.target.value)} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] capitalize">
                      {['info', 'warning', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{t('notifications.dispatch.message', 'Message')}</span>
                  <textarea value={testMessage} onChange={e => setTestMessage(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]" />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-tertiary)] font-medium">{t('notifications.dispatch.channels')}:</span>
                  {ALL_CHANNELS.map(channel => (
                    <button key={channel} onClick={() => toggleChannel(channel)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${testChannels.includes(channel) ? 'bg-[var(--emerald)]/15 text-[var(--emerald)] border-[var(--emerald-glow)]' : 'bg-white/[0.03] text-[var(--text-tertiary)] border-[var(--border)]'}`}>
                      {t(CHANNEL_META[channel].labelKey)}
                    </button>
                  ))}
                  <Btn variant="primary" size="sm" onClick={sendTest} loading={sending} disabled={testChannels.length === 0}>
                    <Send size={13} /> {t('notifications.sendTest')}
                  </Btn>
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === 'preferences' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-tertiary)]">
              {t('notifications.channelsFor')} <span className="font-mono text-[var(--text-secondary)]">{userId}</span>
            </p>
            {prefs.length === 0 ? (
              <Card className="text-center py-12" hover={false}>
                <BellRing size={28} className="mx-auto mb-3 text-[var(--text-disabled)]" />
                <h3 className="font-semibold mb-1">{t('notifications.tab.preferences')}</h3>
                <p className="text-sm text-[var(--text-tertiary)]">{t('notifications.noPrefs')}</p>
              </Card>
            ) : (
              <Card hover={false} className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.prefs.channel', 'Channel')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.prefs.alertTypes', 'Alert types')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.prefs.status', 'Status')}</th>
                        <th className="p-3 text-right text-[var(--text-disabled)] font-medium">{t('notifications.prefs.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prefs.map(p => {
                        const types = Array.isArray(p.alert_types) ? p.alert_types : (typeof p.alert_types === 'string' ? JSON.parse(p.alert_types) : []);
                        return (
                          <tr key={p.id || p.channel} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="p-1.5 rounded bg-white/[0.05] text-[var(--text-secondary)]">{CHANNEL_META[p.channel]?.icon || <Bell size={16} />}</span>
                                <span className="text-[var(--text-primary)] font-medium">{t(CHANNEL_META[p.channel]?.labelKey || p.channel)}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {(Array.isArray(types) ? types : []).map((ty: string) => <Pill key={ty} tone="slate">{ty}</Pill>)}
                              </div>
                            </td>
                            <td className="p-3">
                              <Toggle checked={p.enabled} onChange={(v) => savePreference({ ...p, enabled: v })} label={p.enabled ? t('notifications.prefs.on', 'On') : t('notifications.prefs.off', 'Off')} />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={() => removePreference(p.channel)} className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--rose)] hover:bg-white/[0.05] transition-colors" aria-label={t('notifications.removePreference', 'Remove preference')}><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <Card className="text-center py-12" hover={false}>
                <Clock size={28} className="mx-auto mb-3 text-[var(--text-disabled)]" />
                <p className="text-sm text-[var(--text-tertiary)]">{t('notifications.emptyHistory')}</p>
              </Card>
            ) : (
              <Card hover={false} className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.dispatch.timestamp')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.dispatch.title')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.dispatch.severity')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.dispatch.channels')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('notifications.dispatch.result')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(e => (
                        <tr key={e.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="p-3 whitespace-nowrap font-mono text-[var(--text-tertiary)]">
                            {new Date(e.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="p-3 max-w-[260px]">
                            <div className="text-[var(--text-primary)] font-medium truncate">{e.title}</div>
                            <div className="text-[10px] text-[var(--text-disabled)] truncate">{e.message}</div>
                          </td>
                          <td className="p-3">
                            <Pill tone={e.severity === 'critical' ? 'rose' : e.severity === 'warning' ? 'amber' : 'emerald'}>{e.severity}</Pill>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {e.channels.map(c => <Pill key={c} tone="slate">{c}</Pill>)}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {(e.results || []).map(r => (
                                r.sent
                                  ? <Pill key={r.channel} tone="emerald"><Check size={10} /> {r.channel}</Pill>
                                  : <Pill key={r.channel} tone="rose"><X size={10} /> {r.channel}</Pill>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCardLite({ label, value, accent, icon }: { label: string; value: string | number; accent: 'emerald' | 'cyan' | 'violet' | 'amber' | 'blue' | 'rose'; icon: React.ReactNode }) {
  return (
    <div className={`rounded-[var(--radius-md)] p-5 border-s-[3px] transition-all duration-300 hover:-translate-y-1`} style={{ background: 'rgba(255,255,255,0.02)', borderLeftColor: `var(--${accent})` }}>
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        <span className="text-[var(--text-secondary)] icon-bounce">{icon}</span>
      </div>
      <div className="mt-2.5 text-[28px] font-bold tracking-tight stat-number">{value}</div>
    </div>
  );
}
