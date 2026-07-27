import { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../lib/data-provider';
import { useDevice } from '../lib/device-context';
import { useI18n } from '../lib/i18n';
import { apiClient } from '../lib/api-client';
import { SENSOR_TYPES } from '../lib/constants';
import { PageHeader, Card, Pill, Btn } from '../components/ui';
import { Search, SlidersHorizontal, Download, Save } from 'lucide-react';
import { connectActuatorWebSocket, onAlert } from '../lib/actuator-ws';

interface Alert {
  id: string | number;
  deviceId?: string;
  title: string;
  detail: string;
  level: string;
  time: string;
  acknowledged: boolean;
  sensor?: string;
  source: 'history' | 'live';
}

const LEVEL_STYLE: Record<string, string> = {
  critical: 'bg-[var(--rose-dim)] text-[var(--rose)]',
  emergency: 'bg-[var(--rose-dim)] text-[var(--rose)]',
  warning: 'bg-[var(--amber-dim)] text-[var(--amber)]',
  info: 'bg-[var(--emerald-dim)] text-[var(--emerald)]',
  High: 'bg-[var(--rose-dim)] text-[var(--rose)]',
  Medium: 'bg-[var(--amber-dim)] text-[var(--amber)]',
};

const LEVEL_ORDER: Record<string, number> = {
  emergency: 4, critical: 3, warning: 2, info: 1,
  High: 3, Medium: 2,
};

export default function AlertsPage() {
  const { data, isLive, hasRealData } = useData();
  const { selectedDevice } = useDevice();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | string>('all');
  const [showThresholds, setShowThresholds] = useState(false);
  const { t } = useI18n();

  // Alert history from backend (alert_history table)
  const [historyAlerts, setHistoryAlerts] = useState<Alert[]>([]);
  const [ackedIds, setAckedIds] = useState<Set<number>>(new Set());
  const historyRef = useRef(historyAlerts);
  historyRef.current = historyAlerts;

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
          acknowledged: r.acknowledged,
          sensor: r.sensor,
          source: 'history' as const,
        })));
      }
    }).catch(() => {});
  }, [selectedDevice?.id]);

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
          title: `${v.name} ${isCritical ? 'Critical' : 'Degraded'}`,
          detail: `${v.name} reports ${v.value} (confidence ${v.confidence}%)`,
          level: isCritical ? 'critical' : 'warning',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          acknowledged: false,
          sensor: v.id,
          source: 'live' as const,
        };
      });
  }, [data.virtualSensors]);

  // Merge: live virtual alerts on top, then history, deduplicated
  const liveKeys = useMemo(() => new Set(liveAlerts.map(a => `${a.sensor}:${a.title}`)), [liveAlerts]);
  const alerts = useMemo(() => {
    const live = liveAlerts;
    const hist = historyAlerts
      .filter(a => !liveKeys.has(`${a.sensor}:${a.title}`))
      .map(a => ackedIds.has(Number(a.id)) ? { ...a, acknowledged: true } : a);
    return [...live, ...hist];
  }, [liveAlerts, historyAlerts, liveKeys, ackedIds]);

  const filteredAlerts = alerts
    .filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.detail.toLowerCase().includes(search.toLowerCase()))
    .filter(a => levelFilter === 'all' || a.level === levelFilter)
    .sort((a, b) => (LEVEL_ORDER[b.level] || 0) - (LEVEL_ORDER[a.level] || 0));

  const acknowledge = (id: string | number) => {
    setAckedIds(prev => new Set([...prev, Number(id)]));
    if (typeof id === 'number') {
      apiClient.acknowledgeAlertHistory(id);
    }
  };

  const noRealData = isLive && !hasRealData;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title={t('alerts.title')}
        subtitle={t('alerts.subtitle')}
        right={
          <div className="flex items-center gap-2">
            {noRealData ? <Pill tone="amber">Awaiting real data</Pill> : undefined}
            <button onClick={() => apiClient.exportAlertsCSV()} className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] text-xs flex items-center gap-1.5 border border-[var(--border)]" aria-label="Export alerts"><Download size={12} /> Export</button>
            <Btn variant="ghost" onClick={() => setShowThresholds(true)}>
              <SlidersHorizontal size={15} /> Thresholds
            </Btn>
          </div>
        }
      />

      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
          <input
            type="text"
            placeholder={t('alerts.placeholder.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-[var(--radius-sm)] text-sm"
          />
        </div>
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className="px-4 py-2.5 rounded-[var(--radius-sm)] text-sm"
        >
          <option value="all">{t('alerts.filter.allLevels')}</option>
          <option value="emergency">Emergency</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
        </select>
      </div>

      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <Card className="text-center py-12">
            {noRealData
              ? <div className="text-[var(--text-tertiary)]">No alerts — awaiting real sensor data from connected devices.</div>
              : <div className="text-[var(--text-tertiary)]">No active alerts. All monitored sensors are within healthy ranges.</div>}
          </Card>
        ) : (
          filteredAlerts.map(alert => (
            <div key={String(alert.id)} className={`card flex justify-between items-center ${alert.acknowledged ? 'opacity-60' : ''}`}>
              <div>
                <div className="font-semibold flex items-center gap-3">
                  {alert.title}
                  <span className={`text-xs px-3 py-px rounded-full ${LEVEL_STYLE[alert.level] || LEVEL_STYLE.warning}`}>
                    {alert.level}
                  </span>
                  {alert.source === 'live' && (
                    <Pill tone="emerald">Live</Pill>
                  )}
                </div>
                <div className="text-sm text-[var(--text-tertiary)] mt-1">{alert.detail}</div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div className="text-[var(--text-tertiary)] font-mono">{alert.time}</div>
                {!alert.acknowledged && (
                  <button onClick={() => acknowledge(alert.id)} className="px-4 py-1 bg-[var(--emerald)] rounded-[var(--radius-sm)] text-xs">
                    {t('alerts.button.acknowledge')}
                  </button>
                )}
                {alert.acknowledged && <div className="text-[var(--emerald)] text-xs">{t('alerts.status.acknowledged')}</div>}
              </div>
            </div>
          ))
        )}
      </div>

      {showThresholds && <ThresholdsModal onClose={() => setShowThresholds(false)} />}
    </div>
  );
}

