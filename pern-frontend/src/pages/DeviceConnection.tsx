import { useState, useEffect } from 'react';
import { useI18n } from '../lib/i18n';
import { mqttClient } from '../lib/mqtt-client';
import { useDevice } from '../lib/device-context';
import { DEVICE_PROFILES, DEVICE_CATEGORIES, getProfile, type DeviceCategory } from '../lib/device-profiles';
import { PageHeader, Btn, Pill, LiveBadge, Card, SectionTitle } from '../components/ui';
import { Plus, Wifi, WifiOff, Cpu, Radio, CheckCircle2, Clock, Copy, ChevronDown, Gauge } from 'lucide-react';

const categoryTone: Record<DeviceCategory, 'emerald' | 'cyan' | 'blue' | 'violet'> = {
  MCU: 'emerald',
  Gateway: 'cyan',
  HTTP: 'blue',
  WebSocket: 'violet',
};

export default function DeviceConnection() {
  const { t } = useI18n();
  const { connectedDevices, registerRealDevice, selectedDevice, setSelectedDevice, getDeviceReadings } = useDevice();
  const [brokerUrl, setBrokerUrl] = useState('ws://localhost:9001');
  const [connected, setConnected] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceType, setDeviceType] = useState('ESP32');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>('ESP32');
  const [copied, setCopied] = useState(false);
  const [kindFilter, setKindFilter] = useState<DeviceCategory | 'all'>('all');
  const [baud, setBaud] = useState<number | null>(getProfile('ESP32').defaultBaud);

  // Keep the selected baud rate in sync with the chosen device type
  useEffect(() => {
    const p = getProfile(deviceType);
    setBaud(p.baudRates ? p.defaultBaud : null);
  }, [deviceType]);

  useEffect(() => { setConnected(mqttClient.isConnected()); }, []);

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

  const pending = connectedDevices.filter(d => d.status === 'pending').length;
  const profile = getProfile(deviceType);
  const visibleProfiles = kindFilter === 'all'
    ? DEVICE_PROFILES
    : DEVICE_PROFILES.filter(p => p.category === kindFilter);

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        title={t('deviceConnection.title')}
        subtitle={t('deviceConnection.subtitle')}
        right={<LiveBadge on={connected} label={connected ? 'BROKER LINKED' : 'OFFLINE'} />}
      />

      <div className="grid lg:grid-cols-2 gap-6 grid-entrance">
        {/* Broker + register device */}
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

            {/* Device kind filter */}
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

            {/* Baud rate selector */}
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
              The device appears as <span className="text-[var(--amber)]">pending</span> until its first real reading arrives, then flips to <span className="text-[var(--emerald)]">connected</span>. Each kind uses its own transport and sensor set below.
            </p>
          </Card>

          {/* Device type reference with wiring examples */}
          <Card>
            <SectionTitle className="flex items-center gap-2"><Cpu size={18} className="text-[var(--emerald)]" /> Device Types &amp; Wiring</SectionTitle>
            <div className="text-xs text-[var(--text-tertiary)] mb-3">Pick a type to see how that specific device connects, its baud rate and what sensors it reports.</div>
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
                        <ChevronDown size={16} className={`text-[var(--text-tertiary)] transition ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <div className="text-xs text-[var(--text-tertiary)] mb-2 flex items-center gap-2">
                          <Gauge size={12} /> Baud: {p.baudRates ? `${p.defaultBaud} (options: ${p.baudRates.join(', ')})` : 'n/a — IP transport'}
                        </div>

                        {/* Sensors panel */}
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

        {/* Connected devices */}
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
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDevice(d)}
                  className={`w-full text-left p-3 rounded-[var(--radius-md)] border transition ${selectedDevice?.id === d.id ? 'border-[var(--emerald-glow)] bg-[var(--emerald-dim)]' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'}`}
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
                    <span>{dp.baudRates ? `${dp.defaultBaud} baud` : 'IP'}</span>
                    <span>last seen {new Date(d.lastSeen).toLocaleTimeString()}</span>
                  </div>
                  {readings && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(readings.sensors).slice(0, 6).map(([k, v]) => (
                        <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--text-secondary)] font-mono">{k}: {v}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
            {connectedDevices.length === 0 && (
              <div className="text-center text-[var(--text-disabled)] text-sm py-10 border border-dashed border-[var(--border)] rounded-[var(--radius-md)]">
                Awaiting real device data…
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
