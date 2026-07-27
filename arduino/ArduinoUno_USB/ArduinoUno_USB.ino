/*
 * Arduino Uno via USB Serial
 * PERN IoT Platform - Sensor Publisher
 *
 * NO extra hardware needed — just USB cable.
 * The Arduino sends JSON over Serial (USB).
 * A Node.js bridge on the PC reads it and publishes to MQTT.
 *
 * Wiring: Just plug in the USB cable.
 * Baud: 115200
 *
 * Libraries needed: ArduinoJson (by Benoit Blanchon)
 *
 * Sensor connections (examples - adjust to your wiring):
 *   A0 -> LM35 temperature
 *   A1 -> DHT11 / analog humidity
 *   A2 -> MQ-135 (air quality)
 *   A3 -> MQ-2 (smoke)
 */

#include <ArduinoJson.h>

// ============ CONFIGURATION ============
const char* DEVICE_ID = "Arduino-UNO-001";
const int   BAUD_RATE = 115200;
const unsigned long SEND_INTERVAL = 5000;
// ========================================

unsigned long lastSend = 0;

void setup() {
  Serial.begin(BAUD_RATE);
  while (!Serial) {}
  Serial.println("\n=== PERN IoT - Arduino Uno (USB Serial) ===");
  Serial.println("Waiting for PC bridge connection...");
  // Wait for bridge to connect
  delay(2000);
}

void publishData() {
  // Replace with actual sensor reads
  float tmp  = analogRead(A0) * 0.488;    // LM35
  int   hum  = map(analogRead(A1), 0, 1023, 0, 100);
  int   pm25 = map(analogRead(A2), 0, 1023, 0, 500);
  int   mq   = map(analogRead(A3), 0, 1023, 0, 100);
  int   co2  = 400 + map(analogRead(A4), 0, 1023, 0, 1600);

  // Build JSON
  StaticJsonDocument<256> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["tmp"]  = round(tmp * 10.0) / 10.0;
  sensors["hum"]  = hum;
  sensors["pm25"] = pm25;
  sensors["mq"]   = mq;
  sensors["co2"]  = co2;

  // Send as single line over serial
  serializeJson(doc, Serial);
  Serial.println();  // newline delimiter for the bridge

  Serial.print("Sent: tmp=");
  Serial.print(tmp, 1);
  Serial.print(" hum=");
  Serial.print(hum);
  Serial.print(" pm25=");
  Serial.println(pm25);
}

void loop() {
  unsigned long now = millis();
  if (now - lastSend >= SEND_INTERVAL) {
    lastSend = now;
    publishData();
  }
}
