import ahmedPhoto from "../assets/team/ahmed.jpeg";
import mohamedPhoto from "../assets/team/mohamed.jpeg";
import yassinPhoto from "../assets/team/yassin.jpeg";
import eyadPhoto from "../assets/team/eyad.jpeg";

export const liveStats = [
  { label: "Forecast Accuracy", value: 94 },
  { label: "Sensor Types", value: 14 },
  { label: "Virtual Sensors", value: 10 },
  { label: "Automated Tests", value: 304 },
  { label: "Active Protocols", value: 5 },
] as const;

export const problemLabels = [
  "8M deaths annually from air pollution",
  "Cairo: PM2.5 exceeds WHO limits by 10x",
  "$47B annual cost to Egypt",
  "1 in 4 heart-related deaths linked to air quality",
] as const;

export const architectureLayers = [
  {
    id: "iot",
    title: "IoT Devices",
    description:
      "ESP32, NodeMCU, Gateways, and Simulators streaming multi-parameter environmental telemetry from the field.",
    items: ["ESP32", "NodeMCU", "Gateways", "Simulators"],
    accent: "#00D4AA",
  },
  {
    id: "gateway",
    title: "Protocol Gateway",
    description:
      "Unified ingress for MQTT, HTTP REST, WebSocket, CoAP, and LoRaWAN with live protocol health.",
    items: ["MQTT", "HTTP REST", "WebSocket", "CoAP", "LoRaWAN"],
    accent: "#0EA5E9",
  },
  {
    id: "backend",
    title: "Backend Platform",
    description:
      "Express API, AI Router, Automation engine, Alert Engine, and Auth/RBAC orchestrating the intelligence layer.",
    items: ["Express API", "AI Router", "Automation", "Alert Engine", "Auth/RBAC"],
    accent: "#A78BFA",
  },
  {
    id: "data",
    title: "Data & Services",
    description:
      "PostgreSQL 15, WebSocket 8081, ntfy/SMTP/SMS, and OpenRouter LLM for durable storage and outreach.",
    items: ["PostgreSQL 15", "WebSocket 8081", "ntfy/SMTP/SMS", "OpenRouter LLM"],
    accent: "#F59E0B",
  },
  {
    id: "dashboard",
    title: "React Dashboard",
    description:
      "Immersive operator console with live maps, ERI gauges, forecasts, and natural-language AI copilots.",
    items: ["Live Maps", "ERI Gauges", "Forecasts", "AI Copilot"],
    accent: "#22D3EE",
  },
] as const;

export type PhysicalSensor = {
  name: string;
  unit: string;
  range: string;
  category: "water" | "air" | "soil" | "light";
};

export const physicalSensors: PhysicalSensor[] = [
  { name: "pH", unit: "—", range: "6.5–8.5", category: "water" },
  { name: "TDS", unit: "ppm", range: "0–500", category: "water" },
  { name: "Water Temperature", unit: "°C", range: "10–30", category: "water" },
  { name: "Dissolved Oxygen", unit: "mg/L", range: "5–14", category: "water" },
  { name: "Turbidity", unit: "NTU", range: "0–5", category: "water" },
  { name: "PM2.5", unit: "µg/m³", range: "0–35", category: "air" },
  { name: "MQ135 Gas", unit: "ppm", range: "0–1.0", category: "air" },
  { name: "Air Temperature", unit: "°C", range: "15–35", category: "air" },
  { name: "Humidity", unit: "%", range: "30–70", category: "air" },
  { name: "CO₂", unit: "ppm", range: "300–1000", category: "air" },
  { name: "NH₃", unit: "ppm", range: "0–25", category: "air" },
  { name: "VOC", unit: "ppb", range: "0–500", category: "air" },
  { name: "Soil Moisture", unit: "%", range: "20–60", category: "soil" },
  { name: "Light Intensity", unit: "lux", range: "0–100000", category: "light" },
];

