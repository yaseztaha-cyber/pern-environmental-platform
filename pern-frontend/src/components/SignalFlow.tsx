import { useEffect, useRef, useState, useMemo } from 'react';
import mermaid from 'mermaid';
import {
  Download, Copy, Check, Search, Network, Cpu, Workflow, BellRing,
  ShieldCheck, Radio, BrainCircuit, Beaker, GitBranch, Boxes, Wind, ScrollText,
  Image as ImageIcon, Maximize2, Minimize2, X, Activity, ZoomIn, ZoomOut,
  RotateCcw, Maximize, Crosshair,
} from 'lucide-react';
import { PageHeader, Pill, Btn } from './ui';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#0e1f1a',
    primaryTextColor: '#a7f3d0',
    primaryBorderColor: '#10b981',
    secondaryColor: '#0e1c2c',
    tertiaryColor: '#151b2e',
    lineColor: '#22d3ee',
    textColor: '#e2e8f0',
    mainBkg: '#0b1220',
    nodeBorder: '#2a3550',
    clusterBkg: '#101a30',
    clusterBorder: '#2a3550',
    edgeLabelBackground: '#0b1220',
    titleColor: '#e2e8f0',
    fontSize: '14px',
  },
});

interface DiagramDef {
  title: string;
  description: string;
  tags: string[];
  mermaid: string;
}

