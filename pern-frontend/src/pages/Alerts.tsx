import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useData } from '../lib/data-provider';
import { useDevice } from '../lib/device-context';
import { useI18n } from '../lib/i18n';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES } from '../lib/constants';
import { PageHeader, Card, Pill, Btn, StatCard } from '../components/ui';
import { ChartGrid, CHART_TICK, ChartTooltip } from '../components/charts';
import {
  Search, SlidersHorizontal, Download, Save, Bell, BellRing, Trash2, Pencil,
  Plus, ShieldAlert, Clock, Activity, X, Check, Layers, PieChart, ListChecks,
} from 'lucide-react';
import { connectActuatorWebSocket, onAlert } from '../lib/actuator-ws';

interface Alert {
  id: string | number;
  deviceId?: string;
  title: string;
  detail: string;
  level: string;
  time: string;
  ts?: number;
  acknowledged: boolean;
  sensor?: string;
  source: 'history' | 'live';
}

interface AlertRule {
  id: string;
  name: string;
  sensor: string;
  operator: string;
  threshold: number;
  threshold_max: number | null;
  severity: string;
  notification_channels: string[] | string;
  enabled: boolean;
}

const LEVEL_STYLE: Record<string, string> = {
  critical: 'bg-[var(--rose-dim)] text-[var(--rose)]',
  emergency: 'bg-[var(--rose-dim)] text-[var(--rose)]',
  warning: 'bg-[var(--amber-dim)] text-[var(--amber)]',
  info: 'bg-[var(--emerald-dim)] text-[var(--emerald)]',
  High: 'bg-[var(--rose-dim)] text-[var(--rose)]',
  Medium: 'bg-[var(--amber-dim)] text-[var(--amber)]',
};

const LEVEL_COLOR: Record<string, string> = {
  emergency: 'var(--rose)', critical: 'var(--rose)', warning: 'var(--amber)',
  info: 'var(--emerald)', High: 'var(--rose)', Medium: 'var(--amber)',
};

const LEVEL_ORDER: Record<string, number> = {
  emergency: 4, critical: 3, warning: 2, info: 1,
  High: 3, Medium: 2,
};

const OPERATORS = ['>', '>=', '<', '<=', '==', '!=', 'between', 'outside'];

const SEVERITIES = ['critical', 'emergency', 'warning', 'info'];

function parseRuleRow(r: any): AlertRule {
  let channels: string[] = r.notification_channels;
  if (typeof channels === 'string') {
    try { channels = JSON.parse(channels); } catch { channels = [r.notification_channels]; }
  }
  return {
    id: r.id,
    name: r.name || `${r.sensor || 'rule'} rule`,
    sensor: r.sensor || '',
    operator: r.operator || '>',
    threshold: Number(r.threshold) || 0,
    threshold_max: r.threshold_max != null ? Number(r.threshold_max) : null,
    severity: r.severity || 'warning',
    notification_channels: channels || ['ntfy'],
    enabled: r.enabled !== false,
  };
}

