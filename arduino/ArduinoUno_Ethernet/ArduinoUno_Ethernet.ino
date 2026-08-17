/*
 * Arduino Uno + Ethernet Shield (W5100/W5500)
 * PERN IoT Platform - Sensor Publisher
 *
 * Libraries needed:
 *   - PubSubClient (by Nick O'Leary)
 *   - ArduinoJson (by Benoit Blanchon)
 *   - Ethernet (built-in with Arduino IDE)
 *
 * Wiring (Ethernet Shield):
 *   - Stack shield on top of Uno
 *   - Connect LAN cable from shield to your router/switch
 *
 * Sensor connections (examples - adjust to your wiring):
 *   A0 -> LM35 temperature sensor
 *   A1 -> DHT11 data pin (or analog humidity sensor)
 *   A2 -> MQ-135 analog out (air quality)
 *   A3 -> MQ-2 analog out (smoke/gas)
 */

#include <SPI.h>
#include <Ethernet.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ============ CONFIGURATION ============
// MAC address (unique per device - change last byte if multiple)
byte MAC[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };

// IP config - set to match your network
IPAddress IP(192, 168, 1, 200);     // static IP for this Arduino
IPAddress GATEWAY(192, 168, 1, 1);  // your router IP
IPAddress DNS_SERVER(192, 168, 1, 1);
IPAddress SUBNET(255, 255, 255, 0);

// MQTT broker - change to your PC's local IP
// Find it: ipconfig (Windows) or ifconfig (Mac/Linux)
const char* MQTT_SERVER = "192.168.1.100";
const int   MQTT_PORT   = 1883;
const char* DEVICE_ID   = "Arduino-UNO-001";

// Send interval (ms)
const unsigned long SEND_INTERVAL = 5000;
const int SENSOR_SAMPLES = 5;

// Heartbeat interval (ms)
const unsigned long HEARTBEAT_INTERVAL = 30000;

// Actuator pins
const int PIN_RELAY1 = 3;   // adjust to your wiring
const int PIN_RELAY2 = 4;
const int PIN_LED    = 5;
// ========================================

EthernetClient ethClient;
PubSubClient mqtt(ethClient);
unsigned long lastSend = 0;
unsigned long lastHeartbeat = 0;
unsigned long bootTime = 0;

void connectNetwork() {
  Serial.print("Connecting Ethernet... ");
  Ethernet.begin(MAC, IP, DNS_SERVER, GATEWAY, SUBNET);
  delay(1500);
  if (Ethernet.linkStatus() == LinkON) {
    Serial.println("OK");
  } else {
    Serial.println("WARNING: No link detected. Check cable.");
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
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("OK");
      String cmdTopic = "pern/actuators/" + String(DEVICE_ID) + "/command";
      mqtt.subscribe(cmdTopic.c_str());
      Serial.println("[MQTT] Subscribed to: " + cmdTopic);
      return;
    }
    Serial.print(".");
    delay(1000);
  }
}

int readAvg(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return sum / samples;
}

void readSensors(float &tmp, float &hum, int &pm25, int &mq, int &co2) {
  int a0 = readAvg(A0, SENSOR_SAMPLES);  // LM35
  int a1 = readAvg(A1, SENSOR_SAMPLES);  // analog humidity
  int a2 = readAvg(A2, SENSOR_SAMPLES);  // MQ-135
  int a3 = readAvg(A3, SENSOR_SAMPLES);  // gas
  int a4 = readAvg(A4, SENSOR_SAMPLES);  // CO2

  float v = a0 * (5.0 / 1024.0);
  tmp  = v * 100.0;                         // LM35: 10mV/°C
  hum  = map(a1, 0, 1023, 0, 100);          // 0-100%
  pm25 = map(a2, 0, 1023, 0, 500);          // 0-500 AQI
  mq   = map(a3, 0, 1023, 0, 100);          // 0-100 gas index
  co2  = 400 + map(a4, 0, 1023, 0, 1600);   // 400-2000 ppm
}

void publishData() {
  float tmp, hum;
  int pm25, mq, co2;
  readSensors(tmp, hum, pm25, mq, co2);

  StaticJsonDocument<320> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();
  doc["lat"]       = 30.0444;   // change to your location
  doc["lng"]       = 31.2357;
  doc["region"]    = "Cairo";

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["tmp"]  = round(tmp * 10.0) / 10.0;
  sensors["hum"]  = hum;
  sensors["pm25"] = pm25;
  sensors["mq"]   = mq;
  sensors["co2"]  = co2;

  char buf[320];
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
  doc["rssi"]      = 0;  // Ethernet has no RSSI
  doc["ip"]        = Ethernet.localIP().toString();
  doc["fwVersion"] = "1.0.0";

  char buf[160];
  serializeJson(doc, buf, sizeof(buf));
  String topic = "pern/devices/" + String(DEVICE_ID) + "/heartbeat";
  mqtt.publish(topic.c_str(), buf);
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {}
  bootTime = millis();
  Serial.println("\n=== PERN IoT - Arduino Uno + Ethernet ===");

  pinMode(PIN_RELAY1, OUTPUT); digitalWrite(PIN_RELAY1, LOW);
  pinMode(PIN_RELAY2, OUTPUT); digitalWrite(PIN_RELAY2, LOW);
  pinMode(PIN_LED,    OUTPUT); digitalWrite(PIN_LED,    LOW);

  connectNetwork();
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
