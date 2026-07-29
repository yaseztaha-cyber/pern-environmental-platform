import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#059669',
    primaryTextColor: '#fff',
    primaryBorderColor: '#047857',
    lineColor: '#34d399',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
    fontSize: '14px',
  },
});

const DIAGRAMS: Record<string, { title: string; mermaid: string; description: string }> = {
  system: {
    title: 'System Architecture',
    description: 'End-to-end architecture showing all major components and their interactions.',
    mermaid: `flowchart TB
    subgraph Frontend["React Frontend"]
      DASH["Dashboard"]
      MAP["Map / GlobalSensorMap"]
      ANALYTICS["Analytics"]
      ALERTS_UI["Alert Center"]
      COMPLIANCE_UI["Compliance"]
      WIND_UI["Wind & Plume"]
      SIGNAL["Signal Flow"]
    end
    subgraph Backend["Express :3000"]
      API["REST API"]
      WS["WebSocket :8081"]
      MQTT_CLI["MQTT Client"]
    end
    subgraph External["External"]
      OSM["OpenStreetMap"]
      OPENAQ["OpenAQ"]
      METEQ["Open-Meteo"]
      MQTT_BROKER["Mosquitto"]
    end
    subgraph Storage["Storage"]
      PG[("PostgreSQL")]
      MEM["In-Memory Fallback"]
    end
    Frontend --> API
    Frontend --> WS
    MQTT_CLI --> MQTT_BROKER
    MAP --> OSM`,
  },
  ingestion: {
    title: 'Data Ingestion Pipeline',
    description: 'Sensor data flows from physical devices through MQTT/HTTP/WebSocket into the unified ingestion path.',
    mermaid: `flowchart TD
    D["Devices"] --> MQTT["MQTT"]
    D --> HTTP["HTTP POST"]
    D --> WSG["WebSocket"]
    MQTT --> INGEST["ingestReading()"]
    HTTP --> INGEST
    WSG --> INGEST
    INGEST --> DB[("PostgreSQL")]
    INGEST --> MQTT_REPUB["MQTT Re-publish"]
    INGEST --> WS_BC["WebSocket Broadcast"]
    INGEST --> AUTO["Automation Engine"]
    INGEST --> ALERT["Alert Engine"]
    INGEST --> ANOMALY["Anomaly Detector"]`,
  },
  compliance: {
    title: 'Geo-Compliance Engine',
    description: 'Reverse-geocodes GPS to country, compares readings against local regulatory thresholds.',
    mermaid: `flowchart LR
    GPS["GPS Lat/Lng"] --> GEO["detectCountry()"]
    GEO --> FW["getFramework()"]
    FW --> CHECK["checkCompliance()"]
    CHECK -->|"Exceedances"| RPT["generateReport()"]
    CHECK -->|"Compliant"| PASS["All Good"]
    FW --> EG["Egypt - EEAA"]
    FW --> US["US - EPA"]
    FW --> GB["UK - DEFRA"]
    FW --> DE["Germany - UBA"]
    FW --> IN["India - CPCB"]`,
  },
  wind: {
    title: 'Wind & Plume AI',
    description: 'Wind forecasting, forward plume trajectory, upstream/downwind source analysis.',
    mermaid: `flowchart TD
    M["measurements"] --> WE["wind-engine.js"]
    WE --> FC["fetchForecast()"]
    FC --> PLUME["calculatePlumePath()"]
    PLUME --> TRAJ["Trajectory"]
    FC --> UP["findUpstreamSources()"]
    FC --> DOWN["predictDownwindImpact()"]
    UP --> SOURCES["Industrial Zones"]
    DOWN --> AFFECTED["Affected Areas"]
    TRAJ --> VIS["Frontend Map"]`,
  },
  trust: {
    title: 'Trust & Calibration',
    description: 'Multi-source data trust scoring, drift detection, and automated recalibration.',
    mermaid: `flowchart LR
    A["OpenAQ"] --> TRUST["trust-engine"]
    B["PurpleAir"] --> TRUST
    C["Satellite"] --> TRUST
    D["Sensors"] --> TRUST
    TRUST --> SCORE["confidence_scores"]
    TRUST --> ANOM["getAnomalies()"]
    TRUST --> RECAL["recalibrate()"]
    SCORE --> DASH["Frontend"]
    ANOM --> ALERTS["Alerts"]`,
  },
};

export default function SignalFlow() {
  const [active, setActive] = useState('system');
  const [loading, setLoading] = useState(true);
  const svgRef = useRef<HTMLDivElement>(null);
  const d = DIAGRAMS[active];

  useEffect(() => {
    if (!d || !svgRef.current) return;
    setLoading(true);
    const id = `mermaid-${Date.now()}`;
    svgRef.current.innerHTML = `<div class="mermaid" id="${id}">${d.mermaid}</div>`;
    mermaid.run({ nodes: [document.getElementById(id)!] }).then(() => setLoading(false)).catch(() => setLoading(false));
  }, [active]);

  if (!d) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Signal Flow Architecture</h2>
        <p className="text-sm text-slate-400 mt-1">End-to-end data flow and system interaction diagrams</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(DIAGRAMS).map(([k, v]) => (
          <button key={k} onClick={() => setActive(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              active === k ? 'bg-emerald-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}>
            {v.title}
          </button>
        ))}
      </div>
      <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6 min-h-[400px] flex items-center justify-center">
        {loading ? (
          <div className="text-slate-400">Rendering diagram...</div>
        ) : null}
        <div ref={svgRef} className="w-full overflow-auto [&_svg]:mx-auto" />
      </div>
    </div>
  );
}
