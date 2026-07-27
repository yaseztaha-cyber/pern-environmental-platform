# EHI Platform — Device Integration Guide

> For robotics engineers building ESP32 / Arduino / NodeMCU firmware to connect to the
> Environmental Health Intelligence (EHI) platform.

---

## 1. System Architecture

```
┌──────────────┐       MQTT (port 1883)       ┌──────────────────┐
│  Your Device │ ◄──────────────────────────► │  MQTT Broker     │
│  (ESP32/UNO) │   publish sensor data        │  (Mosquitto)     │
│              │   subscribe to commands       │                  │
└──────────────┘                               └────────┬─────────┘
                                                        │
                                                 ┌──────▼──────┐
                                                 │  EHI Server │
                                                 │  :3000      │
                                                 └──────┬──────┘
                                                        │
                                                 ┌──────▼──────┐
                                                 │  Website UI │
                                                 │  :5173      │
                                                 └─────────────┘
```

### Connection Details

| Parameter | Value |
|-----------|-------|
| MQTT Broker | `mqtt://YOUR_SERVER_IP:1883` |
| MQTT over WebSocket | `ws://YOUR_SERVER_IP:9001` |
| Backend REST API | `http://YOUR_SERVER_IP:3000/api` |
| WebSocket (actuator feedback) | `ws://YOUR_SERVER_IP:8081` |
| MQTT Authentication | None (anonymous allowed) |
| MQTT QoS | 0 (at most once) for sensor data, 1 for actuator commands |

> Replace `YOUR_SERVER_IP` with the IP address of the machine running the EHI backend.
> If running locally, use `localhost` or `127.0.0.1`.

---

## 2. Sensor Data Format

### Topic

```
pern/sensors/{YOUR_DEVICE_ID}/data
```

Example:
```
pern/sensors/ESP32-Cairo-001/data
```

### Payload (JSON)

```json
{
  "device": "ESP32-Cairo-001",
  "timestamp": 1753545600000,
  "sensors": {
    "ph": 7.12,
    "tds": 187,
    "wT": 24.1,
    "dO": 8.5,
    "pm25": 31,
    "mq": 0.58,
    "tmp": 27.3,
    "hum": 55,
    "co2": 458,
    "voc": 167,
    "sm": 41
  }
}
```

### Sensor Keys

You only need to publish the sensors your device actually has. The platform handles
missing keys gracefully.

| Key | Sensor | Unit | Safe Range | Notes |
|-----|--------|------|------------|-------|
| `ph` | pH (water acidity) | — | 6.5 – 8.5 | Float, 2 decimals |
| `tds` | Total Dissolved Solids | ppm | 0 – 500 | Integer |
| `wT` | Water Temperature | °C | 10 – 30 | Float, 1 decimal |
| `dO` | Dissolved Oxygen | mg/L | 5 – 14 | Float, 1 decimal |
| `pm25` | PM2.5 (air particulate) | µg/m³ | 0 – 35 | Integer |
| `mq` | MQ-135 Gas Sensor | ppm | 0 – 1.0 | Float, 2 decimals |
| `tmp` | Air Temperature | °C | 15 – 35 | Float, 1 decimal |
| `hum` | Humidity | % | 30 – 70 | Integer |
| `co2` | CO₂ | ppm | 300 – 1000 | Integer |
| `voc` | Volatile Organic Compounds | ppb | 0 – 500 | Integer |
| `sm` | Soil Moisture | % | 20 – 60 | Integer |

### Minimum Viable Payload

If your device only has, say, a DHT22 (temp + humidity) and a MQ-135:

```json
{
  "device": "MY-DEVICE-001",
  "timestamp": 1753545600000,
  "sensors": {
    "tmp": 27.3,
    "hum": 55,
    "mq": 0.58
  }
}
```

### Publish Interval

- Recommended: **every 4–5 seconds** (matches simulator rate)
- Minimum: 2 seconds (server deduplicates)
- Maximum: 60 seconds (device goes "offline" after 60s of no data)

---

## 3. Device Registration (Optional)

The server auto-registers devices when it receives their first sensor reading. But you
can also publish a status message to explicitly register:

### Topic

```
pern/devices/{YOUR_DEVICE_ID}/status
```

### Payload

```json
{
  "name": "ESP32 Cairo Lab 001",
  "type": "ESP32",
  "status": "online"
}
```

### Device Types