export default function AlertsPage() {
  const { data, isLive, hasRealData } = useData();
  const { selectedDevice } = useDevice();
  const [tab, setTab] = useState<'overview' | 'history' | 'rules'>('overview');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'sensor' | 'device'>('none');
  const [showThresholds, setShowThresholds] = useState(false);
  const { t } = useI18n();

  // Alert history from backend (alert_history table)
  const [historyAlerts, setHistoryAlerts] = useState<Alert[]>([]);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const historyRef = useRef(historyAlerts);
  historyRef.current = historyAlerts;

  // Alert rules + stats
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [stats, setStats] = useState<{ total: number; unacknowledged: number; bySeverity: Record<string, number> }>({ total: 0, unacknowledged: 0, bySeverity: {} });
  const [showRulesForm, setShowRulesForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [ruleFeedback, setRuleFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Load alert history from backend
  useEffect(() => {
    apiClient.getAlertHistory({ limit: 100 }).then(rows => {
      if (Array.isArray(rows)) {
        setHistoryAlerts(rows.map(r => ({
          id: r.id,
          deviceId: r.device_id,
          title: r.severity ? `${r.severity.toUpperCase()}: ${r.sensor}` : r.sensor,
          detail: r.message || `${r.sensor}=${r.value}`,
          level: r.severity || 'warning',
          time: new Date(r.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          ts: new Date(r.triggered_at).getTime(),
          acknowledged: r.acknowledged,
          sensor: r.sensor,
          source: 'history' as const,
        })));
      }
    }).catch(() => {});
  }, [selectedDevice?.id]);

  // Load alert stats
  useEffect(() => {
    apiClient.getAlertStats().then(s => {
      if (s && typeof s === 'object') {
        setStats({ total: s.total || 0, unacknowledged: s.unacknowledged || 0, bySeverity: s.bySeverity || {} });
      }
    }).catch(() => {});
  }, []);

  // Load alert rules
  const loadRules = useMemo(() => {
    return () => {
      apiClient.getAlertRules().then(rows => {
        setRules(Array.isArray(rows) ? rows.map(parseRuleRow) : []);
      }).catch(() => setRules([]));
    };
  }, []);
  useEffect(() => { loadRules(); }, [loadRules]);

  // Real-time alerts via WebSocket
  useEffect(() => {
    connectActuatorWebSocket();
    const unsubscribe = onAlert((alert) => {
      const newAlert: Alert = {
        id: `ws-${Date.now()}-${alert.sensor}`,
        deviceId: alert.device,
        title: alert.title || `${(alert.level || 'warning').toUpperCase()}: ${alert.sensor}`,
        detail: alert.detail || '',
        level: alert.level || 'warning',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ts: Date.now(),
        acknowledged: false,
        sensor: alert.sensor,
        source: 'live' as const,
      };
      setHistoryAlerts(prev => [newAlert, ...prev].slice(0, 200));
    });
    return unsubscribe;
  }, []);

  // Derive live alerts from virtual sensors
  const liveAlerts = useMemo<Alert[]>(() => {
    return data.virtualSensors
      .filter(v => v.category === 'poor' || v.category === 'critical')
      .map(v => {
        const isCritical = v.category === 'critical';
        return {
          id: `live-${v.id}`,
          title: `${v.name} ${isCritical ? t('alerts.live.critical', 'Critical') : t('alerts.live.degraded', 'Degraded')}`,
          detail: `${v.name} ${t('alerts.live.reports', 'reports')} ${v.value} (${t('alerts.live.confidence', 'confidence')} ${v.confidence}%)`,
          level: isCritical ? 'critical' : 'warning',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          ts: Date.now(),
          acknowledged: false,
          sensor: v.id,
          source: 'live' as const,
        };
      });
  }, [data.virtualSensors, t]);

  // Merge: live virtual alerts on top, then history, deduplicated
  const liveKeys = useMemo(() => new Set(liveAlerts.map(a => `${a.sensor}:${a.title}`)), [liveAlerts]);
  const alerts = useMemo(() => {
    const live = liveAlerts;
    const hist = historyAlerts
      .filter(a => !liveKeys.has(`${a.sensor}:${a.title}`))
      .map(a => ackedIds.has(String(a.id)) ? { ...a, acknowledged: true } : a);
    return [...live, ...hist];
  }, [liveAlerts, historyAlerts, liveKeys, ackedIds]);

  const deviceOptions = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach(a => { if (a.deviceId) set.add(a.deviceId); });
    return Array.from(set);
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts
      .filter(a => !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.detail.toLowerCase().includes(search.toLowerCase()))
      .filter(a => levelFilter === 'all' || a.level === levelFilter)
      .filter(a => sourceFilter === 'all' || a.source === sourceFilter)
      .filter(a => deviceFilter === 'all' || a.deviceId === deviceFilter)
      .sort((a, b) => (LEVEL_ORDER[b.level] || 0) - (LEVEL_ORDER[a.level] || 0));
  }, [alerts, search, levelFilter, sourceFilter, deviceFilter]);

  const groups = useMemo(() => {
    const keyFn = (a: Alert) => groupBy === 'sensor' ? (a.sensor || 'unknown') : groupBy === 'device' ? (a.deviceId || 'unknown') : '';
    const m = new Map<string, Alert[]>();
    for (const a of filteredAlerts) {
      const k = keyFn(a);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredAlerts, groupBy]);

  const unacked = alerts.filter(a => !a.acknowledged).length;
  const critCount = alerts.filter(a => a.level === 'critical' || a.level === 'emergency' || a.level === 'High').length;
  const ackRate = alerts.length > 0 ? Math.round((alerts.filter(a => a.acknowledged).length / alerts.length) * 100) : 0;

  const trendData = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const a of alerts) {
      if (!a.ts) continue;
      const d = new Date(a.ts);
      const label = `${String(d.getHours()).padStart(2, '0')}:00`;
      buckets.set(label, (buckets.get(label) || 0) + 1);
    }
    return Array.from(buckets.entries()).sort().map(([label, count]) => ({ label, count }));
  }, [alerts]);

  const sevBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of alerts) counts[a.level] = (counts[a.level] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [alerts]);

  const topSensors = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of alerts) { const k = a.sensor || 'unknown'; counts[k] = (counts[k] || 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [alerts]);

  const acknowledge = (id: string | number) => {
    setAckedIds(prev => new Set([...prev, String(id)]));
    const numericId = typeof id === 'number' ? id : /^\d+$/.test(id) ? Number(id) : null;
    if (numericId !== null) {
      apiClient.acknowledgeAlertHistory(numericId).catch(() => {});
    }
  };

  const saveRule = async (rule: any) => {
    try {
      await apiClient.createAlertRule(rule);
      setRuleFeedback({ ok: true, msg: t('alerts.feedback.ruleSaved', 'Rule saved.') });
      loadRules();
      setShowRulesForm(false);
      setEditingRule(null);
      setTimeout(() => setRuleFeedback(null), 2000);
    } catch {
      setRuleFeedback({ ok: false, msg: t('alerts.feedback.ruleSaveFailed', 'Failed to save rule.') });
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await apiClient.deleteAlertRule(id);
      setRuleFeedback({ ok: true, msg: t('alerts.feedback.ruleDeleted', 'Rule deleted.') });
      loadRules();
      setTimeout(() => setRuleFeedback(null), 2000);
    } catch {
      setRuleFeedback({ ok: false, msg: t('alerts.feedback.ruleDeleteFailed', 'Failed to delete rule.') });
    }
  };

  const toggleRule = (rule: AlertRule) => {
    apiClient.createAlertRule({ ...rule, enabled: !rule.enabled }).then(() => loadRules()).catch(() => {});
  };

  const noRealData = isLive && !hasRealData;

  const tabs = [
    { id: 'overview' as const, label: t('alerts.tab.analytics', 'Analytics'), icon: <PieChart size={13} /> },
    { id: 'history' as const, label: t('alerts.tab.history', 'Alert History'), icon: <ListChecks size={13} /> },
    { id: 'rules' as const, label: t('alerts.tab.rules', 'Rules ({count})', { count: rules.length }), icon: <ShieldAlert size={13} /> },
  ];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('alerts.title')}
        subtitle={t('alerts.subtitle')}
        right={
          <div className="flex items-center gap-2">
            {noRealData ? <Pill tone="amber">{t('alerts.awaitingRealData', 'Awaiting real data')}</Pill> : undefined}
            <button onClick={() => apiClient.downloadCSV(apiClient.exportAlertsCSV(), 'alerts.csv').catch(() => {})} className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] text-xs flex items-center gap-1.5 border border-[var(--border)]" aria-label={t('alerts.button.exportAlerts', 'Export alerts')}><Download size={12} /> {t('alerts.button.export', 'Export')}</button>
            <Btn variant="ghost" onClick={() => setShowThresholds(true)}>
              <SlidersHorizontal size={15} /> {t('alerts.button.thresholds', 'Thresholds')}
            </Btn>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 p-1 rounded-[var(--radius-md)] bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
        {tabs.map(tb => (
          <Btn key={tb.id} onClick={() => setTab(tb.id)} variant="ghost" size="sm" className={`whitespace-nowrap ${tab === tb.id ? '!bg-[var(--emerald)]/15 !text-[var(--emerald)]' : ''}`}>
            <span className="flex items-center gap-1.5">{tb.icon}{tb.label}</span>
          </Btn>
        ))}
      </div>

      <div className="animate-fade-in">
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Key stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 grid-entrance">
              <StatCard label={t('alerts.stat.totalAlerts', 'Total Alerts')} value={stats.total || alerts.length} accent="violet" icon={<Bell size={16} />} />
              <StatCard label={t('alerts.stat.unacknowledged', 'Unacknowledged')} value={unacked} accent="rose" icon={<BellRing size={16} />} />
              <StatCard label={t('alerts.stat.criticalHigh', 'Critical / High')} value={critCount} accent="amber" icon={<ShieldAlert size={16} />} />
              <StatCard label={t('alerts.stat.ackRate', 'Ack Rate')} value={ackRate} unit="%" accent="emerald" trend={t('alerts.stat.ofAllAlerts', 'of all alerts')} icon={<Check size={16} />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Alerts over time */}
              <Card hover={false}>
                <SectionTitleLike>
                  <Clock size={14} className="inline mr-2 text-[var(--emerald)]" />{t('alerts.section.alertsOverTime', 'Alerts over time (by hour)')}
                </SectionTitleLike>
                {trendData.length > 0 ? (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                        <ChartGrid />
                        <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <Bar dataKey="count" name={t('alerts.chart.alertsSeries', 'Alerts')} fill="var(--emerald)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-52 flex items-center justify-center text-sm text-[var(--text-disabled)]">{t('alerts.empty.noActivity', 'No alert activity yet.')}</div>
                )}
              </Card>

              {/* Severity breakdown */}
              <Card hover={false}>
                <SectionTitleLike>
                  <Layers size={14} className="inline mr-2 text-[var(--amber)]" />{t('alerts.section.severityBreakdown', 'Severity breakdown')}
                </SectionTitleLike>
                {sevBreakdown.length > 0 ? (
                  <div className="space-y-3 pt-1">
                    {sevBreakdown.map(([level, count]) => {
                      const pct = alerts.length > 0 ? Math.round((count / alerts.length) * 100) : 0;
                      return (
                        <div key={level}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="capitalize text-[var(--text-secondary)] font-medium">{level}</span>
                            <span className="font-mono text-[var(--text-tertiary)]">{count} · {pct}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: LEVEL_COLOR[level] || 'var(--text-disabled)' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-52 flex items-center justify-center text-sm text-[var(--text-disabled)]">{t('alerts.empty.noBreakdown', 'No alerts to break down.')}</div>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top sensors */}
              <Card hover={false}>
                <SectionTitleLike>
                  <Activity size={14} className="inline mr-2 text-[var(--cyan)]" />{t('alerts.section.mostActiveSensors', 'Most active sensors')}
                </SectionTitleLike>
                {topSensors.length > 0 ? (
                  <div className="space-y-1">
                    {topSensors.map(([sensor, count]) => {
                      const meta = SENSOR_TYPES[sensor as keyof typeof SENSOR_TYPES];
                      const max = topSensors[0]?.[1] || 1;
                      return (
                        <div key={sensor} className="flex items-center gap-3 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-white/[0.03] transition-colors">
                          <span className="w-40 truncate text-xs text-[var(--text-secondary)] font-medium">{meta?.name || sensor}</span>
                          <div className="flex-1 h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: 'linear-gradient(90deg, var(--cyan), var(--emerald))' }} />
                          </div>
                          <span className="text-xs font-mono text-[var(--text-tertiary)]">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text-disabled)] text-center py-8">{t('alerts.empty.noActivity', 'No alert activity yet.')}</div>
                )}
              </Card>

              {/* Rules summary */}
              <Card hover={false}>
                <SectionTitleLike>
                  <ShieldAlert size={14} className="inline mr-2 text-[var(--violet)]" />{t('alerts.section.activeRules', 'Active rules')}
                </SectionTitleLike>
                {rules.length > 0 ? (
                  <div className="space-y-1">
                    {rules.slice(0, 6).map(r => (
                      <div key={r.id} className="flex items-center justify-between px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-white/[0.03] transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${r.enabled ? 'bg-[var(--emerald)]' : 'bg-[var(--text-disabled)]'}`} />
                          <span className="text-xs text-[var(--text-secondary)] truncate">{r.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{r.sensor} {r.operator} {r.threshold}</span>
                          <Pill tone={(LEVEL_COLOR[r.severity] === 'var(--rose)' ? 'rose' : LEVEL_COLOR[r.severity] === 'var(--amber)' ? 'amber' : 'emerald')}>{r.severity}</Pill>
                        </div>
                      </div>
                    ))}
                    {rules.length > 6 && (
                      <button onClick={() => setTab('rules')} className="w-full text-xs text-[var(--emerald)] hover:text-[var(--emerald-bright)] transition-colors pt-1">
                        {t('alerts.viewAllRules', 'View all {count} rules →', { count: rules.length })}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text-disabled)] text-center py-8">
                    {t('alerts.empty.noRules', 'No rules configured.')}
                    <button onClick={() => { setEditingRule(null); setShowRulesForm(true); }} className="block mx-auto mt-2 text-[var(--emerald)] hover:text-[var(--emerald-bright)]">
                      + {t('alerts.empty.createFirstRule', 'Create your first rule')}
                    </button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-4">
            {/* Filters + grouping */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 relative min-w-[200px]">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="text"
                  placeholder={t('alerts.placeholder.search')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-[var(--radius-sm)] text-sm"
                />
              </div>
              <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="px-4 py-2.5 rounded-[var(--radius-sm)] text-sm">
                <option value="all">{t('alerts.filter.allLevels', 'All Levels')}</option>
                <option value="emergency">{t('alerts.severity.emergency', 'Emergency')}</option>
                <option value="critical">{t('alerts.severity.critical', 'Critical')}</option>
                <option value="warning">{t('alerts.severity.warning', 'Warning')}</option>
                <option value="info">{t('alerts.severity.info', 'Info')}</option>
                <option value="High">{t('alerts.severity.high', 'High')}</option>
                <option value="Medium">{t('alerts.severity.medium', 'Medium')}</option>
              </select>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="px-4 py-2.5 rounded-[var(--radius-sm)] text-sm">
                <option value="all">{t('alerts.filter.allSources', 'All sources')}</option>
                <option value="history">{t('alerts.filter.history', 'History')}</option>
                <option value="live">{t('alerts.filter.live', 'Live')}</option>
              </select>
              <select value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)} className="px-4 py-2.5 rounded-[var(--radius-sm)] text-sm">
                <option value="all">{t('alerts.filter.allDevices', 'All devices')}</option>
                {deviceOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex items-center gap-1 p-1 rounded-[var(--radius-sm)] bg-white/[0.03] border border-[var(--border)]">
                {(['none', 'sensor', 'device'] as const).map(g => (
                  <button key={g} onClick={() => setGroupBy(g)}
                    className={`px-2.5 py-1.5 rounded text-xs capitalize transition-colors ${groupBy === g ? 'bg-[var(--emerald)]/15 text-[var(--emerald)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                    {g === 'none' ? t('alerts.group.flat', 'Flat') : t('alerts.group.by', 'Group by {key}', { key: g })}
                  </button>
                ))}
              </div>
            </div>

            {filteredAlerts.length === 0 ? (
              <Card className="text-center py-12" hover={false}>
                {noRealData
                  ? <div className="text-[var(--text-tertiary)]">{t('alerts.empty.awaitingRealData', 'No alerts — awaiting real sensor data from connected devices.')}</div>
                  : <div className="text-[var(--text-tertiary)]">{t('alerts.empty.noMatchFilters', 'No alerts match the current filters.')}</div>}
              </Card>
            ) : groupBy === 'none' ? (
              <AlertList alerts={filteredAlerts} onAck={acknowledge} />
            ) : (
              <div className="space-y-5">
                {groups.map(([key, items]) => (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-2">
                      <Pill tone="slate">{key}</Pill>
                      <span className="text-[10px] text-[var(--text-tertiary)]">{items.length} {items.length !== 1 ? t('alerts.group.alertsWord', 'alerts') : t('alerts.group.alertWord', 'alert')}</span>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                    <AlertList alerts={items} onAck={acknowledge} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'rules' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-tertiary)]">
                {t('alerts.rulesDescription', 'Rules are evaluated continuously against incoming readings by the alert engine (30\u00a0s cooldown per rule).')}
              </p>
              <Btn variant="primary" size="sm" onClick={() => { setEditingRule(null); setShowRulesForm(true); }}>
                <Plus size={13} /> {t('alerts.newRule', 'New rule')}
              </Btn>
            </div>
            {ruleFeedback && (
              <div className={`px-3 py-2 rounded-[var(--radius-sm)] text-xs ${ruleFeedback.ok ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'bg-[var(--rose-dim)] text-[var(--rose)]'}`}>
                {ruleFeedback.msg}
              </div>
            )}
            {rules.length === 0 ? (
              <Card className="text-center py-12" hover={false}>
                <ShieldAlert size={28} className="mx-auto mb-3 text-[var(--text-disabled)]" />
                <h3 className="font-semibold mb-1">{t('alerts.empty.noRulesTitle', 'No alert rules')}</h3>
                <p className="text-sm text-[var(--text-tertiary)] max-w-md mx-auto mb-4">
                  {t('alerts.empty.rulesHint', 'Create rules to raise alerts when a sensor crosses a threshold. Operators: >, >=, <, <=, ==, !=, between, outside.')}
                </p>
                <Btn variant="primary" size="sm" onClick={() => { setEditingRule(null); setShowRulesForm(true); }}><Plus size={13} /> {t('alerts.button.createFirstRule', 'Create first rule')}</Btn>
              </Card>
            ) : (
              <Card hover={false} className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('alerts.column.rule', 'Rule')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('alerts.column.condition', 'Condition')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('alerts.column.severity', 'Severity')}</th>
                        <th className="p-3 text-left text-[var(--text-disabled)] font-medium">{t('alerts.column.status', 'Status')}</th>
                        <th className="p-3 text-right text-[var(--text-disabled)] font-medium">{t('alerts.column.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map(r => (
                        <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="p-3">
                            <div className="text-[var(--text-primary)] font-medium">{r.name}</div>
                            <div className="text-[10px] text-[var(--text-disabled)]">{r.id}</div>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-[var(--text-secondary)]">
                              {SENSOR_TYPES[r.sensor as keyof typeof SENSOR_TYPES]?.name || r.sensor} {r.operator} {r.threshold}
                              {(r.operator === 'between' || r.operator === 'outside') && r.threshold_max != null ? ` ${t('alerts.rule.and', 'and')} ${r.threshold_max}` : ''}
                            </span>
                          </td>
                          <td className="p-3">
                            <Pill tone={LEVEL_COLOR[r.severity] === 'var(--rose)' ? 'rose' : LEVEL_COLOR[r.severity] === 'var(--amber)' ? 'amber' : 'emerald'}>{r.severity}</Pill>
                          </td>
                          <td className="p-3">
                            <button onClick={() => toggleRule(r)}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold transition-colors ${r.enabled ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'bg-white/[0.04] text-[var(--text-disabled)]'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${r.enabled ? 'bg-[var(--emerald)]' : 'bg-[var(--text-disabled)]'}`} />
                              {r.enabled ? t('alerts.status.enabled', 'Enabled') : t('alerts.status.disabled', 'Disabled')}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => { setEditingRule(r); setShowRulesForm(true); }} className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--emerald)] hover:bg-white/[0.05] transition-colors" aria-label={t('alerts.editRule', 'Edit rule')}><Pencil size={13} /></button>
                              <button onClick={() => deleteRule(r.id)} className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--rose)] hover:bg-white/[0.05] transition-colors" aria-label={t('alerts.deleteRule', 'Delete rule')}><Trash2 size={13} /></button>
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

      {showRulesForm && (
        <RuleFormModal
          initial={editingRule}
          onClose={() => { setShowRulesForm(false); setEditingRule(null); }}
          onSave={saveRule}
        />
      )}
      {showThresholds && <ThresholdsModal onClose={() => setShowThresholds(false)} />}
    </div>
  );
}

function SectionTitleLike({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">{children}</div>;
}

function AlertList({ alerts, onAck }: { alerts: Alert[]; onAck: (id: string | number) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      {alerts.map(alert => (
        <div key={String(alert.id)} className={`card flex justify-between items-center ${alert.acknowledged ? 'opacity-60' : ''}`}>
          <div>
            <div className="font-semibold flex items-center gap-3">
              {alert.title}
              <span className={`text-xs px-3 py-px rounded-full ${LEVEL_STYLE[alert.level] || LEVEL_STYLE.warning}`}>
                {alert.level}
              </span>
              {alert.source === 'live' && <Pill tone="emerald">{t('alerts.liveBadge', 'Live')}</Pill>}
            </div>
            <div className="text-sm text-[var(--text-tertiary)] mt-1">{alert.detail}</div>
            {alert.deviceId && <div className="text-[10px] text-[var(--text-disabled)] mt-0.5">{t('alerts.devicePrefix', 'device: ')}{alert.deviceId}</div>}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-[var(--text-tertiary)] font-mono">{alert.time}</div>
            {!alert.acknowledged && (
              <button onClick={() => onAck(alert.id)} className="px-4 py-1 bg-[var(--emerald)] rounded-[var(--radius-sm)] text-xs">
                {t('alerts.button.acknowledge', 'Acknowledge')}
              </button>
            )}
            {alert.acknowledged && <div className="text-[var(--emerald)] text-xs">{t('alerts.status.acknowledged', 'Acknowledged')}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RuleFormModal({ initial, onClose, onSave }: {
  initial: AlertRule | null;
  onClose: () => void;
  onSave: (rule: any) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name || '');
  const [sensor, setSensor] = useState(initial?.sensor || '');
  const [operator, setOperator] = useState(initial?.operator || '>');
  const [threshold, setThreshold] = useState(initial ? String(initial.threshold) : '');
  const [thresholdMax, setThresholdMax] = useState(initial?.threshold_max != null ? String(initial.threshold_max) : '');
  const [severity, setSeverity] = useState(initial?.severity || 'warning');
  const [enabled, setEnabled] = useState(initial ? initial.enabled : true);

  const isRange = operator === 'between' || operator === 'outside';
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!name.trim()) e.push(t('alerts.form.error.nameRequired', 'Rule name is required.'));
    if (!sensor) e.push(t('alerts.form.error.sensorRequired', 'Choose a sensor.'));
    if (threshold === '' || Number.isNaN(Number(threshold))) e.push(t('alerts.form.error.thresholdNumber', 'Threshold must be a number.'));
    if (isRange && (thresholdMax === '' || Number.isNaN(Number(thresholdMax)))) e.push(t('alerts.form.error.secondBound', 'Second bound is required for this operator.'));
    if (isRange && threshold !== '' && thresholdMax !== '' && Number(thresholdMax) <= Number(threshold)) e.push(t('alerts.form.error.boundOrder', 'Upper bound must be above the lower bound.'));
    return e;
  }, [name, sensor, threshold, thresholdMax, isRange, t]);

  const submit = () => {
    if (errors.length > 0) return;
    onSave({
      id: initial?.id,
      name: name.trim(),
      sensor,
      operator,
      threshold: Number(threshold),
      threshold_max: isRange ? Number(thresholdMax) : null,
      severity,
      enabled,
      notification_channels: ['ntfy'],
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass p-6 rounded-[var(--radius-xl)] w-full max-w-lg max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{initial ? t('alerts.form.editTitle', 'Edit rule') : t('alerts.form.createTitle', 'New alert rule')}</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{t('alerts.form.ruleName', 'Rule name')}</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('alerts.form.namePlaceholder', 'e.g. High temperature in lab')} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{t('alerts.form.sensor', 'Sensor')}</span>
              <select value={sensor} onChange={e => setSensor(e.target.value)} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]">
                <option value="">{t('alerts.form.selectPlaceholder', 'Select…')}</option>
                {Object.keys(SENSOR_TYPES).map(k => (
                  <option key={k} value={k}>{SENSOR_TYPES[k as keyof typeof SENSOR_TYPES]?.name} ({k})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{t('alerts.form.operator', 'Operator')}</span>
              <select value={operator} onChange={e => setOperator(e.target.value)} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]">
                {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{isRange ? t('alerts.form.lowerBound', 'Lower bound') : t('alerts.form.threshold', 'Threshold')}</span>
              <input type="number" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]" />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{isRange ? t('alerts.form.upperBound', 'Upper bound') : t('alerts.form.severity', 'Severity')}</span>
              {isRange ? (
                <input type="number" step="any" value={thresholdMax} onChange={e => setThresholdMax(e.target.value)} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]" />
              ) : (
                <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] capitalize">
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </label>
          </div>
          {!isRange && (
            <label className="block">
              <span className="text-xs text-[var(--text-tertiary)] font-medium mb-1 block">{t('alerts.form.severity', 'Severity')}</span>
              <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] capitalize">
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-[var(--emerald)]" />
            {t('alerts.form.enabled', 'Enabled')}
          </label>
          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((er, i) => <div key={i} className="text-xs text-[var(--rose)]">{er}</div>)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-6">
          <Btn variant="primary" onClick={submit} disabled={errors.length > 0}><Save size={15} /> {initial ? t('alerts.form.saveChanges', 'Save changes') : t('alerts.form.createRule', 'Create rule')}</Btn>
          <Btn variant="ghost" onClick={onClose}>{t('alerts.form.cancel', 'Cancel')}</Btn>
        </div>
      </div>
    </div>
  );
}

function ThresholdsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [thresholds, setThresholds] = useState<Record<string, { min: number | null; max: number | null; enabled: boolean }>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.getThresholds().then(rows => {
      const map: Record<string, any> = {};
      (Array.isArray(rows) ? rows : []).forEach(r => { map[r.sensor] = { min: r.min != null ? Number(r.min) : null, max: r.max != null ? Number(r.max) : null, enabled: r.enabled }; });
      setThresholds(map);
    });
  }, []);

  const sensors = Object.keys(SENSOR_TYPES);

  const update = (sensor: string, patch: Partial<{ min: number | null; max: number | null; enabled: boolean }>) => {
    setThresholds(prev => {
      const base = prev[sensor] ?? { min: null, max: null, enabled: true };
      return { ...prev, [sensor]: { ...base, ...patch } };
    });
    setSaved(false);
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const [sensor, tr] of Object.entries(thresholds)) {
      if (tr.enabled && tr.min !== null && tr.max !== null && tr.min >= tr.max) {
        e[sensor] = t('alerts.thresholds.error.minBelowMax', 'min must be below max');
      }
    }
    return e;
  }, [thresholds, t]);

  const hasErrors = Object.keys(errors).length > 0;

  const save = () => {
    if (hasErrors) return;
    Object.entries(thresholds).forEach(([sensor, t]) => {
      apiClient.saveThreshold({ sensor, min: t.min, max: t.max, enabled: t.enabled });
    });
    setSaved(true);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass p-6 rounded-[var(--radius-xl)] w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('alerts.thresholds.title', 'Alert Thresholds')}</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">✕</button>
        </div>
        <div className="space-y-2">
          {sensors.map(sensor => {
            const tr = thresholds[sensor] || { min: null, max: null, enabled: true };
            const meta = SENSOR_TYPES[sensor as keyof typeof SENSOR_TYPES];
            return (
              <div key={sensor} className="flex items-center gap-3 text-sm">
                <span className="w-32 font-medium">{meta.name}</span>
                <label className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  {t('alerts.thresholds.min', 'min')} <input type="number" value={tr.min ?? ''} onChange={e => update(sensor, { min: e.target.value === '' ? null : Number(e.target.value) })} className={`w-20 bg-[var(--surface)] px-2 py-1 rounded ${errors[sensor] ? 'border border-[var(--rose)]' : ''}`} />
                </label>
                <label className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  {t('alerts.thresholds.max', 'max')} <input type="number" value={tr.max ?? ''} onChange={e => update(sensor, { max: e.target.value === '' ? null : Number(e.target.value) })} className={`w-20 bg-[var(--surface)] px-2 py-1 rounded ${errors[sensor] ? 'border border-[var(--rose)]' : ''}`} />
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <input type="checkbox" checked={tr.enabled} onChange={e => update(sensor, { enabled: e.target.checked })} /> {t('alerts.thresholds.on', 'on')}
                </label>
                {errors[sensor] && <span className="text-[var(--rose)] text-xs">{errors[sensor]}</span>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-5">
          <Btn variant="primary" onClick={save} disabled={hasErrors}><Save size={15} /> {t('alerts.thresholds.save', 'Save Thresholds')}</Btn>
          {saved && <span className="text-[var(--emerald)] text-sm">{t('alerts.thresholds.saved', 'Saved')}</span>}
          {hasErrors && <span className="text-[var(--rose)] text-sm">{t('alerts.thresholds.fixErrors', 'Fix validation errors before saving')}</span>}
        </div>
      </div>
    </div>
  );
}