const DIAGRAMS: Record<string, DiagramDef> = {
  system: {
    title: 'System Architecture',
    description: 'End-to-end architecture showing all major components and their interactions.',
    tags: ['architecture', 'overview', 'frontend', 'backend', 'storage'],
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
    tags: ['ingestion', 'mqtt', 'http', 'websocket', 'pipeline'],
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
  realtime: {
    title: 'Realtime & MQTT Streaming',
    description: 'Live path from ESP32 devices through the MQTT broker, backend bridge and WebSocket into the frontend.',
    tags: ['realtime', 'mqtt', 'websocket', 'live', 'streaming'],
    mermaid: `flowchart LR
    ESP["ESP32 Device"] -->|"MQTT publish"| BRK["Mosquitto Broker"]
    BRK -->|"subscribe"| CL["mqtt-client.ts"]
    CL --> WS["WebSocket Bridge :8081"]
    WS --> FR["Frontend useData()"]
    FR --> UI["Live Dashboard"]
    BRK --> BE["Backend MQTT Client"]
    BE --> DB[("PostgreSQL")]
    DB --> WS
    FR --> REDRAW["Live re-render"]`,
  },
  'ai-pipeline': {
    title: 'AI Analysis Pipeline',
    description: 'Scientific analysis core: EHI scoring, ensemble forecasting, confidence scoring, recommendations and insights.',
    tags: ['ai', 'ehi', 'prediction', 'confidence', 'recommendation', 'insight'],
    mermaid: `flowchart LR
    R["Sensor Readings"] --> CORE["scientific-core.ts"]
    H["Historical Data"] --> CORE
    CORE --> EHI["EHI — scientific-ehi.ts"]
    CORE --> PRED["Predictions — prediction-engine.ts"]
    CORE --> CONF["Confidence — confidence-scoring.ts"]
    EHI --> RECS["Recommendation Engine"]
    PRED --> RECS
    RECS --> INS["Insights — ai-analysis.ts"]
    CORE --> INS
    CONF --> UI["AI Page"]
    RECS --> UI
    INS --> UI`,
  },
  'virtual-sensors': {
    title: 'Virtual Sensor Engine',
    description: 'Physical readings feed soft-sensor estimators producing ten derived environmental indices.',
    tags: ['virtual', 'soft-sensor', 'index', 'aqi', 'wqi', 'estimation'],
    mermaid: `flowchart TD
    PH["Physical Sensors"] --> COMP["computeDynamicVirtualSensors()"]
    COMP --> AQI["AQI"]
    COMP --> WQI["WQI"]
    COMP --> RISK["Environmental Risk Score"]
    COMP --> THERMAL["Thermal Comfort Index"]
    COMP --> INDOOR["Indoor Air Score"]
    COMP --> CORR["Corrosion Index"]
    COMP --> BOD["Biological Oxygen Demand"]
    COMP --> AGRI["Agricultural Suitability"]
    COMP --> EUTRO["Eutrophication Risk"]
    COMP --> EXPOS["Human Exposure Index"]
    AQI --> EHI["Environmental Health Index"]
    WQI --> EHI
    THERMAL --> EHI`,
  },
  compliance: {
    title: 'Geo-Compliance Engine',
    description: 'Reverse-geocodes GPS to country, compares readings against local regulatory thresholds.',
    tags: ['compliance', 'geo', 'regulatory', 'country', 'thresholds'],
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
    tags: ['wind', 'plume', 'trajectory', 'forecast', 'source'],
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
    tags: ['trust', 'calibration', 'scoring', 'openaq', 'drift'],
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
  automation: {
    title: 'Automation Engine',
    description: 'Rule evaluation on every reading, actuator commands, audit logging and push notifications.',
    tags: ['automation', 'rules', 'actuator', 'audit', 'notification'],
    mermaid: `flowchart TD
    S["Sensor Reading"] --> ING["ingestReading()"]
    ING --> EVAL["Rule Evaluator"]
    RULES[("Automation Rules")] --> EVAL
    EVAL -->|"matches"| ACT["automation-control.ts"]
    ACT -->|"on/off"| DEV["Actuator / Device"]
    ACT --> LOG[("Audit Log")]
    ACT --> NOTIFY["ntfy Push Notification"]
    EVAL -->|"no match"| IDLE["Wait for next reading"]`,
  },
  alerts: {
    title: 'Alerting & Notifications',
    description: 'Threshold evaluation on ingestion, alert history persistence, live feed and push delivery.',
    tags: ['alerts', 'threshold', 'notification', 'ntfy', 'history'],
    mermaid: `flowchart TD
    ING["ingestReading()"] --> THR["Threshold Check"]
    THR -->|"exceed"| AL["Alert Engine"]
    AL --> HIST[("alert_history Table")]
    AL --> LIVE["Live Alerts (WebSocket)"]
    AL --> NTFY["ntfy Push Notification"]
    AL --> RULES["Automation Trigger"]
    HIST --> ALERTS_UI["Alert Center UI"]
    NTFY --> MOB["Mobile / Desktop"]`,
  },
  security: {
    title: 'Security & Auth Flow',
    description: 'Authentication, JWT issuance, route guarding and role-based access control.',
    tags: ['security', 'auth', 'jwt', 'roles', 'guard'],
    mermaid: `flowchart LR
    UI["Frontend"] -->|"credentials"| AUTH["/api/auth/login"]
    AUTH --> JWT["JWT Issue"]
    JWT --> STORE["localStorage (token)"]
    STORE --> GUARD["RequireAuth"]
    GUARD --> ROLE["Role check"]
    ROLE --> API["Protected API"]
    ROLE -->|"denied"| DENIED["403 Forbidden"]`,
  },
  'ingestion-v3': {
    title: 'Unified V3 Ingestion',
    description: 'Physical devices and external sources converge through trust-scored ingestion into storage and analytics.',
    tags: ['v3', 'ingestion', 'sources', 'openaq', 'waqi', 'trust'],
    mermaid: `flowchart LR
    PHYS["Physical Device"] --> HTTP["/api/v3/ingestion/readings"]
    WEB["WAQI / OpenAQ"] --> SYNC["/api/v3/ingestion/sources"]
    HTTP --> TRUST["Trust Scoring"]
    SYNC --> TRUST
    TRUST --> DB[("Readings Table")]
    DB --> TRENDS["/api/v3/analytics/trends"]
    DB --> FEED["Live Feed"]
    DB --> AUDIT[("Source Audit Log")]`,
  },
};

const DIAGRAM_ICONS: Record<string, any> = {
  system: Network,
  ingestion: GitBranch,
  realtime: Radio,
  'ai-pipeline': BrainCircuit,
  'virtual-sensors': Beaker,
  compliance: ScrollText,
  wind: Wind,
  trust: ShieldCheck,
  automation: Workflow,
  alerts: BellRing,
  security: ShieldCheck,
  'ingestion-v3': Boxes,
};

interface DiagramStats {
  nodes: number;
  edges: number;
  clusters: number;
}

function diagramStats(md: string): DiagramStats {
  const lines = md.split('\n').map(l => l.trim()).filter(Boolean);
  const edges = lines.filter(l => l.includes('-->')).length;
  const clusters = lines.filter(l => l.startsWith('subgraph ')).length;
  const nodeDefs = lines.filter(l => !l.includes('-->') && /^[A-Za-z0-9_]+\s*(\[|\(\(\[)/.test(l)).length;
  return { nodes: nodeDefs - clusters, edges, clusters };
}

function buildGraph(md: string): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  md.split('\n').forEach(line => {
    const parts = line.split('-->');
    if (parts.length < 2) return;
    const from = parts[0].trim().split(/[({]/)[0].trim().replace(/[\]})]+$/, '');
    const to = parts[1].trim().replace(/^\|.*?\|\s*/, '').split(/[({]/)[0].trim().replace(/[\]})]+$/, '');
    if (!from || !to) return;
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.get(from)!.includes(to)) adj.get(from)!.push(to);
  });
  return adj;
}

function hoverStyles(hoverId: string, adj: Map<string, string[]>): string {
  const neighbors = adj.get(hoverId) || [];
  const nodes = [hoverId, ...neighbors];
  const nodeSel = nodes.map(n => `g.node[id*="flowchart-${n}-"]`).join(',');
  const edgeSels = neighbors.flatMap(n => [
    `path[id*="L_${hoverId}_${n}_"]`,
    `path[id*="L_${n}_${hoverId}_"]`,
  ]).join(',');
  return [
    `.mermaid-glass.hovering g.node, .mermaid-glass.hovering g.cluster { opacity: 0.15; }`,
    `.mermaid-glass.hovering g.edgePaths path, .mermaid-glass.hovering g.edgeLabel { opacity: 0.1; }`,
    `.mermaid-glass.hovering ${nodeSel} { opacity: 1; }`,
    `.mermaid-glass.hovering ${edgeSels} { opacity: 1; }`,
  ].join('\n');
}

function nodeIdFromDom(idAttr: string): string {
  const m = idAttr.match(/-flowchart-([A-Za-z0-9_]+)-/);
  return m ? m[1] : idAttr;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default function SignalFlow() {
  const [active, setActive] = useState('system');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hovering, setHovering] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const natural = useRef({ w: 0, h: 0 });
  const svgRef = useRef<HTMLDivElement>(null);
  const d = DIAGRAMS[active];
  const stats = useMemo(() => d ? diagramStats(d.mermaid) : { nodes: 0, edges: 0, clusters: 0 }, [d]);
  const allStats = useMemo(() => Object.fromEntries(
    Object.entries(DIAGRAMS).map(([k, v]) => [k, diagramStats(v.mermaid)])
  ), []);
  const adjacency = useMemo(() => d ? buildGraph(d.mermaid) : new Map<string, string[]>(), [d]);
  const neighbors = useMemo(() => (hovering ? (adjacency.get(hovering) || []) : []), [hovering, adjacency]);

  const readNaturalSize = (svg: Element) => {
    const wAttr = svg.getAttribute('width');
    let w = parseFloat(wAttr || '');
    let h = parseFloat(svg.getAttribute('height') || '');
    if (!w || wAttr?.includes('%')) {
      const vb = (svg as SVGSVGElement).viewBox?.baseVal;
      w = vb?.width || 0;
      h = vb?.height || 0;
    }
    return { w, h };
  };

  const applyZoom = (z: number) => {
    const svg = svgRef.current?.querySelector('svg');
    if (!svg) return;
    if (!natural.current.w) natural.current = readNaturalSize(svg);
    if (!natural.current.w) return;
    const zz = Math.max(0.2, Math.min(3, z));
    svg.setAttribute('width', String(Math.round(natural.current.w * zz)));
    svg.setAttribute('height', String(Math.round(natural.current.h * zz)));
    svg.setAttribute('style', 'max-width: none');
    zoomRef.current = zz;
    setZoom(zz);
  };

  const fitDiagram = () => {
    const host = svgRef.current;
    const svg = host?.querySelector('svg');
    if (!host || !svg) return;
    if (!natural.current.w) natural.current = readNaturalSize(svg);
    if (!natural.current.w) return;
    const avail = host.clientWidth - 24;
    applyZoom(Math.max(0.2, Math.min(1, avail / natural.current.w)));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DIAGRAMS;
    return Object.fromEntries(
      Object.entries(DIAGRAMS).filter(([, v]) =>
        v.title.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.tags.some(t => t.toLowerCase().includes(q))
      )
    );
  }, [query]);

  useEffect(() => {
    if (!d || !svgRef.current) return;
    let cancelled = false;
    setLoading(true);
    setCopied(false);
    setHovering(null);
    natural.current = { w: 0, h: 0 };
    const id = `signal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    mermaid.render(id, d.mermaid)
      .then(({ svg }) => {
        if (cancelled || !svgRef.current) return;
        svgRef.current.innerHTML = svg;
        setLoading(false);
        fitDiagram();
      })
      .catch(err => {
        if (cancelled || !svgRef.current) return;
        svgRef.current.innerHTML = `<div class="mermaid-error">${escapeHtml(err?.message || String(err))}</div>`;
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, d, d.mermaid]);

  if (!d) return null;

  const downloadSvg = () => {
    const svg = svgRef.current?.querySelector('svg');
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signal-flow-${active}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    const svg = svgRef.current?.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = 2;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); return; }
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `signal-flow-${active}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(d.mermaid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signal Flow Architecture"
        subtitle="End-to-end data flow, system interactions and live data paths across the platform"
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter diagrams…"
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--emerald-glow)] transition-colors w-48"
              />
            </div>
            <Btn variant="ghost" size="sm" onClick={copySource} title="Copy diagram source">
              {copied ? <Check size={14} className="text-[var(--emerald)]" /> : <Copy size={14} />} Source
            </Btn>
            <Btn variant="ghost" size="sm" onClick={downloadSvg} title="Download diagram as SVG">
              <Download size={14} /> SVG
            </Btn>
            <Btn variant="ghost" size="sm" onClick={downloadPng} title="Download diagram as PNG">
              <ImageIcon size={14} /> PNG
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen diagram'}
              className="signal-fullscreen-btn"
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {fullscreen ? 'Exit' : 'Fullscreen'}
            </Btn>
          </div>
        }
      />

      {/* Diagram tabs */}
      {Object.keys(filtered).length > 0 ? (
        <div className="flex flex-wrap gap-2 animate-fade-in-up">
          {Object.entries(filtered).map(([k, v]) => {
            const Icon = DIAGRAM_ICONS[k] || Network;
            const isActive = k === active;
            return (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all duration-300 ${
                  isActive
                    ? 'gradient-border glass-panel text-[var(--emerald)] shadow-glow-sm'
                    : 'glass text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:-translate-y-0.5'
                }`}
              >
                <Icon size={14} className={isActive ? 'animate-breathe' : ''} />
                {v.title}
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] leading-none font-semibold ${
                  isActive ? 'bg-[var(--emerald-dim)] text-[var(--emerald)]' : 'bg-[var(--surface)] text-[var(--text-tertiary)]'
                }`}>{allStats[k].edges}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-[var(--text-tertiary)] py-6 text-center">No diagrams match “{query}”.</div>
      )}

      {/* Diagram card */}
      <div className={`glass-panel gradient-border rounded-2xl p-5 md:p-6 animate-fade-slide-up relative ${fullscreen ? 'signal-fullscreen' : ''}`}>
        {fullscreen && (
          <button
            onClick={() => setFullscreen(false)}
            className="fixed top-4 right-4 z-50 p-2 rounded-full glass text-[var(--text-secondary)] hover:text-[var(--emerald)] hover:border-[var(--emerald-glow)] transition-colors"
            title="Close fullscreen"
            aria-label="Close fullscreen"
          >
            <X size={18} />
          </button>
        )}

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-[var(--emerald-dim)] text-[var(--emerald)] flex items-center justify-center animate-breathe">
                {(() => { const Icon = DIAGRAM_ICONS[active] || Network; return <Icon size={16} />; })()}
              </span>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{d.title}</h2>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-2 max-w-2xl leading-relaxed">{d.description}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {d.tags.map(t => (
              <Pill key={t} tone={t === 'ai' ? 'emerald' : t === 'realtime' || t === 'live' ? 'cyan' : t === 'security' ? 'rose' : 'slate'}>{t}</Pill>
            ))}
          </div>
        </div>

        {/* Topology stats + live indicator */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--emerald)]">
            <Activity size={12} className="animate-pulse" />
            Signal Topology
          </span>
          <span className="h-3 w-px bg-[var(--border)]" />
          <Pill tone="emerald">{stats.nodes} nodes</Pill>
          <Pill tone="cyan">{stats.edges} connections</Pill>
          <Pill tone="slate">{stats.clusters} layers</Pill>
          {hovering && (
            <Pill tone="emerald">
              <Crosshair size={11} className="animate-pulse" /> tracing {hovering}
              {neighbors.length > 0 && <span className="text-[var(--text-tertiary)]"> → {neighbors.join(', ')}</span>}
            </Pill>
          )}
        </div>

        <div className="diagram-stage rounded-xl p-4 md:p-6 min-h-[420px] flex items-center justify-center">
          <div className="signal-hud" aria-hidden="true">
            <span className="tl" />
            <span className="tr" />
            <span className="bl" />
            <span className="br" />
          </div>
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border border-[var(--border)]" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--emerald)] animate-spin-slow" />
              </div>
              <div className="text-sm flex items-center gap-2">
                <Cpu size={14} className="animate-pulse" /> Rendering diagram…
              </div>
            </div>
          )}
          {hovering && <style>{hoverStyles(hovering, adjacency)}</style>}
          <div
            key={active}
            ref={svgRef}
            onMouseOver={e => {
              const el = (e.target as Element).closest?.('.node');
              if (!el) return;
              setHovering(nodeIdFromDom(el.getAttribute('id') || ''));
            }}
            onMouseLeave={() => setHovering(null)}
            className={`w-full overflow-auto mermaid-glass animate-diagram-in [&_svg]:mx-auto [&_svg]:max-w-none ${hovering ? 'hovering' : ''}`}
          />

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-xl glass p-1.5">
            <button
              className="zoom-btn"
              onClick={() => applyZoom(zoomRef.current - 0.15)}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)] w-11 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="zoom-btn"
              onClick={() => applyZoom(zoomRef.current + 0.15)}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <span className="w-px h-4 bg-[var(--border)]" />
            <button className="zoom-btn" onClick={fitDiagram} title="Fit to width" aria-label="Fit to width">
              <Maximize size={14} />
            </button>
            <button className="zoom-btn" onClick={() => applyZoom(1)} title="Reset zoom" aria-label="Reset zoom">
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Legend / hints */}
        <div className="mt-4 pt-3 border-t border-[var(--border)] flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--emerald)] shadow-glow-sm" /> Node
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--cyan, #22d3ee) 0 3px, transparent 3px 6px)' }} /> Signal path
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity size={11} className="text-[var(--emerald)] animate-pulse" /> Live flow
          </span>
          <span className="ms-auto inline-flex items-center gap-1.5">
            Hover a node to trace its path · − / + to zoom · ⊞ to fit
          </span>
        </div>
      </div>
    </div>
  );
}