```
ESP32, ESP8266, Arduino Uno, Arduino Mega, Raspberry Pi, Raspberry Pi Pico, NodeMCU
```

---

## 4. Receiving Actuator Commands

### Subscribe To

```
pern/devices/{YOUR_DEVICE_ID}/actuators/+/command
```

The `+` is a wildcard — the server publishes to a specific actuator name.

Example subscription for device `ESP32-Cairo-001`:
```
pern/devices/ESP32-Cairo-001/actuators/+/command
```

This will match topics like:
```
pern/devices/ESP32-Cairo-001/actuators/fan/command
pern/devices/ESP32-Cairo-001/actuators/pump/command
pern/devices/ESP32-Cairo-001/actuators/relay/command
```

### Command Payload (JSON)

```json
{
  "actuator": "fan",
  "state": "on",
  "source": "automation:rule-pm25-high",
  "timestamp": 1753545600000
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `actuator` | string | `fan`, `pump`, `relay`, `buzzer`, `led` | Which actuator to control |
| `state` | string | `on`, `off` | Desired state |
| `source` | string | any | Who triggered it (rule ID, "manual", etc.) |
| `timestamp` | number | epoch ms | When the command was issued |

### Parsing the Actuator Name from Topic

If you subscribe to `pern/devices/ESP32-Cairo-001/actuators/+/command`, the topic
will look like:

```
pern/devices/ESP32-Cairo-001/actuators/fan/command
│     │         │                │         │    │
  0     1         2                3         4    5
