# PERN — Pollution & Environmental Risk Navigator

Full-stack IoT Environmental Intelligence Platform built with **PostgreSQL, Express, React, Node.js**.

Real-time sensor monitoring, AI-powered analysis, multi-protocol device connectivity, and enterprise-grade security — designed for environmental health intelligence in the Nile Delta region.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                     │
│  Dashboard · Sensors · Alerts · AI Chat · Maps · Analytics   │
│  Recharts · Leaflet · Framer Motion · Tailwind CSS           │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API + WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                    Express Backend                            │
│  Auth (Logto OIDC) · RBAC · Rate Limiting · Sanitization    │
│  AI Router (OpenRouter) · Automation Engine · MQTT Gateway   │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│  PostgreSQL │  MQTT Broker │  WebSocket   │  ntfy/SMTP/SMS  │
│  (pg 15)    │ (Mosquitto)  │  (port 8081) │  Notifications  │
└─────────────┴──────────────┴──────────────┴─────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 3, Recharts, Leaflet, Framer Motion |
| Backend | Node.js, Express 5, PostgreSQL 15, MQTT (Mosquitto), WebSocket (ws) |
| Auth | Logto OIDC (JWT via jose), RBAC (admin/manager/member/viewer) |
| AI | OpenRouter API (nvidia/nemotron-3-super-120b-a12b:free), 1M context |
| Notifications | ntfy push, SMTP email, SMS (Twilio), Slack webhooks |
| Protocols | MQTT, HTTP REST, WebSocket, CoAP, LoRaWAN (simulated) |
| DevOps | Docker Compose (5 services), Vitest |

---

## Quick Start

### Docker (recommended)

```bash
docker compose up -d --build
```

Visit **http://localhost** — all 5 services start together:
- Frontend (port 80)
- Backend API (port 3000)
- PostgreSQL (port 5432)
- MQTT Broker (ports 1883/9001)
- Logto Auth (ports 3001/3002)

### Manual Development

```bash
# Backend
cd pern-backend
cp .env.example .env    # configure your environment
npm install
npm run dev             # runs on port 3000

# Frontend
cd pern-frontend
npm install
npm run dev             # runs on port 5174
```

### Device Simulator

```bash
cd pern-backend
node simulator.js       # publishes fake sensor data to MQTT
```

### Remote Access — ESP32 & website from different locations

Everything runs on one PC; the ESP32 and people viewing the website can be anywhere.

**1. Infrastructure** (Docker Postgres for persistence):

```bash
docker compose up -d postgres
cd pern-backend && npm run dev   # API on :3000
cd pern-frontend && npm run dev  # UI on :5174
```

**2. MQTT data path** — the ESP32 and the backend both use the free public broker
`broker.emqx.io`, so physical location doesn't matter:
- Backend: `pern-backend/.env` → `MQTT_BROKER=mqtt://broker.emqx.io:1883`
- Browser live feed: `pern-frontend/.env` → `VITE_MQTT_BROKER_WS=wss://broker.emqx.io:8084/mqtt`
- ESP32 setup page: Broker `broker.emqx.io`, port `1883`, any Device ID

**3. Website from anywhere** (ngrok, free HTTP tunnel):

```bash
ngrok http 5174
# or run launch.bat — it starts everything and prints the public URL
```

`launch.bat` picks the live URL up automatically via `get-tunnel-url.ps1`. On the
ngrok free plan the URL changes each restart unless you reserve a static domain.

> **Note:** the public test broker is open — anyone could subscribe to your topics.
> That's fine for a demo; for sensitive data use a private broker (e.g. EMQX Cloud
> free tier) and fill its username/password into the ESP32 setup form.

---

## Features

### Real-Time Monitoring
- **Live Dashboard** — sensor readings, EHI scores, alert counts, device status
- **MQTT Streaming** — real-time data from ESP32, NodeMCU, and other IoT devices
- **40 page views** covering every aspect of environmental monitoring

### Virtual Sensors (Soft Sensors)
10 computed sensors derived from physical readings:
- Air Quality Index (AQI), Water Quality Index (WQI)
- Environmental Health Index (EHI), Risk Score
- Indoor Air Quality, Corrosion Index, BOD Estimate
- Thermal Comfort, Agricultural Suitability, Human Exposure

### AI-Powered Intelligence
- **Chatbot** — natural language Q&A about your sensor data (SSE streaming)
- **Predictions** — time-series forecasting with confidence intervals
- **Rule Generator** — describe automation rules in plain English
- **Root Cause Analysis** — AI-driven anomaly investigation
- **Knowledge Base** — environmental monitoring documentation

### Multi-Protocol Device Support
| Protocol | Status | Use Case |
|----------|--------|----------|
| MQTT | Active | Primary IoT protocol (Mosquitto) |
| HTTP REST | Active | Simple device integrations |
| WebSocket | Active | Browser-based devices |
| CoAP | Simulated | Constrained/low-power devices |
| LoRaWAN | Simulated | Long-range IoT gateways |

### Automation Engine
- Server-side rule evaluation with PostgreSQL persistence
- Configurable thresholds per sensor type
- Real ntfy notifications on rule triggers
- Automation logs and execution history

### Data Export & Reporting
- CSV export for sensor readings and alerts
- PDF report generation (daily summary, water/air quality, risk assessment)
- Excel-compatible spreadsheet export

### Organization & Team Management
- Multi-organization support with data isolation
- Team member invitations and role management
- Organization-scoped settings and notification channels

---

## Security

