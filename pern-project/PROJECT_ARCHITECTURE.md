# PERN — Complete Technical Architecture Document

**Pollution & Environmental Risk Navigator**  
**Version:** 2.5.0  
**Status:** Production-Ready Multi-Tenant Platform  
**Date:** July 2026

---

## 1. Executive Summary

PERN is a **multi-tenant environmental intelligence platform** that enables real-time monitoring, AI-powered analysis, automation, and device lifecycle management using IoT sensor data.

It is designed to serve two types of users:
- **Organizations** (municipalities, companies, research institutions)
- **Individual users** (researchers, students, environmental enthusiasts)

The platform combines:
- Multi-protocol IoT data ingestion
- Scientifically grounded AI models
- Server-side automation with real device control
- Comprehensive device health tracking

---

## 2. System Architecture Overview

### 2.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                             │
│  React 19 Frontend (26 Pages) + Context Providers + Real-time Listeners     │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
               HTTP/REST        WebSocket         MQTT WebSocket
                    │                 │                 │
┌───────────────────▼─────────────────▼─────────────────▼─────────────────────┐
│                           API & GATEWAY LAYER                               │
│  Express.js + Rate Limiting + Validation + Error Handling + Logging         │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
   Persistence Layer            AI Layer                  Automation Layer
   (PostgreSQL + DB Layer)      (AI Service + Router)     (Engine + MQTT)
          │                           │                           │
   ┌──────▼──────┐             ┌──────▼──────┐             ┌──────▼──────┐
   │ Rules       │             │ Chatbot     │             │ Engine      │
   │ Readings    │             │ Rule Gen    │             │ MQTT Pub    │
   │ History     │             │ Prediction  │             │ ntfy        │
   └─────────────┘             └─────────────┘             └─────────────┘
```

---

## 3. Technology Stack (Detailed)

### Frontend
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 3 (Glassmorphism)
- **Routing**: React Router (HashRouter)
- **State Management**: React Context + Custom Providers
- **Charts**: Recharts
- **Maps**: React Leaflet
- **Animations**: Framer Motion
- **Exports**: jsPDF + XLSX

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (`pg` driver)
- **IoT Protocols**: MQTT.js, WebSocket, HTTP, CoAP (ready), LoRaWAN (ready)
- **AI Integration**: OpenRouter API
- **Logging**: Custom structured logger

### Infrastructure
- Docker Compose (7 services)
- Eclipse Mosquitto (MQTT Broker)
- Logto (OIDC)
- Redis (optional)

---

## 4. Detailed Folder & File Structure

### 4.1 Frontend (`src/`)

```
App.tsx
├── Root component
├── Sets up all providers (Data, Organization, LiveMode, ErrorBoundary)
├── Defines categorized navigation (7 sections, 26 pages)
└── Contains Live Mode status bar placeholder

components/
├── ErrorBoundary.tsx
│   └── Catches unhandled React errors globally
├── PageErrorBoundary.tsx
│   └── Per-page error boundary with retry
├── Toast.tsx
│   └── Toast notification system with animation
├── Skeleton.tsx
│   └── Loading skeleton components
└── OrganizationSwitcher.tsx
    └── Multi-tenant organization selector

lib/
├── Context & Global State
│   ├── app-context.ts
│   │   └── Unified context resolver (Organization vs Individual)
│   ├── organization-context.tsx
│   │   └── React context + state for current organization
│   ├── live-mode-context.tsx
│   │   └── Controls Live Mode state globally
│   └── data-provider.tsx
│       └── Central data store
│       └── Enforces Live Mode restrictions
│       └── Manages MQTT connection
│
├── Communication Layer
│   ├── mqtt-client.ts
│   │   └── Connects to Mosquitto via WebSocket
│   │   └── Listens to sensor data + actuator status
│   ├── actuator-ws.ts
│   │   └── Dedicated WebSocket for real actuator feedback
│   ├── api-client.ts
│   │   └── Authenticated REST client with context headers
│   └── ntfy.ts
│       └── Push notification integration
│
├── AI Core (Upgraded in Phases 1-4)
│   ├── scientific-ehi.ts
│   │   └── WHO 2021 + EPA AQI aligned EHI calculation
│   ├── prediction-engine.ts
│   │   └── Double Exponential Smoothing (Holt’s Method)
│   ├── recommendation-engine.ts
│   │   └── Evidence-based recommendations with sources
│   ├── confidence-scoring.ts
│   │   └── Multi-factor statistical confidence model
│   └── prediction-validation.ts
│       └── Backtesting and accuracy validation
│
├── Domain Logic
│   ├── virtual-sensors.ts
│   │   └── Dynamic computation of 10 soft sensors
│   ├── device-health.ts
│   │   └── Health scoring + Remaining Useful Life (RUL)
│   ├── device-lifecycle.ts
│   │   └── Usage tracking and lifetime estimation
│   ├── automation-control.ts
│   │   └── Client-side automation utilities
│   ├── audit-log.ts
│   │   └── Security audit event logging
│   ├── roles.ts
│   │   └── Role definitions and permissions
│   └── branding.ts
│       └── White-label configuration
│
└── Utilities
    └── export-utils.ts
        └── CSV and Excel export helpers

