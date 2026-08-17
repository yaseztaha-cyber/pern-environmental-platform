/*
 * ============================================================
 *  ESP32 Environmental & Water Quality Station v6.0
 *  PERN Connected Edition — MQTT + Local Web Server
 * ============================================================
 *  Sensors:
 *    DHT22   (GPIO4)   -> temperature (degC), humidity (%RH)
 *    MQ135   (GPIO34)  -> CO2 / NH3 / smoke (ppm) with T+H correction
 *    TDS     (GPIO35)  -> total dissolved solids (ppm)
 *    pH      (GPIO32)  -> pH level
 *    Dust    (GPIO39/VN) -> particulate matter (ADC + voltage)
 *
 *  Connectivity:
 *    - MQTT: publishes every cycle to pern/sensors/{deviceId}/data
 *    - HTTP: local web server on port 80 for browser monitoring
 *    - Subscribes to pern/actuators/{deviceId}/command
 *
 *  MQTT CONTRACT (matches pern-backend/protocols/mqtt-adapter.js):
 *    OUT  pern/sensors/{deviceId}/data
 *         { device, timestamp, sensors: { tmp, hum, co2, nh3, smoke,
 *           tds, ph, dust_raw, dust_volt }, fw, apiKey }
 *    IN   pern/actuators/{deviceId}/command
 *         { actuator, action, value }
 *
 *  Libraries (Arduino Library Manager):
 *    - PubSubClient (Nick O'Leary)
 *    - ArduinoJson (Benoit Blanchon)
 *    - DHT sensor library (Adafruit)
 * ============================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <math.h>

// ============================================================
//  WI-FI & MQTT SETTINGS
// ============================================================
const char* WIFI_SSID = "Nazeer2025";
const char* WIFI_PASS = "Nm1980@Wy1980@";

// Public EMQX broker (shared with PERN backend)
const char* MQTT_SERVER = "broker.emqx.io";
const int   MQTT_PORT   = 1883;
const char* DEVICE_ID   = "ESP32-AirWater-01";
const char* API_KEY     = "pern_your_device_api_key";

WebServer   server(80);
WiFiClient  wifiClient;
PubSubClient mqtt(wifiClient);

// ============================================================
//  PIN DEFINITIONS
// ============================================================
#define DHT_PIN          4
#define DHT_TYPE         DHT22
#define MQ135_PIN        34
#define TDS_PIN          35
#define PH_PIN           32
#define DUST_ANALOG_PIN  39
#define DUST_IR_PIN      18
#define LED_PIN          2

// ============================================================
//  SENSOR READINGS (shared between MQTT & web server)
// ============================================================
float webTemp     = 0.0;
float webHum      = 0.0;
float webCO2      = 0.0;
float webNH3      = 0.0;
float webSmoke    = 0.0;
float webTDS      = 0.0;
float webPH       = 7.0;
int   webDustRaw  = 0;
float webDustVolt = 0.0;
bool  mq135Ready  = false;

// ============================================================
//  SENSOR CONFIGURATIONS
// ============================================================
// DHT22
const int   DHT_OVERSAMPLE       = 3;
const float DHT_EMA_ALPHA        = 0.2;
const float DHT_SELF_HEAT_OFFSET = 0.5;

// MQ135
const bool  MQ135_USE_STORED_R0   = false;
const float MQ135_R0_CLEAN_AIR    = 10.0;
const float MQ135_RL_KOHM         = 1.0;
const float MQ135_RATIO_CLEAN_AIR = 3.6;
const unsigned long MQ135_WARMUP_MS = 120000;

const float MQ135_CO2_A = 116.6020682;
const float MQ135_CO2_B = -2.769034857;
const float MQ135_NH3_A = 102.2;
const float MQ135_NH3_B = -2.473;
const float MQ135_SMOKE_A = 110.47;
const float MQ135_SMOKE_B = -2.862;
const float CO2_ATMOSPHERIC_BASELINE = 400.0;
const float MQ135_CORR_A =  0.00035;
const float MQ135_CORR_B =  0.02718;
const float MQ135_CORR_C =  0.0018;
const float MQ135_CORR_D = -0.003333;

// TDS
const float TDS_VREF     = 3.3;
const int   TDS_ADC_MAX  = 4095;
const int   TDS_SAMPLES  = 30;
float       TDS_K_CELL   = 1.0;
const float TDS_TEMP_COEFF = 0.0191;

// pH Calibration
float phCalibrationOffset = 0.0;

// Timing
const unsigned long CYCLE_INTERVAL_MS = 3000;
unsigned long lastCycleTime = 0;
unsigned long bootTime      = 0;
const unsigned long MQTT_REPORT_INTERVAL_MS = 10000;
unsigned long lastMqttReport = 0;

// State
DHT dht(DHT_PIN, DHT_TYPE);
float emaTemperature = NAN;
float emaHumidity    = NAN;
float mq135R0        = MQ135_R0_CLEAN_AIR;

// ============================================================
//  FUNCTION PROTOTYPES
// ============================================================
void connectWiFi();
void mqttConnect();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void publishMqtt();

bool   dhtCollectSamples(float* outTemp, float* outHum);
float  dhtMedian(float* arr, int n);
void   dhtSort(float* arr, int n);
float  applyEMA(float prev, float newVal, float alpha);
float  mq135ReadRS();
float  mq135CorrectRS(float rs, float tempC, float humidity);
float  mq135CalibrateR0();
float  mq135ReadCO2(float r0, float tempC, float humidity);
float  mq135ReadNH3(float r0, float tempC, float humidity);
float  mq135ReadSmoke(float r0, float tempC, float humidity);
float  tdsReadFilteredVoltage();
float  tdsReadPPM(float tempC);
void   readDustSensor(int &outRaw, float &outVoltage);
float  readPHValue();

// ============================================================
//  WIFI CONNECTION
// ============================================================
void connectWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.print(WIFI_SSID);
  Serial.print(" ... ");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" connected -> ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" FAILED");
  }
}

// ============================================================
//  MQTT CONNECTION
// ============================================================
void mqttConnect() {
  while (!mqtt.connected()) {
    Serial.printf("[MQTT] Connecting to %s:%d as %s ... ", MQTT_SERVER, MQTT_PORT, DEVICE_ID);
    if (mqtt.connect(DEVICE_ID, DEVICE_ID, API_KEY)) {
      Serial.println("connected");
      // Subscribe to actuator commands for this device
      String cmdTopic = String("pern/actuators/") + DEVICE_ID + "/command";
      mqtt.subscribe(cmdTopic.c_str());
      Serial.printf("[MQTT] Subscribed to %s\n", cmdTopic.c_str());
      // Subscribe to config updates
      String cfgTopic = String("pern/devices/") + DEVICE_ID + "/config";
      mqtt.subscribe(cfgTopic.c_str());
      Serial.printf("[MQTT] Subscribed to %s\n", cfgTopic.c_str());
    } else {
      Serial.printf("failed (rc=%d), retry in 5s\n", mqtt.state());
      delay(5000);
    }
  }
}

// ============================================================
//  MQTT CALLBACK — handle actuator commands & config
// ============================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[256];
  unsigned int copyLen = (length < sizeof(msg) - 1) ? length : sizeof(msg) - 1;
  memcpy(msg, payload, copyLen);
  msg[copyLen] = '\0';

  Serial.printf("[MQTT] Received on %s: %s\n", topic, msg);

  // Actuator commands could be forwarded to Serial
  if (strstr(topic, "/actuators/") && strstr(topic, "/command")) {
    Serial.print("[ACTUATOR] ");
    Serial.println(msg);
    // TODO: parse and actuate relays/valves via Serial or GPIO
  }

  // Config updates (e.g. calibrate pH, change interval)
  if (strstr(topic, "/config")) {
    Serial.print("[CONFIG] ");
    Serial.println(msg);
    // TODO: apply configuration changes
  }
}

// ============================================================
//  MQTT PUBLISH — send all sensor readings
// ============================================================
void publishMqtt() {
  StaticJsonDocument<512> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();
  doc["fw"]        = "v6.0";
  doc["apiKey"]    = API_KEY;

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["tmp"]       = round(webTemp * 100.0) / 100.0;
  sensors["hum"]       = round(webHum * 100.0) / 100.0;
  sensors["co2"]       = round(webCO2);
  sensors["nh3"]       = round(webNH3 * 100.0) / 100.0;
  sensors["smoke"]     = round(webSmoke);
  sensors["tds"]       = round(webTDS);
  sensors["ph"]        = round(webPH * 100.0) / 100.0;
  sensors["dust_raw"]  = webDustRaw;
  sensors["dust_volt"] = round(webDustVolt * 100.0) / 100.0;

  char buf[512];
  size_t len = serializeJson(doc, buf, sizeof(buf));

  String topic = String("pern/sensors/") + DEVICE_ID + "/data";
  if (mqtt.connected() && mqtt.publish(topic.c_str(), buf, len)) {
    digitalWrite(LED_PIN, HIGH);
    delay(50);
    digitalWrite(LED_PIN, LOW);
    Serial.printf("[MQTT] Published %u bytes to %s\n", (unsigned)len, topic.c_str());
  } else {
    Serial.println("[MQTT] Publish failed");
  }
}

// ============================================================
//  WEB SERVER — local browser dashboard
// ============================================================
void handleRoot() {
  String html = "<!DOCTYPE html><html lang='en'><head>";
  html += "<meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>Environmental & Water Monitoring Station</title>";
  html += "<meta http-equiv='refresh' content='3'>";
  html += "<style>";
  html += "body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }";
  html += "h1 { color: #38bdf8; text-align: center; margin-bottom: 5px; }";
  html += ".subtitle { color: #94a3b8; font-size: 0.9em; margin-bottom: 10px; }";
  html += ".mqtt-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.75em; font-weight: 600; margin-bottom: 20px; }";
  html += ".mqtt-ok { background: rgba(0,212,170,0.15); color: #00D4AA; border: 1px solid rgba(0,212,170,0.3); }";
  html += ".mqtt-fail { background: rgba(220,38,38,0.15); color: #f87171; border: 1px solid rgba(220,38,38,0.3); }";
  html += ".grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; width: 100%; max-width: 900px; }";
  html += ".card { background: #1e293b; padding: 20px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); text-align: center; border: 1px solid #334155; }";
  html += ".card h2 { margin: 0; font-size: 1.1em; color: #94a3b8; }";
  html += ".card p { font-size: 2.2em; font-weight: bold; margin: 12px 0 0; color: #38bdf8; }";
  html += ".warning { color: #f87171 !important; }";
  html += ".dust-card { border-color: #a855f7; } .dust-card p { color: #c084fc; }";
  html += ".ph-card { border-color: #10b981; } .ph-card p { color: #34d399; }";
  html += ".footer { margin-top: 30px; font-size: 0.85em; color: #64748b; }";
  html += "</style></head><body>";

  html += "<h1>Smart Environmental & Water Station</h1>";
  html += "<div class='subtitle'>ESP32 Multi-Sensor Station v6.0 (MQTT + Web)</div>";

  // MQTT status badge
  if (mqtt.connected()) {
    html += "<div class='mqtt-badge mqtt-ok'>MQTT Connected to " + String(MQTT_SERVER) + "</div>";
  } else {
    html += "<div class='mqtt-badge mqtt-fail'>MQTT Disconnected</div>";
  }

  html += "<div class='grid'>";

  // Temperature & Humidity
  html += "<div class='card'><h2>Temperature</h2><p>" + String(webTemp, 1) + " &deg;C</p></div>";
  html += "<div class='card'><h2>Humidity</h2><p>" + String(webHum, 1) + " %</p></div>";

  // Gas Sensors (MQ135)
  if (!mq135Ready) {
    html += "<div class='card'><h2>Air Quality (MQ135)</h2><p style='font-size:1.1em; color:#fbbf24;'>Warming up...<br>(2 mins)</p></div>";
  } else {
    html += "<div class='card'><h2>Carbon Dioxide</h2><p>" + String(webCO2, 0) + " <span style='font-size:0.4em;'>PPM</span></p></div>";
    html += "<div class='card'><h2>Smoke & Gases</h2><p>" + String(webSmoke, 0) + " <span style='font-size:0.4em;'>idx</span></p></div>";
  }

  // Water Quality
  html += "<div class='card'><h2>Water TDS</h2><p>" + String(webTDS, 0) + " <span style='font-size:0.4em;'>PPM</span></p></div>";
  html += "<div class='card ph-card'><h2>pH Level</h2><p>" + String(webPH, 2) + "</p></div>";

  // Dust Sensor
  html += "<div class='card dust-card'><h2>Dust / Particle Level</h2><p>" + String(webDustRaw) + " <span style='font-size:0.4em;'>ADC</span></p>";
  html += "<div style='color:#a855f7; font-size:0.8em; margin-top:5px;'>" + String(webDustVolt, 2) + " Volt</div></div>";

  html += "</div>";
  html += "<div class='footer'>Device: " + String(DEVICE_ID) + " | MQTT: " + String(MQTT_SERVER) + ":" + String(MQTT_PORT) + " | Data auto-refreshes every 3s</div>";
  html += "</body></html>";

  server.send(200, "text/html", html);
}

// ============================================================
//  SENSOR READ FUNCTIONS
// ============================================================
float readPHValue() {
  long totalADC = 0;
  for (int i = 0; i < 30; i++) {
    totalADC += analogRead(PH_PIN);
    delay(2);
  }
  float avgADC = totalADC / 30.0;
  float voltage = (avgADC * 3.3) / 4095.0;
  float phVal = 3.5 * voltage + phCalibrationOffset;
  if (phVal < 0.0) phVal = 0.0;
  if (phVal > 14.0) phVal = 14.0;
  return phVal;
}

void readDustSensor(int &outRaw, float &outVoltage) {
  digitalWrite(DUST_IR_PIN, HIGH);
  delayMicroseconds(280);
  outRaw = analogRead(DUST_ANALOG_PIN);
  digitalWrite(DUST_IR_PIN, LOW);
  outVoltage = (outRaw * 3.3) / 4095.0;
}

// ============================================================
//  MATH & HELPER FUNCTIONS
// ============================================================
bool dhtCollectSamples(float* outTemp, float* outHum) {
  float temps[DHT_OVERSAMPLE];
  float hums[DHT_OVERSAMPLE];
  int valid = 0;
  for (int i = 0; i < DHT_OVERSAMPLE; i++) {
    if (i > 0) delay(100);
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h) && t >= -40.0 && t <= 80.0 && h >= 0.0 && h <= 100.0) {
      temps[valid] = t; hums[valid] = h; valid++;
    }
  }
  if (valid < (DHT_OVERSAMPLE / 2 + 1)) return false;
  *outTemp = dhtMedian(temps, valid);
  *outHum  = dhtMedian(hums,  valid);
  return true;
}

float dhtMedian(float* arr, int n) {
  float sorted[DHT_OVERSAMPLE];
  for (int i = 0; i < n; i++) sorted[i] = arr[i];
  dhtSort(sorted, n);
  return sorted[n / 2];
}

void dhtSort(float* arr, int n) {
  for (int i = 1; i < n; i++) {
    float key = arr[i]; int j = i - 1;
    while (j >= 0 && arr[j] > key) { arr[j + 1] = arr[j]; j--; }
    arr[j + 1] = key;
  }
}

float applyEMA(float prev, float newVal, float alpha) {
  return alpha * newVal + (1.0 - alpha) * prev;
}

float mq135ReadRS() {
  long total = 0;
  for (int i = 0; i < 50; i++) { total += analogRead(MQ135_PIN); delay(2); }
  float pinVoltage = (total / 50.0) * (TDS_VREF / (float)TDS_ADC_MAX);
  float sensorVoltage = pinVoltage * 2.0;
  if (sensorVoltage <= 0.001) sensorVoltage = 0.001;
  return MQ135_RL_KOHM * (5.0 - sensorVoltage) / sensorVoltage;
}

float mq135CorrectRS(float rs, float tempC, float humidity) {
  float cf = MQ135_CORR_A * exp(MQ135_CORR_B * tempC) + MQ135_CORR_C * humidity + MQ135_CORR_D;
  if (cf < 0.1) cf = 0.1;
  return rs / cf;
}

float mq135CalibrateR0() {
  float tempC = 20.0, humidity = 65.0;
  float rawT = NAN, rawH = NAN;
  if (dhtCollectSamples(&rawT, &rawH)) {
    tempC = rawT - DHT_SELF_HEAT_OFFSET; humidity = rawH;
  }
  float total = 0.0;
  for (int i = 0; i < 50; i++) {
    float rs = mq135ReadRS();
    total += mq135CorrectRS(rs, tempC, humidity);
    delay(100);
  }
  return (total / 50.0) / MQ135_RATIO_CLEAN_AIR;
}

float mq135ReadCO2(float r0, float tempC, float humidity) {
  float rs = mq135ReadRS();
  float ratio = mq135CorrectRS(rs, tempC, humidity) / r0;
  if (ratio <= 0.0) return CO2_ATMOSPHERIC_BASELINE;
  float ppm = MQ135_CO2_A * pow(ratio, MQ135_CO2_B);
  return (ppm < 0.0 ? 0.0 : ppm) + CO2_ATMOSPHERIC_BASELINE;
}

float mq135ReadNH3(float r0, float tempC, float humidity) {
  float rs = mq135ReadRS();
  float ratio = mq135CorrectRS(rs, tempC, humidity) / r0;
  if (ratio <= 0.0) return 0.0;
  float ppm = MQ135_NH3_A * pow(ratio, MQ135_NH3_B);
  return ppm < 0.0 ? 0.0 : ppm;
}

float mq135ReadSmoke(float r0, float tempC, float humidity) {
  float rs = mq135ReadRS();
  float ratio = mq135CorrectRS(rs, tempC, humidity) / r0;
  if (ratio <= 0.0) return 0.0;
  float ppm = MQ135_SMOKE_A * pow(ratio, MQ135_SMOKE_B);
  return ppm < 0.0 ? 0.0 : ppm;
}

float tdsReadFilteredVoltage() {
  int readings[TDS_SAMPLES];
  for (int i = 0; i < TDS_SAMPLES; i++) { readings[i] = analogRead(TDS_PIN); delay(2); }
  for (int i = 1; i < TDS_SAMPLES; i++) {
    int key = readings[i]; int j = i - 1;
    while (j >= 0 && readings[j] > key) { readings[j + 1] = readings[j]; j--; }
    readings[j + 1] = key;
  }
  int trimCount = TDS_SAMPLES / 5;
  long sum = 0;
  for (int i = trimCount; i < TDS_SAMPLES - trimCount; i++) sum += readings[i];
  float avgADC = sum / (float)(TDS_SAMPLES - 2 * trimCount);
  float pinVoltage = avgADC * TDS_VREF / (float)TDS_ADC_MAX;
  return pinVoltage * 2.0;
}

float tdsReadPPM(float tempC) {
  float voltage = tdsReadFilteredVoltage();
  float compensationCoeff = 1.0 + TDS_TEMP_COEFF * (tempC - 25.0);
  float compensatedVoltage = voltage / compensationCoeff;
  float tds = (133.42 * pow(compensatedVoltage, 3)
             - 255.86 * pow(compensatedVoltage, 2)
             + 857.39 * compensatedVoltage) * 0.5 * TDS_K_CELL;
  return tds < 0.0 ? 0.0 : tds;
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(DUST_IR_PIN, OUTPUT);
  digitalWrite(DUST_IR_PIN, LOW);
  pinMode(DUST_ANALOG_PIN, INPUT);

  analogReadResolution(12);
  dht.begin();
  bootTime = millis();

  Serial.println(F("\n================================="));
  Serial.println(F(" PERN ENVIRONMENTAL STATION v6.0 "));
  Serial.println(F(" MQTT + Local Web Server         "));
  Serial.println(F("=================================\n"));

  // WiFi
  connectWiFi();

  // MQTT
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);
  mqttConnect();

  // Web server
  server.on("/", handleRoot);
  server.begin();
  Serial.println("[Web] Server started on port 80\n");

  if (MQ135_USE_STORED_R0) {
    mq135R0 = MQ135_R0_CLEAN_AIR;
    mq135Ready = true;
  }
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  unsigned long now = millis();

  // Keep connections alive
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }
  if (!mqtt.connected()) {
    mqttConnect();
  }
  mqtt.loop();
  server.handleClient();

  // MQ135 Warmup
  if (!MQ135_USE_STORED_R0 && !mq135Ready) {
    if (now - bootTime >= MQ135_WARMUP_MS) {
      Serial.println(F("[MQ135] Warm-up done. Calibrating..."));
      mq135R0 = mq135CalibrateR0();
      mq135Ready = true;
    }
  }

  // Read sensors every 3 seconds
  if (now - lastCycleTime >= CYCLE_INTERVAL_MS) {
    lastCycleTime = now;

    // 1. DHT22
    float rawTemp = NAN, rawHum = NAN;
    if (dhtCollectSamples(&rawTemp, &rawHum)) {
      rawTemp -= DHT_SELF_HEAT_OFFSET;
      if (isnan(emaTemperature)) {
        emaTemperature = rawTemp;
        emaHumidity    = rawHum;
      } else {
        emaTemperature = applyEMA(emaTemperature, rawTemp, DHT_EMA_ALPHA);
        emaHumidity    = applyEMA(emaHumidity, rawHum, DHT_EMA_ALPHA);
      }
      webTemp = emaTemperature;
      webHum  = emaHumidity;
    }

    // 2. TDS
    if (!isnan(emaTemperature)) {
      webTDS = tdsReadPPM(emaTemperature);
    }

    // 3. pH
    webPH = readPHValue();

    // 4. MQ135
    if (mq135Ready && !isnan(emaTemperature)) {
      webCO2   = mq135ReadCO2(mq135R0, emaTemperature, emaHumidity);
      webNH3   = mq135ReadNH3(mq135R0, emaTemperature, emaHumidity);
      webSmoke = mq135ReadSmoke(mq135R0, emaTemperature, emaHumidity);
    }

    // 5. Dust Sensor
    readDustSensor(webDustRaw, webDustVolt);

    // Serial debug
    Serial.print(F("TEMP: ")); Serial.print(webTemp, 1);
    Serial.print(F("C | HUM: ")); Serial.print(webHum, 1);
    Serial.print(F("% | TDS: ")); Serial.print(webTDS, 0);
    Serial.print(F("ppm | pH: ")); Serial.print(webPH, 2);
    Serial.print(F(" | DUST: ")); Serial.print(webDustRaw);
    Serial.print(F(" ADC (")); Serial.print(webDustVolt, 2); Serial.print(F("V)"));
    if (mq135Ready) {
      Serial.print(F(" | CO2: ")); Serial.print(webCO2, 0);
    }
    Serial.println();
  }

  // Publish to MQTT every 10 seconds
  if (now - lastMqttReport >= MQTT_REPORT_INTERVAL_MS) {
    lastMqttReport = now;
    publishMqtt();
  }
}
