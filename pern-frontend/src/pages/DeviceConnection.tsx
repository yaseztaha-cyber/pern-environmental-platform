import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../lib/i18n';
import { mqttClient } from '../lib/mqtt-client';
import { apiClient } from '../lib/api-client';
import { useDevice } from '../lib/device-context';
import { DEVICE_PROFILES, DEVICE_CATEGORIES, getProfile, type DeviceCategory } from '../lib/device-profiles';
import { generateESP32Sketch, type SketchConfig } from '../lib/esp32-sketch-generator';
import { PageHeader, Btn, Pill, LiveBadge, Card, SectionTitle } from '../components/ui';
import {
  Plus, Wifi, WifiOff, Cpu, Radio, CheckCircle2, Clock, Copy, ChevronDown, ChevronRight,
  Gauge, Download, Heart, Signal, Activity, Zap, ZapOff, Settings, RefreshCw, Terminal,
} from 'lucide-react';

const categoryTone: Record<DeviceCategory, 'emerald' | 'cyan' | 'blue' | 'violet'> = {
  MCU: 'emerald',
  Gateway: 'cyan',
  HTTP: 'blue',
  WebSocket: 'violet',
};

type Tab = 'connect' | 'wizard' | 'devices';

export default function DeviceConnection() {
  const { t } = useI18n();
  const { connectedDevices, registerRealDevice, selectedDevice, setSelectedDevice, getDeviceReadings } = useDevice();
  const [tab, setTab] = useState<Tab>('connect');
  const [brokerUrl, setBrokerUrl] = useState('ws://localhost:9001');
  const [connected, setConnected] = useState(false);
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
  });
  const [sketchCode, setSketchCode] = useState('');

  // Keep baud in sync
  useEffect(() => {
    const p = getProfile(deviceType);
    setBaud(p.baudRates ? p.defaultBaud : null);
  }, [deviceType]);

  useEffect(() => { setConnected(mqttClient.isConnected()); }, []);

  // Listen for heartbeats
  useEffect(() => {
    const unsub = mqttClient.onSensorData((data) => {
      // Touch device health when data arrives
      if (data.device) {
        setDeviceHealth(prev => ({
          ...prev,
          [data.device]: { ...prev[data.device], lastData: Date.now() },
        }));
      }
    });
    return unsub;
  }, []);

  const connectBroker = async () => {
    setError(null);
    const success = await mqttClient.connect(brokerUrl);
    setConnected(success);
    if (!success) setError('Could not reach the broker. Is Mosquitto WebSocket (9001) running?');
  };

  const disconnectBroker = () => {
    mqttClient.disconnect();
    setConnected(false);
  };

  const addDevice = () => {
    const id = deviceId.trim();
    if (!id) {
      setError('Enter a device ID (must match the topic pern/sensors/<deviceId>/data)');
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

  // Fetch health for selected device
  const fetchHealth = useCallback(async (id: string) => {
    try {
      const health = await apiClient.getDeviceHealth(id);
      if (health && health.device_id) {
        setDeviceHealth(prev => ({ ...prev, [id]: health }));
      }
    } catch { /* ignore */ }
  }, []);

  // Poll health for connected devices
  useEffect(() => {
    if (connectedDevices.length === 0) return;
    const timer = setInterval(() => {
      connectedDevices.forEach(d => fetchHealth(d.id));
    }, 15000);
    connectedDevices.forEach(d => fetchHealth(d.id));
    return () => clearInterval(timer);
  }, [connectedDevices, fetchHealth]);

  // Actuator control
  const sendActuator = async (deviceId: string, actuator: string, action: string) => {
    try {
      await apiClient.sendActuatorCommand(deviceId, actuator, action);
      setActuatorStates(prev => ({
        ...prev,
        [deviceId]: { ...prev[deviceId], [actuator]: action === 'on' },
      }));
    } catch (err: any) {
      setError(`Actuator command failed: ${err?.message}`);
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

  const pending = connectedDevices.filter(d => d.status === 'pending').length;
  const profile = getProfile(deviceType);
  const visibleProfiles = kindFilter === 'all'
    ? DEVICE_PROFILES
    : DEVICE_PROFILES.filter(p => p.category === kindFilter);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'connect', label: 'Broker & Register', icon: <Radio size={14} /> },
    { key: 'wizard', label: 'ESP32 Setup Wizard', icon: <Terminal size={14} /> },
    { key: 'devices', label: `Devices (${connectedDevices.length})`, icon: <Cpu size={14} /> },
  ];

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        title={t('deviceConnection.title')}
        subtitle={t('deviceConnection.subtitle')}
        right={<LiveBadge on={connected} label={connected ? 'BROKER LINKED' : 'OFFLINE'} />}
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
        <div className="grid lg:grid-cols-2 gap-6 grid-entrance">
          <div className="space-y-6">
            <Card>
              <SectionTitle className="flex items-center gap-2"><Radio size={18} className="text-[var(--emerald)]" /> Link Broker</SectionTitle>
              <div className="text-xs text-[var(--text-tertiary)] mb-4">Devices publish to pern/sensors/&lt;deviceId&gt;/data</div>

              <label className="text-xs text-[var(--text-tertiary)]">{t('deviceConnection.label.brokerUrl')}</label>
              <input
                value={brokerUrl}
                onChange={e => setBrokerUrl(e.target.value)}
                className="block w-full mt-1 px-4 py-2.5 rounded-[var(--radius-sm)] font-mono text-sm"
              />

              <div className="flex gap-3 mt-4">
                <Btn variant="primary" onClick={connectBroker} disabled={connected}>{t('deviceConnection.button.connect')}</Btn>
                <Btn variant="ghost" onClick={disconnectBroker} disabled={!connected}>{t('deviceConnection.button.disconnect')}</Btn>
              </div>

              <div className="mt-4 text-sm flex items-center gap-2">
                {connected
                  ? <><Wifi size={16} className="text-[var(--emerald)]" /><span className="text-[var(--emerald)]">Linked to broker</span></>
                  : <><WifiOff size={16} className="text-[var(--text-tertiary)]" /><span className="text-[var(--text-tertiary)]">Not linked</span></>}
              </div>
            </Card>

            <Card>
              <SectionTitle className="flex items-center gap-2"><Plus size={18} className="text-[var(--emerald)]" /> Register a Device</SectionTitle>

              <div className="text-xs text-[var(--text-tertiary)] mb-2">Device kind</div>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => setKindFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs ${kindFilter === 'all' ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}
                >All</button>
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
                  placeholder="Device ID"
                  className="px-3 py-2.5 rounded-[var(--radius-sm)] text-sm"
                />
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Gauge size={15} className="text-[var(--text-tertiary)]" />
                <span className="text-xs text-[var(--text-tertiary)]">Baud rate</span>
                {profile.baudRates ? (
                  <select
                    value={baud ?? undefined}
                    onChange={e => setBaud(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm bg-[var(--surface)]"
                  >
                    {profile.baudRates.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                ) : (
                  <Pill tone="slate">{profile.link.includes('Ethernet') ? 'Ethernet/Wi-Fi' : 'IP / Ethernet'}</Pill>
                )}
              </div>

              <Btn variant="primary" onClick={addDevice}><Plus size={16} /> Add Device</Btn>
              <p className="text-xs text-[var(--text-tertiary)] mt-3">
                The device appears as <span className="text-[var(--amber)]">pending</span> until its first real reading arrives, then flips to <span className="text-[var(--emerald)]">connected</span>.
              </p>
            </Card>

            {/* Device type reference */}
            <Card>
              <SectionTitle className="flex items-center gap-2"><Cpu size={18} className="text-[var(--emerald)]" /> Device Types &amp; Wiring</SectionTitle>
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
                            <Gauge size={12} /> Baud: {p.baudRates ? `${p.defaultBaud} (options: ${p.baudRates.join(', ')})` : 'n/a — IP transport'}
                          </div>
                          <div className="text-xs text-[var(--text-tertiary)] mb-1">Sensors ({p.sensorDetails.length})</div>
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
                            <Copy size={12} /> {copied ? 'Copied!' : 'Copy example'}
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
          />
        </div>
      )}

      {/* ===== TAB: ESP32 Setup Wizard ===== */}
      {tab === 'wizard' && (
        <div className="space-y-6 grid-entrance">
          <Card>
            <SectionTitle className="flex items-center gap-2"><Terminal size={18} className="text-[var(--emerald)]" /> ESP32 Quick Setup</SectionTitle>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Fill in your WiFi and MQTT details below. The generated sketch includes bidirectional MQTT, actuator support, and device heartbeat — ready to upload via Arduino IDE.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">Device ID</label>
                <input value={wiz.deviceId} onChange={e => setWiz({ ...wiz, deviceId: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">Send Interval (ms)</label>
                <input type="number" value={wiz.sendInterval} onChange={e => setWiz({ ...wiz, sendInterval: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">WiFi SSID</label>
                <input value={wiz.wifiSsid} onChange={e => setWiz({ ...wiz, wifiSsid: e.target.value })}
                  placeholder="Your WiFi network name" className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">WiFi Password</label>
                <input type="password" value={wiz.wifiPass} onChange={e => setWiz({ ...wiz, wifiPass: e.target.value })}
                  placeholder="Your WiFi password" className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">MQTT Broker IP</label>
                <input value={wiz.mqttServer} onChange={e => setWiz({ ...wiz, mqttServer: e.target.value })}
                  placeholder="192.168.1.100" className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]">MQTT Port</label>
                <input type="number" value={wiz.mqttPort} onChange={e => setWiz({ ...wiz, mqttPort: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm" />
              </div>
            </div>

            {/* Sensor selection */}
            <div className="mt-4">
              <label className="text-xs text-[var(--text-tertiary)]">Sensors</label>
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
              <label className="text-xs text-[var(--text-tertiary)]">Actuators</label>
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
              <Btn variant="primary" onClick={generateSketch}><Activity size={16} /> Generate Sketch</Btn>
              <Btn variant="ghost" onClick={downloadSketch}><Download size={16} /> Download .ino</Btn>
            </div>
          </Card>

          {/* Generated sketch output */}
          {sketchCode && (
            <Card>
              <SectionTitle className="flex items-center gap-2">
                <Terminal size={18} className="text-[var(--emerald)]" /> Generated Sketch
                <Pill tone="emerald">{wiz.sensors.length} sensors, {wiz.actuators.length} actuators</Pill>
              </SectionTitle>
              <div className="relative">
                <pre className="text-[11px] leading-relaxed bg-black/40 rounded-[var(--radius-sm)] p-4 overflow-x-auto font-mono text-[var(--emerald)] max-h-[500px] overflow-y-auto whitespace-pre-wrap">{sketchCode}</pre>
                <button
                  onClick={() => copyExample(sketchCode)}
                  className="absolute top-2 right-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--emerald)] flex items-center gap-1 transition"
                >
                  <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="mt-3 p-3 rounded-[var(--radius-sm)] bg-[var(--emerald-dim)] border border-[var(--emerald-glow)] text-xs text-[var(--emerald)]">
                <strong>Next steps:</strong> 1) Open Arduino IDE → 2) Paste or open the downloaded .ino → 3) Install libraries (PubSubClient, ArduinoJson, DHT) → 4) Select board "ESP32 Dev Module" → 5) Upload
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
  deviceHealth, actuatorStates, sendActuator,
}: {
  connectedDevices: any[];
  selectedDevice: any;
  setSelectedDevice: (d: any) => void;
  getDeviceReadings: (id: string) => any;
  deviceHealth: Record<string, any>;
  actuatorStates: Record<string, Record<string, boolean>>;
  sendActuator: (deviceId: string, actuator: string, action: string) => void;
}) {
  const pending = connectedDevices.filter(d => d.status === 'pending').length;

  return (
    <Card>
      <SectionTitle className="flex items-center gap-2"><Cpu size={18} className="text-[var(--emerald)]" /> Connected Devices</SectionTitle>
      <div className="text-xs text-[var(--text-tertiary)] mb-4">
        {connectedDevices.length === 0
          ? 'None yet — link the broker and a device will appear the moment it sends real data.'
          : `${connectedDevices.length} device(s) · ${pending} pending first reading`}
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
                    ? <Pill tone="emerald"><CheckCircle2 size={12} /> connected</Pill>
                    : <Pill tone="amber"><Clock size={12} /> pending</Pill>}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1 flex items-center gap-2 flex-wrap">
                  <Pill tone={categoryTone[dp.category]}>{dp.category}</Pill>
                  <Pill tone={dp.protocol === 'MQTT' ? 'emerald' : dp.protocol === 'HTTP' ? 'blue' : 'violet'}>{dp.protocol}</Pill>
                  <span>last seen {new Date(d.lastSeen).toLocaleTimeString()}</span>
                </div>
              </button>

              {/* Health bar (when device has heartbeat data) */}
              {health && health.rssi != null && (
                <div className="px-3 pb-2 flex flex-wrap gap-3 text-[10px] text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1"><Signal size={10} /> RSSI: {health.rssi} dBm</span>
                  <span className="flex items-center gap-1"><Activity size={10} /> Heap: {health.free_heap ? `${(health.free_heap / 1024).toFixed(0)}KB` : '?'}</span>
                  <span className="flex items-center gap-1"><Clock size={10} /> Uptime: {health.uptime_seconds ? `${Math.floor(health.uptime_seconds / 60)}m` : '?'}</span>
                  {health.firmware_version && <span className="flex items-center gap-1"><Cpu size={10} /> FW: {health.firmware_version}</span>}
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
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5">Actuators</div>
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
            </div>
          );
        })}

        {connectedDevices.length === 0 && (
          <div className="text-center text-[var(--text-disabled)] text-sm py-10 border border-dashed border-[var(--border)] rounded-[var(--radius-md)]">
            Awaiting real device data…
          </div>
        )}
      </div>
    </Card>
  );
}
