/**
 * ESP32 Sketch Generator
 *
 * Generates a ready-to-upload Arduino sketch personalized with the user's
 * WiFi credentials, MQTT broker IP, device ID, and sensor configuration.
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

  const sensorSetup = config.sensors.includes('tmp') || config.sensors.includes('hum')
    ? '  dht.begin();\n' : '';

  const sensorReads = config.sensors.map(s => {
    switch (s) {
      case 'tmp':
        return `  float tmp = (analogRead(PIN_TMP) / 4095.0 * 3.3) * 100.0;`;
      case 'hum':
        return `  float hum = dht.readHumidity();`;
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

  const needsDHT = config.sensors.includes('tmp') || config.sensors.includes('hum');
  const dhtInclude = needsDHT ? '#include <DHT.h>\n#define DHT_PIN 4\n#define DHT_TYPE DHT22\nDHT dht(DHT_PIN, DHT_TYPE);\n' : '';
  const dhtInit = needsDHT ? '  dht.begin();\n' : '';

  const relayDefines = config.actuators
    .map(a => `#define PIN_${a.toUpperCase()}  ${RELAY_PINS[a] ?? 16}`)
    .join('\n');

  const relaySetup = config.actuators
    .map(a => `  pinMode(PIN_${a.toUpperCase()}, OUTPUT);\n  digitalWrite(PIN_${a.toUpperCase()}, LOW);`)
    .join('\n');

  const actuatorSubscribe = config.actuators.length > 0 ? `
  // Subscribe to actuator commands
  String cmdTopic = "pern/actuators/" + String(DEVICE_ID) + "/command";
  mqtt.subscribe(cmdTopic.c_str());` : '';

  const actuatorHandler = config.actuators.length > 0 ? `
void handleActuator(const char* actuator, const char* action) {
  bool on = (strcmp(action, "on") == 0);
${config.actuators.map(a => `  if (strcmp(actuator, "${a}") == 0) {
    digitalWrite(PIN_${a.toUpperCase()}, on ? HIGH : LOW);
    Serial.printf("[ACT] %s -> %s\\n", "${a}", on ? "ON" : "OFF");
    // Publish status feedback
    StaticJsonDocument<128> fb;
    fb["device"] = DEVICE_ID;
    fb["actuator"] = "${a}";
    fb["state"] = on ? "on" : "off";
    fb["source"] = "device";
    char buf[128];
    serializeJson(fb, buf);
    mqtt.publish(("pern/devices/" + String(DEVICE_ID) + "/actuators/${a}/status").c_str(), buf);
    return;
  }`).join('\n')}
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[256];
  unsigned int len = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
  memcpy(msg, payload, len);
  msg[len] = 0;

  StaticJsonDocument<128> cmd;
  if (deserializeJson(cmd, msg) == DeserializationOk) {
    handleActuator(cmd["actuator"], cmd["action"]);
  }
}` : '';

  return `// ================================================
// ESP32 Sensor Node — Auto-generated for PERN IoT
// Device: ${config.deviceId}
// WiFi:   ${config.wifiSsid}
// MQTT:   ${config.mqttServer}:${config.mqttPort}
// Sensors: ${config.sensors.join(', ')}
// Actuators: ${config.actuators.length > 0 ? config.actuators.join(', ') : 'none'}
// Generated: ${new Date().toISOString()}
// ================================================
//
// Libraries (install via Arduino Library Manager):
//   - PubSubClient (by Nick O'Leary)
//   - ArduinoJson (by Benoit Blanchon)
//   ${needsDHT ? '- DHT sensor library (by Adafruit)' : ''}
//
// Board: Install "esp32" via Boards Manager
//   Select: ESP32 Dev Module

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
${dhtInclude}

// ===== CONFIGURATION =====
const char* WIFI_SSID   = "${config.wifiSsid}";
const char* WIFI_PASS   = "${config.wifiPass}";
const char* MQTT_SERVER = "${config.mqttServer}";
const int   MQTT_PORT   = ${config.mqttPort};
const char* DEVICE_ID   = "${config.deviceId}";
const unsigned long INTERVAL = ${config.sendInterval};

// ===== PINS =====
${sensorDefines}
${relayDefines ? '\n// ===== ACTUATORS =====\n' + relayDefines : ''}

WiFiClient wifi;
PubSubClient mqtt(wifi);
Preferences prefs;
unsigned long lastSend = 0;
int msgCount = 0;
${dhtInclude ? '' : ''}

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
  } else {
    Serial.println("\\n[WiFi] FAILED - restarting...");
    ESP.restart();
  }
}

// ===== MQTT =====
void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("[MQTT] Connecting...");
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("OK");
${actuatorSubscribe}
    } else {
      Serial.printf(" failed (rc=%d), retrying...\\n", mqtt.state());
      delay(3000);
    }
  }
}
${actuatorHandler}

// ===== Setup =====
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\\n╔══════════════════════════════════════╗");
  Serial.println("║  PERN IoT — ${config.deviceId}          ║");
  Serial.println("╚══════════════════════════════════════╝\\n");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
${relaySetup}

  connectWiFi();
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setBufferSize(512);
${config.actuators.length > 0 ? '  mqtt.setCallback(mqttCallback);' : ''}
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
  doc["timestamp"] = millis();
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
  }
}
`;
}