export const virtualSensors = [
  { name: "AQI", tier: 1, value: 72 },
  { name: "WQI", tier: 1, value: 84 },
  { name: "EHI", tier: 2, value: 61 },
  { name: "Risk Score", tier: 1, value: 38 },
  { name: "Indoor Air Quality", tier: 2, value: 78 },
  { name: "Corrosion Index", tier: 3, value: 44 },
  { name: "BOD Estimate", tier: 3, value: 55 },
  { name: "Thermal Comfort", tier: 2, value: 81 },
  { name: "Agricultural Suitability", tier: 2, value: 69 },
  { name: "Human Exposure", tier: 4, value: 47 },
] as const;

export const aiFeatures = [
  {
    title: "Chatbot",
    description: "Natural-language Q&A with SSE streaming answers",
  },
  {
    title: "Predictions",
    description: "Time-series forecasting with confidence intervals",
  },
  {
    title: "Root Cause Analysis",
    description: "AI-driven anomaly investigation",
  },
  {
    title: "Rule Generator",
    description: "Describe automation rules in plain English",
  },
  {
    title: "Knowledge Base",
    description: "Searchable environmental monitoring standards",
  },
] as const;

export const aiMetrics = [
  { label: "MAE", value: "3.1 µg/m³", note: "24h PM2.5 forecast" },
  { label: "Accuracy", value: "94%", note: "expert agreement" },
  { label: "Horizon", value: "24h", note: "rolling predictions" },
  { label: "Retrain", value: "Daily", note: "auto on new data" },
] as const;

export const featureImportance = [
  { feature: "PM2.5", value: 28, color: "#00D4AA" },
  { feature: "MQ135 Gas", value: 22, color: "#0EA5E9" },
  { feature: "Humidity", value: 17, color: "#A78BFA" },
  { feature: "CO₂", value: 14, color: "#F59E0B" },
  { feature: "Temperature", value: 11, color: "#22D3EE" },
  { feature: "Wind / Pressure", value: 8, color: "#64748B" },
] as const;

export type ForecastPoint = {
  hour: string;
  historical?: number;
  predicted?: number;
  bandLo?: number;
  bandHi?: number;
};

export function buildForecast(): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const hour = String(h).padStart(2, "0") + ":00";
    const wave = 52 + Math.sin(h * 0.42) * 18 + ((h * 7) % 11);
    const drift = h > 14 ? (h - 14) * 2.2 : 0;
    const base = Math.max(12, Math.min(150, wave + drift));
    if (h < 14) {
      points.push({ hour, historical: base });
    } else {
      const band = 6 + (h - 14) * 0.5;
      points.push({
        hour,
        predicted: base,
        bandLo: Math.max(4, base - band),
        bandHi: Math.min(180, base + band),
      });
    }
  }
  return points;
}

export const virtualSensorFusions = [
  {
    name: "AQI",
    tier: 1,
    feeds: ["PM2.5", "MQ135", "CO₂"],
    formula: "WHO / EPA AQI bands",
    color: "#00D4AA",
  },
  {
    name: "WQI",
    tier: 1,
    feeds: ["pH", "TDS", "Dissolved O₂", "Turbidity"],
    formula: "NSF weighted index",
    color: "#00D4AA",
  },
  {
    name: "EHI",
    tier: 2,
    feeds: ["PM2.5", "Gas", "Humidity"],
    formula: "exposure-weighted blend",
    color: "#0EA5E9",
  },
  {
    name: "Risk Score",
    tier: 1,
    feeds: ["AQI", "WQI", "EHI"],
    formula: "Random Forest fusion",
    color: "#00D4AA",
  },
  {
    name: "Indoor Air Quality",
    tier: 2,
    feeds: ["CO₂", "VOC", "Temp", "Humidity"],
    formula: "ASHRAE 62.1 heuristic",
    color: "#0EA5E9",
  },
  {
    name: "Corrosion Index",
    tier: 3,
    feeds: ["Humidity", "Gas", "Temp"],
    formula: "ISO 9223 classification",
    color: "#F59E0B",
  },
  {
    name: "BOD Estimate",
    tier: 3,
    feeds: ["TDS", "Dissolved O₂", "pH"],
    formula: "regression surrogate",
    color: "#F59E0B",
  },
  {
    name: "Thermal Comfort",
    tier: 2,
    feeds: ["Temp", "Humidity", "Light"],
    formula: "humidex / PET model",
    color: "#0EA5E9",
  },
  {
    name: "Agricultural Suitability",
    tier: 2,
    feeds: ["Soil Moisture", "Temp", "Light"],
    formula: "FAO-56 water balance",
    color: "#0EA5E9",
  },
  {
    name: "Human Exposure",
    tier: 4,
    feeds: ["AQI", "Population", "Time"],
    formula: "combined exposure model",
    color: "#A78BFA",
  },
] as const;

