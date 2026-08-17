/**
 * ESP32 Sketch Generator
 *
 * Generates a ready-to-upload Arduino sketch personalized with the user's
 * WiFi credentials, MQTT broker IP, device ID, sensor configuration, and
 * (optionally) device API key + backend URL for HTTP fallback ingestion.
 *
 * The generated sketch follows the same canonical contract as the full
 * ESP32_WiFi firmware:
 *   - Actuator commands on pern/devices/{id}/actuators/+/command with
 *     payload { device, actuator, command, params } (legacy topic also handled)
 *   - NTP-synced epoch timestamps in every publish
 *   - MQTT username/password auth (username=deviceId, password=apiKey)
 *   - HTTP fallback to POST /api/readings when MQTT publish fails
 */

export interface SketchConfig {
  deviceId: string;
  wifiSsid: string;
  wifiPass: string;
  mqttServer: string;
  mqttPort: number;
  sendInterval: number;
  sensors: string[];
  actuators: string[];
  apiKey?: string;
  serverUrl?: string;
}

const PIN_MAP: Record<string, number> = {
  tmp: 34, hum: 35, pm25: 32, co2: 36, ph: 33, tds: 39, sm: 14,
};

const RELAY_PINS: Record<string, number> = {
  relay1: 16, relay2: 17, led: 2,
};

