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
const int SENSOR_SAMPLES = 5;
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

int readAvg(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return sum / samples;
}

void publishData() {
  // Sensor conversions (10-bit ADC, 5V ref)
  int a0  = readAvg(A0, SENSOR_SAMPLES);       // LM35 (temp)
  int a1  = readAvg(A1, SENSOR_SAMPLES);       // analog humidity
  int a2  = readAvg(A2, SENSOR_SAMPLES);        // MQ-135 (air quality)
  int a3  = readAvg(A3, SENSOR_SAMPLES);        // gas sensor
  int a4  = readAvg(A4, SENSOR_SAMPLES);        // CO2 sensor

  float voltage = a0 * (5.0 / 1024.0);
  float tmp     = voltage * 100.0;             // LM35: 10mV/°C

  int   hum  = map(a1, 0, 1023, 0, 100);       // generic humidity (0-100%)
  int   pm25 = map(a2, 0, 1023, 0, 500);        // MQ-135 -> PM2.5 index (0-500)
  int   mq   = map(a3, 0, 1023, 0, 100);        // gas sensor (0-100)
  int   co2  = 400 + map(a4, 0, 1023, 0, 1600); // CO2 (400-2000 ppm)

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
  Serial.print(pm25);
  Serial.print(" mq=");
  Serial.print(mq);
  Serial.print(" co2=");
  Serial.println(co2);
}

void loop() {
  unsigned long now = millis();
  if (now - lastSend >= SEND_INTERVAL) {
    lastSend = now;
    publishData();
  }
}