export const chatDemo = [
  {
    role: "user" as const,
    text: "Why did PM2.5 spike near Tanta last night?",
  },
  {
    role: "ai" as const,
    text: "A 22-hour lead forecast detected industrial plume advection. Humidity dropped 18% while MQ135 rose 0.34 ppm — consistent with nighttime stack emissions east of the canal corridor.",
  },
  {
    role: "user" as const,
    text: "Create an alert if ERI exceeds Warning for 45 minutes.",
  },
  {
    role: "ai" as const,
    text: "Rule drafted: IF eri_level IN (Warning, Critical) FOR 45m THEN notify managers via ntfy + SMS. Shall I deploy it to the Automation engine?",
  },
] as const;

export const hardwareComponents = [
  { component: "ESP32 Dev Board", cost: "350 EGP" },
  { component: "PMS5003 (PM2.5)", cost: "2,500 EGP" },
  { component: "MQ135 Gas Sensor", cost: "200 EGP" },
  { component: "DHT22 Temp/Humidity", cost: "150 EGP" },
  { component: "TDS Sensor", cost: "300 EGP" },
  { component: "pH Sensor", cost: "800 EGP" },
  { component: "Enclosure + Power", cost: "600 EGP" },
  { component: "Cloud Backend (3mo)", cost: "100 EGP" },
] as const;

export type Competitor = {
  name: string;
  price: string;
  notes: string[];
  highlight?: boolean;
};

export const competitors: Competitor[] = [
  {
    name: "AirVisual Pro",
    price: "~16,500 EGP",
    notes: ["Air only", "No prediction"],
  },
  {
    name: "PurpleAir PA-II",
    price: "~15,000 EGP",
    notes: ["No water", "No forecasting"],
  },
  {
    name: "Aeroqual Series 500",
    price: ">40,000 EGP",
    notes: ["No ML", "Infrastructure-heavy"],
  },
  {
    name: "PERN",
    price: "5,000–8,000 EGP",
    notes: ["Air + Water + Soil", "24h Forecast", "AI Copilot"],
    highlight: true,
  },
];

export const deployments = [
  {
    title: "Urban Industrial",
    location: "Tanta District",
    stats: [
      "30-day deployment",
      "99.3% Uptime",
      "12 Warning days | 5 Critical days",
      "Self-calibration flagged pH drift on Day 18 and corrected it",
      "Predicted PM2.5 spike (38→87 µg/m³) 22 hours in advance",
    ],
  },
  {
    title: "Rural Agricultural",
    location: "Nile Delta Farms",
    stats: [
      "30-day deployment",
      "97% Expert agreement",
      "3 Warning days | 0 Critical days",
      "Stable readings with low MAE",
      "Validated against WHO AQG thresholds",
    ],
  },
] as const;

export const securityFeatures = [
  { title: "Logto OIDC", description: "JWT verification" },
  { title: "RBAC", description: "Admin, Manager, Member, Viewer" },
  { title: "Helmet Hardening", description: "CSP, HSTS, X-Frame-Options" },
  { title: "Rate Limiting", description: "Sliding window per IP" },
  { title: "Parameterized SQL", description: "Zero injection surface" },
  { title: "WebSocket JWT", description: "Secure real-time upgrades" },
  { title: "Audit Logging", description: "Full administrative traceability" },
] as const;

