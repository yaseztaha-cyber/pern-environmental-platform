# PERN — Pollution & Environmental Risk Navigator

## ✅ Fully Implemented Real Integrations

### 1. Virtual Sensors (Soft Sensors)
- 10 computed sensors: AQI, WQI, Risk, Indoor Air, Corrosion, BOD, Thermal Comfort, Agri Suitability, Eutrophication, Human Exposure
- Real-time computation from physical readings
- Confidence scoring + formula descriptions

### 2. ntfy Push Notifications
- Real HTTP calls to `https://ntfy.sh`
- Configurable topic in Settings
- Critical alerts, automation triggers, device status

### 3. Real MQTT Connections
- Connects to local Mosquitto (`ws://localhost:9001`)
- Live mode streams real sensor data
- Device simulator included

### 4. Real Automation Engine
- Server-side rule evaluation
- Persists to PostgreSQL
- Triggers real ntfy notifications when rules fire

### 5. Logto OIDC Authentication
- Full `@logto/browser` integration
- Login page + callback handler
- JWT verification in backend

### 6. PostgreSQL Persistence
- Sensor readings, automation rules & logs saved to DB
- Full schema in `db.js`

---

## Quick Start (Docker)

```bash
cd pern-project
docker compose up -d --build
```

Then visit: **http://localhost**

---

## Manual Development

### Frontend
```bash
cd pern-frontend
npm run dev
```

### Backend
```bash
cd pern-backend
npm start
```

### Device Simulator
```bash
node simulator.js
```

---

## Key Files

- `frontend/src/lib/virtual-sensors.ts` — 10 soft sensors
- `frontend/src/lib/ntfy.ts` — Push notifications
- `frontend/src/lib/mqtt-client.ts` — Real-time IoT
- `backend/server.js` — Full backend + automation
- `backend/db.js` — PostgreSQL layer
- `docker-compose.yml` — All 7 services

---

**STEM Gharbiya • Grade 11 • 2026**