### Authentication & Authorization
- **Logto OIDC** — standards-compliant JWT authentication via `jose`
- **RBAC** — four roles: `admin`, `manager`, `member`, `viewer`
- **Ownership checks** — users can only modify their own resources
- **WebSocket auth** — JWT verification on WS upgrade handshake
- Tokens stored in `sessionStorage` (cleared on tab close)

### API Protection
- **Rate limiting** — per-IP sliding window with configurable limits per route
- **Rate limit headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- **Input validation** — sensor data range checks, automation rule validation
- **Input sanitization** — XSS pattern stripping on all request body and query params
- **Request logging** — method, URL, status, duration, IP, user-agent for every request

### Security Headers (Helmet)
- Content Security Policy (CSP) with restrictive directives
- HSTS (2 years, includeSubDomains, preload)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Cross-Origin policies configured

### CORS
- Explicit origin allowlist (no wildcard origins)
- Restricted `allowedHeaders` (Content-Type, Authorization, X-Organization-Id, X-User-Id)
- Credentials mode with explicit origins only

### Environment Security
- `.env.example` with placeholder values (never commit real `.env`)
- `NODE_ENV` controls error message exposure
- Stack traces hidden in production
- Database queries fully parameterized (no SQL injection)

---

## Project Structure

```
├── pern-frontend/
│   └── src/
│       ├── pages/          # 41 page components (lazy-loaded)
│       ├── components/     # Reusable UI components
│       │   └── ui.tsx      # 15+ memoized primitives
│       ├── lib/            # Core libraries
│       │   ├── api-client.ts      # REST client with retry + auth
│       │   ├── mqtt-client.ts     # MQTT WebSocket connection
│       │   ├── data-provider.tsx  # Sensor data context
│       │   ├── device-context.tsx # Device management
│       │   ├── auth-context.tsx   # Authentication state
│       │   ├── i18n.tsx           # Internationalization (en/ar)
│       │   └── virtual-sensors.ts # 10 soft sensor algorithms
│       └── App.tsx         # Router + providers + lazy imports
│
├── pern-backend/
│   ├── server.js           # Express app + MQTT + routes
│   ├── db.js               # PostgreSQL layer (1368 lines, full schema)
│   ├── auth.js             # Logto JWT verification
│   ├── routes/             # 14 route modules
│   ├── services/           # 11 service modules
│   ├── middleware/          # 6 middleware (auth, RBAC, rate-limit, etc.)
│   ├── protocols/          # 7 protocol adapters
│   ├── websocket/          # Actuator WebSocket server
│   └── utils/              # Logger, env validator
│
├── docker-compose.yml      # 5-service Docker stack
└── README.md
```

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/server.js` | Express app, MQTT ingestion, REST API, automation |
| `backend/db.js` | PostgreSQL schema, queries, migrations (25+ tables) |
| `backend/auth.js` | Logto OIDC JWT verification |
| `backend/services/ai-service.js` | OpenRouter LLM integration |
| `backend/services/automation-engine.js` | Server-side rule evaluation |
| `backend/middleware/rbac.js` | Role-based access control |
| `backend/middleware/rate-limiter.js` | Sliding-window rate limiting |
| `frontend/src/lib/virtual-sensors.ts` | 10 soft sensor algorithms |
| `frontend/src/lib/mqtt-client.ts` | Real-time MQTT WebSocket client |
| `frontend/src/lib/api-client.ts` | REST client with retry + auth |
| `frontend/src/lib/i18n.tsx` | English/Arabic translations |
| `frontend/src/pages/Dashboard.tsx` | Main monitoring dashboard |

---

## Configuration

### Environment Variables

Copy `pern-backend/.env.example` to `pern-backend/.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `MQTT_BROKER` | Yes | MQTT broker URL |
| `OPENROUTER_API_KEY` | For AI | OpenRouter API key |
| `ENFORCE_AUTH` | For prod | Set `true` to require Logto login |
| `LOGTO_ENDPOINT` | For auth | Logto tenant URL |
| `LOGTO_APP_ID` | For auth | Logto application ID |
| `NODE_ENV` | For prod | Set `production` for hardened mode |
| `ALLOWED_ORIGINS` | For prod | Comma-separated CORS origins |

### Frontend Variables

Create `pern-frontend/.env`:

| Variable | Description |
|----------|-------------|
| `VITE_LOGTO_ENDPOINT` | Logto tenant URL |
| `VITE_LOGTO_APP_ID` | Logto application ID |
| `VITE_API_URL` | Backend API URL (default: `/api`) |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/sensors` | — | Recent sensor readings |
| POST | `/api/sensors` | write | Ingest sensor data |
| GET | `/api/alerts` | — | Alert history |
| POST | `/api/alerts` | write | Create alert rule |
| POST | `/api/persistence/rules` | — | Save automation rules |
| POST | `/api/chatbot/send` | — | AI chat (SSE streaming) |
| POST | `/api/reports/generate` | rate-limit | Generate PDF report |
| GET | `/api/protocols/status` | — | Protocol adapter status |
| POST | `/api/ai-tools/*` | — | AI analysis endpoints |
| WebSocket | `ws://localhost:8081` | JWT | Real-time actuator updates |

---

## Testing

```bash
cd pern-backend && npm test
cd pern-frontend && npm test
```

---

## License

Copyright © 2026 Yassen Taha Hussainy Elnasher. All rights reserved.

This project is created and owned by **Yassen Taha Hussainy Elnasher**. Copying, modifying or redistributing any part of it is not permitted without written permission.

STEM Gharbiya · Grade 11 · 2026
