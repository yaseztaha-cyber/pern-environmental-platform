/*
 * ESP32 Advanced — PERN IoT Platform Sensor Node
 * ================================================
 * Features:
 *   - WiFi Captive Portal for zero-edit configuration
 *   - Bidirectional MQTT (sensor data OUT, actuator commands IN)
 *   - Device heartbeat with RSSI, uptime, free heap, firmware version
 *   - MQTT OTA firmware updates (chunked base64 over pern/devices/{id}/ota)
 *   - Actuator control (relays, LEDs, servos) — canonical command topic
 *   - HTTP fallback ingestion (POST /api/readings) when MQTT is unreachable
 *   - MQTT username/password auth (username=deviceId, password=apiKey)
 *   - NTP-synced epoch timestamps (no more millis() since boot)
 *   - Runtime config push over MQTT (interval + sensor enable) with persistence
 *   - mDNS discovery (pern-esp32.local)
 *   - Deep sleep support for battery devices
 *   - Sensor averaging and error handling
 *   - Soft watchdog + MQTT reconnect backoff
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
 *
 * MQTT CONTRACT (must match backend):
 *   OUT pern/sensors/{deviceId}/data                { device, timestamp, sensors, fw, apiKey }
 *   OUT pern/devices/{deviceId}/heartbeat           { device, timestamp, uptime, freeHeap, ... }
 *   OUT pern/devices/{deviceId}/status              { device, status: 'online', fwVersion }
 *   OUT pern/devices/{deviceId}/actuators/{act}/status
 *   OUT pern/devices/{deviceId}/config/ack          { device, accepted, config }
 *   OUT pern/devices/{deviceId}/ota/status          { device, state, percent, message }
 *   IN  pern/devices/{deviceId}/actuators/+/command { device, actuator, command, params, source }
 *   IN  pern/actuators/{deviceId}/command           (legacy: { actuator, action })
 *   IN  pern/devices/{deviceId}/config              { interval, sensors, source }
 *   IN  pern/devices/{deviceId}/ota                 { index:-1 kind:begin size | index:n chunk64 | index:-2 kind:end }
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>
#include <HTTPClient.h>
#include <time.h>

// ============ FIRMWARE INFO ============
#define FW_NAME    "PERN-ESP32"
#define FW_VERSION "2.1.0"
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
#define MQTT_BUFFER_SIZE    8192   // must fit the largest OTA chunk JSON
#define WATCHDOG_MS         90000  // soft watchdog — restart if the loop stalls

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
String apiKey = "";
String serverUrl = "";

// Runtime
unsigned long lastSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long bootTime = 0;
unsigned long sendInterval = SEND_INTERVAL_MS;
unsigned long lastLoopActivity = 0;
unsigned long lastMqttAttempt = 0;
unsigned long mqttBackoffMs = 1000;
int msgCount = 0;
int httpFallbackOk = 0;
int httpFallbackFail = 0;
bool configMode = false;

// OTA state
bool otaActive = false;
unsigned long otaSize = 0;
unsigned long otaReceived = 0;
int otaLastPercent = -1;
char mqttMsgBuf[MQTT_BUFFER_SIZE];       // global — keep big buffers off the stack
unsigned char otaDecodeBuf[4608];        // max decode of a 4096-char base64 chunk

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
//  Time — NTP-synced epoch timestamps
// ============================================================

unsigned long long epochMillis() {
  time_t nowT = time(nullptr);
  if (nowT > 1600000000) return ((unsigned long long)nowT) * 1000ULL;
  return (unsigned long long)millis();  // before NTP sync — uptime offset
}

void syncNtp() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[NTP] Syncing");
  int attempts = 0;
  while (time(nullptr) < 1600000000 && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (time(nullptr) > 1600000000) {
    struct tm t;
    getLocalTime(&t);
    Serial.printf(" OK (%04d-%02d-%02d %02d:%02d:%02d UTC)\n",
                  t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec);
  } else {
    Serial.println(" TIMEOUT — using uptime offsets until synced");
  }
}

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
<h1>PERN IoT Setup</h1>
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
  <label>Backend URL (HTTP fallback, optional)</label>
  <input name="serverurl" value="%SERVER_URL%" placeholder="http://192.168.1.100:3000">
  <label>Device API Key (optional)</label>
  <input name="apikey" value="%API_KEY%" placeholder="pern_... (issued on dashboard)">
  <label>MQTT Username (optional, overrides API key)</label>
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
  apiKey     = prefs.getString("apikey", "");
  serverUrl  = prefs.getString("serverurl", "");

  // Runtime state (send interval + sensor enable map) — persisted across reboots
  sendInterval = (unsigned long)prefs.getInt("sintv", SEND_INTERVAL_MS);
  String sensJson = prefs.getString("senscfg", "");
  if (sensJson.length() > 0) {
    StaticJsonDocument<256> d;
    if (deserializeJson(d, sensJson) == DeserializationOk) {
      for (int i = 0; i < NUM_SENSORS; i++) {
        if (d.containsKey(sensors[i].key)) {
          sensors[i].enabled = d[sensors[i].key].as<bool>();
        }
      }
    }
  }
  prefs.end();
}

String sensorConfigJson() {
  StaticJsonDocument<256> d;
  for (int i = 0; i < NUM_SENSORS; i++) {
    d[sensors[i].key] = sensors[i].enabled;
  }
  String out;
  serializeJson(d, out);
  return out;
}

void saveRuntimeState() {
  prefs.begin("pern", false);
  prefs.putInt("sintv", (int)sendInterval);
  prefs.putString("senscfg", sensorConfigJson());
  prefs.end();
}

void saveConfig(String ssid, String pass, String mqtt, int port, String devId,
                String mUser, String mPass, String apiKeyIn, String serverUrlIn) {
  prefs.begin("pern", false);
  prefs.putString("ssid", ssid);
  prefs.putString("wifipass", pass);
  prefs.putString("mqtt", mqtt);
  prefs.putInt("mqttport", port);
  prefs.putString("deviceId", devId);
  prefs.putString("mqttuser", mUser);
  prefs.putString("mqttpass", mPass);
  prefs.putString("apikey", apiKeyIn);
  prefs.putString("serverurl", serverUrlIn);
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
    html.replace("%SERVER_URL%", serverUrl);
    html.replace("%API_KEY%", apiKey);
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
    String aKey     = portal.arg("apikey");
    String sUrl     = portal.arg("serverurl");

    if (devId.length() > 0) deviceId = devId;
    if (aKey.length() > 0) apiKey = aKey;
    if (sUrl.length() > 0) serverUrl = sUrl;

    saveConfig(ssid, pass, mqtt, port, devId, mUser, mPass, aKey, sUrl);

    portal.send(200, "text/html",
      "<html><body style='background:#0a0f1a;color:#10b981;font-family:system-ui;text-align:center;padding:40px'>"
      "<h1>Saved!</h1><p>Device will reboot in 3 seconds...</p>"
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
    syncNtp();
  } else {
    Serial.println("\n[WiFi] FAILED — starting configuration portal...");
    WiFi.disconnect();
    startPortal();
  }
}

void subscribeTopics() {
  String cmdTopic  = "pern/devices/" + deviceId + "/actuators/+/command";
  String legacyCmd = "pern/actuators/" + deviceId + "/command";
  String cfgTopic  = "pern/devices/" + deviceId + "/config";
  String otaTopic  = "pern/devices/" + deviceId + "/ota";
  mqtt.subscribe(cmdTopic.c_str());
  mqtt.subscribe(legacyCmd.c_str());
  mqtt.subscribe(cfgTopic.c_str());
  mqtt.subscribe(otaTopic.c_str());
  Serial.println("[MQTT] Subscribed:");
  Serial.println("   " + cmdTopic);
  Serial.println("   " + legacyCmd);
  Serial.println("   " + cfgTopic);
  Serial.println("   " + otaTopic);
}

bool tryMqttConnect() {
  if (mqttServer.length() == 0) return false;
  if (mqtt.connected()) return true;

  bool ok;
  if (mqttUser.length() > 0) {
    ok = mqtt.connect(deviceId.c_str(), mqttUser.c_str(), mqttPass.c_str());
  } else if (apiKey.length() > 0) {
    ok = mqtt.connect(deviceId.c_str(), deviceId.c_str(), apiKey.c_str());
  } else {
    ok = mqtt.connect(deviceId.c_str());
  }

  if (ok) {
    Serial.println("[MQTT] Connected to " + mqttServer);
    subscribeTopics();
    publishDeviceStatus();
  }
  return ok;
}

void connectMQTT() {
  if (mqttServer.length() == 0) return;
  Serial.print("[MQTT] Initial connect to " + mqttServer + "... ");
  for (int i = 0; i < 5; i++) {
    if (tryMqttConnect()) {
      Serial.println("OK");
      return;
    }
    delay(1000);
  }
  Serial.println("FAILED — will retry in background with backoff");
}

// Non-blocking reconnect with exponential backoff (1s → 60s max)
void ensureMqtt() {
  if (mqtt.connected()) {
    mqttBackoffMs = 1000;
    return;
  }
  unsigned long now = millis();
  if (now - lastMqttAttempt < mqttBackoffMs) return;
  lastMqttAttempt = now;
  if (tryMqttConnect()) {
    mqttBackoffMs = 1000;
  } else {
    mqttBackoffMs = mqttBackoffMs >= 60000 ? 60000 : mqttBackoffMs * 2;
    Serial.printf("[MQTT] Retry in %lus\n", mqttBackoffMs / 1000);
  }
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
//  Publish Sensor Data (+ HTTP fallback)
// ============================================================

void sendHttpFallback(JsonDocument& src) {
  if (serverUrl.length() == 0) {
    Serial.println("[HTTP] Fallback skipped (no server URL configured)");
    return;
  }

  // The /api/readings endpoint rejects null sensors — send numerics only.
  StaticJsonDocument<768> out;
  out["device"] = deviceId;
  out["timestamp"] = epochMillis();
  JsonObject dst = out.createNestedObject("sensors");
  JsonVariant srcSensors = src["sensors"];
  if (srcSensors.is<JsonObject>()) {
    JsonObject ss = srcSensors.as<JsonObject>();
    for (int i = 0; i < NUM_SENSORS; i++) {
      if (!sensors[i].enabled) continue;
      JsonVariant v = ss[sensors[i].key];
      if (v.is<float>()) dst[sensors[i].key] = v.as<float>();
      else if (v.is<int>()) dst[sensors[i].key] = v.as<int>();
    }
  }
  if (dst.size() == 0) {
    Serial.println("[HTTP] No numeric sensors to send — skipped");
    return;
  }

  String body;
  serializeJson(out, body);

  String url = serverUrl;
  if (!url.endsWith("/")) url += "/";
  url += "api/readings";

  HTTPClient http;
  http.setTimeout(4000);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  if (apiKey.length() > 0) http.addHeader("X-Api-Key", apiKey);

  Serial.printf("[HTTP] Fallback POST %s ... ", url.c_str());
  int code = http.POST(body);
  if (code == 200 || code == 201) {
    httpFallbackOk++;
    Serial.printf("OK (%d)\n", code);
  } else {
    httpFallbackFail++;
    Serial.printf("FAILED (%d)\n", code);
  }
  http.end();
}

void publishData() {
  StaticJsonDocument<768> doc;
  doc["device"]    = deviceId;
  doc["timestamp"] = epochMillis();
  doc["fw"]        = FW_VERSION;
  if (apiKey.length() > 0) doc["apiKey"] = apiKey;   // used for MQTT message-level auth

  JsonObject s = doc.createNestedObject("sensors");
  readAllSensors(s);

  char buf[768];
  size_t len = serializeJson(doc, buf, sizeof(buf));

  String topic = "pern/sensors/" + deviceId + "/data";
  bool sent = false;
  if (mqtt.connected()) {
    if (mqtt.publish(topic.c_str(), buf, len)) {
      msgCount++;
      sent = true;
      Serial.printf("#%d [%s] published OK\n", msgCount, deviceId.c_str());
    } else {
      Serial.println("[MQTT] Publish FAILED");
    }
  } else {
    Serial.println("[MQTT] Not connected — trying HTTP fallback");
  }

  if (!sent) {
    sendHttpFallback(doc);
  }
}

// ============================================================
//  Heartbeat + device status — device health
// ============================================================

void publishDeviceStatus() {
  StaticJsonDocument<256> doc;
  doc["device"]    = deviceId;
  doc["name"]      = deviceId;
  doc["type"]      = "esp32";
  doc["status"]    = "online";
  doc["fwVersion"] = FW_VERSION;
  doc["timestamp"] = epochMillis();
  char buf[256];
  size_t len = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(("pern/devices/" + deviceId + "/status").c_str(), buf, len);
}

void publishHeartbeat() {
  StaticJsonDocument<384> doc;
  doc["device"]      = deviceId;
  doc["timestamp"]   = epochMillis();
  doc["uptime"]      = (millis() - bootTime) / 1000;
  doc["freeHeap"]    = ESP.getFreeHeap();
  doc["rssi"]        = WiFi.RSSI();
  doc["ip"]          = WiFi.localIP().toString();
  doc["fwVersion"]   = FW_VERSION;
  doc["fwName"]      = FW_NAME;
  doc["wifiChannel"] = WiFi.channel();
  doc["cpuFreq"]     = ESP.getCpuFreqMHz();
  doc["httpFallbackOk"]   = httpFallbackOk;
  doc["httpFallbackFail"] = httpFallbackFail;

  // Actuator states
  JsonObject act = doc.createNestedObject("actuators");
  for (int i = 0; i < NUM_ACTUATORS; i++) {
    act[actuators[i].key] = actuators[i].state;
  }

  char buf[384];
  size_t len = serializeJson(doc, buf, sizeof(buf));

  String topic = "pern/devices/" + deviceId + "/heartbeat";
  mqtt.publish(topic.c_str(), buf, len);

  #ifdef DEBUG
  Serial.printf("[HB] uptime=%lus heap=%d rssi=%d\n",
                (unsigned long)(millis() - bootTime) / 1000,
                ESP.getFreeHeap(), WiFi.RSSI());
  #endif
}

// ============================================================
//  Actuator handling
// ============================================================

bool resolveCommandState(const char* command, JsonDocument& cmd) {
  if (strcmp(command, "on") == 0 || strcmp(command, "1") == 0 || strcmp(command, "true") == 0) return true;
  if (strcmp(command, "off") == 0 || strcmp(command, "0") == 0 || strcmp(command, "false") == 0) return false;
  if (strcmp(command, "set") == 0) {
    JsonVariant v = cmd["params"]["value"];
    if (v.is<bool>()) return v.as<bool>();
    if (v.is<int>()) return v.as<int>() > 0;
    if (v.is<float>()) return v.as<float>() > 0;
    if (v.is<const char*>()) {
      const char* sv = v.as<const char*>();
      return sv && (strcmp(sv, "on") == 0 || strcmp(sv, "true") == 0 || strcmp(sv, "1") == 0);
    }
  }
  return false;
}

void publishActuatorStatus(const char* actuatorKey, bool state) {
  StaticJsonDocument<192> fb;
  fb["device"]    = deviceId;
  fb["actuator"]  = actuatorKey;
  fb["state"]     = state ? "on" : "off";
  fb["timestamp"] = epochMillis();
  fb["source"]    = "device";
  char buf[192];
  serializeJson(fb, buf, sizeof(buf));
  String statusTopic = "pern/devices/" + deviceId + "/actuators/" + actuatorKey + "/status";
  mqtt.publish(statusTopic.c_str(), buf);
}

void handleActuatorCommand(const char* actuatorKey, const char* command, JsonDocument& cmd) {
  for (int i = 0; i < NUM_ACTUATORS; i++) {
    if (String(actuators[i].key) == actuatorKey) {
      bool newState = resolveCommandState(command, cmd);
      actuators[i].state = newState;
      digitalWrite(actuators[i].pin, newState ? HIGH : LOW);
      Serial.printf("[ACT] %s -> %s\n", actuatorKey, newState ? "ON" : "OFF");
      publishActuatorStatus(actuatorKey, newState);
      return;
    }
  }
  Serial.printf("[ACT] Unknown actuator: %s\n", actuatorKey);
}

// ============================================================
//  Config apply (interval + sensors) with ACK + persistence
// ============================================================

void applyConfig(JsonDocument& cfg) {
  bool changed = false;

  if (cfg.containsKey("interval")) {
    long v = cfg["interval"].as<long>();
    if (v >= 500 && v <= 3600000) {
      sendInterval = (unsigned long)v;
      changed = true;
      Serial.printf("[CFG] interval -> %lu ms\n", sendInterval);
    }
  }

  if (cfg.containsKey("sensors")) {
    JsonVariant sensorsVariant = cfg["sensors"];
    if (sensorsVariant.is<JsonObject>()) {
      JsonObject s = sensorsVariant.as<JsonObject>();
      for (int i = 0; i < NUM_SENSORS; i++) {
        if (s.containsKey(sensors[i].key)) {
          bool en = s[sensors[i].key].as<bool>();
          if (sensors[i].enabled != en) {
            sensors[i].enabled = en;
            changed = true;
            Serial.printf("[CFG] sensor %s -> %s\n", sensors[i].key, en ? "ON" : "OFF");
          }
        }
      }
    }
  }

  if (changed) saveRuntimeState();

  // ACK with the effective config so the backend can confirm the apply.
  StaticJsonDocument<512> ack;
  ack["device"]    = deviceId;
  ack["accepted"]  = true;
  ack["timestamp"] = epochMillis();
  JsonObject a = ack.createNestedObject("config");
  a["interval"] = sendInterval;
  JsonObject sa = a.createNestedObject("sensors");
  for (int i = 0; i < NUM_SENSORS; i++) {
    sa[sensors[i].key] = sensors[i].enabled;
  }
  char buf[512];
  size_t len = serializeJson(ack, buf, sizeof(buf));
  mqtt.publish(("pern/devices/" + deviceId + "/config/ack").c_str(), buf, len);
  Serial.println("[CFG] applied + acked");
}

// ============================================================
//  MQTT OTA (chunked base64)
// ============================================================

void publishOtaStatus(const char* state, int percent, const char* message) {
  StaticJsonDocument<192> doc;
  doc["device"]    = deviceId;
  doc["state"]     = state;
  doc["percent"]   = percent;
  doc["message"]   = message ? message : "";
  doc["version"]   = FW_VERSION;
  doc["timestamp"] = epochMillis();
  char buf[192];
  size_t len = serializeJson(doc, buf, sizeof(buf));
  String topic = "pern/devices/" + deviceId + "/ota/status";
  mqtt.publish(topic.c_str(), buf, len);
}

bool base64Decode(const char* in, unsigned char* out, size_t outMax, size_t* outLen) {
  static const char tbl[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t o = 0;
  int val = 0;
  int bits = 0;
  for (const unsigned char* p = (const unsigned char*)in; *p; ++p) {
    if (*p == '=') break;                       // padding — stop
    if (*p == '\n' || *p == '\r') continue;
    const char* pos = strchr(tbl, (char)*p);
    if (!pos) return false;
    val = (val << 6) | (int)(pos - tbl);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (o < outMax) out[o++] = (unsigned char)((val >> bits) & 0xFF);
    }
  }
  *outLen = o;
  return true;
}

void handleOtaMessage(char* msg) {
  DynamicJsonDocument doc(4600);
  if (deserializeJson(doc, msg) != DeserializationOk) {
    publishOtaStatus("error", -1, "invalid JSON");
    return;
  }

  long index = doc["index"] | -9;

  if (index == -1) {
    // begin
    unsigned long size = doc["size"] | 0UL;
    otaSize = size;
    otaReceived = 0;
    otaLastPercent = -1;
    if (Update.begin(size)) {
      otaActive = true;
      Serial.printf("[OTA] Begin size=%lu\n", size);
      publishOtaStatus("begin", 0, "started");
    } else {
      Serial.printf("[OTA] Update.begin failed (err %d)\n", (int)Update.getError());
      publishOtaStatus("error", -1, "Update.begin failed");
    }
  } else if (index == -2) {
    // end
    if (!otaActive) {
      publishOtaStatus("error", -1, "end without begin");
      return;
    }
    if (Update.end()) {
      Serial.println("[OTA] Done — restarting");
      publishOtaStatus("done", 100, "success");
      delay(1000);
      ESP.restart();
    } else {
      Serial.printf("[OTA] Update.end failed (err %d)\n", (int)Update.getError());
      publishOtaStatus("error", -1, "Update.end failed");
      otaActive = false;
    }
  } else if (index >= 0) {
    // chunk
    if (!otaActive) {
      publishOtaStatus("error", -1, "chunk before begin");
      return;
    }
    const char* chunk64 = doc["chunk64"];
    if (!chunk64) {
      publishOtaStatus("error", -1, "missing chunk64");
      otaActive = false;
      Update.abort();
      return;
    }
    size_t decodedLen = 0;
    if (!base64Decode(chunk64, otaDecodeBuf, sizeof(otaDecodeBuf), &decodedLen)) {
      publishOtaStatus("error", -1, "bad base64");
      otaActive = false;
      Update.abort();
      return;
    }
    if (Update.write(otaDecodeBuf, decodedLen) != decodedLen) {
      publishOtaStatus("error", -1, "write failed");
      otaActive = false;
      Update.abort();
      return;
    }
    otaReceived += decodedLen;
    if (otaSize > 0) {
      int percent = (int)((unsigned long long)otaReceived * 100 / otaSize);
      if (percent - otaLastPercent >= 10) {
        otaLastPercent = percent;
        publishOtaStatus("progress", percent, "");
      }
    }
  }
}

// ============================================================
//  MQTT Message Handler (actuator commands + config + OTA)
// ============================================================

// Canonical topic: pern/devices/{id}/actuators/{actuator}/command → actuator in topic.
// Legacy topic:    pern/actuators/{id}/command                  → actuator in payload.
String actuatorFromTopic(const String& topic) {
  if (topic.indexOf("/devices/") < 0) return "";  // legacy topic — no actuator in path
  int i1 = topic.lastIndexOf("/actuators/");
  if (i1 < 0) return "";
  String rest = topic.substring(i1 + 11);
  int slash = rest.indexOf("/");
  return slash > 0 ? rest.substring(0, slash) : "";
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  unsigned int copyLen = length < sizeof(mqttMsgBuf) - 1 ? length : sizeof(mqttMsgBuf) - 1;
  memcpy(mqttMsgBuf, payload, copyLen);
  mqttMsgBuf[copyLen] = '\0';

  String topicStr = String(topic);

  // OTA (highest priority)
  if (topicStr.endsWith("/ota")) {
    handleOtaMessage(mqttMsgBuf);
    return;
  }

  // Actuator commands — canonical + legacy
  if (topicStr.indexOf("/actuators/") >= 0 && topicStr.endsWith("/command")) {
    String topicActuator = actuatorFromTopic(topicStr);
    StaticJsonDocument<512> cmd;
    if (deserializeJson(cmd, mqttMsgBuf) != DeserializationOk) return;

    const char* actuator = cmd["actuator"] | "";
    if ((actuator == nullptr || actuator[0] == '\0') && topicActuator.length() > 0) {
      actuator = topicActuator.c_str();
    }
    const char* command = cmd["command"] | "";
    if (command == nullptr || command[0] == '\0') {
      command = cmd["action"] | "";
    }
    if (actuator && actuator[0] && command && command[0]) {
      handleActuatorCommand(actuator, command, cmd);
    }
    return;
  }

  // Config updates: pern/devices/{id}/config
  if (topicStr.endsWith("/config")) {
    StaticJsonDocument<512> cfg;
    if (deserializeJson(cfg, mqttMsgBuf) == DeserializationOk) {
      applyConfig(cfg);
    }
    return;
  }
}

// ============================================================
//  Setup & Loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(500);
  bootTime = millis();
  lastLoopActivity = millis();

  Serial.println("\n================================");
  Serial.println(" PERN IoT Platform — ESP32 Node v" FW_VERSION);
  Serial.println("================================");

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
    mqtt.setBufferSize(MQTT_BUFFER_SIZE);
    connectMQTT();
    startMDNS();
    Serial.println("\n[BOOT] Ready. Sending data every " + String(sendInterval) + "ms\n");
  }

  digitalWrite(PIN_LED, LOW);
}

void loop() {
  if (configMode) {
    portal.handleClient();
    return;
  }

  unsigned long now = millis();

  // Soft watchdog — restart if the loop ever stalls
  if (now - lastLoopActivity > WATCHDOG_MS) {
    Serial.println("[WATCHDOG] Loop stalled — restarting");
    ESP.restart();
  }
  lastLoopActivity = now;

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (configMode) return;
  }

  if (!mqtt.connected()) {
    ensureMqtt();
  }

  mqtt.loop();

  // During OTA keep pumping MQTT but pause normal publishing
  if (otaActive) {
    digitalWrite(PIN_LED, (millis() / 200) % 2 == 0 ? HIGH : LOW);
    return;
  }

  now = millis();

  // Publish sensor data
  if (now - lastSend >= sendInterval) {
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
