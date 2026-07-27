/**
 * Device profiles — defines how different device kinds connect, their baud
 * rate / link parameters, and the sensor set they report. Used by the
 * connection system so each device type has its own transport, topic,
 * baud rate and expected sensor list with units and typical ranges.
 */

export type DeviceCategory = 'MCU' | 'Gateway' | 'HTTP' | 'WebSocket';

export interface SensorDetail {
  key: string;
  label: string;
  unit: string;
  range: string;
}

export interface DeviceProfile {
  type: string;
  label: string;
  category: DeviceCategory;
  protocol: 'MQTT' | 'HTTP' | 'WebSocket';
  transport: string;
  // Link parameters shown to the user (baud rate applies to serial MCUs)
  link: string;
  // Supported baud rates for serial/MCU devices; null for IP-based transports
  baudRates: number[] | null;
  defaultBaud: number | null;
  sensors: string[];
  sensorDetails: SensorDetail[];
  // Example the user can copy to wire up a real device
  example: (deviceId: string, baud?: number | null) => string;
}

const SENSORS: Record<string, SensorDetail> = {
  pm25: { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', range: '0–500' },
  co2: { key: 'co2', label: 'CO₂', unit: 'ppm', range: '400–5000' },
  voc: { key: 'voc', label: 'VOC', unit: 'ppb', range: '0–2000' },
  tmp: { key: 'tmp', label: 'Temperature', unit: '°C', range: '-20–60' },
  hum: { key: 'hum', label: 'Humidity', unit: '%', range: '0–100' },
  ph: { key: 'ph', label: 'pH', unit: '', range: '0–14' },
  tds: { key: 'tds', label: 'TDS', unit: 'ppm', range: '0–2000' },
  dO: { key: 'dO', label: 'Dissolved O₂', unit: 'mg/L', range: '0–14' },
  mq: { key: 'mq', label: 'MQ Gas', unit: 'V', range: '0–5' },
  wT: { key: 'wT', label: 'Water Temp', unit: '°C', range: '0–50' },
  nh3: { key: 'nh3', label: 'NH₃', unit: 'ppm', range: '0–100' },
  sm: { key: 'sm', label: 'Soil Moisture', unit: '%', range: '0–100' },
};

function details(keys: string[]): SensorDetail[] {
  return keys.map(k => SENSORS[k] || { key: k, label: k, unit: '', range: '' });
}

function serialExample(id: string, topic: string, sensors: string[], baud?: number | null): string {
  const b = baud ? baud : 115200;
  const sample = sensors.map(s => `"${s}": 0`).join(', ');
  return (
    `// ${topic}\n` +
    `// Serial: ${b} baud, 8N1  (Arduino Serial.begin(${b}))\n` +
    `void publish() {\n` +
    `  String payload = "{\\"device\\": \\"${id}\\", \\"timestamp\\": " + millis() +\n` +
    `    ", \\"sensors\\": { ${sample} } }";\n` +
    `  mqttClient.publish("${topic}", payload.c_str());\n` +
    `}`
  );
}

export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    type: 'Arduino-USB',
    label: 'Arduino Uno (USB Serial)',
    category: 'MCU',
    protocol: 'MQTT',
    transport: 'MQTT · via Node.js bridge on PC',
    link: 'USB Serial → bridge.js → MQTT broker',
    baudRates: [9600, 115200],
    defaultBaud: 115200,
    sensors: ['pm25', 'tmp', 'hum', 'co2', 'mq'],
    sensorDetails: details(['pm25', 'tmp', 'hum', 'co2', 'mq']),
    example: (id, baud) =>
      `// ========================================\n` +
      `// Arduino Uno + USB Serial → PC Bridge\n` +
      `// ========================================\n` +
      `// HARDWARE: Arduino Uno, LM35 (A0), DHT11 (A1),\n` +
      `//           MQ-135 (A2), GP2Y1010AU (A3)\n` +
      `// LIBRARIES: ArduinoJson (install via Library Manager)\n` +
      `// WIRING:\n` +
      `//   LM35 → A0   DHT11 → A1   MQ-135 → A2\n` +
      `//   GP2Y1010AU粉尘传感器 → A3 (with 150Ω + 220µF)\n` +
      `// STEP 1: Upload this sketch to Arduino Uno\n` +
      `// STEP 2: On PC run: node bridge.js COM3\n` +
      `// ========================================\n\n` +
      `#include <ArduinoJson.h>\n\n` +
      `const char* DEVICE_ID = "${id}";\n` +
      `const unsigned long INTERVAL = 5000; // 5 seconds\n` +
      `unsigned long lastSend = 0;\n\n` +
      `// Sensor pins\n` +
      `const int PIN_TEMP = A0;  // LM35 temperature\n` +
      `const int PIN_HUM  = A1;  // DHT11 humidity\n` +
      `const int PIN_PM25 = A2;  // MQ-135 analog\n` +
      `const int PIN_CO2  = A3;  // GP2Y1010AU dust\n\n` +
      `void setup() {\n` +
      `  Serial.begin(${baud || 115200});\n` +
      `  while (!Serial) { ; }\n` +
      `  analogReference(DEFAULT);\n` +
      `  delay(100);\n` +
      `}\n\n` +
      `float readTemperature() {\n` +
      `  int raw = analogRead(PIN_TEMP);\n` +
      `  float voltage = raw * (5.0 / 1023.0);\n` +
      `  return voltage * 100.0;  // LM35: 10mV/°C\n` +
      `}\n\n` +
      `int readHumidity() {\n` +
      `  int raw = analogRead(PIN_HUM);\n` +
      `  return map(raw, 0, 1023, 20, 90); // approx\n` +
      `}\n\n` +
      `int readPM25() {\n` +
      `  int raw = analogRead(PIN_PM25);\n` +
      `  return map(raw, 0, 1023, 0, 500); // µg/m³\n` +
      `}\n\n` +
      `int readCO2() {\n` +
      `  int raw = analogRead(PIN_CO2);\n` +
      `  return 400 + map(raw, 0, 1023, 0, 1600); // ppm\n` +
      `}\n\n` +
      `void loop() {\n` +
      `  if (millis() - lastSend < INTERVAL) return;\n` +
      `  lastSend = millis();\n\n` +
      `  float tmp  = readTemperature();\n` +
      `  int   hum  = readHumidity();\n` +
      `  int   pm25 = readPM25();\n` +
      `  int   co2  = readCO2();\n\n` +
      `  StaticJsonDocument<256> doc;\n` +
      `  doc["device"]    = DEVICE_ID;\n` +
      `  doc["timestamp"] = millis();\n` +
      `  JsonObject s = doc.createNestedObject("sensors");\n` +
      `  s["tmp"]  = round(tmp * 10.0) / 10.0;\n` +
      `  s["hum"]  = hum;\n` +
      `  s["pm25"] = pm25;\n` +
      `  s["co2"]  = co2;\n\n` +
      `  serializeJson(doc, Serial);\n` +
      `  Serial.println();  // newline delimiter for bridge\n` +
      `}`,
  },
  {
    type: 'Arduino-Ethernet',
    label: 'Arduino Uno (Ethernet Shield)',
    category: 'MCU',
    protocol: 'MQTT',
    transport: 'MQTT · ws://localhost:9001',
    link: 'Ethernet W5100/W5500 · LAN cable',
    baudRates: [9600, 115200],
    defaultBaud: 115200,
    sensors: ['pm25', 'tmp', 'hum', 'co2', 'mq'],
    sensorDetails: details(['pm25', 'tmp', 'hum', 'co2', 'mq']),
    example: (id, baud) =>
      `// Arduino Uno + Ethernet Shield (W5100/W5500)\n` +
      `// Libraries: PubSubClient, Ethernet (built-in)\n\n` +
      `#include <SPI.h>\n` +
      `#include <Ethernet.h>\n` +
      `#include <PubSubClient.h>\n` +
      `#include <ArduinoJson.h>\n\n` +
      `byte MAC[] = {0xDE,0xAD,0xBE,0xEF,0xFE,0xED};\n` +
      `IPAddress IP(192,168,1,200);\n` +
      `EthernetClient eth;\n` +
      `PubSubClient mqtt(eth);\n\n` +
      `void setup() {\n` +
      `  Serial.begin(${baud || 115200});\n` +
      `  Ethernet.begin(MAC, IP);\n` +
      `  mqtt.setServer("192.168.1.100", 1883);  // Your PC IP\n` +
      `  mqtt.connect("${id}");\n` +
      `}\n\n` +
      `void loop() {\n` +
      `  mqtt.loop();\n` +
      `  // ... read sensors, build JSON, publish to:\n` +
      `  // pern/sensors/${id}/data\n` +
      `}`,
  },
  {
    type: 'Arduino-ESP8266',
    label: 'Arduino Uno (ESP-01 WiFi)',
    category: 'MCU',
    protocol: 'MQTT',
    transport: 'MQTT · ws://localhost:9001',
    link: 'SoftwareSerial → ESP-01 (AT commands)',
    baudRates: [9600, 115200],
    defaultBaud: 9600,
    sensors: ['pm25', 'tmp', 'hum', 'co2'],
    sensorDetails: details(['pm25', 'tmp', 'hum', 'co2']),
    example: (id, baud) =>
      `// Arduino Uno + ESP-01 WiFi Module\n` +
      `// Wiring: ESP TX→Pin10, ESP RX→Pin11 (via divider!)\n` +
      `// ESP-01 is 3.3V — use voltage divider on TX→RX\n` +
      `// Libraries: PubSubClient\n\n` +
      `#include <SoftwareSerial.h>\n` +
      `#include <PubSubClient.h>\n` +
      `#include <ArduinoJson.h>\n\n` +
      `SoftwareSerial esp(10, 11);\n` +
      `PubSubClient mqtt(esp);\n\n` +
      `// First: send AT commands to connect WiFi\n` +
      `// AT+CWJAP="SSID","PASSWORD"\n\n` +
      `// Then connect MQTT and publish:\n` +
      `// pern/sensors/${id}/data`,
  },
  {
    type: 'ESP32',
    label: 'ESP32 (Air + Water)',
    category: 'MCU',
    protocol: 'MQTT',
    transport: 'MQTT · ws://localhost:9001',
    link: 'UART 115200 · Wi-Fi 2.4GHz',
    baudRates: [9600, 57600, 115200, 230400],
    defaultBaud: 115200,
    sensors: ['pm25', 'co2', 'voc', 'tmp', 'hum', 'ph', 'tds', 'dO'],
    sensorDetails: details(['pm25', 'co2', 'voc', 'tmp', 'hum', 'ph', 'tds', 'dO']),
    example: (id, baud) =>
      `// ========================================\n` +
      `// ESP32 WiFi MQTT — Air + Water Quality\n` +
      `// ========================================\n` +
      `// HARDWARE: ESP32, DHT22 (GPIO4), MQ-135 (GPIO34),\n` +
      `//           BMP280 (I2C), TDS (GPIO35), pH (GPIO32)\n` +
      `// LIBRARIES (install via Library Manager):\n` +
      `//   PubSubClient, DHT sensor library, Adafruit BMP280\n` +
      `// WIFI: Set SSID & PASSWORD below\n` +
      `// MQTT: Set MQTT_SERVER to your PC's IP address\n` +
      `// ========================================\n\n` +
      `#include <WiFi.h>\n` +
      `#include <PubSubClient.h>\n` +
      `#include <DHT.h>\n` +
      `#include <ArduinoJson.h>\n\n` +
      `// ===== CONFIGURATION =====\n` +
      `const char* WIFI_SSID   = "YOUR_WIFI_SSID";\n` +
      `const char* WIFI_PASS   = "YOUR_WIFI_PASSWORD";\n` +
      `const char* MQTT_SERVER = "192.168.1.100"; // Your PC IP\n` +
      `const int   MQTT_PORT   = 1883;\n` +
      `const char* DEVICE_ID   = "${id}";\n` +
      `const char* TOPIC       = "pern/sensors/${id}/data";\n` +
      `const unsigned long INTERVAL = 5000;\n\n` +
      `// ===== PINS =====\n` +
      `#define DHT_PIN    4\n` +
      `#define DHT_TYPE   DHT22\n` +
      `#define MQ135_PIN  34\n` +
      `#define TDS_PIN    35\n` +
      `#define PH_PIN     32\n` +
      `#define CO2_PIN    36\n\n` +
      `WiFiClient wifi;\n` +
      `PubSubClient mqtt(wifi);\n` +
      `DHT dht(DHT_PIN, DHT_TYPE);\n` +
      `unsigned long lastSend = 0;\n\n` +
      `void connectWiFi() {\n` +
      `  WiFi.begin(WIFI_SSID, WIFI_PASS);\n` +
      `  Serial.print("Connecting to WiFi");\n` +
      `  while (WiFi.status() != WL_CONNECTED) {\n` +
      `    delay(500);\n` +
      `    Serial.print(".");\n` +
      `  }\n` +
      `  Serial.println("\\nWiFi connected: " + WiFi.localIP().toString());\n` +
      `}\n\n` +
      `void connectMQTT() {\n` +
      `  while (!mqtt.connected()) {\n` +
      `    Serial.print("Connecting to MQTT...");\n` +
      `    if (mqtt.connect(DEVICE_ID)) {\n` +
      `      Serial.println("connected!");\n` +
      `    } else {\n` +
      `      Serial.print("failed, rc=");\n` +
      `      Serial.print(mqtt.state());\n` +
      `      Serial.println(" retry in 3s");\n` +
      `      delay(3000);\n` +
      `    }\n` +
      `  }\n` +
      `}\n\n` +
      `float readPH() {\n` +
      `  int raw = analogRead(PH_PIN);\n` +
      `  float voltage = raw * (3.3 / 4095.0);\n` +
      `  return 7.0 + ((2.5 - voltage) / 0.18);\n` +
      `}\n\n` +
      `float readTDS() {\n` +
      `  int raw = analogRead(TDS_PIN);\n` +
      `  float voltage = raw * (3.3 / 4095.0);\n` +
      `  float temp = dht.readTemperature();\n` +
      `  float comp = 1.0 + 0.02 * (temp - 25.0);\n` +
      `  return (133.42*voltage*voltage*voltage\n` +
      `        - 255.86*voltage*voltage\n` +
      `        + 857.39*voltage) * comp;\n` +
      `}\n\n` +
      `void setup() {\n` +
      `  Serial.begin(${baud || 115200});\n` +
      `  dht.begin();\n` +
      `  connectWiFi();\n` +
      `  mqtt.setServer(MQTT_SERVER, MQTT_PORT);\n` +
      `}\n\n` +
      `void loop() {\n` +
      `  if (!mqtt.connected()) connectMQTT();\n` +
      `  mqtt.loop();\n\n` +
      `  if (millis() - lastSend < INTERVAL) return;\n` +
      `  lastSend = millis();\n\n` +
      `  float tmp  = dht.readTemperature();\n` +
      `  float hum  = dht.readHumidity();\n` +
      `  int   pm25 = map(analogRead(MQ135_PIN), 0, 4095, 0, 500);\n` +
      `  int   co2  = 400 + map(analogRead(CO2_PIN), 0, 4095, 0, 1600);\n` +
      `  float ph   = readPH();\n` +
      `  float tds  = readTDS();\n\n` +
      `  StaticJsonDocument<384> doc;\n` +
      `  doc["device"]    = DEVICE_ID;\n` +
      `  doc["timestamp"] = millis();\n` +
      `  JsonObject s = doc.createNestedObject("sensors");\n` +
      `  s["tmp"]  = round(tmp * 10.0) / 10.0;\n` +
      `  s["hum"]  = round(hum * 10.0) / 10.0;\n` +
      `  s["pm25"] = pm25;\n` +
      `  s["co2"]  = co2;\n` +
      `  s["ph"]   = round(ph * 100.0) / 100.0;\n` +
      `  s["tds"]  = round(tds);\n\n` +
      `  char buffer[384];\n` +
      `  serializeJson(doc, buffer);\n` +
      `  mqtt.publish(TOPIC, buffer);\n` +
      `  Serial.println(buffer);\n` +
      `}`,
  },
  {
    type: 'ESP8266',
    label: 'ESP8266 (Compact)',
    category: 'MCU',
    protocol: 'MQTT',
    transport: 'MQTT · ws://localhost:9001',
    link: 'UART 115200 · Wi-Fi 2.4GHz',
    baudRates: [9600, 57600, 115200],
    defaultBaud: 115200,
    sensors: ['pm25', 'tmp', 'hum', 'co2'],
    sensorDetails: details(['pm25', 'tmp', 'hum', 'co2']),
    example: (id, baud) => serialExample(id, `pern/sensors/${id}/data`, ['pm25', 'tmp', 'hum', 'co2'], baud),
  },
  {
    type: 'NodeMCU',
    label: 'NodeMCU',
    category: 'MCU',
    protocol: 'MQTT',
    transport: 'MQTT · ws://localhost:9001',
    link: 'UART 115200 · Wi-Fi 2.4GHz',
    baudRates: [9600, 57600, 115200],
    defaultBaud: 115200,
    sensors: ['pm25', 'mq', 'ph', 'tds', 'wT'],
    sensorDetails: details(['pm25', 'mq', 'ph', 'tds', 'wT']),
    example: (id, baud) => serialExample(id, `pern/sensors/${id}/data`, ['pm25', 'mq', 'ph', 'tds', 'wT'], baud),
  },
  {
    type: 'Raspberry Pi',
    label: 'Raspberry Pi (Gateway)',
    category: 'Gateway',
    protocol: 'MQTT',
    transport: 'MQTT · ws://localhost:9001',
    link: 'Ethernet/Wi-Fi · Python paho-mqtt',
    baudRates: [115200],
    defaultBaud: 115200,
    sensors: ['pm25', 'co2', 'voc', 'tmp', 'hum', 'ph', 'tds', 'dO', 'nh3', 'sm'],
    sensorDetails: details(['pm25', 'co2', 'voc', 'tmp', 'hum', 'ph', 'tds', 'dO', 'nh3', 'sm']),
    example: (id) =>
      `# pip install paho-mqtt\n` +
      `import paho.mqtt.client as mqtt, time\n` +
      `c = mqtt.Client()\n` +
      `c.connect("localhost", 9001, 60)\n` +
      `c.publish("pern/sensors/${id}/data",\n` +
      `  '{"device":"${id}","sensors":{"pm25":20,"co2":430,"voc":120,"tmp":26,"hum":50,"ph":7.0,"tds":170,"dO":8.2,"nh3":4,"sm":38}}')\n` +
      `c.disconnect()`,
  },
  {
    type: 'HTTP Sensor',
    label: 'HTTP/REST Sensor',
    category: 'HTTP',
    protocol: 'HTTP',
    transport: 'HTTP POST · http://localhost:3002',
    link: 'REST · JSON over Ethernet/Wi-Fi',
    baudRates: null,
    defaultBaud: null,
    sensors: ['pm25', 'co2', 'tmp', 'hum'],
    sensorDetails: details(['pm25', 'co2', 'tmp', 'hum']),
    example: (id) =>
      `curl -X POST http://localhost:3002/api/devices/${id}/data \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      `  -d '{ "sensors": { "pm25": 18, "co2": 405, "tmp": 25, "hum": 48 } }'`,
  },
  {
    type: 'WebSocket Sensor',
    label: 'WebSocket Sensor',
    category: 'WebSocket',
    protocol: 'WebSocket',
    transport: 'WebSocket · ws://localhost:8080',
    link: 'WS · JSON over Ethernet/Wi-Fi',
    baudRates: null,
    defaultBaud: null,
    sensors: ['pm25', 'tmp', 'hum'],
    sensorDetails: details(['pm25', 'tmp', 'hum']),
    example: (id) =>
      `// Connect to ws://localhost:8080 and send:\n` +
      `{ "device": "${id}", "sensors": { "pm25": 17, "tmp": 24, "hum": 47 } }`,
  },
  {
    type: 'Generic',
    label: 'Generic / Custom',
    category: 'MCU',
    protocol: 'MQTT',
    transport: 'MQTT · ws://localhost:9001',
    link: 'UART 115200 · any transport',
    baudRates: [9600, 57600, 115200, 230400],
    defaultBaud: 115200,
    sensors: ['pm25', 'tmp', 'hum'],
    sensorDetails: details(['pm25', 'tmp', 'hum']),
    example: (id, baud) => serialExample(id, `pern/sensors/${id}/data`, ['pm25', 'tmp', 'hum'], baud),
  },
];

export const DEVICE_CATEGORIES: DeviceCategory[] = ['MCU', 'Gateway', 'HTTP', 'WebSocket'];

export function getProfile(type: string): DeviceProfile {
  return DEVICE_PROFILES.find(p => p.type === type) || DEVICE_PROFILES[DEVICE_PROFILES.length - 1];
}