pages/ (26 pages)
├── Dashboard.tsx
├── Sensors.tsx
├── Devices.tsx
├── DeviceLifecycle.tsx
├── DeviceHealthDashboard.tsx
├── Automation.tsx
├── AI.tsx
├── Predictions.tsx
├── Map.tsx
├── Reports.tsx
├── Chatbot.tsx
├── Alerts.tsx
├── ProtocolStatus.tsx
├── OrganizationSettings.tsx
├── TeamMembers.tsx
├── SecurityAudit.tsx
├── SensorCalibration.tsx
├── History.tsx
├── Weather.tsx
├── Analytics.tsx
├── Research.tsx
├── Firmware.tsx
├── Knowledge.tsx
├── Showcase.tsx
├── Resources.tsx
├── Settings.tsx
├── Login.tsx
├── AuthCallback.tsx
└── DeviceConnection.tsx
```

### 4.2 Backend Structure

```
server.js
├── Environment validation
├── Route mounting
├── WebSocket server startup
├── Automation Engine startup
└── Global error handler

routes/
├── persistence.js
│   ├── POST /rules
│   ├── GET  /rules
│   ├── POST /readings
│   └── GET  /readings
│
├── chatbot.js
│   ├── POST /chat
│   └── POST /clear
│
├── ai-tools.js
│   └── POST /generate-rule
│
└── protocols.js
    └── GET /status

services/
├── ai-service.js
│   ├── Conversation memory management
│   ├── System prompt construction
│   ├── Tool calling support
│   └── OpenRouter integration
│
├── ai-router.js
│   ├── Response caching (5 min TTL)
│   ├── Rate limiting
│   └── Usage tracking
│
├── automation-engine.js
│   ├── Server-side rule evaluation
│   ├── Real MQTT command publishing
│   ├── ntfy notification sending
│   └── Database rule loading on startup
│
└── rule-generator.js
    └── Natural language to structured rule conversion

protocols/
├── protocol-adapter.js (Base class)
├── protocol-manager.js (Central dispatcher)
├── mqtt-adapter.js
├── http-adapter.js
├── websocket-adapter.js
├── coap-adapter.js
└── lorawan-adapter.js

websocket/
└── actuator-ws.js
    └── Real-time actuator status broadcasting

middleware/
├── rate-limiter.js
├── validator.js
└── error-handler.js

utils/
├── logger.js (Structured logging)
└── env-validator.js (Startup validation)

db.js
└── PostgreSQL abstraction layer
```

---

## 5. Database Schema (Detailed)

### Tables

**organizations**
- `id`, `name`, `slug`, `plan`, `max_devices`, `max_users`, `created_at`

**automation_rules**
- `id`, `name`, `sensor`, `operator`, `threshold`, `action` (JSONB), `enabled`, `organization_id`

**sensor_readings**
- `id`, `device_id`, `timestamp`, `sensors` (JSONB), `organization_id`, `created_at`

**automation_logs**
- `id`, `rule_id`, `rule_name`, `sensor`, `value`, `organization_id`, `timestamp`

**devices**
- `id`, `name`, `type`, `region`, `status`, `organization_id`, `last_seen`

---

## 6. Key Data Flows (Detailed)

### Live Sensor Data Flow
1. Physical device publishes to `pern/sensors/{device}/data`
2. Backend Automation Engine receives data
3. Rules are evaluated server-side
4. Data is forwarded to frontend via MQTT + WebSocket
5. Virtual sensors and EHI are recalculated

### Automation Execution Flow
1. Sensor data arrives
2. Rules evaluated in `automation-engine.js`
3. If triggered → MQTT command published to `pern/actuators/{device}/command`
4. Device executes action
5. Device publishes status to `pern/actuators/{device}/status`
6. Frontend receives update via WebSocket

### AI Chat Flow
1. User sends message + current context
2. AI Router checks cache
3. AI Service builds rich prompt + conversation history
4. Sent to OpenRouter
5. Response returned + stored in memory

---

## 7. Security Model

- Multi-tenancy isolation via `organization_id`
- Rate limiting on AI and data endpoints
- Input validation on critical routes
- Audit logging for sensitive actions
- Role-based permissions
- Environment variable validation at startup

---

## 8. Deployment Options

- **Docker Compose** (Recommended for most users)
- **Kubernetes** (Using provided manifests)
- **Manual** (Node.js + PostgreSQL + Mosquitto)

---

## 9. Testing Strategy

- Manual testing via `AI_TESTING_CHECKLIST.md`
- Automated tests in `src/__tests__/`
- Validation covers all major AI modules

---

## 10. Future Work

- Full OpenAPI documentation
- Historical prediction validation
- Per-device protocol selection UI
- Binary payload decoding
- Production monitoring stack
- Comprehensive automated test coverage

---

**End of Document**

This architecture document is designed to give any developer, architect, or stakeholder a complete and deep understanding of how the PERN platform is built, how all components interact, and how data flows through the system.