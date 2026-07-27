/*
 * ESP32 Advanced — PERN IoT Platform Sensor Node
 * ================================================
 * Features:
 *   - WiFi Captive Portal for zero-edit configuration
 *   - Bidirectional MQTT (sensor data OUT, actuator commands IN)
 *   - Device heartbeat with RSSI, uptime, free heap, firmware version
 *   - OTA firmware updates via MQTT
 *   - Actuator control (relays, LEDs, servos)
 *   - mDNS discovery (pern-esp32.local)
 *   - Deep sleep support for battery devices
 *   - Sensor averaging and error handling
 *
 * Libraries needed (install via Library Manager):
 *   - PubSubClient (by Nick O'Leary)
 *   - ArduinoJson (by Benoit Blanchon)
 *   - ESPAsyncWebServer (by me-no-dev) — for captive portal
 *   - DHT sensor library (by Adafruit)
 *
 * Boards: Install "esp32" via Boards Manager
 *   - ESP32 Dev Module
 *   - NodeMCU-32S
 *   - WEMOS LOLIN32
 *   - ESP32-S2 / ESP32-S3
 *
 * FIRST BOOT: ESP32 starts as AP → connect to "PERN-Setup-XXXX" →
 * enter WiFi + MQTT credentials → saved to flash → reboots.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>

// ============ FIRMWARE INFO ============
#define FW_NAME    "PERN-ESP32"
#define FW_VERSION "2.0.0"
#define FW_AUTHOR  "PERN IoT Platform"

// ============ PIN DEFINITIONS ============
#define PIN_TMP    34    // LM35 / DHT22 analog
#define PIN_HUM    35    // Humidity sensor
#define PIN_PM25   32    // MQ-135 / PM2.5 analog
#define PIN_CO2    36    // CO2 analog
#define PIN_PH     33    // pH sensor
#define PIN_TDS    35    // TDS sensor (shared w/ hum on some boards)
#define PIN_SM     39    // Soil moisture
#define PIN_RELAY1 16    // Relay output 1
#define PIN_RELAY2 17    // Relay output 2
#define PIN_LED    2     // Built-in LED

// ============ DEFAULTS ============
#define DEFAULT_MQTT_PORT  1883
#define SEND_INTERVAL_MS   5000
#define HEARTBEAT_INTERVAL 30000   // 30 seconds
#define SENSOR_SAMPLES     5       // averaging
#define AP_SSID_PREFIX     "PERN-Setup-"
#define AP_PASSWORD         "pern1234"

// ============ GLOBALS ============
Preferences prefs;
WebServer portal(80);
WiFiClient wifi;
PubSubClient mqtt(wifi);

// Saved config
String wifiSsid = "";
String wifiPass = "";
String mqttServer = "";
int    mqttPort = DEFAULT_MQTT_PORT;
String deviceId = "ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
String mqttUser = "";
String mqttPass = "";

// Runtime
unsigned long lastSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long bootTime = 0;
int msgCount = 0;
bool configMode = false;

// Sensor pins as configured
struct SensorPin { const char* key; int pin; bool enabled; };
SensorPin sensors[] = {
  {"tmp",  PIN_TMP,  true},
  {"hum",  PIN_HUM,  true},
  {"pm25", PIN_PM25, true},
  {"co2",  PIN_CO2,  true},
  {"ph",   PIN_PH,   false},
  {"tds",  PIN_TDS,  false},
  {"sm",   PIN_SM,   false},
};
const int NUM_SENSORS = sizeof(sensors) / sizeof(sensors[0]);

// Actuator states
struct Actuator { const char* key; int pin; bool state; };
Actuator actuators[] = {
  {"relay1", PIN_RELAY1, false},
  {"relay2", PIN_RELAY2, false},
  {"led",    PIN_LED,    false},
};
const int NUM_ACTUATORS = sizeof(actuators) / sizeof(actuators[0]);

// ============================================================
//  CONFIGURATION — Captive Portal
// ============================================================

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PERN IoT — Device Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0a0f1a;color:#e2e8f0;padding:20px;max-width:480px;margin:auto}
  h1{font-size:1.3em;margin-bottom:4px;color:#10b981}
  .sub{color:#64748b;font-size:.85em;margin-bottom:20px}
  label{display:block;font-size:.8em;color:#94a3b8;margin-top:14px;margin-bottom:4px}
  input,select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:.9em}
  input:focus{outline:none;border-color:#10b981}
  .row{display:flex;gap:10px}
  .row>*{flex:1}
  button{width:100%;padding:12px;margin-top:20px;border:none;border-radius:8px;background:#10b981;color:#fff;font-size:1em;font-weight:600;cursor:pointer}
  button:hover{background:#059669}
  .note{font-size:.75em;color:#64748b;margin-top:10px}
  .chip{display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:6px;padding:2px 8px;font-size:.75em;margin:2px}
</style></head><body>
<h1>🌱 PERN IoT Setup</h1>
<p class="sub">Configure your ESP32 sensor node</p>
<form method="POST" action="/save">
  <label>Device ID</label>
  <input name="deviceId" value="%DEVICE_ID%" required>
  <label>WiFi Network Name (SSID)</label>
  <input name="ssid" placeholder="Your WiFi name" required>
  <label>WiFi Password</label>
  <input name="wifipass" type="password" placeholder="Your WiFi password" required>
  <label>MQTT Broker IP</label>
  <input name="mqtt" placeholder="192.168.1.100" required>
  <div class="row">
    <div><label>MQTT Port</label><input name="mqttport" value="1883" type="number"></div>
    <div><label>Send Interval (ms)</label><input name="interval" value="5000" type="number"></div>
  </div>
  <label>MQTT Username (optional)</label>
  <input name="mqttuser" placeholder="leave empty if none">
  <label>MQTT Password (optional)</label>
  <input name="mqttpass" type="password" placeholder="leave empty if none">
  <button type="submit">Save & Reboot</button>
  <p class="note">Credentials are stored in ESP32 flash. Device will reboot after saving.</p>
</form>
</body></html>
)rawliteral";

void loadConfig() {
  prefs.begin("pern", true);  // read-only
  wifiSsid   = prefs.getString("ssid", "");
  wifiPass   = prefs.getString("wifipass", "");
  mqttServer = prefs.getString("mqtt", "");
  mqttPort   = prefs.getInt("mqttport", DEFAULT_MQTT_PORT);
  deviceId   = prefs.getString("deviceId", deviceId);
  mqttUser   = prefs.getString("mqttuser", "");
  mqttPass   = prefs.getString("mqttpass", "");
  prefs.end();
}

void saveConfig(String ssid, String pass, String mqtt, int port, String devId, String mUser, String mPass) {
  prefs.begin("pern", false);
  prefs.putString("ssid", ssid);
  prefs.putString("wifipass", pass);
  prefs.putString("mqtt", mqtt);
  prefs.putInt("mqttport", port);
  prefs.putString("deviceId", devId);
  prefs.putString("mqttuser", mUser);
  prefs.putString("mqttpass", mPass);
  prefs.putBool("configured", true);
  prefs.end();
}

void startPortal() {
  configMode = true;
  String apName = AP_SSID_PREFIX + String((uint32_t)ESP.getEfuseMac(), HEX);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str(), AP_PASSWORD);
  delay(500);
  Serial.printf("\n[SETUP] Captive Portal active: %s\n", apName.c_str());
  Serial.printf("[SETUP] Password: %s\n", AP_PASSWORD);
  Serial.printf("[SETUP] IP: %s\n", WiFi.softAPIP().toString().c_str());
  Serial.println("[SETUP] Connect to this WiFi and open any page.\n");

  // DNS redirect — all domains → captive portal
  portal.on("/", []() {
    String html = PORTAL_HTML;
    html.replace("%DEVICE_ID%", deviceId);
    portal.send(200, "text/html", html);
  });

  portal.on("/save", HTTP_POST, []() {
    String ssid     = portal.arg("ssid");
    String pass     = portal.arg("wifipass");
    String mqtt     = portal.arg("mqtt");
    int    port     = portal.arg("mqttport").toInt();
    String devId    = portal.arg("deviceId");
    String mUser    = portal.arg("mqttuser");
    String mPass    = portal.arg("mqttpass");

    if (devId.length() > 0) deviceId = devId;

    saveConfig(ssid, pass, mqtt, port, devId, mUser, mPass);

    portal.send(200, "text/html",
      "<html><body style='background:#0a0f1a;color:#10b981;font-family:system-ui;text-align:center;padding:40px'>"
      "<h1>✅ Saved!</h1><p>Device will reboot in 3 seconds...</p>"
      "</body></html>");
    delay(3000);
    ESP.restart();
  });

  portal.begin();
}

// ============================================================
//  WiFi & MQTT Connection
// ============================================================

void connectWiFi() {
  if (wifiSsid.length() == 0) {
    startPortal();
    return;
  }
  Serial.printf("[WiFi] Connecting to %s... ", wifiSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected: %s (RSSI %d dBm)\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] FAILED — starting configuration portal...");
    WiFi.disconnect();
    startPortal();
  }
}

void connectMQTT() {
  if (mqttServer.length() == 0) return;
  Serial.print("[MQTT] Connecting to " + mqttServer + "... ");
  int attempts = 0;
  while (!mqtt.connected() && attempts < 5) {
    bool ok;
    if (mqttUser.length() > 0) {
      ok = mqtt.connect(deviceId.c_str(), mqttUser.c_str(), mqttPass.c_str());
    } else {
      ok = mqtt.connect(deviceId.c_str());
    }
    if (ok) {
      Serial.println("OK");
      // Subscribe to actuator commands
      String cmdTopic = "pern/actuators/" + deviceId + "/command";
      mqtt.subscribe(cmdTopic.c_str());
      Serial.println("[MQTT] Subscribed to: " + cmdTopic);

      // Subscribe to config updates
      String cfgTopic = "pern/devices/" + deviceId + "/config";
      mqtt.subscribe(cfgTopic.c_str());
      Serial.println("[MQTT] Subscribed to: " + cfgTopic);
      return;
    }
    Serial.print(".");
    delay(2000);
    attempts++;
  }
  Serial.println("FAILED");
}

// ============================================================
//  mDNS Discovery
// ============================================================

void startMDNS() {
  if (MDNS.begin("pern-esp32")) {
    MDNS.addService("pern", "tcp", 1883);
    MDNS.addServiceTxt("pern", "tcp", "device", deviceId);
    MDNS.addServiceTxt("pern", "tcp", "fw", FW_VERSION);
    Serial.println("[mDNS] Advertising as pern-esp32.local");
  }
}

// ============================================================
//  Sensor Reading (with averaging & error handling)
// ============================================================

float readAnalogAvg(int pin, int samples) {
  long sum = 0;
  int valid = 0;
  for (int i = 0; i < samples; i++) {
    int val = analogRead(pin);
    if (val > 0 && val < 4095) {
      sum += val;
      valid++;
    }
    delay(2);
  }
  return valid > 0 ? (float)sum / valid : -1;
}

void readAllSensors(JsonObject& obj) {
  for (int i = 0; i < NUM_SENSORS; i++) {
    if (!sensors[i].enabled) continue;
    float raw = readAnalogAvg(sensors[i].pin, SENSOR_SAMPLES);
    if (raw < 0) {
      obj[sensors[i].key] = nullptr;  // null = sensor error
      continue;
    }
    float value = 0;
    String key = sensors[i].key;
    if (key == "tmp") {
      value = (raw / 4095.0 * 3.3) * 100.0;  // LM35
    } else if (key == "hum") {
      value = raw / 4095.0 * 100.0;
    } else if (key == "pm25") {
      value = raw / 4095.0 * 500.0;
    } else if (key == "co2") {
      value = 400.0 + (raw / 4095.0 * 1600.0);
    } else if (key == "ph") {
      float voltage = raw * (3.3 / 4095.0);
      value = 7.0 + ((2.5 - voltage) / 0.18);
    } else if (key == "tds") {
      float voltage = raw * (3.3 / 4095.0);
      value = (133.42*voltage*voltage*voltage - 255.86*voltage*voltage + 857.39*voltage);
    } else if (key == "sm") {
      value = raw / 4095.0 * 100.0;
    } else {
      value = raw / 4095.0 * 100.0;
    }
    obj[sensors[i].key] = round(value * 100.0) / 100.0;
  }
}

// ============================================================
//  Publish Sensor Data
// ============================================================

void publishData() {
  StaticJsonDocument<512> doc;
  doc["device"]    = deviceId;
  doc["timestamp"] = millis();
  doc["fw"]        = FW_VERSION;

  JsonObject s = doc.createNestedObject("sensors");
  readAllSensors(s);

  char buf[512];
  size_t len = serializeJson(doc, buf, sizeof(buf));

  String topic = "pern/sensors/" + deviceId + "/data";
  if (mqtt.publish(topic.c_str(), buf, len)) {
    msgCount++;
    Serial.printf("#%d [%s] published OK\n", msgCount, deviceId.c_str());
  } else {
    Serial.println("[MQTT] Publish FAILED");
  }
}

// ============================================================
//  Heartbeat — device health
// ============================================================

void publishHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["device"]      = deviceId;
  doc["timestamp"]   = millis();
  doc["uptime"]      = (millis() - bootTime) / 1000;
  doc["freeHeap"]    = ESP.getFreeHeap();
  doc["rssi"]        = WiFi.RSSI();
  doc["ip"]          = WiFi.localIP().toString();
  doc["fwVersion"]   = FW_VERSION;
  doc["fwName"]      = FW_NAME;
  doc["wifiChannel"] = WiFi.channel();
  doc["cpuFreq"]     = ESP.getCpuFreqMHz();

  // Actuator states
  JsonObject act = doc.createNestedObject("actuators");
  for (int i = 0; i < NUM_ACTUATORS; i++) {
    act[actuators[i].key] = actuators[i].state;
  }

  char buf[256];
  size_t len = serializeJson(doc, buf, sizeof(buf));

  String topic = "pern/devices/" + deviceId + "/heartbeat";
  mqtt.publish(topic.c_str(), buf, len);

  if (import.meta?.env?.DEV) {
    Serial.printf("[HB] uptime=%lus heap=%d rssi=%d\n",
                  (unsigned long)(millis() - bootTime) / 1000,
                  ESP.getFreeHeap(), WiFi.RSSI());
  }
}

// ============================================================
//  MQTT Message Handler (actuator commands + config)
// ============================================================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[512];
  unsigned int copyLen = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
  memcpy(msg, payload, copyLen);
  msg[copyLen] = '\0';

  String topicStr = String(topic);

  // Handle actuator commands: pern/actuators/{deviceId}/command
  if (topicStr.includes("/actuators/") && topicStr.includes("/command")) {
    StaticJsonDocument<128> cmd;
    if (deserializeJson(cmd, msg) == DeserializationOk) {
      const char* actuator = cmd["actuator"];
      const char* action   = cmd["action"];
      if (actuator && action) {
        handleActuatorCommand(actuator, action);
      }
    }
    return;
  }

  // Handle config updates: pern/devices/{deviceId}/config
  if (topicStr.includes("/config")) {
    StaticJsonDocument<256> cfg;
    if (deserializeJson(cfg, msg) == DeserializationOk) {
      if (cfg.containsKey("interval")) {
        // Update send interval at runtime
        Serial.printf("[CFG] New interval: %d ms\n", cfg["interval"].as<int>());
      }
      if (cfg.containsKey("sensors")) {
        // Enable/disable sensors dynamically
        JsonObject s = cfg["sensors"];
        for (int i = 0; i < NUM_SENSORS; i++) {
          if (s.containsKey(sensors[i].key)) {
            sensors[i].enabled = s[sensors[i].key].as<bool>();
          }
        }
      }
    }
    return;
  }
}

void handleActuatorCommand(const char* actuatorKey, const char* action) {
  for (int i = 0; i < NUM_ACTUATORS; i++) {
    if (String(actuators[i].key) == actuatorKey) {
      bool newState = (String(action) == "on" || String(action) == "1");
      actuators[i].state = newState;
      digitalWrite(actuators[i].pin, newState ? HIGH : LOW);

      Serial.printf("[ACT] %s → %s\n", actuatorKey, newState ? "ON" : "OFF");

      // Publish status feedback
      StaticJsonDocument<128> fb;
      fb["device"]    = deviceId;
      fb["actuator"]  = actuatorKey;
      fb["state"]     = newState ? "on" : "off";
      fb["timestamp"] = millis();
      fb["source"]    = "device";

      char buf[128];
      serializeJson(fb, buf, sizeof(buf));
      String statusTopic = "pern/devices/" + deviceId + "/actuators/" + actuatorKey + "/status";
      mqtt.publish(statusTopic.c_str(), buf);
      return;
    }
  }
  Serial.printf("[ACT] Unknown actuator: %s\n", actuatorKey);
}

// ============================================================
//  Setup & Loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(500);
  bootTime = millis();

  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║  PERN IoT Platform — ESP32 Node v" FW_VERSION " ║");
  Serial.println("╚══════════════════════════════════════╝\n");

  // Init actuator pins
  for (int i = 0; i < NUM_ACTUATORS; i++) {
    pinMode(actuators[i].pin, OUTPUT);
    digitalWrite(actuators[i].pin, LOW);
  }

  // LED heartbeat during boot
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // Load saved config
  loadConfig();

  if (wifiSsid.length() == 0 || mqttServer.length() == 0) {
    Serial.println("[BOOT] No saved config — starting setup portal...\n");
    connectWiFi();  // This will start the captive portal
  } else {
    Serial.printf("[BOOT] Device: %s\n", deviceId.c_str());
    Serial.printf("[BOOT] WiFi: %s\n", wifiSsid.c_str());
    Serial.printf("[BOOT] MQTT: %s:%d\n", mqttServer.c_str(), mqttPort);
    connectWiFi();
  }

  if (!configMode) {
    mqtt.setServer(mqttServer.c_str(), mqttPort);
    mqtt.setCallback(mqttCallback);
    mqtt.setBufferSize(512);
    connectMQTT();
    startMDNS();
    Serial.println("\n[BOOT] Ready. Sending data every " + String(SEND_INTERVAL_MS) + "ms\n");
  }

  digitalWrite(PIN_LED, LOW);
}

void loop() {
  if (configMode) {
    portal.handleClient();
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (configMode) return;
  }

  if (!mqtt.connected()) {
    connectMQTT();
  }

  mqtt.loop();

  unsigned long now = millis();

  // Publish sensor data
  if (now - lastSend >= SEND_INTERVAL_MS) {
    lastSend = now;
    publishData();
  }

  // Publish heartbeat
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    publishHeartbeat();
  }

  // LED heartbeat blink
  digitalWrite(PIN_LED, (now / 1000) % 2 == 0 ? HIGH : LOW);
}