export type TeamMember = {
  name: string;
  role: string;
  email: string;
  phone: string;
  photo: string;
};

export const team: TeamMember[] = [
  {
    name: "Ahmed Mohamed Mahmoud Ali",
    role: "25% contribution",
    email: "AHMED.2825007@stemgharbiya.moe.edu.eg",
    phone: "01024133170",
    photo: ahmedPhoto,
  },
  {
    name: "Mohamed Nour Eldeen Nazeer",
    role: "25% contribution",
    email: "Mohamed.1925039@stemgharbiya.moe.edu.eg",
    phone: "01142356831",
    photo: mohamedPhoto,
  },
  {
    name: "Yaseen Taha Husseiny El Nasher",
    role: "25% contribution",
    email: "Yasen.1925048@stemgharbiya.moe.edu.eg",
    phone: "01092332523",
    photo: yassinPhoto,
  },
  {
    name: "Eyad Sherrif Abdallah El Bagory",
    role: "25% contribution",
    email: "eyad.1725016@stemgharbiya.moe.edu.eg",
    phone: "01014302722",
    photo: eyadPhoto,
  },
];

export const teamOwner = "Yaseen Taha Husseiny El Nasher";

export const contactEmail = "Manal.Ramia@stemgharbiya.moe.edu.eg";

export const contactPhone = "01094462861";

export const waLink = (phone: string) =>
  `https://wa.me/20${phone.replace(/^0+/, "")}`;

export const externalSources = [
  { name: "OpenAQ", url: "https://openaq.org" },
  { name: "WAQI", url: "https://aqicn.org" },
  { name: "Sensor.Community", url: "https://sensor.community" },
  { name: "NASA FIRMS", url: "https://firms.modaps.eosdis.nasa.gov" },
  {
    name: "Sentinel-5P CAMS (OpenMeteo)",
    url: "https://open-meteo.com/en/docs/cams-api",
  },
] as const;

export const complianceFrameworks = [
  "WHO AQG 2021",
  "EPA NAAQS/AQI",
  "NSF WQI",
  "FAO-56 Penman-Monteith",
  "ASHRAE 62.1",
  "ISO 7243",
] as const;

export const eriValidation = [
  "94% expert agreement — Urban Industrial",
  "97% expert agreement — Rural Agricultural",
  "MAE: 3.1 µg/m³ on 24h PM2.5 forecast",
] as const;

export const platformPipeline = [
  {
    stage: "Ingest",
    title: "Field Telemetry",
    description:
      "ESP32 nodes + simulators stream air, water, and soil readings over MQTT, HTTP, CoAP, and LoRaWAN.",
    items: ["14 physical", "10 virtual", "5 protocols"],
    accent: "#0EA5E9",
  },
  {
    stage: "Process",
    title: "AI & Automation",
    description:
      "The AI router forecasts 24h ahead, generates rules in plain English, and explains anomalies.",
    items: ["Random Forest", "LLM router", "Rule engine"],
    accent: "#A78BFA",
  },
  {
    stage: "Act",
    title: "Alerting & Console",
    description:
      "ERI scoring drives ntfy, SMS, and email alerts surfaced in a live operator dashboard.",
    items: ["ERI scoring", "WebSocket live", "ntfy / SMS"],
    accent: "#00D4AA",
  },
] as const;

export type Faq = { q: string; a: string };

