import { useState } from 'react';
import { PageHeader, Card, Pill } from '../components/ui';
import {
  BookOpen, Copy, Check, ChevronDown, ChevronRight, Cpu, Wifi,
  Cable, Upload, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';

type TFunc = (key: string, fallback?: string, params?: Record<string, string>) => string;

/* ─── Copy button helper ─── */
function CopyButton({ text, t }: { text: string; t: TFunc }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-xs flex items-center gap-1 hover:text-[var(--emerald)] transition-colors">
      {copied ? <><Check size={12} /> {t('setupGuide.copy.copied', 'Copied!')}</> : <><Copy size={12} /> {t('setupGuide.copy.copy', 'Copy')}</>}
    </button>
  );
}

/* ─── Collapsible section ─── */
function GuideSection({ title, icon, defaultOpen = false, children }: {
  title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors">
        {icon}
        <span className="font-medium text-sm flex-1">{title}</span>
        {open ? <ChevronDown size={16} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={16} className="text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-[var(--border)]">{children}</div>}
    </div>
  );
}

/* ─── Code block ─── */
function CodeBlock({ title, lang, children, t }: { title: string; lang?: string; children: string; t: TFunc }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between bg-black/50 rounded-t-[var(--radius-sm)] px-3 py-1.5 border border-b-0 border-[var(--border)]">
        <span className="text-xs text-[var(--text-tertiary)] font-mono">{title}{lang ? ` (${lang})` : ''}</span>
        <CopyButton text={children} t={t} />
      </div>
      <pre className="bg-black/40 rounded-b-[var(--radius-sm)] p-3 overflow-x-auto text-[11px] leading-relaxed font-mono text-[var(--emerald)] border border-[var(--border)] whitespace-pre-wrap">{children}</pre>
    </div>
  );
}

/* ─── Step indicator ─── */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-[var(--emerald-dim)] text-[var(--emerald)] flex items-center justify-center font-bold text-sm shrink-0">{n}</div>
        <div className="w-px flex-1 bg-[var(--border)] my-1" />
      </div>
      <div className="pb-6 flex-1 min-w-0">
        <div className="font-semibold text-sm mb-2">{title}</div>
        <div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  MAIN PAGE                                         */
/* ═══════════════════════════════════════════════════ */

type Board = 'esp32' | 'arduino-uno';

