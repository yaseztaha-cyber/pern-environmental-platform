# PERN Backend API Documentation

**Version:** 2.5.0  
**Base URL:** `http://localhost:3000/api`

---

## Authentication & Context

Most endpoints support context via headers:

- `X-Organization-Id` — For organization-scoped data
- `X-User-Id` — For individual user data
- `Authorization` — Bearer token (future)

---

## Core Endpoints

### 1. Health Check
**GET** `/health`  
Returns server status, MQTT connection, and persistence status.

---

### 2. Sensor Data

**POST** `/persistence/readings`  
Save sensor readings from devices.

**Request Body:**
```json
{
  "device": "ESP32-Cairo-001",
  "sensors": {
    "pm25": 24.5,
    "ph": 7.3,
    "tmp": 29.1
  }
}
```

**GET** `/persistence/readings?limit=50`  
Retrieve recent sensor readings.

---

### 3. Automation Rules

**POST** `/persistence/rules`  
Save automation rules.

**GET** `/persistence/rules`  
Load saved automation rules.

---

### 4. Chatbot (AI Assistant)

**POST** `/chatbot/chat`  
Send a message to the AI with full environmental context.

**Request Body:**
```json
{
  "message": "Is the air quality dangerous?",
  "context": { ...current environmental data... },
  "sessionId": "main-session"
}
```

---

### 5. AI Tools

**POST** `/ai-tools/generate-rule`  
Convert natural language into a structured automation rule.

---

### 6. Protocol Status

**GET** `/protocols/status`  
Returns the connection status of all supported protocols (MQTT, HTTP, WebSocket, etc.).

---

## Error Format

All errors return:

```json
{
  "success": false,
  "error": "Error message"
}
```

---

*This is a basic reference. A full OpenAPI/Swagger specification can be added later.*