function ThresholdsModal({ onClose }: { onClose: () => void }) {
  const [thresholds, setThresholds] = useState<Record<string, { min: number | null; max: number | null; enabled: boolean }>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.getThresholds().then(rows => {
      const map: Record<string, any> = {};
      (Array.isArray(rows) ? rows : []).forEach(r => { map[r.sensor] = { min: Number(r.min), max: Number(r.max), enabled: r.enabled }; });
      setThresholds(map);
    });
  }, []);

  const sensors = Object.keys(SENSOR_TYPES);

  const update = (sensor: string, patch: Partial<{ min: number | null; max: number | null; enabled: boolean }>) => {
    setThresholds(prev => ({ ...prev, [sensor]: { min: null, max: null, enabled: true, ...prev[sensor], ...patch } }));
    setSaved(false);
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const [sensor, t] of Object.entries(thresholds)) {
      if (t.enabled && t.min !== null && t.max !== null && t.min >= t.max) {
        e[sensor] = 'min must be below max';
      }
    }
    return e;
  }, [thresholds]);

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
          <h3 className="text-lg font-semibold">Alert Thresholds</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">✕</button>
        </div>
        <div className="space-y-2">
          {sensors.map(sensor => {
            const t = thresholds[sensor] || { min: null, max: null, enabled: true };
            const meta = SENSOR_TYPES[sensor as keyof typeof SENSOR_TYPES];
            return (
              <div key={sensor} className="flex items-center gap-3 text-sm">
                <span className="w-32 font-medium">{meta.name}</span>
                <label className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  min <input type="number" value={t.min ?? ''} onChange={e => update(sensor, { min: e.target.value === '' ? null : Number(e.target.value) })} className={`w-20 bg-[var(--surface)] px-2 py-1 rounded ${errors[sensor] ? 'border border-[var(--rose)]' : ''}`} />
                </label>
                <label className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  max <input type="number" value={t.max ?? ''} onChange={e => update(sensor, { max: e.target.value === '' ? null : Number(e.target.value) })} className={`w-20 bg-[var(--surface)] px-2 py-1 rounded ${errors[sensor] ? 'border border-[var(--rose)]' : ''}`} />
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <input type="checkbox" checked={t.enabled} onChange={e => update(sensor, { enabled: e.target.checked })} /> on
                </label>
                {errors[sensor] && <span className="text-[var(--rose)] text-xs">{errors[sensor]}</span>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-5">
          <Btn variant="primary" onClick={save} disabled={hasErrors}><Save size={15} /> Save Thresholds</Btn>
          {saved && <span className="text-[var(--emerald)] text-sm">Saved</span>}
          {hasErrors && <span className="text-[var(--rose)] text-sm">Fix validation errors before saving</span>}
        </div>
      </div>
    </div>
  );
}