```

Extract the actuator name from position `[4]`:
```
topic.split('/')[4]  →  "fan"
```

---

## 5. Sending Actuator Status Feedback

After executing a command, publish the actual state back so the website shows it.

### Topic

```
pern/devices/{YOUR_DEVICE_ID}/actuators/{ACTUATOR_NAME}/status
```

Example:
```
pern/devices/ESP32-Cairo-001/actuators/fan/status
```

### Payload (JSON)

```json
{
  "device": "ESP32-Cairo-001",
  "actuator": "fan",
  "state": "on",
  "source": "automation:rule-pm25-high",
  "timestamp": 1753545600000
}
```

---

## 6. Arduino Uno + WiFi Chip (ESP8266/ENC28J60) Notes

The Arduino Uno does not have built-in WiFi. You need an external WiFi module.

### Option A: Arduino Uno + ESP8266 (ESP-01) via Serial

```
Arduino Uno          ESP-01
───────────          ──────
TX (pin 1)  ──────►  RX
RX (pin 0)  ◄──────  TX
GND         ──────►  GND
3.3V        ──────►  VCC + CH_PD
```

- Use `SoftwareSerial` on pins 2,3 for AT commands to ESP8266
- ESP8266 connects to WiFi and MQTT broker
- Arduino sends sensor data to ESP8266 via serial
- ESP8266 forwards to MQTT broker
- Limitation: RAM-constrained, may not support all sensors simultaneously

### Option B: Arduino Uno + ESP8266 (NodeMCU) as WiFi Co-processor

More reliable. NodeMCU runs the MQTT client, Arduino runs the sensors.

```
Arduino Uno          NodeMCU (ESP8266)
───────────          ─────────────────
TX (pin 1)  ──────►  RX (D6 / GPIO12)
RX (pin 0)  ◄──────  TX (D5 / GPIO14)
GND         ──────►  GND
5V          ──────►  VIN
```

### Option C: ESP32 (Recommended)

The ESP32 has built-in WiFi AND Bluetooth. It can run the full MQTT client and read
sensors directly — no separate Arduino needed.

**This is the recommended platform.** See the ESP32 example below.

---

## 7. ESP32 Example (Arduino IDE)

### Required Libraries

```
PubSubClient (by Nick O'Leary)  — MQTT client
ArduinoJson (by Benoit Blanchon) — JSON serialization
WiFi (built-in)                  — WiFi connection
```

Install via Arduino IDE Library Manager:
- Search "PubSubClient" → Install
- Search "ArduinoJson" → Install

### Complete Example

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== CONFIGURATION =====
const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD   = "YOUR_WIFI_PASSWORD";
const char* MQTT_BROKER     = "YOUR_SERVER_IP";  // e.g. "192.168.1.100"
const int   MQTT_PORT       = 1883;
const char* DEVICE_ID       = "ESP32-Cairo-001"; // Must match what the server expects

// MQTT Topics
String sensorTopic    = String("pern/sensors/") + DEVICE_ID + "/data";
String statusTopic    = String("pern/devices/") + DEVICE_ID + "/status";
String commandTopic   = String("pern/devices/") + DEVICE_ID + "/actuators/+/command";

// ===== OBJECTS =====
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// ===== ACTUATOR PINS =====
#define PIN_FAN    26   // GPIO26 → Relay for fan
#define PIN_PUMP   27   // GPIO27 → Relay for pump
#define PIN_LED    25   // GPIO25 → Status LED

// ===== SENSOR PINS =====
#define PIN_MQ135  34   // ADC input for MQ-135
#define PIN_DHT    4    // DHT22 data pin

// ===== SETUP =====
void setup() {
  Serial.begin(115200);

  pinMode(PIN_FAN, OUTPUT);
  pinMode(PIN_PUMP, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_FAN, LOW);
  digitalWrite(PIN_PUMP, LOW);

  connectWiFi();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
}

// ===== MAIN LOOP =====
void loop() {
  if (!mqtt.connected()) {
    reconnectMQTT();
  }
  mqtt.loop();

  // Publish sensor data every 5 seconds
  static unsigned long lastPublish = 0;
  if (millis() - lastPublish > 5000) {
    lastPublish = millis();
    publishSensorData();
  }
}

// ===== WIFI =====
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

// ===== MQTT =====
void reconnectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to MQTT...");
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println(" connected!");
      mqtt.subscribe(commandTopic.c_str());
      Serial.println("Subscribed to: " + commandTopic);

      // Announce device online
      StaticJsonDocument<128> doc;
      doc["name"]   = DEVICE_ID;
      doc["type"]   = "ESP32";
      doc["status"] = "online";
      char buf[128];
      serializeJson(doc, buf);
      mqtt.publish(statusTopic.c_str(), buf);
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" retrying in 5s...");
      delay(5000);
    }
  }
}

// ===== PUBLISH SENSOR DATA =====
void publishSensorData() {
  // Read your actual sensors here
  float ph      = readPH();
  int   pm25    = readPM25();
  float tmp     = readTemperature();
  int   hum     = readHumidity();
  int   co2     = readCO2();
  float mq      = readMQ135();
  int   sm      = readSoilMoisture();

  // Build JSON
  StaticJsonDocument<512> doc;
  doc["device"]    = DEVICE_ID;
  doc["timestamp"] = millis();

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["ph"]   = round2(ph);
  sensors["pm25"] = pm25;
  sensors["tmp"]  = round2(tmp);
  sensors["hum"]  = hum;
  sensors["co2"]  = co2;
  sensors["mq"]   = round2(mq);
  sensors["sm"]   = sm;

  char buf[512];
  serializeJson(doc, buf);

  if (mqtt.publish(sensorTopic.c_str(), buf)) {
    Serial.println("Published: " + String(buf));
  } else {
    Serial.println("Publish FAILED");
  }
}

// ===== RECEIVE ACTUATOR COMMANDS =====
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  // Parse topic: pern/devices/{deviceId}/actuators/{actuator}/command
  String topicStr = String(topic);
  int actuatorIdx = topicStr.lastIndexOf('/') - 1;
  String actuator = topicStr.substring(topicStr.lastIndexOf('/', topicStr.lastIndexOf('/') - 1) + 1,
                                       topicStr.lastIndexOf('/'));

  // Parse JSON payload
  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  String state  = doc["state"] | "off";
  String source = doc["source"] | "unknown";

  Serial.println("Command: " + actuator + " → " + state + " (from: " + source + ")");

  // Execute command
  int pin = -1;
  if (actuator == "fan")   pin = PIN_FAN;
  if (actuator == "pump")  pin = PIN_PUMP;
  if (actuator == "led")   pin = PIN_LED;

  if (pin >= 0) {
    digitalWrite(pin, state == "on" ? HIGH : LOW);
  }

  // Send status feedback
  publishActuatorStatus(actuator, state, source);
}

// ===== SEND ACTUATOR STATUS =====
void publishActuatorStatus(String actuator, String state, String source) {
  String statusActuatorTopic = String("pern/devices/") + DEVICE_ID + "/actuators/" + actuator + "/status";

  StaticJsonDocument<256> doc;
  doc["device"]    = DEVICE_ID;
  doc["actuator"]  = actuator;
  doc["state"]     = state;
  doc["source"]    = source;
  doc["timestamp"] = millis();

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(statusActuatorTopic.c_str(), buf);
}

// ===== SENSOR STUBS (replace with real readings) =====
float readPH()          { return 7.1 + random(-30, 30) / 100.0; }
int   readPM25()        { return random(10, 50); }
float readTemperature() { return 27.0 + random(-20, 20) / 10.0; }
int   readHumidity()    { return 50 + random(0, 20); }
int   readCO2()         { return 400 + random(0, 100); }
float readMQ135()       { return analogRead(PIN_MQ135) / 4095.0; }
int   readSoilMoisture(){ return random(20, 60); }
float round2(float v)   { return round(v * 100) / 100.0; }
```

---

## 8. Testing Without Hardware

You can test the full pipeline using `mosquitto_pub` from the command line:

### Publish fake sensor data

```bash
mosquitto_pub -h localhost -t "pern/sensors/TEST-DEVICE/data" -m '{
  "device": "TEST-DEVICE",
  "timestamp": 1753545600000,
  "sensors": {
    "pm25": 60,
    "ph": 5.8,
    "co2": 1200,
    "tmp": 40,
    "hum": 80
  }
}'
```

### Subscribe to actuator commands

```bash
mosquitto_sub -h localhost -t "pern/devices/TEST-DEVICE/actuators/+"
```

You should see commands arrive when automation rules trigger (e.g., if pm25 > 35, the
server will publish a `fan ON` command).

### Subscribe to all sensor data

```bash
mosquitto_sub -h localhost -t "pern/sensors/#"
```

---

## 9. Automation Rules (Server-Side)

The server evaluates these rules automatically. You do NOT need to implement them on
the device — the server publishes actuator commands via MQTT when a rule triggers.

| Rule | Condition | Action |
|------|-----------|--------|
| PM2.5 High → Fan On | `pm25 > 35` | Fan ON on ESP32-Cairo-001 |
| CO2 Critical → Ventilation | `co2 > 1000` | Fan ON on ESP32-Cairo-001 |
| pH Low → Pump On | `ph < 6.5` | Pump ON on ESP32-Cairo-001 |
| Heat Warning → Fan On | `tmp > 38` | Fan ON on ESP32-Cairo-001 |

Rules can be added/modified via the website Automation page or the REST API.

---

## 10. REST API Endpoints (Optional)

If you prefer HTTP over MQTT for sensor data:

### POST sensor data

```
POST http://YOUR_SERVER_IP:3000/api/sensors
Content-Type: application/json

{
  "device": "ESP32-Cairo-001",
  "sensors": {
    "pm25": 31,
    "tmp": 27.3
  }
}
```

### Health check

```
GET http://YOUR_SERVER_IP:3000/api/health
```

Response:
```json
{
  "status": "ok",
  "mqtt": true,
  "db": "ok"
}
```

---

## 11. Troubleshooting

| Problem | Solution |
|---------|----------|
| Device can't connect to MQTT broker | Check broker IP, port 1883, firewall rules |
| Sensor data not showing on website | Verify topic format: `pern/sensors/{id}/data` |
| Actuator commands not received | Subscribe to `pern/devices/{id}/actuators/+/command` |
| Device shows "offline" | Send data more frequently (< 60s interval) |
| Automation rules don't fire | Check sensor key names match exactly (`pm25` not `PM25`) |
| MQTT connection drops | Reconnect with backoff; server auto-reconnects |

---

## 12. Wiring Reference (ESP32)

```
ESP32 GPIO Pin Assignment (example):
─────────────────────────────────────
GPIO 25  → Status LED (built-in)
GPIO 26  → Relay Channel 1 (Fan)
GPIO 27  → Relay Channel 2 (Pump)
GPIO 34  → MQ-135 Analog Output (ADC1, read-only)
GPIO 4   → DHT22 Data (with 10kΩ pull-up to 3.3V)
GPIO 21  → I2C SDA (for BMP280, SHT31, etc.)
GPIO 22  → I2C SCL
GPIO 16  → Soil Moisture Analog (ADC2)
3.3V     → Sensor VCC
GND      → Common Ground
```

> **Note:** GPIO 34–39 are input-only on ESP32. Use them for analog sensors.
> GPIO 2, 12, 15, 33 may cause boot issues — avoid for critical outputs.
