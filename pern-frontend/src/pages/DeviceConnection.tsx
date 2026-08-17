import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../lib/i18n';
import { mqttClient } from '../lib/mqtt-client';
import { MQTT_BROKER_WS } from '../lib/constants';
import { backendWs } from '../lib/ws-client';
import { apiClient } from '../lib/api-client';
import { useDevice } from '../lib/device-context';
import { DEVICE_PROFILES, DEVICE_CATEGORIES, getProfile, type DeviceCategory } from '../lib/device-profiles';
import { generateESP32Sketch, type SketchConfig } from '../lib/esp32-sketch-generator';
import { PageHeader, Btn, Pill, LiveBadge, Card, SectionTitle } from '../components/ui';
import {
  Plus, Wifi, WifiOff, Cpu, Radio, CheckCircle2, Clock, Copy, ChevronDown,
  Gauge, Download, Signal, Activity, Zap, ZapOff, Settings, RefreshCw, Terminal,
  Globe, KeyRound, ShieldCheck, Database, Server,
} from 'lucide-react';

const categoryTone: Record<DeviceCategory, 'emerald' | 'cyan' | 'blue' | 'violet'> = {
  MCU: 'emerald',
  Gateway: 'cyan',
  HTTP: 'blue',
  WebSocket: 'violet',
};

interface LiveTransport {
  active: boolean;
  messages: number;
  clients?: number;
  lastIngestAt?: number | null;
  lastMessageAt?: number | null;
}

interface LiveStatus {
  mqtt: boolean;
  websocketClients: number;
  db: string;
  devices: number;
  recentReadings: number;
  uptime: number;
  memoryUsage: number;
  timestamp: number;
  transports: {
    http: LiveTransport;
    mqtt: LiveTransport;
    websocket: LiveTransport;
    adapters: LiveTransport;
  };
  deviceAuth: { enforcementEnabled: boolean };
}

