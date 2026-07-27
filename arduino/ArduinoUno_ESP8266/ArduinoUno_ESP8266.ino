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
// Find it: ipconfig (Windows) or ifconfig (Mac/Linux)
const char* MQTT_SERVER = "192.168.1.100";
const int   MQTT_PORT   = 1883;
const char* DEVICE_ID   = "Arduino-UNO-001";

// ESP8266 via SoftwareSerial (pins 10=RX, 11=TX)
SoftwareSerial esp(10, 11);
PubSubClient mqtt(esp);

// Send interval (ms)
const unsigned long SEND_INTERVAL = 5000;
// ========================================

unsigned long lastSend = 0;

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
  sendAT("AT+CWMODE=1");        // station mode
  String resp = sendAT("AT+CWJAP=\"" + String(WIFI_SSID) + "\",\"" + String(WIFI_PASS) + "\"", 15000);
  if (resp.indexOf("OK") >= 0 || resp.indexOf("CONNECTED") >= 0) {
    Serial.println("OK");
    sendAT("AT+CIFSR");  // show IP
  } else {
    Serial.println("FAILED - check SSID/password");
    Serial.println(resp);
    while (1) { delay(1000); }
  }
}

void connectMQTT() {
  Serial.print("Connecting MQTT... ");
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  int attempts = 0;
  while (!mqtt.connected() && attempts < 20) {
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("OK");
      return;
    }
    Serial.print(".");
    delay(1000);
    attempts++;
  }
  Serial.println("FAILED");
}

void publishData() {
  // Replace with actual sensor readings
  float tmp  = 25.0 + random(0, 50) / 10.0;
  int   hum  = 40 + random(0, 30);
  int   pm25 = 15 + random(0, 40);
  int   co2  = 400 + random(0, 200);

  StaticJsonDocument<256> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["tmp"]  = tmp;
  sensors["hum"]  = hum;
  sensors["pm25"] = pm25;
  sensors["co2"]  = co2;

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));

  String topic = "pern/sensors/" + String(DEVICE_ID) + "/data";
  if (mqtt.publish(topic.c_str(), buf)) {
    Serial.println(buf);
  } else {
    Serial.println("Publish failed!");
  }
}

void setup() {
  Serial.begin(115200);
  esp.begin(9600);
  while (!Serial) {}
  Serial.println("\n=== PERN IoT - Arduino Uno + ESP8266 ===");

  // Test ESP8266
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
}
