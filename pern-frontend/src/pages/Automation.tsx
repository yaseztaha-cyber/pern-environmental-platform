import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import { sendNtfyNotification, notifyAutomationTrigger } from '../lib/ntfy';
import { useData } from '../lib/data-provider';
import { executeAutomationRule } from '../lib/automation-control';
import type { AutomationRule } from '../lib/automation-control';
import { SENSOR_TYPES } from '../lib/constants';
import { showToast } from '../components/Toast';
import { apiClient } from '../lib/api-client';
import { logAuditEvent } from '../lib/audit-log';
import { useOrganization } from '../lib/organization-context';
import { mqttClient } from '../lib/mqtt-client';
import { connectActuatorWebSocket, onActuatorStatus } from '../lib/actuator-ws';
import { PageErrorBoundary } from '../components/PageErrorBoundary';
import { PageHeader, Card, Pill, Btn, SectionTitle, Toggle } from '../components/ui';
import { Trash2, Plus } from 'lucide-react';

interface ActuatorStatus {
  device: string;
  actuator: string;
  state: 'on' | 'off';
  lastChanged: string;
}

export default function AutomationPage() {
  return (
    <PageErrorBoundary pageName="Automation">
      <AutomationContent />
    </PageErrorBoundary>
  );
}

function AutomationContent() {
  const { t } = useI18n();
  const { data } = useData();

  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id || 'default';

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    sensor: 'pm25',
    operator: '>',
    threshold: 45,
    actuatorDevice: 'ESP32-Cairo-001',
    actuatorType: 'fan',
    actuatorCommand: 'on' as 'on' | 'off',
  });

  const [actuatorStatuses, setActuatorStatuses] = useState<ActuatorStatus[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [ntfyTopic, setNtfyTopic] = useState(localStorage.getItem('pern_ntfy_topic') || 'pern-platform-alerts-2026');

  // Load rules from backend API, fallback to localStorage
  useEffect(() => {
    apiClient.getAutomationRules().then(rows => {
      if (Array.isArray(rows) && rows.length > 0) {
        const parsed = rows
          .filter((r: any) => r.enabled)
          .map((r: any): AutomationRule => {
            let action = r.action;
            if (typeof action === 'string') {
              try { action = JSON.parse(action); } catch { action = null; }
            }
            return {
              id: r.id,
              name: r.name,
              sensor: r.sensor,
              operator: r.operator,
              threshold: Number(r.threshold),
              action: action?.device ? action : { device: 'unknown', actuator: 'relay', command: 'on', duration: 0 },
              priority: 5,
              enabled: r.enabled,
              cooldown: 300,
              lastTriggered: 0,
            };
          });
        setRules(parsed);
      } else {
        const saved = localStorage.getItem(`pern_${orgId}_automation_rules`);
        if (saved) {
          try { setRules(JSON.parse(saved)); } catch { /* empty */ }
        }
      }
    });
  }, [orgId]);

  useEffect(() => {
    localStorage.setItem(`pern_${orgId}_automation_rules`, JSON.stringify(rules));
  }, [rules, orgId]);

  const addLog = (msg: string) => {
    setLogs(prev => [new Date().toLocaleTimeString() + ' — ' + msg, ...prev].slice(0, 12));
  };

  const toggleRule = (id: string) => {
    const rule = rules.find(r => r.id === id);
    const newState = !rule?.enabled;

    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: newState } : r));

    logAuditEvent(
      newState ? 'enable_automation_rule' : 'disable_automation_rule',
      'automation',
      { ruleId: id, ruleName: rule?.name },
      'info'
    );
  };

  const deleteRule = async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    await apiClient.deleteAutomationRule(id);
    addLog(`Deleted rule ${id}`);
    showToast('Rule deleted', 'success');
  };

  const createRule = async () => {
    if (!newRule.name) return;
    const rulePayload = {
      name: newRule.name,
      sensor: newRule.sensor,
      operator: newRule.operator,
      threshold: newRule.threshold,
      action: { device: newRule.actuatorDevice, actuator: newRule.actuatorType, command: newRule.actuatorCommand, duration: 0 },
      enabled: true,
      organization_id: orgId,
    };
    const result = await apiClient.createAutomationRule(rulePayload) as any;
    if (result) {
      const parsed = typeof result.action === 'string' ? (() => { try { return JSON.parse(result.action); } catch { return result.action; } })() : result.action;
      setRules(prev => [...prev, {
        id: result.id,
        name: result.name,
        sensor: result.sensor,
        operator: result.operator,
        threshold: Number(result.threshold),
        action: parsed?.device ? parsed : rulePayload.action,
        priority: 5,
        enabled: true,
        cooldown: 300,
        lastTriggered: 0,
      }]);
      addLog(`Created rule: ${newRule.name}`);
      showToast('Rule created', 'success');
      setShowCreate(false);
      setNewRule({ name: '', sensor: 'pm25', operator: '>', threshold: 45, actuatorDevice: 'ESP32-Cairo-001', actuatorType: 'fan', actuatorCommand: 'on' });
    }
  };

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const interval = setInterval(() => {
      const d = dataRef.current;
      const current = { ...d.physical, ...d.virtualSensors.reduce((acc, vs) => { acc[vs.id] = vs.value; return acc; }, {} as any) };

      rules.forEach(rule => {
        const value = current[rule.sensor];
        if (value !== undefined) {
          executeAutomationRule(rule, value).then(triggered => {
            if (triggered) {
              addLog(`Executed: ${rule.name}`);
              notifyAutomationTrigger(rule.name, value);

              const newStatus: ActuatorStatus = {
                device: rule.action.device,
                actuator: rule.action.actuator,
                state: rule.action.command === 'on' ? 'on' : 'off',
                lastChanged: new Date().toISOString()
              };

              setActuatorStatuses(prev => {
                const filtered = prev.filter(s => !(s.device === newStatus.device && s.actuator === newStatus.actuator));
                return [...filtered, newStatus].slice(-8);
              });
            }
          });
        }
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [rules]);

  useEffect(() => {
    connectActuatorWebSocket();

    const unsubscribeWS = onActuatorStatus((status) => {
      const newStatus: ActuatorStatus = {
        device: status.device,
        actuator: status.actuator,
        state: status.state,
        lastChanged: new Date(status.timestamp).toISOString()
      };

      setActuatorStatuses(prev => {
        const filtered = prev.filter(s =>
          !(s.device === newStatus.device && s.actuator === newStatus.actuator)
        );
        return [...filtered, newStatus].slice(-8);
      });
    });

    const unsubscribeMQTT = mqttClient.onActuatorStatus((status) => {
      const newStatus: ActuatorStatus = {
        device: status.device,
        actuator: status.actuator,
        state: status.state,
        lastChanged: new Date(status.timestamp).toISOString()
      };

      setActuatorStatuses(prev => {
        const filtered = prev.filter(s =>
          !(s.device === newStatus.device && s.actuator === newStatus.actuator)
        );
        return [...filtered, newStatus].slice(-8);
      });
    });

    return () => {
      unsubscribeWS();
      unsubscribeMQTT();
    };
  }, []);

  const testNtfy = async () => {
    const success = await sendNtfyNotification({
      title: '🧪 PERN Automation Test',
      message: t('automation.ntfy.testMessage', undefined, { ehi: data.ehi }),
      priority: 4,
      tags: ['test', 'automation'],
      topic: ntfyTopic
    });

    if (success) {
      addLog('Test notification sent via ntfy.sh');
      showToast(t('automation.toast.testSent'), 'success');
    } else {
      addLog('Failed to send notification');
      showToast(t('automation.toast.testFailed'), 'error');
    }
  };

  const saveTopic = () => {
    localStorage.setItem('pern_ntfy_topic', ntfyTopic);
    addLog(`ntfy topic saved: ${ntfyTopic}`);
  };

  return (
    <div>
      <PageHeader
        title={t('automation.title')}
        subtitle={t('automation.subtitle')}
        right={
          <div className="flex items-center gap-2">
            <Btn variant="primary" onClick={testNtfy}>
              {t('automation.button.sendTestNotification')}
            </Btn>
          </div>
        }
      />

      <Card hover={false} className="mb-8">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="section-label block mb-1">{t('automation.label.ntfyTopic')}</label>
            <input
              type="text"
              value={ntfyTopic}
              onChange={(e) => setNtfyTopic(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] px-4 py-2 rounded-[var(--radius-sm)] w-full text-sm font-mono"
            />
          </div>
          <Btn variant="ghost" onClick={saveTopic} className="mt-5">
            {t('automation.button.saveTopic')}
          </Btn>
        </div>
      </Card>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>{t('automation.section.activeRules')}</SectionTitle>
          <Btn variant="ghost" onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 text-sm">
            <Plus size={14} /> New Rule
          </Btn>
        </div>

        {showCreate && (
          <Card hover={false} className="mb-3 border-[var(--emerald)]/30">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">Name</label>
                <input value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))} className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded text-sm" placeholder="Rule name" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">Sensor</label>
                <select value={newRule.sensor} onChange={e => setNewRule(p => ({ ...p, sensor: e.target.value }))} className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded text-sm">
                  {Object.entries(SENSOR_TYPES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">Condition</label>
                <div className="flex gap-1">
                  <select value={newRule.operator} onChange={e => setNewRule(p => ({ ...p, operator: e.target.value }))} className="bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 rounded text-sm w-16">
                    <option value=">">{`>`}</option><option value="<">{`<`}</option><option value=">=">{`>=`}</option><option value="<=">{`<=`}</option><option value="==">==</option>
                  </select>
                  <input type="number" value={newRule.threshold} onChange={e => setNewRule(p => ({ ...p, threshold: Number(e.target.value) }))} className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 rounded text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">Actuator</label>
                <div className="flex gap-1">
                  <select value={newRule.actuatorType} onChange={e => setNewRule(p => ({ ...p, actuatorType: e.target.value }))} className="bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 rounded text-sm flex-1">
                    <option>fan</option><option>pump</option><option>relay</option><option>buzzer</option><option>led</option>
                  </select>
                  <select value={newRule.actuatorCommand} onChange={e => setNewRule(p => ({ ...p, actuatorCommand: e.target.value as 'on' | 'off' }))} className="bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 rounded text-sm w-14">
                    <option value="on">ON</option><option value="off">OFF</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Btn variant="primary" onClick={createRule} className="text-xs">Create Rule</Btn>
              <Btn variant="ghost" onClick={() => setShowCreate(false)} className="text-xs">Cancel</Btn>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id} hover={false} className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{rule.name}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-px">
                   IF {SENSOR_TYPES[rule.sensor as keyof typeof SENSOR_TYPES]?.name ?? rule.sensor} {rule.operator} {rule.threshold} → {rule.action.actuator} {rule.action.command}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  checked={rule.enabled}
                  onChange={() => toggleRule(rule.id)}
                  label={rule.enabled ? t('automation.status.enabled') : t('automation.status.disabled')}
                />
                <button onClick={() => deleteRule(rule.id)} className="text-[var(--text-tertiary)] hover:text-[var(--rose)] transition-colors p-1" title="Delete rule">
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <SectionTitle className="flex items-center gap-2">
          {t('automation.section.actuatorStatus')}
          <Pill tone="emerald">{t('automation.badge.live')}</Pill>
        </SectionTitle>
        {actuatorStatuses.length === 0 ? (
          <Card hover={false} className="text-sm text-[var(--text-tertiary)] border-l-[3px] border-l-[var(--emerald)]">
            {t('automation.emptyState.noActuatorCommands')}
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 grid-entrance">
            {actuatorStatuses.map((status, i) => (
              <Card key={i} hover={false} className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-[var(--text-primary)]">{status.device} — {status.actuator}</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{t('automation.label.lastChanged')}{new Date(status.lastChanged).toLocaleTimeString()}</div>
                </div>
                <Pill tone={status.state === 'on' ? 'emerald' : 'slate'}>
                  {status.state.toUpperCase()}
                </Pill>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle>{t('automation.section.executionLog')}</SectionTitle>
        <Card hover={false} className="font-mono text-xs bg-black/40 p-4 h-52 overflow-auto">
          {logs.length === 0 ? (
            <div className="text-[var(--text-disabled)]">{t('automation.emptyState.logPlaceholder')}</div>
          ) : logs.map((log, i) => <div key={i} className="py-px text-[var(--text-secondary)]">{log}</div>)}
        </Card>
      </div>
    </div>
  );
}
