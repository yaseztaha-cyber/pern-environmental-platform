/*
 * Arduino Uno + ESP8266 (ESP-01) via SoftwareSerial
 * PERN IoT Platform - Sensor Publisher
 *
 * Libraries needed:
 *   - PubSubClient (by Nick O'Leary)
 *   - ArduinoJson (by Benoit Blanchon)
 *
 * Wiring (ESP-01 to Arduino Uno):
 *   ESP-01       Arduino Uno
 *   -------      -----------
 *   VCC    --->  3.3V (NOT 5V!)
 *   GND    --->  GND
 *   CH_PD  --->  3.3V (pull high)
 *   TX     --->  Pin 10 (SoftwareSerial RX)
 *   RX     --->  Pin 11 (SoftwareSerial TX) via voltage divider (3.3V!)
 *   GPIO0  --->  3.3V (pull high for normal mode)
 *
 * IMPORTANT: ESP-01 is 3.3V logic. Use a voltage divider on Arduino TX->ESP RX.
 *
 * First time setup:
 *   1. Connect ESP-01 TX/RX to hardware serial (pins 0,1)
 *   2. Upload AT firmware test: AT+GMR (should reply OK)
 *   3. Set WiFi: AT+CWJAP="SSID","PASSWORD"
 *   4. Then upload this sketch (move wires back to 10,11)
 */

#include <SoftwareSerial.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ============ CONFIGURATION ============
// WiFi credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// MQTT broker - change to your PC's local IP
const char* MQTT_SERVER = "192.168.1.100";
const int   MQTT_PORT   = 1883;
const char* DEVICE_ID   = "Arduino-UNO-001";

// ESP8266 via SoftwareSerial (pins 10=RX, 11=TX)
SoftwareSerial esp(10, 11);
PubSubClient mqtt(esp);

// Timing (ms)
const unsigned long SEND_INTERVAL = 5000;
const unsigned long HEARTBEAT_INTERVAL = 30000;
const int SENSOR_SAMPLES = 5;

// Actuator pins
const int PIN_RELAY1 = 3;
const int PIN_RELAY2 = 4;
const int PIN_LED    = 5;
// ========================================

unsigned long lastSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long bootTime = 0;

// Send AT command and wait for response
String sendAT(String cmd, unsigned long timeout = 3000) {
  esp.println(cmd);
  String response = "";
  unsigned long start = millis();
  while (millis() - start < timeout) {
    while (esp.available()) {
      response += (char)esp.read();
    }
  }
  return response;
}

void connectWiFi() {
  Serial.print("Connecting WiFi... ");
  sendAT("AT+CWMODE=1");
  String resp = sendAT("AT+CWJAP=\"" + String(WIFI_SSID) + "\",\"" + String(WIFI_PASS) + "\"", 15000);
  if (resp.indexOf("OK") >= 0 || resp.indexOf("CONNECTED") >= 0) {
    Serial.println("OK");
    sendAT("AT+CIFSR");
  } else {
    Serial.println("FAILED - check SSID/password");
    while (1) { delay(1000); }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[128];
  unsigned int copyLen = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
  memcpy(msg, payload, copyLen);
  msg[copyLen] = '\0';

  String topicStr = String(topic);
  if (topicStr.includes("/command")) {
    StaticJsonDocument<96> cmd;
    if (deserializeJson(cmd, msg) == DeserializationOk) {
      const char* actuator = cmd["actuator"];
      const char* action   = cmd["action"];
      if (actuator && action) {
        bool newState = (String(action) == "on" || String(action) == "1");
        if (strcmp(actuator, "relay1") == 0) digitalWrite(PIN_RELAY1, newState ? HIGH : LOW);
        if (strcmp(actuator, "relay2") == 0) digitalWrite(PIN_RELAY2, newState ? HIGH : LOW);
        if (strcmp(actuator, "led") == 0)    digitalWrite(PIN_LED,    newState ? HIGH : LOW);
        Serial.printf("[ACT] %s -> %s\n", actuator, newState ? "ON" : "OFF");
      }
    }
  }
}

void connectMQTT() {
  Serial.print("Connecting MQTT... ");
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  int attempts = 0;
  while (!mqtt.connected() && attempts < 20) {
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("OK");
      String cmdTopic = "pern/actuators/" + String(DEVICE_ID) + "/command";
      mqtt.subscribe(cmdTopic.c_str());
      Serial.println("[MQTT] Subscribed to: " + cmdTopic);
      return;
    }
    Serial.print(".");
    delay(1000);
    attempts++;
  }
  Serial.println("FAILED");
}

int readAvg(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return sum / samples;
}

void publishData() {
  int a0 = readAvg(A0, SENSOR_SAMPLES);
  int a1 = readAvg(A1, SENSOR_SAMPLES);
  int a2 = readAvg(A2, SENSOR_SAMPLES);
  int a3 = readAvg(A4, SENSOR_SAMPLES);

  float v = a0 * (5.0 / 1024.0);
  float tmp = v * 100.0;
  int   hum = map(a1, 0, 1023, 0, 100);
  int   pm25 = map(a2, 0, 1023, 0, 500);
  int   co2 = 400 + map(a3, 0, 1023, 0, 1600);

  StaticJsonDocument<256> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["tmp"]  = round(tmp * 10.0) / 10.0;
  sensors["hum"]  = hum;
  sensors["pm25"] = pm25;
  sensors["co2"]  = co2;

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));

  String topic = "pern/sensors/" + String(DEVICE_ID) + "/data";
  if (mqtt.publish(topic.c_str(), buf)) {
    Serial.print("Published: ");
    Serial.println(buf);
  } else {
    Serial.println("Publish failed!");
  }
}

void publishHeartbeat() {
  StaticJsonDocument<160> doc;
  doc["device"]    = DEVICE_ID;
  doc["uptime"]    = (millis() - bootTime) / 1000;
  doc["rssi"]      = 0;
  doc["fwVersion"] = "1.0.0";

  char buf[160];
  serializeJson(doc, buf, sizeof(buf));
  String topic = "pern/devices/" + String(DEVICE_ID) + "/heartbeat";
  mqtt.publish(topic.c_str(), buf);
}

void setup() {
  Serial.begin(115200);
  esp.begin(9600);
  while (!Serial) {}
  bootTime = millis();
  Serial.println("\n=== PERN IoT - Arduino Uno + ESP8266 ===");

  pinMode(PIN_RELAY1, OUTPUT); digitalWrite(PIN_RELAY1, LOW);
  pinMode(PIN_RELAY2, OUTPUT); digitalWrite(PIN_RELAY2, LOW);
  pinMode(PIN_LED,    OUTPUT); digitalWrite(PIN_LED,    LOW);

  String resp = sendAT("AT");
  if (resp.indexOf("OK") < 0) {
    Serial.println("ERROR: ESP8266 not responding. Check wiring.");
    while (1) { delay(1000); }
  }
  Serial.println("ESP8266 OK");

  connectWiFi();
  connectMQTT();
  Serial.println("Ready. Sending data every 5s.\n");
}

void loop() {
  if (!mqtt.connected()) {
    connectMQTT();
  }
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastSend >= SEND_INTERVAL) {
    lastSend = now;
    publishData();
  }
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    publishHeartbeat();
  }
}
