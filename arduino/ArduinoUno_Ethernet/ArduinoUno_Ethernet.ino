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
// ========================================

EthernetClient ethClient;
PubSubClient mqtt(ethClient);
unsigned long lastSend = 0;

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

void connectMQTT() {
  Serial.print("Connecting MQTT... ");
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println("OK");
      return;
    }
    Serial.print(".");
    delay(1000);
  }
}

void readSensors(float &tmp, float &hum, int &pm25, int &mq, int &co2) {
  // Replace these with your actual sensor reading logic
  tmp  = analogRead(A0) * 0.488;    // LM35: 10mV/°C, 5V ref
  hum  = map(analogRead(A1), 0, 1023, 0, 100);
  pm25 = map(analogRead(A2), 0, 1023, 0, 500);
  mq   = map(analogRead(A3), 0, 1023, 0, 100);
  co2  = 400 + map(analogRead(A4), 0, 1023, 0, 1600);
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

void setup() {
  Serial.begin(115200);
  while (!Serial) {}
  Serial.println("\n=== PERN IoT - Arduino Uno + Ethernet ===");

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
}