const ESP32_CODE = `// ========================================
// ESP32 WiFi MQTT — Air + Water Quality
// ========================================
// HARDWARE: ESP32 DevKit, DHT22 (GPIO4),
//   MQ-135 (GPIO34), BMP280 (I2C),
//   TDS Sensor (GPIO35), pH Sensor (GPIO32)
//
// LIBRARIES (Arduino Library Manager):
//   - PubSubClient by Nick O'Leary
//   - DHT sensor library by Adafruit
//   - Adafruit BMP280 (optional)
//   - ArduinoJson by Benoit Blanchon
//
// WIRING:
//   ESP32 GPIO4  → DHT22 DATA (with 10kΩ pull-up)
//   ESP32 GPIO34 → MQ-135 AOUT (analog, read-only)
//   ESP32 GPIO35 → TDS Sensor AOUT
//   ESP32 GPIO32 → pH Sensor AOUT
//   ESP32 GPIO36 → CO2 Sensor AOUT
//   ESP32 3.3V   → Sensor VCC
//   ESP32 GND    → Sensor GND
//
// STEP 1: Install Arduino IDE + ESP32 board package
// STEP 2: Install libraries via Library Manager
// STEP 3: Update YOUR_WIFI_SSID, YOUR_WIFI_PASSWORD
//         and MQTT_SERVER (your PC's local IP)
// STEP 4: Select board "ESP32 Dev Module"
// STEP 5: Upload and open Serial Monitor (115200 baud)
// ========================================

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ===== CONFIGURATION — EDIT THESE =====
const char* WIFI_SSID   = "YOUR_WIFI_SSID";
const char* WIFI_PASS   = "YOUR_WIFI_PASSWORD";
const char* MQTT_SERVER = "192.168.1.100";  // Your PC IP
const int   MQTT_PORT   = 1883;
const char* DEVICE_ID   = "esp32-001";
const char* TOPIC       = "pern/sensors/esp32-001/data";
const unsigned long INTERVAL = 5000;  // Send every 5s

// ===== SENSOR PINS =====
#define DHT_PIN    4
#define DHT_TYPE   DHT22
#define MQ135_PIN  34   // ADC1 channels work during WiFi
#define TDS_PIN    35
#define PH_PIN     32
#define CO2_PIN    36

WiFiClient wifi;
PubSubClient mqtt(wifi);
DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastSend = 0;

// ===== WiFi Connection =====
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nConnected: " + WiFi.localIP().toString());
}

// ===== MQTT Connection =====
void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("MQTT...");
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("OK");
    } else {
      Serial.print("fail rc=");
      Serial.print(mqtt.state());
      Serial.println(" retry in 3s");
      delay(3000);
    }
  }
}

// ===== Sensor Reading Functions =====
float readPH() {
  int raw = analogRead(PH_PIN);
  float voltage = raw * (3.3 / 4095.0);
  return 7.0 + ((2.5 - voltage) / 0.18);
}

float readTDS() {
  int raw = analogRead(TDS_PIN);
  float voltage = raw * (3.3 / 4095.0);
  float temp = dht.readTemperature();
  float comp = 1.0 + 0.02 * (temp - 25.0);
  return (133.42*voltage*voltage*voltage
        - 255.86*voltage*voltage
        + 857.39*voltage) * comp;
}

// ===== Setup =====
void setup() {
  Serial.begin(115200);
  delay(1000);
  dht.begin();
  connectWiFi();
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  Serial.println("ESP32 Environmental Monitor Ready");
}

// ===== Main Loop =====
void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  if (millis() - lastSend < INTERVAL) return;
  lastSend = millis();

  // Read all sensors
  float tmp  = dht.readTemperature();
  float hum  = dht.readHumidity();
  int   pm25 = map(analogRead(MQ135_PIN), 0, 4095, 0, 500);
  int   co2  = 400 + map(analogRead(CO2_PIN), 0, 4095, 0, 1600);
  float ph   = readPH();
  float tds  = readTDS();

  // Build JSON
  StaticJsonDocument<384> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();
  JsonObject s = doc.createNestedObject("sensors");
  s["tmp"]  = round(tmp * 10.0) / 10.0;
  s["hum"]  = round(hum * 10.0) / 10.0;
  s["pm25"] = pm25;
  s["co2"]  = co2;
  s["ph"]   = round(ph * 100.0) / 100.0;
  s["tds"]  = round(tds);

  // Publish to MQTT
  char buffer[384];
  serializeJson(doc, buffer);
  mqtt.publish(TOPIC, buffer);

  Serial.print("Published: ");
  Serial.println(buffer);
}`;

const ARDUINO_UNO_CODE = `// ========================================
// Arduino Uno + USB Serial → PC Bridge
// ========================================
// HARDWARE: Arduino Uno, LM35 (A0),
//   DHT11 (A1), MQ-135 (A2), GP2Y1010AU (A3)
//
// LIBRARIES (Arduino Library Manager):
//   - ArduinoJson by Benoit Blanchon
//
// WIRING:
//   LM35 OUT     → A0
//   DHT11 DATA   → A1 (with 10kΩ pull-up)
//   MQ-135 AOUT  → A2
//   GP2Y1010AU   → A3 (with 150Ω + 220µF filter)
//
// HOW IT WORKS:
//   Arduino reads sensors and sends JSON via Serial.
//   The PC bridge (bridge.js) reads Serial and
//   publishes to MQTT broker automatically.
//
// STEP 1: Install ArduinoJson via Library Manager
// STEP 2: Upload this sketch to Arduino Uno
// STEP 3: On PC, run: node bridge.js COM3
//   (replace COM3 with your Arduino's COM port)
// ========================================

#include <ArduinoJson.h>

const char* DEVICE_ID = "arduino-001";
const unsigned long INTERVAL = 5000;
unsigned long lastSend = 0;

// Sensor pins
const int PIN_TEMP = A0;  // LM35 temperature
const int PIN_HUM  = A1;  // DHT11 humidity
const int PIN_PM25 = A2;  // MQ-135 analog
const int PIN_CO2  = A3;  // GP2Y1010AU dust

// ===== Sensor Reading Functions =====
float readTemperature() {
  int raw = analogRead(PIN_TEMP);
  float voltage = raw * (5.0 / 1023.0);
  return voltage * 100.0;  // LM35: 10mV per °C
}

int readHumidity() {
  int raw = analogRead(PIN_HUM);
  return map(raw, 0, 1023, 20, 90);
}

int readPM25() {
  int raw = analogRead(PIN_PM25);
  return map(raw, 0, 1023, 0, 500);
}

int readCO2() {
  int raw = analogRead(PIN_CO2);
  return 400 + map(raw, 0, 1023, 0, 1600);
}

// ===== Setup =====
void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }
  analogReference(DEFAULT);
  delay(100);
}

// ===== Main Loop =====
void loop() {
  if (millis() - lastSend < INTERVAL) return;
  lastSend = millis();

  // Read all sensors
  float tmp  = readTemperature();
  int   hum  = readHumidity();
  int   pm25 = readPM25();
  int   co2  = readCO2();

  // Build JSON
  StaticJsonDocument<256> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();
  JsonObject s = doc.createNestedObject("sensors");
  s["tmp"]  = round(tmp * 10.0) / 10.0;
  s["hum"]  = hum;
  s["pm25"] = pm25;
  s["co2"]  = co2;

  // Send to PC bridge via Serial
  serializeJson(doc, Serial);
  Serial.println();
}`;