export function generateESP32Sketch(config: SketchConfig): string {
  const sensorDefines = config.sensors
    .map(s => `#define PIN_${s.toUpperCase()}  ${PIN_MAP[s] ?? 34}`)
    .join('\n');

  const sensorReads = config.sensors.map(s => {
    switch (s) {
      case 'tmp':
        return `  float tmp = (analogRead(PIN_TMP) / 4095.0 * 3.3) * 100.0;`;
      case 'hum':
        return `  float hum = analogRead(PIN_HUM) / 4095.0 * 100.0;`;
      case 'pm25':
        return `  int pm25 = map(analogRead(PIN_PM25), 0, 4095, 0, 500);`;
      case 'co2':
        return `  float co2 = 400.0 + (analogRead(PIN_CO2) / 4095.0 * 1600.0);`;
      case 'ph':
        return `  float voltage_ph = analogRead(PIN_PH) * (3.3 / 4095.0);\n  float ph = 7.0 + ((2.5 - voltage_ph) / 0.18);`;
      case 'tds':
        return `  float voltage_tds = analogRead(PIN_TDS) * (3.3 / 4095.0);\n  float tds = (133.42*voltage_tds*voltage_tds*voltage_tds - 255.86*voltage_tds*voltage_tds + 857.39*voltage_tds);`;
      case 'sm':
        return `  int sm = map(analogRead(PIN_SM), 0, 4095, 0, 100);`;
      default:
        return `  float ${s} = analogRead(34) / 4095.0 * 100.0;`;
    }
  }).join('\n');

  const sensorJson = config.sensors.map(s => {
    const cast = ['tmp', 'hum', 'co2', 'ph', 'tds'].includes(s) ? 'round(' + s + ' * 100.0) / 100.0' : s;
    return `  s["${s}"] = ${cast};`;
  }).join('\n');

  // Only numeric sensors are forwarded over HTTP (the backend rejects nulls).
  const httpSensors = config.sensors.map(s => {
    const cast = ['tmp', 'hum', 'co2', 'ph', 'tds'].includes(s) ? 'round(' + s + ' * 100.0) / 100.0' : s;
    return `  if (ss.containsKey("${s}")) dst["${s}"] = ${cast};`;
  }).join('\n');

  const relayDefines = config.actuators
    .map(a => `#define PIN_${a.toUpperCase()}  ${RELAY_PINS[a] ?? 16}`)
    .join('\n');

  const relaySetup = config.actuators
    .map(a => `  pinMode(PIN_${a.toUpperCase()}, OUTPUT);\n  digitalWrite(PIN_${a.toUpperCase()}, LOW);`)
    .join('\n');

  const hasActuators = config.actuators.length > 0;
  const hasFallback = !!config.serverUrl && config.serverUrl.trim().length > 0;
  const hasApiKey = !!config.apiKey && config.apiKey.trim().length > 0;

  const apiKeyDefine = hasApiKey
    ? `const char* API_KEY = "${config.apiKey}";`
    : 'const char* API_KEY = "";';
  const serverUrlDefine = hasFallback
    ? `const char* SERVER_URL = "${config.serverUrl}";`
    : 'const char* SERVER_URL = "";';

  const httpInclude = hasFallback ? '\n#include <HTTPClient.h>' : '';
  const timeInclude = '\n#include <time.h>';

  const actuatorSubscribe = hasActuators ? `
  // Subscribe to actuator commands (canonical topic + legacy)
  String cmdTopic = "pern/devices/" + String(DEVICE_ID) + "/actuators/+/command";
  mqtt.subscribe(cmdTopic.c_str());
  String legacyTopic = "pern/actuators/" + String(DEVICE_ID) + "/command";
  mqtt.subscribe(legacyTopic.c_str());` : '';

  const actuatorHandler = hasActuators ? `
void handleActuator(const char* actuator, const char* command, float value) {
  bool on = (strcmp(command, "on") == 0) || (strcmp(command, "set") == 0 && value > 0);
${config.actuators.map(a => `  if (strcmp(actuator, "${a}") == 0) {
    digitalWrite(PIN_${a.toUpperCase()}, on ? HIGH : LOW);
    Serial.printf("[ACT] %s -> %s\\n", "${a}", on ? "ON" : "OFF");
    // Publish status feedback
    StaticJsonDocument<128> fb;
    fb["device"] = DEVICE_ID;
    fb["actuator"] = "${a}";
    fb["state"] = on ? "on" : "off";
    fb["timestamp"] = epochMillis();
    fb["source"] = "device";
    char buf[128];
    serializeJson(fb, buf);
    mqtt.publish(("pern/devices/" + String(DEVICE_ID) + "/actuators/${a}/status").c_str(), buf);
    return;
  }`).join('\n')}
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[512];
  unsigned int len = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
  memcpy(msg, payload, len);
  msg[len] = 0;

  StaticJsonDocument<256> cmd;
  if (deserializeJson(cmd, msg) != DeserializationOk) return;

  String actuator = cmd["actuator"] | "";
  String command = cmd["command"] | "";
  if (command == "") command = cmd["action"] | "";
  float value = cmd["params"]["value"] | 0.0f;
  if (actuator != "" && command != "") {
    handleActuator(actuator.c_str(), command.c_str(), value);
  }
}` : '';

  const httpFallback = hasFallback ? `
// ===== HTTP fallback (when MQTT publish fails) =====
void httpFallback(JsonObject ss) {
  HTTPClient http;
  http.setTimeout(4000);
  String url = String(SERVER_URL);
  if (!url.endsWith("/")) url += "/";
  url += "api/readings";

  StaticJsonDocument<512> out;
  out["device"]    = DEVICE_ID;
  out["timestamp"] = epochMillis();
  JsonObject dst = out.createNestedObject("sensors");
${httpSensors}
  if (dst.size() == 0) return;

  String body;
  serializeJson(out, body);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  if (API_KEY[0] != '\\0') http.addHeader("X-Api-Key", API_KEY);
  int code = http.POST(body);
  Serial.printf("[HTTP] fallback -> %d\\n", code);
  http.end();
}` : '';

  return `// ================================================
// ESP32 Sensor Node — Auto-generated for PERN IoT
// Device: ${config.deviceId}
// WiFi:   ${config.wifiSsid}
// MQTT:   ${config.mqttServer}:${config.mqttPort}
// Sensors: ${config.sensors.join(', ')}
// Actuators: ${config.actuators.length > 0 ? config.actuators.join(', ') : 'none'}
// HTTP fallback: ${hasFallback ? config.serverUrl : 'disabled'}
// Generated: ${new Date().toISOString()}
// ================================================
//
// Libraries (install via Arduino Library Manager):
//   - PubSubClient (by Nick O'Leary)
//   - ArduinoJson (by Benoit Blanchon)
//
// Board: Install "esp32" via Boards Manager
//   Select: ESP32 Dev Module

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>${timeInclude}${httpInclude}

// ===== CONFIGURATION =====
const char* WIFI_SSID   = "${config.wifiSsid}";
const char* WIFI_PASS   = "${config.wifiPass}";
const char* MQTT_SERVER = "${config.mqttServer}";
const int   MQTT_PORT   = ${config.mqttPort};
const char* DEVICE_ID   = "${config.deviceId}";
const unsigned long INTERVAL = ${config.sendInterval};
${apiKeyDefine}
${serverUrlDefine}

// ===== PINS =====
${sensorDefines}
${relayDefines ? '\n// ===== ACTUATORS =====\n' + relayDefines : ''}

WiFiClient wifi;
PubSubClient mqtt(wifi);
unsigned long lastSend = 0;
int msgCount = 0;

// ===== NTP / epoch timestamps =====
unsigned long long epochMillis() {
  time_t nowT = time(nullptr);
  if (nowT > 1600000000) return ((unsigned long long)nowT) * 1000ULL;
  return millis();
}

void syncNtp() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  int attempts = 0;
  while (time(nullptr) < 1600000000 && attempts < 20) {
    delay(500);
    attempts++;
  }
  Serial.printf("[NTP] %s\\n", time(nullptr) > 1600000000 ? "synced" : "timeout");
}

// ===== WiFi =====
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s... ", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\\n[WiFi] Connected: %s (RSSI %d dBm)\\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    syncNtp();
  } else {
    Serial.println("\\n[WiFi] FAILED - restarting...");
    ESP.restart();
  }
}

// ===== MQTT =====
void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("[MQTT] Connecting...");
    bool ok;
    if (API_KEY[0] != '\\0') {
      ok = mqtt.connect(DEVICE_ID, DEVICE_ID, API_KEY);
    } else {
      ok = mqtt.connect(DEVICE_ID);
    }
    if (ok) {
      Serial.println("OK");
${actuatorSubscribe}
    } else {
      Serial.printf(" failed (rc=%d), retrying...\\n", mqtt.state());
      delay(3000);
    }
  }
}
${actuatorHandler}
${httpFallback}

// ===== Setup =====
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\\n=================================");
  Serial.println(" PERN IoT — ${config.deviceId}");
  Serial.println("=================================");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
${relaySetup}

  connectWiFi();
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setBufferSize(1024);
${hasActuators ? '  mqtt.setCallback(mqttCallback);' : ''}
  connectMQTT();

  Serial.println("[BOOT] Ready. Sending data every ${config.sendInterval}ms\\n");
}

// ===== Loop =====
void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastSend < INTERVAL) return;
  lastSend = now;

  // Read sensors
${sensorReads}

  // Build JSON
  StaticJsonDocument<512> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = epochMillis();
${hasApiKey ? '  doc["apiKey"] = API_KEY;' : ''}
  JsonObject s = doc.createNestedObject("sensors");
${sensorJson}

  // Publish
  char buf[512];
  serializeJson(doc, buf);
  String topic = "pern/sensors/" + String(DEVICE_ID) + "/data";
  if (mqtt.publish(topic.c_str(), buf)) {
    msgCount++;
    Serial.printf("#%d [%s] published OK\\n", msgCount, DEVICE_ID);
  } else {
    Serial.println("[MQTT] Publish FAILED!");
${hasFallback ? '    httpFallback(doc["sensors"]);' : ''}
  }
}
`;
}
