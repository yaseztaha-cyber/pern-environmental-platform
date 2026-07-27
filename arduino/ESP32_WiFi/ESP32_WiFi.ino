/*
 * ESP32 (Recommended - Built-in WiFi)
 * PERN IoT Platform - Sensor Publisher
 *
 * Libraries needed:
 *   - PubSubClient (by Nick O'Leary)
 *   - ArduinoJson (by Benoit Blanchon)
 *
 * Boards: Install "esp32" via Boards Manager
 *   - ESP32 Dev Module
 *   - NodeMCU-32S
 *   - WEMOS LOLIN32
 *
 * Sensor connections (examples - adjust to your wiring):
 *   GPIO 34 -> LM35 temperature sensor
 *   GPIO 35 -> DHT11 data pin
 *   GPIO 32 -> MQ-135 analog out (air quality)
 *   GPIO 33 -> MQ-2 analog out (smoke/gas)
 *   GPIO 25 -> HC-SR04 TRIG (ultrasonic distance)
 *   GPIO 26 -> HC-SR04 ECHO
 *   GPIO 27 -> Soil moisture analog
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ============ CONFIGURATION ============
// WiFi credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// MQTT broker - change to your PC's local IP
// Find it: ipconfig (Windows) or ifconfig (Mac/Linux)
const char* MQTT_SERVER = "192.168.1.100";
const int   MQTT_PORT   = 1883;
const char* DEVICE_ID   = "ESP32-Cairo-001";

// Location (optional - for map display)
const float  LAT   = 30.0444;
const float  LNG   = 31.2357;
const char* REGION = "Cairo";

// Send interval (ms)
const unsigned long SEND_INTERVAL = 5000;

// Sensor pins
const int PIN_TMP   = 34;
const int PIN_HUM   = 35;
const int PIN_PM25  = 32;
const int PIN_MQ    = 33;
const int PIN_CO2   = 36;
const int PIN_SM    = 39;
// ========================================

WiFiClient wifi;
PubSubClient mqtt(wifi);
unsigned long lastSend = 0;
int msgCount = 0;

void connectWiFi() {
  Serial.printf("Connecting WiFi [%s]... ", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWiFi OK: %s (RSSI %d dBm)\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\nWiFi FAILED - check SSID/password");
    ESP.restart();
  }
}

void connectMQTT() {
  Serial.print("Connecting MQTT... ");
  int attempts = 0;
  while (!mqtt.connected() && attempts < 10) {
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("OK");
      return;
    }
    Serial.print(".");
    delay(1000);
    attempts++;
  }
  Serial.println("FAILED - will retry next loop");
}

// Read actual analog sensors - replace with your sensor code
void readSensors(float &tmp, float &hum, int &pm25, int &mq, float &co2, int &sm) {
  // LM35: 10mV per °C, 12-bit ADC (0-4095), 3.3V reference
  tmp = (analogRead(PIN_TMP) / 4095.0 * 3.3) * 100.0;

  // Humidity - raw percentage from analog sensor
  hum = map(analogRead(PIN_HUM), 0, 4095, 0, 100);

  // PM2.5 from MQ-135 analog output
  pm25 = map(analogRead(PIN_PM25), 0, 4095, 0, 500);

  // MQ sensor (smoke/gas)
  mq = map(analogRead(PIN_MQ), 0, 4095, 0, 100);

  // CO2 estimate from analog
  co2 = 400.0 + (analogRead(PIN_CO2) / 4095.0 * 1600.0);

  // Soil moisture
  sm = map(analogRead(PIN_SM), 0, 4095, 0, 100);
}

void publishData() {
  float tmp, hum_f, co2;
  int pm25, mq, sm;
  readSensors(tmp, hum_f, pm25, mq, co2, sm);

  StaticJsonDocument<384> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();
  doc["lat"]       = LAT;
  doc["lng"]       = LNG;
  doc["region"]    = REGION;

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["tmp"]  = round(tmp * 10.0) / 10.0;
  sensors["hum"]  = hum_f;
  sensors["pm25"] = pm25;
  sensors["mq"]   = mq;
  sensors["co2"]  = round(co2);
  sensors["sm"]   = sm;

  char buf[384];
  size_t len = serializeJson(doc, buf, sizeof(buf));

  String topic = "pern/sensors/" + String(DEVICE_ID) + "/data";
  if (mqtt.publish(topic.c_str(), buf, len)) {
    msgCount++;
    Serial.printf("#%d [%s] tmp=%.1f hum=%d pm25=%d co2=%.0f\n",
                  msgCount, DEVICE_ID, tmp, (int)hum_f, pm25, co2);
  } else {
    Serial.println("Publish FAILED!");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================");
  Serial.println("  PERN IoT Platform - ESP32 Sensor Node");
  Serial.println("========================================");
  Serial.printf("Device: %s\n", DEVICE_ID);
  Serial.printf("Broker: %s:%d\n", MQTT_SERVER, MQTT_PORT);

  analogReadResolution(12);

  connectWiFi();
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  connectMQTT();

  Serial.println("Ready. Sending data every 5s.\n");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqtt.connected()) {
    connectMQTT();
  }

  mqtt.loop();

  unsigned long now = millis();
  if (now - lastSend >= SEND_INTERVAL) {
    lastSend = now;
    publishData();
  }
}