const BRIDGE_CODE = `// ========================================
// Arduino Serial → MQTT Bridge (Node.js)
// ========================================
// USAGE: node bridge.js COM3
//   (replace COM3 with your Arduino port)
//
// PREREQUISITES:
//   npm install serialport mqtt
//
// This script reads JSON lines from Arduino Serial
// and publishes them to the MQTT broker on port 1883.
// ========================================

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const mqtt = require('mqtt');

const PORT = process.argv[2] || 'COM3';
const BAUD = 115200;
const MQTT_BROKER = 'mqtt://localhost:1883';

console.log(\`Bridge: \${PORT} → MQTT \${MQTT_BROKER}\`);

// Connect to MQTT broker
const mqttClient = mqtt.connect(MQTT_BROKER);
mqttClient.on('connect', () => console.log('MQTT connected'));
mqttClient.on('error', (e) => console.error('MQTT error:', e.message));

// Open serial port
const port = new SerialPort({ path: PORT, baudRate: BAUD });
const parser = port.pipe(new ReadlineParser({ delimiter: '\\n' }));

parser.on('data', (line) => {
  try {
    const data = JSON.parse(line.trim());
    const deviceId = data.device || 'unknown';
    const topic = \`pern/sensors/\${deviceId}/data\`;
    mqttClient.publish(topic, line.trim());
    console.log(\`[\${new Date().toLocaleTimeString()}] \${topic}\`);
  } catch (e) {
    // Not valid JSON, skip
  }
});

port.on('error', (e) => console.error('Serial error:', e.message));
console.log('Waiting for Arduino data...');`;

const MOQTT_BROKER_CONFIG = `# ========================================
# Mosquitto MQTT Broker — Docker Quick Start
# ========================================
# This runs the MQTT broker with WebSocket
# support on port 9001 (required by the platform).
#
# PREREQUISITE: Docker installed
# ========================================

docker run -d \\
  --name mosquitto \\
  -p 1883:1883 \\
  -p 9001:9001 \\
  -v $(pwd)/mosquitto.conf:/mosquitto/config/mosquitto.conf \\
  eclipse-mosquitto

# --- mosquitto.conf (save this file) ---
listener 1883
listener 9001
protocol websockets
allow_anonymous true`;

