import { useState } from 'react';
import {
  Server, Wifi, ExternalLink, Code, Copy, Check,
  Database, Cloud, Lock, Cpu, Radio, Zap, FileCode, Globe
} from 'lucide-react';
import { PageHeader, Card, SectionTitle, Pill, Btn } from '../components/ui';

function CodeBlock({ id, language, children }: { id: string; language: string; children: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="relative group rounded-[var(--radius-sm)] bg-black/30 border border-white/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)] border-b border-white/[0.06]">
        <span className="text-[10px] text-[var(--text-disabled)] font-mono uppercase">{language}</span>
        <button
          onClick={() => copyText(children)}
          aria-label="Copy code"
          className="text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors"
          title="Copy"
        >
          {copied === id ? <Check size={12} className="text-[var(--emerald)]" /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="p-3 text-xs text-[var(--text-secondary)] font-mono overflow-x-auto leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

function LinkCard({ icon, title, description, href, tag }: { icon: React.ReactNode; title: string; description: string; href: string; tag?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block">
      <Card hover>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-[var(--radius-sm)] bg-white/[0.05] flex items-center justify-center text-[var(--emerald)]">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
              {tag && <Pill tone="emerald">{tag}</Pill>}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-1 leading-relaxed">{description}</p>
          </div>
          <ExternalLink size={14} className="shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--text-secondary)]" />
        </div>
      </Card>
    </a>
  );
}

const API_ENDPOINTS = [
  { method: 'GET', path: '/api/devices', desc: 'List all registered devices' },
  { method: 'POST', path: '/api/devices', desc: 'Register a new device' },
  { method: 'GET', path: '/api/devices/:id/readings', desc: 'Get historical sensor readings for a device' },
  { method: 'POST', path: '/api/ehi-history', desc: 'Persist an EHI data point' },
  { method: 'GET', path: '/api/ehi-history', desc: 'Retrieve EHI history (optional ?device= filter)' },
  { method: 'GET', path: '/api/alerts', desc: 'List active alerts (optional ?device= filter)' },
  { method: 'POST', path: '/api/alerts', desc: 'Create a new alert rule' },
  { method: 'POST', path: '/api/alerts/:id/acknowledge', desc: 'Acknowledge an alert' },
  { method: 'GET', path: '/api/thresholds', desc: 'List configured sensor thresholds' },
  { method: 'POST', path: '/api/thresholds', desc: 'Save or update a threshold' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-[var(--emerald)]',
  POST: 'text-[var(--cyan)]',
  PUT: 'text-[var(--amber)]',
  DELETE: 'text-[var(--rose)]',
};

export default function ResourcesPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'api' | 'mqtt' | 'protocols' | 'quickstart'>('overview');

  const tabs = [
    { id: 'overview' as const, label: 'Architecture', icon: <Server size={14} /> },
    { id: 'api' as const, label: 'API Reference', icon: <Code size={14} /> },
    { id: 'mqtt' as const, label: 'MQTT Topics', icon: <Radio size={14} /> },
    { id: 'protocols' as const, label: 'Protocols', icon: <Wifi size={14} /> },
    { id: 'quickstart' as const, label: 'Quick Start', icon: <Zap size={14} /> },
  ];

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Resources & Documentation"
        subtitle="Platform architecture · API reference · Device protocols"
        right={<Pill tone="emerald">v0.1.0</Pill>}
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 p-1 rounded-[var(--radius-md)] bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
        {tabs.map(tab => (
          <Btn
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            variant="ghost"
            size="sm"
            className={`whitespace-nowrap ${
              activeTab === tab.id
                ? '!bg-[var(--emerald)]/15 !text-[var(--emerald)]'
                : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
            </span>
          </Btn>
        ))}
      </div>

      <div className="animate-fade-in">
        {/* Architecture Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>Platform Architecture</SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] leading-relaxed mb-5">
                The Environmental Health Index platform is a full-stack IoT monitoring system built on the PERN stack
                with real-time MQTT data ingestion, virtual sensor computation, and an AI-powered recommendation engine.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 grid-entrance">
                {[
                  { icon: <Database size={16} />, name: 'PostgreSQL', role: 'Time-series storage, device registry, alerts, users' },
                  { icon: <Server size={16} />, name: 'Express.js', role: 'REST API, auth middleware, webhook handlers' },
                  { icon: <Cpu size={16} />, name: 'React + Vite', role: 'Dashboard SPA, Recharts, Leaflet maps' },
                  { icon: <Radio size={16} />, name: 'Node.js', role: 'MQTT broker bridge, background jobs' },
                ].map(tech => (
                  <Card key={tech.name} hover={false} className="text-center">
                    <div className="text-[var(--emerald)] flex justify-center mb-2">{tech.icon}</div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">{tech.name}</div>
                    <div className="text-[10px] text-[var(--text-disabled)] mt-1 leading-snug">{tech.role}</div>
                  </Card>
                ))}
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6 grid-entrance">
              <Card hover={false}>
                <SectionTitle>Data Flow</SectionTitle>
                <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--emerald)]/15 text-[var(--emerald)] flex items-center justify-center text-[10px] font-bold">1</span>
                    <div><strong className="text-[var(--text-primary)]">Sensors</strong> on ESP32/Arduino read PM2.5, pH, temperature, CO₂, etc.</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--cyan)]/15 text-[var(--cyan)] flex items-center justify-center text-[10px] font-bold">2</span>
                    <div><strong className="text-[var(--text-primary)]">MQTT Publish</strong> — device sends JSON to <code className="text-[11px] bg-white/[0.06] px-1 rounded">pern/sensors/{'{device}'}/data</code></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--amber)]/15 text-[var(--amber)] flex items-center justify-center text-[10px] font-bold">3</span>
                    <div><strong className="text-[var(--text-primary)]">Backend</strong> validates, stores readings, computes virtual sensors & EHI</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--violet)]/15 text-[var(--violet)] flex items-center justify-center text-[10px] font-bold">4</span>
                    <div><strong className="text-[var(--text-primary)]">Dashboard</strong> receives real-time updates, displays charts, alerts, and AI insights</div>
                  </div>
                </div>
              </Card>

              <Card hover={false}>
                <SectionTitle>External Dependencies</SectionTitle>
                <div className="space-y-2.5">
                  {[
                    { name: 'Open-Meteo API', desc: 'Weather forecast data for correlation analysis', url: 'https://open-meteo.com' },
                    { name: 'Mosquitto MQTT', desc: 'Lightweight broker for IoT message transport', url: 'https://mosquitto.org' },
                    { name: 'Logto', desc: 'Open-source identity & access management', url: 'https://logto.io' },
                    { name: 'ntfy.sh', desc: 'Push notification service for alert delivery', url: 'https://ntfy.sh' },
                  ].map(dep => (
                    <a key={dep.name} href={dep.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-2.5 rounded-[var(--radius-sm)] hover:bg-white/[0.04] transition-colors group">
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">{dep.name}</div>
                        <div className="text-[10px] text-[var(--text-disabled)]">{dep.desc}</div>
                      </div>
                      <ExternalLink size={12} className="text-[var(--text-disabled)]" />
                    </a>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* API Reference */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>REST API Endpoints</SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">
                All endpoints are prefixed with <code className="text-[11px] bg-white/[0.06] px-1 rounded">/api</code>. Requests require
                a <code className="text-[11px] bg-white/[0.06] px-1 rounded">Bearer</code> token in the <code className="text-[11px] bg-white/[0.06] px-1 rounded">Authorization</code> header
                and an <code className="text-[11px] bg-white/[0.06] px-1 rounded">X-Organization-Id</code> or <code className="text-[11px] bg-white/[0.06] px-1 rounded">X-User-Id</code> header.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="p-2.5 text-left text-[var(--text-disabled)] font-medium w-16">Method</th>
                      <th className="p-2.5 text-left text-[var(--text-disabled)] font-medium">Endpoint</th>
                      <th className="p-2.5 text-left text-[var(--text-disabled)] font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {API_ENDPOINTS.map((ep, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="p-2.5 font-mono font-bold text-[11px]">
                          <span className={METHOD_COLORS[ep.method] ?? 'text-[var(--text-secondary)]'}>{ep.method}</span>
                        </td>
                        <td className="p-2.5 font-mono text-[var(--text-secondary)]">{ep.path}</td>
                        <td className="p-2.5 text-[var(--text-tertiary)]">{ep.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card hover={false}>
              <SectionTitle>Request Headers</SectionTitle>
              <CodeBlock id="headers" language="HTTP">{`Authorization: Bearer <your-token>
Content-Type: application/json
X-Organization-Id: org_cairo_01    # for org-scoped requests
X-User-Id: user_123                # for individual requests`}</CodeBlock>
            </Card>

            <Card hover={false}>
              <SectionTitle>Response Format</SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] mb-3">All responses are JSON. Error responses include a <code className="text-[11px] bg-white/[0.06] px-1 rounded">message</code> field.</p>
              <CodeBlock id="response-success" language="JSON">{`{
  "data": [...],
  "total": 42,
  "page": 1
}`}</CodeBlock>
              <div className="mt-3">
                <CodeBlock id="response-error" language="JSON">{`{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}`}</CodeBlock>
              </div>
            </Card>
          </div>
        )}

        {/* MQTT Topics */}
        {activeTab === 'mqtt' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>MQTT Topic Structure</SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] mb-5">
                The platform uses a hierarchical topic structure for device communication. The default broker
                is Mosquitto over WebSocket on port 9001.
              </p>
              <div className="space-y-4">
                {[
                  {
                    topic: 'pern/sensors/{device_id}/data',
                    desc: 'Sensor readings from devices. Published periodically (default 5s).',
                    direction: 'Device → Broker',
                    payload: `{
  "sensors": {
    "pm25": 21.4,
    "co2": 438,
    "tmp": 29.3,
    "hum": 54,
    "ph": 7.25
  },
  "timestamp": 1719000000000
}`,
                  },
                  {
                    topic: 'pern/actuators/{device_id}/{actuator}/status',
                    desc: 'Actuator state feedback (relays, pumps, fans).',
                    direction: 'Device → Broker',
                    payload: `{
  "actuator": "fan",
  "state": "on",
  "source": "auto",
  "triggeredBy": "co2_threshold",
  "timestamp": 1719000000000
}`,
                  },
                  {
                    topic: 'pern/devices/{device_id}/status',
                    desc: 'Device online/offline discovery announcements.',
                    direction: 'Device → Broker',
                    payload: `{
  "device": "esp32_cairo_01",
  "timestamp": 1719000000000
}`,
                  },
                  {
                    topic: 'pern/actuators/{device_id}/{actuator}/set',
                    desc: 'Remote actuator control commands from dashboard.',
                    direction: 'Broker → Device',
                    payload: `{
  "actuator": "fan",
  "state": "on",
  "source": "manual",
  "triggeredBy": "user_dashboard",
  "timestamp": 1719000000000
}`,
                  },
                ].map((entry, i) => (
                  <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-b border-[var(--border)]">
                      <code className="text-xs text-[var(--emerald)] font-mono">{entry.topic}</code>
                      <Pill tone="slate">{entry.direction}</Pill>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-xs text-[var(--text-tertiary)] mb-2">{entry.desc}</p>
                      <pre className="text-[11px] text-[var(--text-disabled)] font-mono whitespace-pre">{entry.payload}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card hover={false}>
              <SectionTitle>Broker Configuration</SectionTitle>
              <CodeBlock id="mqtt-config" language="JavaScript">{`// Default connection settings
const MQTT_CONFIG = {
  broker: 'ws://localhost:9001',     // WebSocket transport
  clientId: 'pern-frontend-' + Date.now(),
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 3000,             // exponential backoff to 30s
};

// Subscribe patterns
client.subscribe('pern/sensors/+/data', { qos: 0 });
client.subscribe('pern/devices/+/status', { qos: 0 });
client.subscribe('pern/actuators/+/+/status', { qos: 0 });`}</CodeBlock>
            </Card>
          </div>
        )}

        {/* Protocols */}
        {activeTab === 'protocols' && (
          <div className="space-y-6">
            {[
              {
                name: 'MQTT',
                icon: <Radio size={18} />,
                color: 'emerald' as const,
                description: 'Lightweight publish/subscribe protocol designed for IoT. Primary sensor data transport.',
                features: ['Publish/subscribe model', 'QoS levels 0, 1, 2', 'Last Will and Testament', 'Retained messages', 'Topic wildcards (+, #)'],
                connection: `# Install a Node.js MQTT client
npm install mqtt

# Connect and subscribe
import mqtt from 'mqtt';
const client = mqtt.connect('ws://localhost:9001');
client.subscribe('pern/sensors/+/data');
client.on('message', (topic, payload) => {
  const data = JSON.parse(payload.toString());
  console.log(data.sensors);
});

# Publish sensor data
client.publish('pern/sensors/esp32_01/data', JSON.stringify({
  sensors: { pm25: 21.4, co2: 438, tmp: 29.3 },
  timestamp: Date.now()
}));`,
              },
              {
                name: 'HTTP / REST',
                icon: <Globe size={18} />,
                color: 'cyan' as const,
                description: 'Standard request/response protocol for API calls, device registration, and historical data.',
                features: ['Stateless requests', 'JSON payloads', 'Bearer token auth', 'Standard HTTP verbs', 'CORS enabled'],
                connection: `# Register a device
curl -X POST https://your-server.com/api/devices \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "ESP32 Cairo 01",
    "type": "ESP32",
    "location": { "lat": 30.0444, "lng": 31.2357 }
  }';

# Fetch historical readings
curl https://your-server.com/api/devices/esp32_01/readings \\
  -H "Authorization: Bearer <token>"`,
              },
              {
                name: 'WebSocket',
                icon: <Zap size={18} />,
                color: 'amber' as const,
                description: 'Full-duplex persistent connection for real-time dashboard updates and actuator control.',
                features: ['Bidirectional data flow', 'Low latency', 'No polling overhead', 'Event-driven', 'Auto-reconnect'],
                connection: `// WebSocket connection for actuator control
const ws = new WebSocket('wss://your-server.com/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'actuator_command',
    device: 'esp32_01',
    actuator: 'fan',
    state: 'on'
  }));
};

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  if (update.type === 'sensor_update') {
    updateDashboard(update.sensors);
  }
};`,
              },
            ].map(protocol => (
              <Card key={protocol.name} hover={false}>
                <div className="flex items-center gap-3 mb-3">
                  <div style={{ color: `var(--${protocol.color})` }}>{protocol.icon}</div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{protocol.name}</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">{protocol.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {protocol.features.map(f => (
                    <Pill key={f} tone={protocol.color}>{f}</Pill>
                  ))}
                </div>
                <CodeBlock id={`proto-${protocol.name.toLowerCase().replace(/[\s/]/g, '-')}`} language="JavaScript / Shell">
                  {protocol.connection}
                </CodeBlock>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Start */}
        {activeTab === 'quickstart' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>
                <Zap size={14} className="inline mr-2 text-[var(--emerald)]" />
                Quick Start — Connect a New Device
              </SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] mb-5">
                Follow these steps to register an ESP32/ESP8266 device and start streaming sensor data to the platform.
              </p>
              <div className="space-y-4">
                {[
                  {
                    step: 1,
                    title: 'Install dependencies on your device',
                    code: `# Arduino IDE: Install PubSubClient library
# PlatformIO: Add to platformio.ini
lib_deps = knolleary/PubSubClient@^2.8`,
                  },
                  {
                    step: 2,
                    title: 'Configure WiFi and MQTT broker',
                    code: `#define WIFI_SSID     "YourSSID"
#define WIFI_PASS     "YourPassword"
#define MQTT_BROKER   "your-server.com"
#define MQTT_PORT     1883           // 8883 for TLS
#define MQTT_TOPIC    "pern/sensors/esp32_01/data"`,
                  },
                  {
                    step: 3,
                    title: 'Read sensors and publish data',
                    code: `void publishSensorData() {
  StaticJsonDocument<256> doc;
  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["pm25"] = readPM25();
  sensors["co2"]  = readCO2();
  sensors["tmp"]  = readTemperature();
  sensors["hum"]  = readHumidity();
  sensors["ph"]   = readPH();
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  client.publish(MQTT_TOPIC, buffer);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  static unsigned long lastPublish = 0;
  if (millis() - lastPublish > 5000) {  // every 5 seconds
    publishSensorData();
    lastPublish = millis();
  }
}`,
                  },
                  {
                    step: 4,
                    title: 'Register the device on the platform',
                    code: `curl -X POST https://your-server.com/api/devices \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "ESP32 Cairo 01", "type": "ESP32"}'`,
                  },
                  {
                    step: 5,
                    title: 'Verify data is flowing',
                    code: `# In the dashboard, switch to Live Mode
# You should see real-time sensor readings
# appearing in the Physical Sensors grid

# Or check MQTT directly:
mosquitto_sub -h your-server.com -t "pern/sensors/#"`,
                  },
                ].map(s => (
                  <div key={s.step}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--emerald)]/15 text-[var(--emerald)] flex items-center justify-center text-xs font-bold">
                        {s.step}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{s.title}</span>
                    </div>
                    <CodeBlock id={`qs-${s.step}`} language="C++ / Shell">{s.code}</CodeBlock>
                  </div>
                ))}
              </div>
            </Card>

            <Card hover={false}>
              <SectionTitle>External Documentation</SectionTitle>
              <div className="grid md:grid-cols-2 gap-3 grid-entrance">
                <LinkCard
                  icon={<Cloud size={16} />}
                  title="Open-Meteo API"
                  description="Free weather forecast API. Used for environmental correlation with sensor data."
                  href="https://open-meteo.com/en/docs"
                  tag="Weather"
                />
                <LinkCard
                  icon={<Radio size={16} />}
                  title="MQTT v5.0 Specification"
                  description="OASIS standard for lightweight IoT messaging protocol."
                  href="https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html"
                />
                <LinkCard
                  icon={<Lock size={16} />}
                  title="Logto Documentation"
                  description="Open-source identity platform used for user authentication and RBAC."
                  href="https://docs.logto.io"
                />
                <LinkCard
                  icon={<FileCode size={16} />}
                  title="PubSubClient (Arduino)"
                  description="MQTT client library for ESP32/ESP8266 Arduino development."
                  href="https://pubsubclient.knolleary.net"
                />
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