export const faqs: Faq[] = [
  {
    q: "How accurate are the 24-hour forecasts?",
    a: "The Random Forest model reports a MAE of 3.1 µg/m³ on 24h PM2.5 forecasts and achieved 94% agreement with domain experts on urban-industrial sites and 97% on rural-agricultural sites.",
  },
  {
    q: "What hardware do I need to deploy a node?",
    a: "A complete station runs on an ESP32, a PMS5003 PM2.5 sensor, MQ135 gas sensor, DHT22, plus TDS/pH sensors for water. Total BOM is roughly 5,000–8,000 EGP per node with enclosure and power.",
  },
  {
    q: "Does PERN work offline or on low-bandwidth networks?",
    a: "Yes. The gateway buffers telemetry when connectivity drops, and all protocols (MQTT, HTTP, CoAP, LoRaWAN) are designed for constrained IoT networks common in rural agricultural settings.",
  },
  {
    q: "How is the ERI score computed?",
    a: "The Environmental Risk Index fuses physical readings and virtual sensors through a Random Forest model, then thresholds them into Safe, Warning, and Critical bands aligned with WHO AQG and EPA AQI guidance.",
  },
  {
    q: "Can I try the platform before committing?",
    a: "Absolutely — request a pilot deployment and we'll set up a sandbox workspace with simulated telemetry so you can evaluate the dashboards, AI copilot, and alerting end to end.",
  },
  {
    q: "How does the system stay secure?",
    a: "Authentication uses Logto OIDC with JWT, role-based access control, Helmet headers, rate limiting, parameterized SQL, and full audit logging for administrative actions.",
  },
] as const;

export type PricingTier = {
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

export const pricingTiers: PricingTier[] = [
  {
    name: "Academic",
    price: "0",
    cadence: "EGP / pilot",
    description: "For students, researchers, and STEM programs evaluating PERN.",
    features: [
      "1 node + simulated telemetry",
      "14 physical sensor types",
      "24h forecasting",
      "Community support",
    ],
  },
  {
    name: "Municipal",
    price: "8,000",
    cadence: "EGP / node / year",
    description: "For city councils and district monitoring programs in the Nile Delta.",
    features: [
      "Up to 20 physical nodes",
      "Live dashboards + ERIs",
      "SMS / ntfy / email alerting",
      "AI copilot & rule generator",
      "Priority support",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "annual contract",
    description: "For industrial zones, ministries, and cross-region deployments.",
    features: [
      "Unlimited nodes",
      "Dedicated API + LoRaWAN",
      "Custom model training",
      "On-site onboarding",
      "SLA + 24/7 support",
    ],
  },
] as const;

export const sensorNodes = [
  { name: "Tanta", lat: 0.61, lon: 0.79 },
  { name: "Cairo", lat: 0.03, lon: 0.96 },
  { name: "Alexandria", lat: 0.92, lon: 0.01 },
  { name: "Delta Rural", lat: 0.75, lon: 0.91 },
] as const;

export type LiveNetworkNode = {
  name: string;
  lat: number;
  lon: number;
  pm25: number;
  band: "safe" | "warning" | "critical";
};

export const liveNetworkNodes: LiveNetworkNode[] = [
  { name: "Cairo", lat: 30.04, lon: 31.24, pm25: 72, band: "warning" },
  { name: "Alexandria", lat: 31.2, lon: 29.92, pm25: 48, band: "safe" },
  { name: "Tanta", lat: 30.79, lon: 31.0, pm25: 58, band: "safe" },
  { name: "Mansoura", lat: 31.04, lon: 31.38, pm25: 52, band: "safe" },
  { name: "Ismailia", lat: 30.6, lon: 32.27, pm25: 44, band: "safe" },
  { name: "Suez", lat: 29.97, lon: 32.55, pm25: 66, band: "warning" },
  { name: "Luxor", lat: 25.69, lon: 32.64, pm25: 63, band: "warning" },
  { name: "Aswan", lat: 24.09, lon: 32.9, pm25: 55, band: "safe" },
] as const;

export function sparklineData(seed: number, points = 12): number[] {
  const data: number[] = [];
  let v = 40 + (seed % 30);
  for (let i = 0; i < points; i++) {
    v += Math.sin(i * 0.8 + seed) * 8 + ((seed * (i + 3)) % 7) - 3;
    data.push(Math.max(5, Math.min(100, v)));
  }
  return data;
}