export default function DeviceSetupGuide() {
  const { t } = useI18n();
  const [selectedBoard, setSelectedBoard] = useState<Board>('esp32');

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        title={t('setupGuide.title', 'Device Setup Guide')}
        subtitle={t('setupGuide.subtitle', 'Step-by-step guide to connect Arduino Uno or ESP32 to the platform')}
        right={<Pill tone="emerald"><BookOpen size={14} /> {t('setupGuide.interactiveGuide', 'Interactive Guide')}</Pill>}
      />

      {/* Board selector */}
      <Card hover={false} className="mb-6">
        <div className="flex items-center gap-4">
          <span className="text-xs text-[var(--text-tertiary)] font-medium">{t('setupGuide.selectBoard', 'Select your board:')}</span>
          <div className="flex gap-2">
            {([
              ['esp32', t('setupGuide.board.esp32', 'ESP32 (WiFi MQTT)'), t('setupGuide.board.esp32Desc', 'Direct WiFi connection, no bridge needed')],
              ['arduino-uno', t('setupGuide.board.arduinoUno', 'Arduino Uno (USB Serial)'), t('setupGuide.board.arduinoUnoDesc', 'Uses PC bridge to connect to MQTT')],
            ] as [Board, string, string][]).map(([key, label, desc]) => (
              <button
                key={key}
                onClick={() => setSelectedBoard(key)}
                className={`flex-1 p-3 rounded-[var(--radius-md)] border text-left transition-all ${
                  selectedBoard === key
                    ? 'border-[var(--emerald)] bg-[var(--emerald-dim)]'
                    : 'border-[var(--border)] hover:border-[var(--emerald-glow)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Cpu size={16} className={selectedBoard === key ? 'text-[var(--emerald)]' : 'text-[var(--text-tertiary)]'} />
                  <span className="font-medium text-sm">{label}</span>
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{desc}</div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="space-y-4">

        {/* ──── STEP 0: Prerequisites ──── */}
        <GuideSection
          title={t('setupGuide.prereqTitle', 'Prerequisites — What You Need')}
          icon={<AlertTriangle size={18} className="text-[var(--amber)]" />}
          defaultOpen={true}
        >
          <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-black/20 rounded-lg border border-[var(--border)]">
                <div className="font-medium text-[var(--text-primary)] mb-1">{t('setupGuide.hardware', 'Hardware')}</div>
                <ul className="space-y-1 text-[var(--text-tertiary)]">
                  {selectedBoard === 'esp32' ? (
                    <>
                      <li>• {t('setupGuide.hw.esp32Board', 'ESP32 DevKit V1 board')}</li>
                      <li>• {t('setupGuide.hw.dht22', 'DHT22 temperature/humidity sensor')}</li>
                      <li>• {t('setupGuide.hw.mq135', 'MQ-135 air quality sensor')}</li>
                      <li>• {t('setupGuide.hw.tds', 'TDS water quality sensor')}</li>
                      <li>• {t('setupGuide.hw.ph', 'pH sensor module')}</li>
                      <li>• {t('setupGuide.hw.jumperWires', 'Jumper wires + breadboard')}</li>
                      <li>• {t('setupGuide.hw.usbMicro', 'USB Micro cable')}</li>
                    </>
                  ) : (
                    <>
                      <li>• {t('setupGuide.hw.arduinoBoard', 'Arduino Uno R3 board')}</li>
                      <li>• {t('setupGuide.hw.lm35', 'LM35 temperature sensor')}</li>
                      <li>• {t('setupGuide.hw.dht11', 'DHT11 humidity sensor')}</li>
                      <li>• {t('setupGuide.hw.mq135', 'MQ-135 air quality sensor')}</li>
                      <li>• {t('setupGuide.hw.gp2y', 'GP2Y1010AU dust sensor')}</li>
                      <li>• {t('setupGuide.hw.usbAB', 'USB Type-A to B cable')}</li>
                      <li>• {t('setupGuide.hw.capacitor', '150Ω resistor + 220µF capacitor')}</li>
                    </>
                  )}
                </ul>
              </div>
              <div className="p-3 bg-black/20 rounded-lg border border-[var(--border)]">
                <div className="font-medium text-[var(--text-primary)] mb-1">{t('setupGuide.software', 'Software')}</div>
                <ul className="space-y-1 text-[var(--text-tertiary)]">
                  <li>• {t('setupGuide.sw.arduinoIde', 'Arduino IDE 2.x')}</li>
                  <li>• {t('setupGuide.sw.node', 'Node.js 18+ (for bridge & MQTT)')}</li>
                  <li>• {t('setupGuide.sw.mosquitto', 'Mosquitto MQTT broker (Docker)')}</li>
                  {selectedBoard === 'arduino-uno' && <li>• {t('setupGuide.sw.npm', 'npm:')} <code>serialport mqtt</code></li>}
                  {selectedBoard === 'esp32' && <li>• {t('setupGuide.sw.esp32Package', 'ESP32 board package in Arduino IDE')}</li>}
                  <li>• {t('setupGuide.sw.libraries', 'Arduino Library Manager libraries')}</li>
                </ul>
              </div>
            </div>
          </div>
        </GuideSection>

        {/* ──── STEP 1: MQTT Broker ──── */}
        <GuideSection
          title={t('setupGuide.step1Title', 'Step 1 — Start MQTT Broker (Mosquitto)')}
          icon={<Wifi size={18} className="text-[var(--emerald)]" />}
          defaultOpen={true}
        >
          <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
            <p>{t('setupGuide.step1Body', 'The MQTT broker is the hub that receives data from your device and forwards it to the platform. Run this with Docker:')}</p>
            <CodeBlock title={t('setupGuide.terminalStartMosquitto', 'Terminal — Start Mosquitto')} lang="bash" t={t}>{MOQTT_BROKER_CONFIG}</CodeBlock>
            <div className="flex items-start gap-2 p-2 bg-[var(--amber-dim)] rounded-lg border border-[var(--amber)]/20">
              <AlertTriangle size={14} className="text-[var(--amber)] mt-0.5 shrink-0" />
              <span>{t('setupGuide.step1Warning.a', 'The broker must be running on ')}<code className="font-mono">localhost:1883</code>{t('setupGuide.step1Warning.b', ' (MQTT) and ')}<code className="font-mono">localhost:9001</code>{t('setupGuide.step1Warning.c', ' (WebSocket) for the platform to connect.')}</span>
            </div>
          </div>
        </GuideSection>

        {/* ──── STEP 2: Install Libraries ──── */}
        <GuideSection
          title={t('setupGuide.step2Title', 'Step 2 — Install Arduino Libraries')}
          icon={<Upload size={18} className="text-[var(--blue)]" />}
        >
          <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
            <p>{t('setupGuide.step2Body.a', 'In Arduino IDE, go to ')}<strong>Sketch → Include Library → Manage Libraries</strong>{t('setupGuide.step2Body.b', ' and install:')}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
                <CheckCircle2 size={14} className="text-[var(--emerald)] shrink-0" />
                <div>
                  <div className="font-medium text-[var(--text-primary)]">{t('setupGuide.lib.arduinoJson', 'ArduinoJson')}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{t('setupGuide.lib.arduinoJsonDesc', "by Benoit Blanchon — JSON builder")}</div>
                </div>
              </div>
              {selectedBoard === 'esp32' && (
                <>
                  <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
                    <CheckCircle2 size={14} className="text-[var(--emerald)] shrink-0" />
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{t('setupGuide.lib.pubSubClient', 'PubSubClient')}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{t('setupGuide.lib.pubSubClientDesc', "by Nick O'Leary — MQTT client")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
                    <CheckCircle2 size={14} className="text-[var(--emerald)] shrink-0" />
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{t('setupGuide.lib.dht', 'DHT sensor library')}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{t('setupGuide.lib.dhtDesc', 'by Adafruit — DHT22 support')}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </GuideSection>

        {/* ──── STEP 3: Wiring ──── */}
        <GuideSection
          title={t('setupGuide.step3Title', 'Step 3 — Wire the Sensors')}
          icon={<Cable size={18} className="text-[var(--violet)]" />}
        >
          <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
            <p>{t('setupGuide.step3Body', 'Connect sensors to your board as follows. Always connect GND first, then VCC, then signal pins.')}</p>
            {selectedBoard === 'esp32' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="py-2 pr-4 text-[var(--text-tertiary)] font-medium">{t('setupGuide.table.sensor', 'Sensor')}</th>
                      <th className="py-2 pr-4 text-[var(--text-tertiary)] font-medium">{t('setupGuide.table.esp32Pin', 'ESP32 Pin')}</th>
                      <th className="py-2 pr-4 text-[var(--text-tertiary)] font-medium">{t('setupGuide.table.notes', 'Notes')}</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr className="border-b border-[var(--border)]/50"><td className="py-1.5 pr-4">DHT22 DATA</td><td className="py-1.5 pr-4 text-[var(--emerald)]">GPIO4</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.esp32.pullup', '10kΩ pull-up to 3.3V')}</td></tr>
                    <tr className="border-b border-[var(--border)]/50"><td className="py-1.5 pr-4">MQ-135 AOUT</td><td className="py-1.5 pr-4 text-[var(--emerald)]">GPIO34</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.esp32.adc1Wifi', 'ADC1 — works during WiFi')}</td></tr>
                    <tr className="border-b border-[var(--border)]/50"><td className="py-1.5 pr-4">TDS AOUT</td><td className="py-1.5 pr-4 text-[var(--emerald)]">GPIO35</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.esp32.readOnly', 'ADC1, read-only')}</td></tr>
                    <tr className="border-b border-[var(--border)]/50"><td className="py-1.5 pr-4">pH AOUT</td><td className="py-1.5 pr-4 text-[var(--emerald)]">GPIO32</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.esp32.adc1', 'ADC1')}</td></tr>
                    <tr><td className="py-1.5 pr-4">CO2 AOUT</td><td className="py-1.5 pr-4 text-[var(--emerald)]">GPIO36</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.esp32.vp', 'ADC1 (VP pin)')}</td></tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="py-2 pr-4 text-[var(--text-tertiary)] font-medium">{t('setupGuide.table.sensor', 'Sensor')}</th>
                      <th className="py-2 pr-4 text-[var(--text-tertiary)] font-medium">{t('setupGuide.table.arduinoPin', 'Arduino Pin')}</th>
                      <th className="py-2 pr-4 text-[var(--text-tertiary)] font-medium">{t('setupGuide.table.notes', 'Notes')}</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr className="border-b border-[var(--border)]/50"><td className="py-1.5 pr-4">LM35 OUT</td><td className="py-1.5 pr-4 text-[var(--emerald)]">A0</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.uno.lm35', '10mV/°C, VCC=5V')}</td></tr>
                    <tr className="border-b border-[var(--border)]/50"><td className="py-1.5 pr-4">DHT11 DATA</td><td className="py-1.5 pr-4 text-[var(--emerald)]">A1</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.uno.pullup5', '10kΩ pull-up to 5V')}</td></tr>
                    <tr className="border-b border-[var(--border)]/50"><td className="py-1.5 pr-4">MQ-135 AOUT</td><td className="py-1.5 pr-4 text-[var(--emerald)]">A2</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.uno.warmup', 'Needs 5 min warm-up')}</td></tr>
                    <tr><td className="py-1.5 pr-4">GP2Y1010AU</td><td className="py-1.5 pr-4 text-[var(--emerald)]">A3</td><td className="py-1.5 text-[var(--text-tertiary)] font-sans">{t('setupGuide.note.uno.filter', '150Ω + 220µF filter circuit')}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-start gap-2 p-2 bg-[var(--rose-dim)] rounded-lg border border-[var(--rose)]/20">
              <AlertTriangle size={14} className="text-[var(--rose)] mt-0.5 shrink-0" />
              <span><strong>{t('setupGuide.step3Warning.important', 'Important:')}</strong>{t('setupGuide.step3Warning.body', ' Never connect 5V sensors directly to ESP32 (3.3V only). Use a voltage divider or logic level shifter.')}</span>
            </div>
          </div>
        </GuideSection>

        {/* ──── STEP 4: Upload Code ──── */}
        <GuideSection
          title={t('setupGuide.step4Title', 'Step 4 — Upload Code to {board}', { board: selectedBoard === 'esp32' ? 'ESP32' : 'Arduino Uno' })}
          icon={<Upload size={18} className="text-[var(--emerald)]" />}
          defaultOpen={true}
        >
          <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
            {selectedBoard === 'esp32' ? (
              <>
                <Step n={1} title={t('setupGuide.step4.installPackage', 'Install ESP32 Board Package')}>
                  <p>{t('setupGuide.step4.prefs.a', 'In Arduino IDE, go to ')}<strong>File → Preferences</strong>{t('setupGuide.step4.prefs.b', ', add this URL to "Additional Board Manager URLs":')}</p>
                  <code className="block bg-black/30 rounded p-2 font-mono text-[var(--emerald)] mt-1">https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json</code>
                  <p>{t('setupGuide.step4.boardsManager.a', 'Then ')}<strong>Tools → Board → Boards Manager</strong>{t('setupGuide.step4.boardsManager.b', ', search "esp32" and install.')}</p>
                </Step>
                <Step n={2} title={t('setupGuide.step4.editConfig', 'Edit Configuration')}>
                  <p>{t('setupGuide.step4.editConfigBody', 'In the code below, change these values:')}</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li><code>YOUR_WIFI_SSID</code>{t('setupGuide.step4.ssidDesc', ' — your WiFi network name')}</li>
                    <li><code>YOUR_WIFI_PASSWORD</code>{t('setupGuide.step4.passDesc', ' — your WiFi password')}</li>
                    <li><code>MQTT_SERVER</code>{t('setupGuide.step4.serverDesc.a', " — your PC's IP (run ")}<code>ipconfig</code>{t('setupGuide.step4.serverDesc.b', ' to find it)')}</li>
                    <li><code>DEVICE_ID</code>{t('setupGuide.step4.deviceIdDesc', ' — a unique name for this device')}</li>
                  </ul>
                </Step>
                <Step n={3} title={t('setupGuide.step4.upload', 'Upload')}>
                  <p>{t('setupGuide.step4.uploadEsp32.a', 'Select ')}<strong>Tools → Board → ESP32 → ESP32 Dev Module</strong>{t('setupGuide.step4.uploadEsp32.b', ', select the correct COM port, then click Upload.')}</p>
                </Step>
              </>
            ) : (
              <>
                <Step n={1} title={t('setupGuide.step4.selectBoardPort', 'Select Board & Port')}>
                  <p>{t('setupGuide.step4.selectBoardPortBody.a', 'Select ')}<strong>Tools → Board → Arduino AVR → Arduino Uno</strong>{t('setupGuide.step4.selectBoardPortBody.b', ', then select your COM port.')}</p>
                </Step>
                <Step n={2} title={t('setupGuide.step4.editDeviceId', 'Edit DEVICE_ID')}>
                  <p>{t('setupGuide.step4.editDeviceIdBody.a', 'Change ')}<code>DEVICE_ID</code>{t('setupGuide.step4.editDeviceIdBody.b', ' in the code to a unique name (e.g., "arduino-001").')}</p>
                </Step>
                <Step n={3} title={t('setupGuide.step4.upload', 'Upload')}>
                  <p>{t('setupGuide.step4.uploadVerify.a', 'Click Upload. After upload, open Serial Monitor at ')}<strong>115200 baud</strong>{t('setupGuide.step4.uploadVerify.b', ' to verify JSON output.')}</p>
                </Step>
              </>
            )}
            <CodeBlock title={t('setupGuide.sketchTitle', '{board} Sketch (.ino)', { board: selectedBoard === 'esp32' ? 'ESP32' : 'Arduino Uno' })} lang="C++" t={t}>{selectedBoard === 'esp32' ? ESP32_CODE : ARDUINO_UNO_CODE}</CodeBlock>
          </div>
        </GuideSection>

        {/* ──── STEP 5: PC Bridge (Arduino only) ──── */}
        {selectedBoard === 'arduino-uno' && (
          <GuideSection
            title={t('setupGuide.step5Title', 'Step 5 — Start PC Bridge (Arduino Only)')}
            icon={<Cable size={18} className="text-[var(--blue)]" />}
          >
            <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
              <p>{t('setupGuide.step5Body', 'Arduino Uno has no WiFi. The bridge script reads Serial JSON from Arduino and publishes to MQTT:')}</p>
              <Step n={1} title={t('setupGuide.step5.installDeps', 'Install Node.js Dependencies')}>
                <CodeBlock title={t('setupGuide.terminal', 'Terminal')} lang="bash" t={t}>{`npm install serialport mqtt`}</CodeBlock>
              </Step>
              <Step n={2} title={t('setupGuide.step5.findPort', 'Find Your COM Port')}>
                <p>{t('setupGuide.step5.findPortBody.a', 'Check ')}<strong>Device Manager → Ports (COM & LPT)</strong>{t('setupGuide.step5.findPortBody.b', ' for "Arduino Uno (COM3)" or similar.')}</p>
              </Step>
              <Step n={3} title={t('setupGuide.step5.runBridge', 'Run the Bridge')}>
                <CodeBlock title={t('setupGuide.terminal', 'Terminal')} lang="bash" t={t}>{`node bridge.js COM3`}</CodeBlock>
                <p>{t('setupGuide.step5.runBridgeBody', 'You should see MQTT publish messages appearing every 5 seconds.')}</p>
              </Step>
              <CodeBlock title={t('setupGuide.bridgeJs', 'bridge.js')} lang="JavaScript" t={t}>{BRIDGE_CODE}</CodeBlock>
            </div>
          </GuideSection>
        )}

        {/* ──── STEP 6: Platform Connection ──── */}
        <GuideSection
          title={t('setupGuide.step6Title', 'Step {n} — Connect in the Platform', { n: selectedBoard === 'esp32' ? '5' : '6' })}
          icon={<CheckCircle2 size={18} className="text-[var(--emerald)]" />}
          defaultOpen={true}
        >
          <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
            <Step n={1} title={t('setupGuide.step6.linkBroker', 'Link the MQTT Broker')}>
              <p>{t('setupGuide.step6.linkBrokerBody.a', 'Go to ')}<strong>Connect Device</strong>{t('setupGuide.step6.linkBrokerBody.b', ' page. Enter your broker URL (default: ')}<code>ws://localhost:9001</code>{t('setupGuide.step6.linkBrokerBody.c', ') and click ')}<strong>Connect</strong>{t('setupGuide.step6.linkBrokerBody.d', '.')}</p>
            </Step>
            <Step n={2} title={t('setupGuide.step6.register', 'Register Your Device')}>
              <p>{t('setupGuide.step6.registerBody.a', 'Enter the same ')}<code>DEVICE_ID</code>{t('setupGuide.step6.registerBody.b', ' you set in the Arduino code, select the device type, and click ')}<strong>Add Device</strong>{t('setupGuide.step6.registerBody.c', '.')}</p>
            </Step>
            <Step n={3} title={t('setupGuide.step6.verifyData', 'Verify Data Flow')}>
              <p>{t('setupGuide.step6.verifyDataBody.a', 'The device will show as ')}<Pill tone="amber">{t('setupGuide.status.pending', 'pending')}</Pill>{t('setupGuide.step6.verifyDataBody.b', ' until its first reading arrives. Once data flows, it flips to ')}<Pill tone="emerald">{t('setupGuide.status.connected', 'connected')}</Pill>{t('setupGuide.step6.verifyDataBody.c', '.')}</p>
            </Step>
            <div className="flex items-start gap-2 p-2 bg-[var(--emerald-dim)] rounded-lg border border-[var(--emerald)]/20">
              <CheckCircle2 size={14} className="text-[var(--emerald)] mt-0.5 shrink-0" />
              <span>{t('setupGuide.step6Tip', 'Tip: Open Serial Monitor to confirm your device is sending data. You should see JSON lines every 5 seconds.')}</span>
            </div>
          </div>
        </GuideSection>

        {/* ──── Troubleshooting ──── */}
        <GuideSection
          title={t('setupGuide.troubleshooting', 'Troubleshooting')}
          icon={<AlertTriangle size={18} className="text-[var(--amber)]" />}
        >
          <div className="mt-3 space-y-3 text-xs text-[var(--text-secondary)]">
            <div className="space-y-2">
              {[
                [t('setupGuide.faq.devicePending', 'Device stays "pending"'), t('setupGuide.faq.devicePendingSol', 'Check that the MQTT broker is running (Docker), the broker URL in the platform matches ws://localhost:9001, and the DEVICE_ID matches exactly.')],
                [t('setupGuide.faq.noSerial', 'No Serial output'), t('setupGuide.faq.noSerialSol', 'Verify baud rate is 115200 in Serial Monitor. Check wiring — especially VCC and GND.')],
                [t('setupGuide.faq.wifiFail', 'ESP32: WiFi connection fails'), t('setupGuide.faq.wifiFailSol', 'Ensure you\'re using 2.4GHz WiFi (ESP32 doesn\'t support 5GHz). Check SSID/password are correct.')],
                [t('setupGuide.faq.mqttFail', 'MQTT connection fails'), t('setupGuide.faq.mqttFailSol', 'Run "mosquitto -h" to verify Mosquitto is installed. Check that port 1883 is not blocked by firewall.')],
                [t('setupGuide.faq.unstable', 'Unstable readings'), t('setupGuide.faq.unstableSol', 'Add 100nF decoupling capacitors on sensor VCC pins. Keep analog wires short. Avoid running sensor wires near power cables.')],
                [t('setupGuide.faq.dhtNan', 'DHT22 returns NaN'), t('setupGuide.faq.dhtNanSol', 'Add a 10kΩ pull-up resistor between DATA and VCC. Ensure the sensor has had at least 2 seconds to initialize.')],
              ].map(([problem, solution], i) => (
                <div key={i} className="p-2 bg-black/20 rounded-lg">
                  <div className="font-medium text-[var(--text-primary)]">{problem}</div>
                  <div className="text-[var(--text-tertiary)] mt-0.5">{solution}</div>
                </div>
              ))}
            </div>
          </div>
        </GuideSection>

      </div>
    </div>
  );
}