function fmtTime(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

function fmtUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function TransportRow({ name, status, icon }: { name: string; status: LiveTransport; icon: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
          {icon} {name}
        </span>
        {status.active
          ? <Pill tone="emerald">{t('deviceConnection.status.active', 'active')}</Pill>
          : <Pill tone="rose">{t('deviceConnection.status.inactive', 'inactive')}</Pill>}
      </div>
      <div className="mt-1.5 text-[10px] text-[var(--text-tertiary)] flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{status.messages ?? 0} msg</span>
        {typeof status.clients === 'number' && <span>{t('deviceConnection.clientsCount', '{count} client(s)', { count: status.clients })}</span>}
        <span>{t('deviceConnection.label.last', 'last: ')}{fmtTime(status.lastMessageAt ?? status.lastIngestAt)}</span>
      </div>
    </div>
  );
}

function LiveTransportCard({ liveStatus, mqttConnected, wsConnected }: { liveStatus: LiveStatus | null; mqttConnected: boolean; wsConnected: boolean }) {
  const { t } = useI18n();
  const tr = liveStatus?.transports;
  return (
    <Card hover={false} className="mb-6">
      <SectionTitle className="flex items-center gap-2">
        <Activity size={18} className="text-[var(--emerald)]" /> {t('deviceConnection.section.connectionHealth', 'Connection Health')}
        {liveStatus && (
          <span className="flex items-center gap-1.5 ml-auto text-[11px] font-normal text-[var(--text-tertiary)]">
            <RefreshCw size={11} /> {t('deviceConnection.label.polling5s', 'polling every 5s')}
          </span>
        )}
      </SectionTitle>
      {!liveStatus || !tr ? (
        <div className="py-6 text-center text-sm text-[var(--text-tertiary)]">
          {t('deviceConnection.status.backendUnreachable', 'Backend unreachable — no live transport telemetry.')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <TransportRow name="HTTP" status={{ ...tr.http, active: tr.http.active }} icon={<Globe size={12} />} />
            <TransportRow name="MQTT" status={{ ...tr.mqtt, active: mqttConnected || tr.mqtt.active }} icon={<Wifi size={12} />} />
            <TransportRow name="WebSocket" status={{ ...tr.websocket, active: wsConnected || tr.websocket.active }} icon={<Radio size={12} />} />
            <TransportRow name={t('deviceConnection.transport.adapters', 'Adapters')} status={tr.adapters} icon={<Cpu size={12} />} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
            <Pill tone={liveStatus.db === 'ok' ? 'emerald' : 'cyan'}>
              <Database size={11} /> {liveStatus.db === 'ok' ? 'PostgreSQL' : t('deviceConnection.status.inMemory', 'in-memory')}
            </Pill>
            <Pill tone="slate"><Server size={11} /> {t('deviceConnection.stats.readings', '{devices} device(s) · {readings} recent readings', { devices: liveStatus.devices, readings: liveStatus.recentReadings })}</Pill>
            <Pill tone="slate">{t('deviceConnection.label.uptimeLive', 'uptime {uptime}', { uptime: fmtUptime(liveStatus.uptime) })}</Pill>
            <Pill tone="slate">{t('deviceConnection.label.heapLive', '{memory} MB heap', { memory: liveStatus.memoryUsage })}</Pill>
            <Pill tone={liveStatus.deviceAuth?.enforcementEnabled ? 'amber' : 'slate'}>
              <ShieldCheck size={11} /> {t('deviceConnection.label.deviceAuth', 'device auth {state}', { state: liveStatus.deviceAuth?.enforcementEnabled ? t('deviceConnection.status.authEnforced', 'ENFORCED') : t('deviceConnection.status.authOpen', 'open') })}
            </Pill>
          </div>
        </>
      )}
    </Card>
  );
}

type Tab = 'connect' | 'wizard' | 'devices';

export default function DeviceConnection() {
  const { t } = useI18n();
  const { connectedDevices, registerRealDevice, selectedDevice, setSelectedDevice, getDeviceReadings } = useDevice();
  const [tab, setTab] = useState<Tab>('connect');
  const [brokerUrl, setBrokerUrl] = useState(MQTT_BROKER_WS);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceType, setDeviceType] = useState('ESP32');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>('ESP32');
  const [copied, setCopied] = useState(false);
  const [kindFilter, setKindFilter] = useState<DeviceCategory | 'all'>('all');
  const [baud, setBaud] = useState<number | null>(getProfile('ESP32').defaultBaud);

  // Health & actuator state
  const [deviceHealth, setDeviceHealth] = useState<Record<string, any>>({});
  const [actuatorStates, setActuatorStates] = useState<Record<string, Record<string, boolean>>>({});
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);

  // Wizard state
  const [wiz, setWiz] = useState<SketchConfig>({
    deviceId: 'ESP32-Cairo-001',
    wifiSsid: '',
    wifiPass: '',
    mqttServer: '192.168.1.100',
    mqttPort: 1883,
    sendInterval: 5000,
    sensors: ['tmp', 'hum', 'pm25', 'co2'],
    actuators: [],
    apiKey: '',
    serverUrl: '',
  });
  const [sketchCode, setSketchCode] = useState('');

  // Keep baud in sync
  useEffect(() => {
    const p = getProfile(deviceType);
    setBaud(p.baudRates ? p.defaultBaud : null);
  }, [deviceType]);

  useEffect(() => { setMqttConnected(mqttClient.isConnected()); }, []);

  // Poll backend /api/live/status for transport telemetry
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await apiClient.getLiveStatus();
        if (alive) setLiveStatus(s);
      } catch { /* backend offline */ }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // Connect to backend WebSocket for real-time broadcasts
  useEffect(() => {
    backendWs.connect();
    const unsubConn = backendWs.onConnectionChange(setWsConnected);
    return () => { unsubConn(); backendWs.disconnect(); };
  }, []);

  // Listen for heartbeats from both MQTT and backend WS
  useEffect(() => {
    const unsubMqtt = mqttClient.onSensorData((data) => {
      if (data.device) {
        setDeviceHealth(prev => ({
          ...prev,
          [data.device]: { ...prev[data.device], lastData: Date.now() },
        }));
      }
    });
    const unsubWs = backendWs.onDeviceHeartbeat((data) => {
      const id = data.deviceId || data.device;
      if (id) {
        setDeviceHealth(prev => ({
          ...prev,
          [id]: { ...prev[id], ...data, lastHeartbeat: Date.now() },
        }));
      }
    });
    const unsubSensor = backendWs.onSensorReading((data) => {
      if (data.device) {
        setDeviceHealth(prev => ({
          ...prev,
          [data.device]: { ...prev[data.device], lastData: Date.now() },
        }));
      }
    });
    return () => { unsubMqtt(); unsubWs(); unsubSensor(); };
  }, []);

  const connectBroker = async () => {
    setError(null);
    const success = await mqttClient.connect(brokerUrl);
    setMqttConnected(success);
    if (!success) setError(t('deviceConnection.error.brokerUnreachable', 'Could not reach the broker. Is Mosquitto WebSocket (9001) running?'));
  };

  const disconnectBroker = () => {
    mqttClient.disconnect();
    setMqttConnected(false);
  };

  const addDevice = () => {
    const id = deviceId.trim();
    if (!id) {
      setError(t('deviceConnection.error.deviceIdRequired', 'Enter a device ID (must match the topic pern/sensors/<deviceId>/data)'));
      return;
    }
    registerRealDevice(id, deviceType);
    setDeviceId('');
    setError(null);
  };

  const copyExample = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Fetch health for selected device (fallback when WS not connected)
  const fetchHealth = useCallback(async (id: string) => {
    try {
      const health = await apiClient.getDeviceHealth(id);
      if (health && health.device_id) {
        setDeviceHealth(prev => ({ ...prev, [id]: health }));
      }
    } catch { /* ignore */ }
  }, []);

  // Poll health for connected devices only when WS is not connected
  useEffect(() => {
    if (connectedDevices.length === 0 || wsConnected) return;
    const timer = setInterval(() => {
      connectedDevices.forEach(d => fetchHealth(d.id));
    }, 15000);
    connectedDevices.forEach(d => fetchHealth(d.id));
    return () => clearInterval(timer);
  }, [connectedDevices, fetchHealth, wsConnected]);

  // Actuator control
  const sendActuator = async (deviceId: string, actuator: string, action: string) => {
    try {
      await apiClient.sendActuatorCommand(deviceId, actuator, action);
      setActuatorStates(prev => ({
        ...prev,
        [deviceId]: { ...prev[deviceId], [actuator]: action === 'on' },
      }));
    } catch (err: any) {
      setError(t('deviceConnection.error.actuatorFailed', 'Actuator command failed: {message}', { message: err?.message }));
    }
  };

  // Generate sketch
  const generateSketch = () => {
    const code = generateESP32Sketch(wiz);
    setSketchCode(code);
  };

  const downloadSketch = () => {
    if (!sketchCode) generateSketch();
    const code = sketchCode || generateESP32Sketch(wiz);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wiz.deviceId || 'ESP32'}.ino`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const profile = getProfile(deviceType);
  const visibleProfiles = kindFilter === 'all'
    ? DEVICE_PROFILES
    : DEVICE_PROFILES.filter(p => p.category === kindFilter);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'connect', label: t('deviceConnection.tab.connect', 'Broker & Register'), icon: <Radio size={14} /> },
    { key: 'wizard', label: t('deviceConnection.tab.wizard', 'ESP32 Setup Wizard'), icon: <Terminal size={14} /> },
    { key: 'devices', label: t('deviceConnection.tab.devices', 'Devices ({count})', { count: connectedDevices.length }), icon: <Cpu size={14} /> },
  ];

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        title={t('deviceConnection.title', 'Device Connection Manager')}
        subtitle={t('deviceConnection.subtitle', 'Real MQTT + Virtual Sensor Compatibility')}
        right={
          <div className="flex items-center gap-2">
            <LiveBadge on={mqttConnected} label={mqttConnected ? 'MQTT' : 'MQTT'} />
            <LiveBadge on={wsConnected} label={wsConnected ? 'WS' : 'WS'} />
          </div>
        }
      />

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-[var(--surface)] p-1 rounded-[var(--radius-md)]">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium transition ${
              tab === tb.key
                ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>

      {/* ===== TAB: Broker & Register ===== */}
      {tab === 'connect' && (
        <>
          <LiveTransportCard liveStatus={liveStatus} mqttConnected={mqttConnected} wsConnected={wsConnected} />
          <div className="grid lg:grid-cols-2 gap-6 grid-entrance">
          <div className="space-y-6">
            <Card>
              <SectionTitle className="flex items-center gap-2"><Radio size={18} className="text-[var(--emerald)]" /> {t('deviceConnection.section.linkBroker', 'Link Broker')}</SectionTitle>
              <div className="text-xs text-[var(--text-tertiary)] mb-4">{t('deviceConnection.hint.topicFormat', 'Devices publish to pern/sensors/<deviceId>/data')}</div>

              <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.brokerUrl', 'MQTT Broker WebSocket URL')}</label>
              <input
                value={brokerUrl}
                onChange={e => setBrokerUrl(e.target.value)}
                className="block w-full mt-1 px-4 py-2.5 rounded-[var(--radius-sm)] font-mono text-sm"
              />

              <div className="flex gap-3 mt-4">
                <Btn variant="primary" onClick={connectBroker} disabled={mqttConnected}>{t('deviceConnection.button.connect', 'Connect')}</Btn>
                <Btn variant="ghost" onClick={disconnectBroker} disabled={!mqttConnected}>{t('deviceConnection.button.disconnect', 'Disconnect')}</Btn>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  {mqttConnected
                    ? <><Wifi size={16} className="text-[var(--emerald)]" /><span className="text-[var(--emerald)]">{t('deviceConnection.status.mqttLinked', 'MQTT broker linked')}</span></>
                    : <><WifiOff size={16} className="text-[var(--text-tertiary)]" /><span className="text-[var(--text-tertiary)]">{t('deviceConnection.status.mqttNotLinked', 'MQTT not linked')}</span></>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {wsConnected
                    ? <><Globe size={16} className="text-[var(--cyan)]" /><span className="text-[var(--cyan)]">{t('deviceConnection.status.wsConnected', 'Backend WS connected')}</span></>
                    : <><Globe size={16} className="text-[var(--text-tertiary)]" /><span className="text-[var(--text-tertiary)]">{t('deviceConnection.status.wsDisconnected', 'Backend WS disconnected')}</span></>}
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle className="flex items-center gap-2"><Plus size={18} className="text-[var(--emerald)]" /> {t('deviceConnection.section.registerDevice', 'Register a Device')}</SectionTitle>

              <div className="text-xs text-[var(--text-tertiary)] mb-2">{t('deviceConnection.label.deviceKind', 'Device kind')}</div>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => setKindFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs ${kindFilter === 'all' ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}
                >{t('deviceConnection.filter.all', 'All')}</button>
                {DEVICE_CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setKindFilter(c)}
                    className={`px-3 py-1.5 rounded-full text-xs ${kindFilter === c ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}
                  >{c}</button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <select
                  value={deviceType}
                  onChange={e => setDeviceType(e.target.value)}
                  className="col-span-2 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm"
                >
                  {visibleProfiles.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
                <input
                  value={deviceId}
                  onChange={e => setDeviceId(e.target.value)}
                  placeholder={t('deviceConnection.placeholder.deviceId', 'Device ID')}
                  className="px-3 py-2.5 rounded-[var(--radius-sm)] text-sm"
                />
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Gauge size={15} className="text-[var(--text-tertiary)]" />
                <span className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.baudRate', 'Baud rate')}</span>
                {profile.baudRates ? (
                  <select
                    value={baud ?? undefined}
                    onChange={e => setBaud(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm bg-[var(--surface)]"
                  >
                    {profile.baudRates.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                ) : (
                  <Pill tone="slate">{profile.link.includes('Ethernet') ? t('deviceConnection.transport.ethernetWifi', 'Ethernet/Wi-Fi') : t('deviceConnection.transport.ipEthernet', 'IP / Ethernet')}</Pill>
                )}
              </div>

              <Btn variant="primary" onClick={addDevice}><Plus size={16} /> {t('deviceConnection.button.addDevice', 'Add Device')}</Btn>
              <p className="text-xs text-[var(--text-tertiary)] mt-3">
                {t('deviceConnection.description.pendingPrefix', 'The device appears as ')}<span className="text-[var(--amber)]">{t('deviceConnection.status.pending', 'pending')}</span>{t('deviceConnection.description.pendingSuffix', ' until its first real reading arrives, then flips to ')}<span className="text-[var(--emerald)]">{t('deviceConnection.status.connected', 'connected')}</span>.
              </p>
            </Card>

            {/* Device type reference */}
            <Card>
              <SectionTitle className="flex items-center gap-2"><Cpu size={18} className="text-[var(--emerald)]" /> {t('deviceConnection.section.deviceTypes', 'Device Types & Wiring')}</SectionTitle>
              <div className="space-y-2">
                {visibleProfiles.map(p => {
                  const isOpen = expanded === p.type;
                  return (
                    <div key={p.type} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                      <button
                        onClick={() => setExpanded(isOpen ? null : p.type)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <div>
                          <div className="font-medium text-sm">{p.label}</div>
                          <div className="text-xs text-[var(--text-tertiary)]">{p.link}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill tone={categoryTone[p.category]}>{p.category}</Pill>
                          <Pill tone={p.protocol === 'MQTT' ? 'emerald' : p.protocol === 'HTTP' ? 'blue' : 'violet'}>{p.protocol}</Pill>
                          {isOpen ? <ChevronDown size={16} className="text-[var(--text-tertiary)] rotate-180" /> : <ChevronDown size={16} className="text-[var(--text-tertiary)]" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          <div className="text-xs text-[var(--text-tertiary)] mb-2 flex items-center gap-2">
                            <Gauge size={12} /> {p.baudRates ? t('deviceConnection.label.baudOptions', 'Baud: {baud} (options: {options})', { baud: p.defaultBaud ?? 0, options: p.baudRates.join(', ') }) : t('deviceConnection.label.naIpTransport', 'n/a — IP transport')}
                          </div>
                          <div className="text-xs text-[var(--text-tertiary)] mb-1">{t('deviceConnection.label.sensorsCount', 'Sensors ({count})', { count: p.sensorDetails.length })}</div>
                          <div className="grid grid-cols-2 gap-1.5 mb-3">
                            {p.sensorDetails.map(s => (
                              <div key={s.key} className="flex items-center justify-between text-[11px] bg-black/30 rounded-lg px-2 py-1">
                                <span className="text-[var(--text-secondary)]">{s.label}{s.unit ? ` (${s.unit})` : ''}</span>
                                <span className="text-[var(--text-disabled)] font-mono">{s.range}</span>
                              </div>
                            ))}
                          </div>
                          <pre className="text-[11px] leading-relaxed bg-black/40 rounded-[var(--radius-sm)] p-3 overflow-x-auto font-mono text-[var(--emerald)] whitespace-pre-wrap">{p.example(deviceId.trim() || 'DEVICE_ID', p.baudRates ? p.defaultBaud : null)}</pre>
                          <button
                            onClick={() => copyExample(p.example(deviceId.trim() || 'DEVICE_ID', p.baudRates ? p.defaultBaud : null))}
                            className="mt-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--emerald)] flex items-center gap-1"
                          >
                            <Copy size={12} /> {copied ? t('deviceConnection.button.copied', 'Copied!') : t('deviceConnection.button.copyExample', 'Copy example')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {error && (
              <div className="p-3 rounded-[var(--radius-md)] bg-[var(--rose-dim)] border border-[var(--rose-dim)] text-sm text-[var(--rose)]">{error}</div>
            )}
          </div>

          {/* Right column: connected devices */}
          <ConnectedDeviceList
            connectedDevices={connectedDevices}
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
            getDeviceReadings={getDeviceReadings}
            deviceHealth={deviceHealth}
            actuatorStates={actuatorStates}
            sendActuator={sendActuator}
            enforcementEnabled={liveStatus?.deviceAuth?.enforcementEnabled ?? false}
          />
          </div>
        </>
      )}

      {/* ===== TAB: ESP32 Setup Wizard ===== */}
      {tab === 'wizard' && (
        <div className="space-y-6 grid-entrance">
          <Card>
            <SectionTitle className="flex items-center gap-2"><Terminal size={18} className="text-[var(--emerald)]" /> {t('deviceConnection.section.quickSetup', 'ESP32 Quick Setup')}</SectionTitle>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('deviceConnection.description.wizardIntro', 'Fill in your WiFi and MQTT details below. The generated sketch includes bidirectional MQTT, actuator support, device heartbeat, HTTP fallback ingestion, and NTP timestamps — ready to upload via Arduino IDE.')}
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.deviceId', 'Device ID')}</label>
                <input value={wiz.deviceId} onChange={e => setWiz({ ...wiz, deviceId: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.sendInterval', 'Send Interval (ms)')}</label>
                <input type="number" value={wiz.sendInterval} onChange={e => setWiz({ ...wiz, sendInterval: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.wifiSsid', 'WiFi SSID')}</label>
                <input value={wiz.wifiSsid} onChange={e => setWiz({ ...wiz, wifiSsid: e.target.value })}
                  placeholder={t('deviceConnection.placeholder.wifiSsid', 'Your WiFi network name')} className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.wifiPass', 'WiFi Password')}</label>
                <input type="password" value={wiz.wifiPass} onChange={e => setWiz({ ...wiz, wifiPass: e.target.value })}
                  placeholder={t('deviceConnection.placeholder.wifiPass', 'Your WiFi password')} className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.mqttBrokerIp', 'MQTT Broker IP')}</label>
                <input value={wiz.mqttServer} onChange={e => setWiz({ ...wiz, mqttServer: e.target.value })}
                  placeholder="192.168.1.100" className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.mqttPort', 'MQTT Port')}</label>
                <input type="number" value={wiz.mqttPort} onChange={e => setWiz({ ...wiz, mqttPort: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.apiKey', 'Device API Key (optional)')}</label>
                <input value={wiz.apiKey} onChange={e => setWiz({ ...wiz, apiKey: e.target.value })}
                  placeholder={t('deviceConnection.placeholder.apiKey', 'pern_... issued on the Devices tab')} className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.backendUrl', 'Backend URL — HTTP fallback (optional)')}</label>
                <input value={wiz.serverUrl} onChange={e => setWiz({ ...wiz, serverUrl: e.target.value })}
                  placeholder="http://192.168.1.100:3000" className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-mono" />
              </div>
            </div>

            {/* Sensor selection */}
            <div className="mt-4">
              <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.sensors', 'Sensors')}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {['tmp', 'hum', 'pm25', 'co2', 'ph', 'tds', 'sm'].map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      const sensors = wiz.sensors.includes(s) ? wiz.sensors.filter(x => x !== s) : [...wiz.sensors, s];
                      setWiz({ ...wiz, sensors });
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      wiz.sensors.includes(s)
                        ? 'bg-[var(--emerald-dim)] border-[var(--emerald-glow)] text-[var(--emerald)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Actuator selection */}
            <div className="mt-4">
              <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.actuators', 'Actuators')}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {['relay1', 'relay2', 'led'].map(a => (
                  <button
                    key={a}
                    onClick={() => {
                      const actuators = wiz.actuators.includes(a) ? wiz.actuators.filter(x => x !== a) : [...wiz.actuators, a];
                      setWiz({ ...wiz, actuators });
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      wiz.actuators.includes(a)
                        ? 'bg-[var(--amber-dim)] border-[var(--amber)] text-[var(--amber)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {a.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Btn variant="primary" onClick={generateSketch}><Activity size={16} /> {t('deviceConnection.button.generateSketch', 'Generate Sketch')}</Btn>
              <Btn variant="ghost" onClick={downloadSketch}><Download size={16} /> {t('deviceConnection.button.downloadIno', 'Download .ino')}</Btn>
            </div>
          </Card>

          {/* Generated sketch output */}
          {sketchCode && (
            <Card>
              <SectionTitle className="flex items-center gap-2">
                <Terminal size={18} className="text-[var(--emerald)]" /> {t('deviceConnection.section.generatedSketch', 'Generated Sketch')}
                <Pill tone="emerald">{t('deviceConnection.pill.sensorActuatorCount', '{sensors} sensors, {actuators} actuators', { sensors: wiz.sensors.length, actuators: wiz.actuators.length })}</Pill>
              </SectionTitle>
              <div className="relative">
                <pre className="text-[11px] leading-relaxed bg-black/40 rounded-[var(--radius-sm)] p-4 overflow-x-auto font-mono text-[var(--emerald)] max-h-[500px] overflow-y-auto whitespace-pre-wrap">{sketchCode}</pre>
                <button
                  onClick={() => copyExample(sketchCode)}
                  className="absolute top-2 right-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--emerald)] flex items-center gap-1 transition"
                >
                  <Copy size={12} /> {copied ? t('deviceConnection.button.copied', 'Copied!') : t('deviceConnection.button.copy', 'Copy')}
                </button>
              </div>
              <div className="mt-3 p-3 rounded-[var(--radius-sm)] bg-[var(--emerald-dim)] border border-[var(--emerald-glow)] text-xs text-[var(--emerald)]">
                <strong>{t('deviceConnection.nextSteps', 'Next steps: 1) Open Arduino IDE → 2) Paste or open the downloaded .ino → 3) Install libraries (PubSubClient, ArduinoJson, DHT) → 4) Select board "ESP32 Dev Module" → 5) Upload')}</strong>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ===== TAB: Devices ===== */}
      {tab === 'devices' && (
        <div className="grid-entrance">
          <ConnectedDeviceList
            connectedDevices={connectedDevices}
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
            getDeviceReadings={getDeviceReadings}
            deviceHealth={deviceHealth}
            actuatorStates={actuatorStates}
            sendActuator={sendActuator}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Connected Device List (shared between tabs)
// ============================================================

function ConnectedDeviceList({
  connectedDevices, selectedDevice, setSelectedDevice, getDeviceReadings,
  deviceHealth, actuatorStates, sendActuator, enforcementEnabled,
}: {
  connectedDevices: any[];
  selectedDevice: any;
  setSelectedDevice: (d: any) => void;
  getDeviceReadings: (id: string) => any;
  deviceHealth: Record<string, any>;
  actuatorStates: Record<string, Record<string, boolean>>;
  sendActuator: (deviceId: string, actuator: string, action: string) => void;
  enforcementEnabled?: boolean;
}) {
  const { t } = useI18n();
  const pending = connectedDevices.filter(d => d.status === 'pending').length;

  interface DeviceApiKeyState { hasKey: boolean; plaintext?: string; busy?: boolean; }
  const [apiKeyStates, setApiKeyStates] = useState<Record<string, DeviceApiKeyState>>({});

  const issueKey = async (id: string) => {
    setApiKeyStates(prev => ({ ...prev, [id]: { ...prev[id], busy: true } }));
    try {
      const res = await apiClient.issueDeviceApiKey(id);
      setApiKeyStates(prev => ({ ...prev, [id]: { hasKey: true, plaintext: res?.apiKey || '', busy: false } }));
    } catch {
      setApiKeyStates(prev => ({ ...prev, [id]: { hasKey: false, busy: false } }));
    }
  };

  const revokeKey = async (id: string) => {
    setApiKeyStates(prev => ({ ...prev, [id]: { ...prev[id], busy: true } }));
    try {
      await apiClient.revokeDeviceApiKey(id);
      setApiKeyStates(prev => ({ ...prev, [id]: { hasKey: false, busy: false } }));
    } catch {
      setApiKeyStates(prev => ({ ...prev, [id]: { ...prev[id], busy: false } }));
    }
  };

  const copyApiKey = (id: string) => {
    const k = apiKeyStates[id]?.plaintext;
    if (k) navigator.clipboard?.writeText(k).catch(() => {});
  };

  // Runtime config + OTA state
  interface DeviceConfigState { loaded?: boolean; form?: { interval: number; sensors: Record<string, boolean> }; ack?: any; }
  interface OtaState { status: string; percent: number; message: string; }
  const [configs, setConfigs] = useState<Record<string, DeviceConfigState>>({});
  const [otaStates, setOtaStates] = useState<Record<string, OtaState>>({});
  const [otaFiles, setOtaFiles] = useState<Record<string, string>>({});
  const [otaFileNames, setOtaFileNames] = useState<Record<string, string>>({});
  const [configBusy, setConfigBusy] = useState<Record<string, boolean>>({});
  const [otaBusy, setOtaBusy] = useState<Record<string, boolean>>({});
  const [otaVersion, setOtaVersion] = useState('');

  // Fetch the desired config once per selected device
  useEffect(() => {
    const id = selectedDevice?.id;
    if (!id || configs[id]?.loaded) return;
    apiClient.getDeviceConfig(id).then(res => {
      setConfigs(prev => ({
        ...prev,
        [id]: {
          loaded: true,
          form: {
            interval: res?.config?.interval ?? 15000,
            sensors: res?.config?.sensors || {},
          },
          ack: res?.lastConfigPush ? { applied: true, pushedAt: res.lastConfigPush } : undefined,
        },
      }));
    }).catch(() => {
      setConfigs(prev => ({ ...prev, [id]: { loaded: true, form: { interval: 15000, sensors: {} } } }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice?.id]);

  // Live OTA + config-ack feedback from the backend WebSocket
  useEffect(() => {
    const unsubOta = backendWs.onOtaStatus((data) => {
      if (data.device) {
        setOtaStates(prev => ({ ...prev, [data.device]: { status: data.state || 'unknown', percent: data.percent ?? 0, message: data.message || '' } }));
      }
    });
    const unsubAck = backendWs.onConfigAck((data) => {
      if (data.device) {
        setConfigs(prev => ({ ...prev, [data.device]: { ...prev[data.device], ack: data } }));
      }
    });
    return () => { unsubOta(); unsubAck(); };
  }, []);

  const applyConfig = async (id: string) => {
    const form = configs[id]?.form;
    if (!form) return;
    setConfigBusy(prev => ({ ...prev, [id]: true }));
    try {
      await apiClient.sendDeviceConfig(id, { interval: form.interval, sensors: form.sensors });
      setConfigs(prev => ({ ...prev, [id]: { ...prev[id], ack: { applied: true, message: t('deviceConnection.status.pushedAwaitingAck', 'Pushed — awaiting device ACK') } } }));
    } catch (err: any) {
      setConfigs(prev => ({ ...prev, [id]: { ...prev[id], ack: { applied: false, message: err?.message } } }));
    } finally {
      setConfigBusy(prev => ({ ...prev, [id]: false }));
    }
  };

  const onOtaFile = (id: string, file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result).split(',')[1] || '';
      setOtaFiles(prev => ({ ...prev, [id]: b64 }));
      setOtaFileNames(prev => ({ ...prev, [id]: file.name }));
      setOtaStates(prev => ({ ...prev, [id]: { status: 'idle', percent: 0, message: t('deviceConnection.status.fileReady', '{name} ready ({chars} b64 chars)', { name: file.name, chars: b64.length.toLocaleString() }) } }));
    };
    reader.readAsDataURL(file);
  };

  const pushOta = async (id: string) => {
    const b64 = otaFiles[id];
    if (!b64) return;
    setOtaBusy(prev => ({ ...prev, [id]: true }));
    setOtaStates(prev => ({ ...prev, [id]: { status: 'pushing', percent: 0, message: t('deviceConnection.status.otaSending', 'Sending firmware chunks over MQTT…') } }));
    try {
      const res = await apiClient.pushOta(id, b64, otaVersion || undefined);
      setOtaStates(prev => ({ ...prev, [id]: { status: 'queued', percent: 0, message: t('deviceConnection.status.otaSent', '{count} chunks sent — awaiting device status…', { count: res.totalChunks }) } }));
    } catch (err: any) {
      setOtaStates(prev => ({ ...prev, [id]: { status: 'error', percent: 0, message: err?.message } }));
    } finally {
      setOtaBusy(prev => ({ ...prev, [id]: false }));
    }
  };

  const otaTone = (s: string): 'emerald' | 'amber' | 'rose' | 'slate' => {
    if (s === 'done' || s === 'success') return 'emerald';
    if (s === 'progress' || s === 'begin' || s === 'pushing' || s === 'queued') return 'amber';
    if (s === 'error' || s === 'failed') return 'rose';
    return 'slate';
  };

  return (
    <Card>
      <SectionTitle className="flex items-center gap-2"><Cpu size={18} className="text-[var(--emerald)]" /> {t('deviceConnection.section.connectedDevices', 'Connected Devices')}</SectionTitle>
      <div className="text-xs text-[var(--text-tertiary)] mb-4">
        {connectedDevices.length === 0
          ? t('deviceConnection.emptyState.noDevices', 'None yet — link the broker and a device will appear the moment it sends real data.')
          : t('deviceConnection.listSummary', '{count} device(s) · {pending} pending first reading', { count: connectedDevices.length, pending })}
      </div>

      <div className="space-y-3">
        {connectedDevices.map(d => {
          const dp = getProfile(d.type);
          const readings = getDeviceReadings(d.id);
          const health = deviceHealth[d.id];
          const actState = actuatorStates[d.id] || {};
          const isSelected = selectedDevice?.id === d.id;

          return (
            <div key={d.id}
              className={`rounded-[var(--radius-md)] border transition ${isSelected ? 'border-[var(--emerald-glow)] bg-[var(--emerald-dim)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}
            >
              {/* Device header */}
              <button
                onClick={() => setSelectedDevice(d)}
                className="w-full text-left p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{d.name}</div>
                  {d.status === 'connected'
                    ? <Pill tone="emerald"><CheckCircle2 size={12} /> {t('deviceConnection.status.connected', 'connected')}</Pill>
                    : <Pill tone="amber"><Clock size={12} /> {t('deviceConnection.status.pending', 'pending')}</Pill>}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1 flex items-center gap-2 flex-wrap">
                  <Pill tone={categoryTone[dp.category]}>{dp.category}</Pill>
                  <Pill tone={dp.protocol === 'MQTT' ? 'emerald' : dp.protocol === 'HTTP' ? 'blue' : 'violet'}>{dp.protocol}</Pill>
                  <span>{t('deviceConnection.label.lastSeen', 'last seen {time}', { time: new Date(d.lastSeen).toLocaleTimeString() })}</span>
                </div>
              </button>

              {/* Health bar (when device has heartbeat data) */}
              {health && health.rssi != null && (
                <div className="px-3 pb-2 flex flex-wrap gap-3 text-[10px] text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1"><Signal size={10} /> {t('deviceConnection.label.rssi', 'RSSI: {value} dBm', { value: health.rssi })}</span>
                  <span className="flex items-center gap-1"><Activity size={10} /> {t('deviceConnection.label.heapHealth', 'Heap: ')}{health.free_heap ? `${(health.free_heap / 1024).toFixed(0)}KB` : '?'}</span>
                  <span className="flex items-center gap-1"><Clock size={10} /> {t('deviceConnection.label.uptimeHealth', 'Uptime: ')}{health.uptime_seconds ? `${Math.floor(health.uptime_seconds / 60)}m` : '?'}</span>
                  {health.firmware_version && <span className="flex items-center gap-1"><Cpu size={10} /> {t('deviceConnection.label.fwHealth', 'FW: ')}{health.firmware_version}</span>}
                  {health.ip_address && <span className="flex items-center gap-1"><Wifi size={10} /> {health.ip_address}</span>}
                </div>
              )}

              {/* Sensor readings */}
              {readings && (
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                  {Object.entries(readings.sensors).slice(0, 8).map(([k, v]) => (
                    <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-black/30 text-[var(--text-secondary)] font-mono">{k}: {typeof v === 'number' ? v.toFixed(1) : String(v)}</span>
                  ))}
                </div>
              )}

              {/* Actuator controls */}
              {isSelected && dp.sensors.length > 0 && (
                <div className="px-3 pb-3 border-t border-[var(--border)] pt-2 mt-1">
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5">{t('deviceConnection.label.actuators', 'Actuators')}</div>
                  <div className="flex gap-2">
                    {['relay1', 'relay2', 'led'].map(a => {
                      const isOn = actState[a] ?? false;
                      return (
                        <button
                          key={a}
                          onClick={() => sendActuator(d.id, a, isOn ? 'off' : 'on')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium border transition ${
                            isOn
                              ? 'bg-[var(--amber-dim)] border-[var(--amber)] text-[var(--amber)]'
                              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                          }`}
                        >
                          {isOn ? <Zap size={12} /> : <ZapOff size={12} />}
                          {a.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Device API key management */}
              {isSelected && (
                <div className="px-3 pb-3 border-t border-[var(--border)] pt-2 mt-1">
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1.5">
                    <KeyRound size={10} /> {t('deviceConnection.section.deviceApiKey', 'Device API Key')}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={apiKeyStates[d.id]?.hasKey ? 'emerald' : 'slate'}>
                      {apiKeyStates[d.id]?.hasKey ? t('deviceConnection.status.keySet', 'key set') : t('deviceConnection.status.noKey', 'no key')}
                    </Pill>
                    <button
                      onClick={() => issueKey(d.id)}
                      disabled={apiKeyStates[d.id]?.busy || apiKeyStates[d.id]?.hasKey}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium border transition disabled:opacity-50 bg-[var(--emerald-dim)] border-[var(--emerald-glow)] text-[var(--emerald)]"
                    >
                      <KeyRound size={12} /> {apiKeyStates[d.id]?.busy ? t('deviceConnection.button.issuing', 'Issuing…') : t('deviceConnection.button.issueKey', 'Issue key')}
                    </button>
                    {apiKeyStates[d.id]?.hasKey && (
                      <button
                        onClick={() => revokeKey(d.id)}
                        disabled={apiKeyStates[d.id]?.busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium border border-[var(--rose-dim)] text-[var(--rose)] transition disabled:opacity-50"
                      >
                        {t('deviceConnection.button.revoke', 'Revoke')}
                      </button>
                    )}
                  </div>
                  {apiKeyStates[d.id]?.plaintext && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 text-[10px] font-mono bg-black/40 border border-[var(--border)] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[var(--amber)] break-all">
                        {apiKeyStates[d.id].plaintext}
                      </code>
                      <button
                        onClick={() => copyApiKey(d.id)}
                        className="text-[var(--text-tertiary)] hover:text-[var(--emerald)] transition"
                        title={t('deviceConnection.title.copy', 'Copy')}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  )}
                  {enforcementEnabled && (
                    <div className="mt-1.5 text-[10px] text-[var(--amber)] flex items-center gap-1">
                      <ShieldCheck size={10} /> {t('deviceConnection.description.authEnforced', 'Device auth is enforced — HTTP devices must send this key in X-Api-Key.')}
                    </div>
                  )}
                </div>
              )}

              {/* Runtime config push (MQTT) */}
              {isSelected && dp.protocol === 'MQTT' && (
                <div className="px-3 pb-3 border-t border-[var(--border)] pt-2 mt-1">
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1.5">
                    <Settings size={10} /> {t('deviceConnection.section.runtimeConfig', 'Runtime Config (MQTT push)')}
                  </div>
                  {configs[d.id]?.form && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[10px] text-[var(--text-secondary)]">{t('deviceConnection.label.interval', 'Interval (ms)')}</label>
                      <input
                        type="number"
                        value={configs[d.id].form?.interval ?? 15000}
                        onChange={e => setConfigs(prev => ({ ...prev, [d.id]: { ...prev[d.id], form: { ...(prev[d.id]?.form || { interval: 15000, sensors: {} }), interval: Number(e.target.value) } } }))}
                        className="w-28 px-2 py-1 rounded-[var(--radius-sm)] text-xs font-mono"
                      />
                      {['tmp', 'hum', 'pm25', 'co2', 'ph', 'tds', 'sm'].map(sk => {
                        const enabled = configs[d.id].form?.sensors?.[sk];
                        return (
                          <button
                            key={sk}
                            onClick={() => setConfigs(prev => ({
                              ...prev,
                              [d.id]: {
                                ...prev[d.id],
                                form: {
                                  ...(prev[d.id]?.form || { interval: 15000, sensors: {} }),
                                  sensors: { ...(prev[d.id]?.form?.sensors || {}), [sk]: !enabled },
                                },
                              },
                            }))}
                            className={`px-2 py-1 rounded-full text-[10px] border transition ${
                              enabled
                                ? 'bg-[var(--emerald-dim)] border-[var(--emerald-glow)] text-[var(--emerald)]'
                                : 'border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {sk.toUpperCase()}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => applyConfig(d.id)}
                        disabled={configBusy[d.id]}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium border transition disabled:opacity-50 bg-[var(--emerald-dim)] border-[var(--emerald-glow)] text-[var(--emerald)]"
                      >
                        <Settings size={12} /> {configBusy[d.id] ? t('deviceConnection.button.pushing', 'Pushing…') : t('deviceConnection.button.applyConfig', 'Apply config')}
                      </button>
                    </div>
                  )}
                  {configs[d.id]?.ack && (
                    <div className="mt-1.5 text-[10px] flex items-center gap-1">
                      {configs[d.id].ack.applied || configs[d.id].ack.accepted ? (
                        <span className="text-[var(--emerald)] flex items-center gap-1"><CheckCircle2 size={10} /> {configs[d.id].ack.message || t('deviceConnection.status.configAccepted', 'Config accepted by device')}</span>
                      ) : (
                        <span className="text-[var(--rose)] flex items-center gap-1">{t('deviceConnection.status.pushFailed', 'Push failed: {message}', { message: configs[d.id].ack.message })}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MQTT OTA update */}
              {isSelected && dp.protocol === 'MQTT' && (
                <div className="px-3 pb-3 border-t border-[var(--border)] pt-2 mt-1">
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1.5">
                    <RefreshCw size={10} /> {t('deviceConnection.section.firmwareUpdate', 'Firmware Update (MQTT OTA)')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[10px] text-[var(--text-secondary)]">{t('deviceConnection.label.version', 'Version')}</label>
                    <input
                      value={otaVersion}
                      onChange={e => setOtaVersion(e.target.value)}
                      placeholder="v1.0.0"
                      className="w-24 px-2 py-1 rounded-[var(--radius-sm)] text-xs font-mono"
                    />
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium border cursor-pointer transition text-[var(--text-secondary)] hover:border-[var(--text-secondary)]">
                      <Download size={12} /> {otaFileNames[d.id] || t('deviceConnection.button.chooseBin', 'Choose .bin')}
                      <input type="file" accept=".bin,application/octet-stream" className="hidden" onChange={e => onOtaFile(d.id, e.target.files?.[0])} />
                    </label>
                    <button
                      onClick={() => pushOta(d.id)}
                      disabled={otaBusy[d.id] || !otaFiles[d.id]}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium border transition disabled:opacity-50 bg-[var(--amber-dim)] border-[var(--amber)] text-[var(--amber)]"
                    >
                      <RefreshCw size={12} className={otaBusy[d.id] ? 'animate-spin' : ''} /> {otaBusy[d.id] ? t('deviceConnection.button.pushing', 'Pushing…') : t('deviceConnection.button.pushOta', 'Push OTA')}
                    </button>
                    {otaStates[d.id] && (
                      <Pill tone={otaTone(otaStates[d.id].status)}>
                        {otaStates[d.id].status}
                        {otaStates[d.id].percent > 0 && otaStates[d.id].percent < 100 ? ` ${otaStates[d.id].percent}%` : ''}
                      </Pill>
                    )}
                  </div>
                  {otaStates[d.id]?.message && (
                    <div className="mt-1.5 text-[10px] text-[var(--text-tertiary)] break-all">{otaStates[d.id].message}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {connectedDevices.length === 0 && (
          <div className="text-center text-[var(--text-disabled)] text-sm py-10 border border-dashed border-[var(--border)] rounded-[var(--radius-md)]">
            {t('deviceConnection.emptyState.awaitingData', 'Awaiting real device data…')}
          </div>
        )}
      </div>
    </Card>
  );
}
