import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen, ExternalLink, Quote, Code, Zap, Lightbulb, Check, Copy,
  FileDown, FileSpreadsheet, Link2,
} from 'lucide-react';
import { PageHeader, Card, SectionTitle, Pill, Btn } from '../components/ui';
import { useI18n } from '../lib/i18n';
import {
  REFERENCES,
  toBibTeXCollection, toReferenceCSV, getReferenceUsage,
  type ReferenceKind,
} from '../lib/ai-references';
import { ESTIMATOR_REFS, ESTIMATOR_METADATA } from '../lib/virtual-sensor-estimators';

function CodeBlock({ id, language, children }: { id: string; language: string; children: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }
  return (
    <div className="relative group rounded-[var(--radius-sm)] bg-black/30 border border-white/[0.06] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)] border-b border-white/[0.06]">
        <span className="text-[10px] text-[var(--text-disabled)] font-mono uppercase">{language}</span>
        <button onClick={() => copyText(children)} aria-label={t('references.copyCode', 'Copy')} className="text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors" title={t('references.copyCode', 'Copy')}>
          {copied === id ? <Check size={12} className="text-[var(--emerald)]" /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="p-3 text-xs text-[var(--text-secondary)] font-mono overflow-x-auto leading-relaxed">{children}</pre>
    </div>
  );
}

const KIND_TONE: Record<ReferenceKind, 'blue' | 'cyan' | 'violet' | 'emerald'> = {
  standard: 'blue',
  guideline: 'cyan',
  research: 'violet',
  method: 'emerald',
};

const USAGE_TONE: Record<string, 'emerald' | 'cyan' | 'violet' | 'amber' | 'slate'> = {
  domain: 'cyan',
  sensor: 'emerald',
  estimator: 'violet',
};

/** Map a reference id to human-readable usage locations across the platform. */
function usageFor(id: string, t: (k: string, f: string) => string): Array<{ kind: 'domain' | 'sensor' | 'estimator'; label: string }> {
  const out: Array<{ kind: 'domain' | 'sensor' | 'estimator'; label: string }> = [];
  for (const u of getReferenceUsage(id)) {
    out.push({ kind: u.kind, label: u.kind === 'domain' ? `${t('references.usedBy.domain', 'Domain')} · ${u.label}` : `${t('references.usedBy.sensor', 'Sensor')} · ${u.label}` });
  }
  for (const [estId, refIds] of Object.entries(ESTIMATOR_REFS)) {
    if (refIds.includes(id)) {
      const meta = ESTIMATOR_METADATA.find(m => m.id === estId);
      out.push({ kind: 'estimator', label: `${t('references.usedBy.estimator', 'Estimator')} · ${meta?.name || estId}` });
    }
  }
  return out;
}

const ARTICLE_KEYS: Record<string, { title: string; summary: string }> = {
  'air-quality-1': { title: 'knowledge.article.airQuality.title', summary: 'knowledge.article.airQuality.summary' },
  'ehi-1': { title: 'knowledge.article.ehi.title', summary: 'knowledge.article.ehi.summary' },
  'predictive-1': { title: 'knowledge.article.predictive.title', summary: 'knowledge.article.predictive.summary' },
  'sensors-1': { title: 'knowledge.article.sensors.title', summary: 'knowledge.article.sensors.summary' },
  'automation-1': { title: 'knowledge.article.automation.title', summary: 'knowledge.article.automation.summary' },
  'troubleshooting-1': { title: 'knowledge.article.troubleshooting.title', summary: 'knowledge.article.troubleshooting.summary' },
  'health-score-1': { title: 'knowledge.article.healthScore.title', summary: 'knowledge.article.healthScore.summary' },
  'rssi-pathloss-1': { title: 'knowledge.article.rssi.title', summary: 'knowledge.article.rssi.summary' },
  'uncertainty-1': { title: 'knowledge.article.uncertainty.title', summary: 'knowledge.article.uncertainty.summary' },
};

const CATEGORY_KEYS: Record<string, string> = {
  'Air Quality': 'knowledge.category.airQuality',
  Metrics: 'knowledge.category.metrics',
  Analytics: 'knowledge.category.analytics',
  Hardware: 'knowledge.category.hardware',
  Automation: 'knowledge.category.automation',
  Troubleshooting: 'knowledge.category.troubleshooting',
  Networks: 'knowledge.category.networks',
};

const KNOWLEDGE_ARTICLES = [
  {
    id: 'air-quality-1', title: 'Understanding Indoor Air Quality', category: 'Air Quality',
    summary: 'Key pollutants, safe thresholds, and monitoring practices for indoor environments.',
    content: `Indoor air quality (IAQ) is a critical factor in building health and occupant well-being. Key pollutants include:
**CO₂ (Carbon Dioxide):** Normal outdoor ~420 ppm, acceptable indoor <1000 ppm, above 2000 ppm drowsiness.
**PM2.5 (Fine Particulate Matter):** WHO guideline <15 µg/m³ annual, <45 µg/m³ 24-hour. Sources: cooking, smoking, infiltration.
**CO (Carbon Monoxide):** Safe <9 ppm 8-hr avg. Above 35 ppm immediate health risk.
**SO₂ and NO₂:** Primarily combustion sources; trigger asthma and respiratory irritation.`,
    tags: ['air-quality', 'CO2', 'PM2.5', 'monitoring'],
  },
  {
    id: 'ehi-1', title: 'The Environmental Health Index (EHI)', category: 'Metrics',
    summary: 'How EHI combines multiple sensor readings into a unified health score using weighted sub-indices.',
    content: `The Environmental Health Index (EHI) is a composite metric: EHI = Σ wᵢ·fᵢ.
**Weights:** Temperature 0.15, Humidity 0.15, Pressure 0.05, CO₂ 0.20, PM2.5 0.20, CO 0.10, SO₂ 0.075, NO₂ 0.075.
**Score ranges:** 80–100 Excellent, 60–79 Good, 40–59 Moderate, 20–39 Poor, 0–19 Critical.`,
    tags: ['EHI', 'metrics', 'scoring', 'formula'],
  },
  {
    id: 'predictive-1', title: 'Predictive Analytics', category: 'Analytics',
    summary: 'Holt-Winters, Holt\'s DES, and ensemble methods for environmental trend forecasting.',
    content: `**Holt-Winters Triple ES:** Best for data with trends and seasonality — captures level, trend, and seasonal components.
**Holt's Double ES:** Level and trend without seasonality.
**Ensemble Methods:** Weighted average of multiple predictors, with confidence intervals.
**Applications:** HVAC optimization, maintenance forecasting, air quality early warning.`,
    tags: ['analytics', 'prediction', 'forecasting'],
  },
  {
    id: 'sensors-1', title: 'Sensor Placement Best Practices', category: 'Hardware',
    summary: 'Optimal placement strategies for temperature, CO₂, PM2.5, and humidity sensors.',
    content: `**Temperature & Humidity:** Mount at 1.2–1.5m height (breathing zone), away from sunlight and heat sources.
**CO₂ Sensors:** Central location, away from windows and doors.
**PM2.5 Sensors:** Central position, away from cooking areas and HVAC vents.
**General:** Document locations, calibrate on installation, quarterly maintenance.`,
    tags: ['sensors', 'placement', 'hardware', 'calibration'],
  },
  {
    id: 'automation-1', title: 'Setting Up Automation Rules', category: 'Automation',
    summary: 'Threshold, time-based, and compound rules for environmental automation.',
    content: `**Threshold Rules:** Trigger actions when sensor values cross limits. E.g., temperature > 28°C → activate cooling.
**Time-based Rules:** Scheduled actions. E.g., EVERY 30 minutes → log data.
**Compound Rules:** Combined conditions. E.g., temperature > 26°C AND humidity > 70% → dehumidifier.
**Best Practices:** Conservative thresholds, add hysteresis, cooldown periods for equipment.`,
    tags: ['automation', 'rules', 'threshold'],
  },
  {
    id: 'troubleshooting-1', title: 'Common Sensor Issues', category: 'Troubleshooting',
    summary: 'Diagnosing and resolving zero readings, erratic data, drift, and network problems.',
    content: `**Zero/Null Readings:** Check power, network, restart sensor, verify firmware.
**Erratic Readings:** Check interference sources, loose connections, allow 30-min stabilization.
**Drift Over Time:** Normal for gas sensors; recalibrate regularly; replace if drift >10%.
**Network Issues:** Verify MQTT broker, WiFi signal, firewall rules, device credentials.
**Data Gaps:** Check battery, transmission intervals, database capacity, API rate limits.`,
    tags: ['troubleshooting', 'maintenance', 'debugging'],
  },
  {
    id: 'health-score-1', title: 'How the Device Health Score is Calculated', category: 'Metrics',
    summary: 'The weighted 0–100 composite and the R²-validated trend and RUL models behind fleet health.',
    content: `The **Device Health Score** is a weighted composite of three subsystems:

**Score = 0.40 · Signal + 0.35 · Memory + 0.25 · Uptime**

- **Signal (RSSI):** scaled 0–100 over the −90…−30 dBm usable window (IEEE 802.11).
- **Memory (free heap):** scored against ESP32-class budgets — ≥200 KB healthy, <10 KB critical (Espressif TRM / ESP-IDF).
- **Uptime:** sustained operation earns 100; frequent resets score low (ISO 17359 condition monitoring).

**Trends** are fitted with ordinary least squares (Gauss 1809) and validated with **R²** (Moriasi et al. 2007); the **Theil–Sen** median slope (Sen 1968) is robust to outliers and an **EWMA** (Roberts 1959) smooths the raw signal.

**Remaining Useful Life (RUL)** extrapolates the degrading health slope to the critical threshold (score < 40), a linear degradation model consistent with **ISO 13381-1:2015** prognostics. RUL and trend estimates carry a qualitative confidence derived from fit R², sample count and observation span.`,
    tags: ['health', 'score', 'rssi', 'rul', 'formula'],
  },
  {
    id: 'rssi-pathloss-1', title: 'RSSI, Path Loss & Estimating Distance', category: 'Networks',
    summary: 'How the log-distance path-loss model turns received signal strength into an approximate device distance.',
    content: `Received signal strength (RSSI) is the power a receiver observes from a transmitter. In open air the **Friis transmission equation** (Friis 1946) governs free-space loss, but indoors reflections and obstructions raise the path-loss exponent (ITU-R P.1238-11).

**Log-distance path-loss model:**
d = d₀ · 10^((P₀ − RSSI) / (10·n))

- d₀ = reference distance (1 m)
- P₀ = expected RSSI at d₀ (≈ −45 dBm)
- n = path-loss exponent (2.0 free space; 2–4 indoors)

Because walls and furniture vary, distance from RSSI is **approximate** — always report it with its uncertainty and treat it as a coarse geolocation aid, not a measurement.`,
    tags: ['rssi', 'path-loss', 'distance', 'wifi', 'network'],
  },
  {
    id: 'uncertainty-1', title: 'Measurement Uncertainty & Confidence', category: 'Metrics',
    summary: 'GUM-style type-B uncertainty: turning a sensor accuracy spec into a defensible confidence interval.',
    content: `Every sensor reports a value with limited accuracy. The **Guide to the Expression of Uncertainty in Measurement (GUM, JCGM 100:2008)** standardizes how to propagate that into a defensible statement.

For a declared relative accuracy of p% of reading, assuming a **rectangular** distribution over ±p%:
u = (value · p/100) / √3

**Expanded uncertainty** applies a coverage factor k. With **k = 2** the interval covers ≈95% of likely values — the convention recommended for reporting.

**Example:** an RSSI of −60 dBm with ±3% declared accuracy gives u ≈ 1.04 dBm and a 95% interval of roughly −62…−58 dBm. Confidence statements on this platform always state their coverage factor and distributional assumption.`,
    tags: ['uncertainty', 'gum', 'metrology', 'confidence', 'accuracy'],
  },
];

const API_ENDPOINTS = [
  { method: 'GET', path: '/api/devices', desc: 'List all registered devices' },
  { method: 'POST', path: '/api/devices', desc: 'Register a new device' },
  { method: 'GET', path: '/api/devices/:id/readings', desc: 'Get historical sensor readings' },
  { method: 'POST', path: '/api/ehi-history', desc: 'Persist an EHI data point' },
  { method: 'GET', path: '/api/ehi-history', desc: 'Retrieve EHI history' },
  { method: 'GET', path: '/api/alerts', desc: 'List active alerts' },
  { method: 'POST', path: '/api/alerts', desc: 'Create a new alert rule' },
  { method: 'POST', path: '/api/alerts/:id/acknowledge', desc: 'Acknowledge an alert' },
  { method: 'GET', path: '/api/alerts/rules', desc: 'List alert rules' },
  { method: 'POST', path: '/api/alerts/rules', desc: 'Create / update an alert rule' },
  { method: 'DELETE', path: '/api/alerts/rules/:id', desc: 'Delete an alert rule' },
  { method: 'GET', path: '/api/thresholds', desc: 'List configured sensor thresholds' },
  { method: 'POST', path: '/api/thresholds', desc: 'Save or update a threshold' },
];

const METHOD_COLORS: Record<string, string> = { GET: 'text-[var(--emerald)]', POST: 'text-[var(--cyan)]', PUT: 'text-[var(--amber)]', DELETE: 'text-[var(--rose)]' };

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, type: 'spring' as const, stiffness: 70 } }) };

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReferencesPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'references' | 'articles' | 'api' | 'quickstart'>('references');
  const [searchRef, setSearchRef] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const filteredRefs = useMemo(() => {
    return REFERENCES.filter(r => {
      const matchesSearch = !searchRef || r.title.toLowerCase().includes(searchRef.toLowerCase()) || r.authors.toLowerCase().includes(searchRef.toLowerCase()) || r.publisher.toLowerCase().includes(searchRef.toLowerCase()) || r.tags.some(tag => tag.includes(searchRef.toLowerCase()));
      const matchesTags = selectedTags.size === 0 || r.tags.some(tag => selectedTags.has(tag));
      return matchesSearch && matchesTags;
    });
  }, [searchRef, selectedTags]);

  const allTags = useMemo(() => Array.from(new Set(REFERENCES.flatMap(r => r.tags))).sort(), []);

  const tabs = [
    { id: 'references' as const, label: t('references.tab.references', 'Scientific References'), icon: <Quote size={14} /> },
    { id: 'articles' as const, label: t('references.tab.articles', 'Knowledge Articles'), icon: <BookOpen size={14} /> },
    { id: 'api' as const, label: t('references.tab.api', 'API Reference'), icon: <Code size={14} /> },
    { id: 'quickstart' as const, label: t('references.tab.quickstart', 'Quick Start'), icon: <Zap size={14} /> },
  ];

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-[1100px] mx-auto">
      <PageHeader
        title={t('references.title', 'References')}
        subtitle={t('references.subtitle', 'Scientific citations · Knowledge articles · API reference · Quick-start guides')}
        right={<div className="flex items-center gap-2">
          <Pill tone="emerald">{REFERENCES.length} {t('references.sources', 'sources')}</Pill>
        </div>}
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 p-1 rounded-[var(--radius-md)] bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
        {tabs.map(tab => (
          <Btn key={tab.id} onClick={() => setActiveTab(tab.id)} variant="ghost" size="sm" className={`whitespace-nowrap ${activeTab === tab.id ? '!bg-[var(--emerald)]/15 !text-[var(--emerald)]' : ''}`}>
            <span className="flex items-center gap-1.5">{tab.icon}{tab.label}</span>
          </Btn>
        ))}
      </div>

      <div className="animate-fade-in">

        {/* ── Scientific References Tab ── */}
        {activeTab === 'references' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>
                <Quote size={14} className="inline mr-2 text-[var(--emerald)]" />
                {t('references.section.scientific', 'Scientific References')}
              </SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] leading-relaxed mb-5">
                {t('references.scientific.description', 'All algorithms and methodologies used in the PERN platform are grounded in peer-reviewed scientific literature and international standards. Every reference below is a real standard, guideline, or publication traced directly to the equation, threshold, or design decision it backs.')}
              </p>

              {/* Search + export */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Quote size={14} className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input type="text" value={searchRef} onChange={e => setSearchRef(e.target.value)} placeholder={t('references.searchPlaceholder', 'Search references by title, author, publisher, or tag...')} className="w-full pl-10 rtl:pl-4 pr-4 rtl:pr-10 py-2 border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--bg-primary)] text-[var(--text-primary)]" />
                </div>
                <div className="flex items-center gap-2">
                  <Btn variant="ghost" size="sm" disabled={filteredRefs.length === 0} onClick={() => downloadFile('pern-references.bib', toBibTeXCollection(filteredRefs), 'text/plain')}>
                    <FileDown size={12} /> BibTeX
                  </Btn>
                  <Btn variant="ghost" size="sm" disabled={filteredRefs.length === 0} onClick={() => downloadFile('pern-references.csv', toReferenceCSV(filteredRefs), 'text/csv')}>
                    <FileSpreadsheet size={12} /> CSV
                  </Btn>
                </div>
              </div>

              {/* Tag filters */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {allTags.map(tag => (
                  <button key={tag} onClick={() => {
                    const next = new Set(selectedTags);
                    if (next.has(tag)) next.delete(tag); else next.add(tag);
                    setSelectedTags(next);
                  }} className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                    selectedTags.has(tag) ? 'bg-[var(--emerald)]/15 text-[var(--emerald)] border-[var(--emerald)]/30' : 'bg-white/[0.03] text-[var(--text-tertiary)] border-white/[0.08] hover:text-[var(--text-secondary)]'
                  }`}>
                    {tag}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                {filteredRefs.map((ref, i) => {
                  const usages = usageFor(ref.id, t);
                  return (
                    <div key={ref.id} className="flex items-start gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] hover:bg-white/[0.03] transition-colors group">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--emerald)]/10 text-[var(--emerald)] flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--emerald)] transition-colors">{ref.title}</span>
                          <Pill tone={KIND_TONE[ref.kind]} className="!px-2 !py-0 !text-[9px] capitalize">{ref.kind}</Pill>
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{ref.authors} ({ref.year})</div>
                        <div className="text-[11px] text-[var(--text-disabled)]">{ref.publisher}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {ref.tags.map(tag => <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-white/[0.04] rounded text-[var(--text-disabled)]">#{tag}</span>)}
                        </div>
                        {usages.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mr-0.5">
                              <Link2 size={9} /> {t('references.usedBy', 'Used by')}
                            </span>
                            {usages.map(u => (
                              <span key={u.label} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${USAGE_TONE[u.kind] === 'cyan' ? 'bg-[rgba(34,211,238,0.08)] text-[var(--cyan)] border-[rgba(34,211,238,0.2)]' : USAGE_TONE[u.kind] === 'emerald' ? 'bg-[var(--emerald-dim)] text-[var(--emerald)] border-[var(--emerald-glow)]' : 'bg-[rgba(167,139,250,0.1)] text-[var(--violet)] border-[rgba(167,139,250,0.25)]'}`}>
                                {u.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {ref.url && (
                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[var(--text-disabled)] hover:text-[var(--emerald)] mt-1 transition-colors" title={t('references.openSource', 'Open source')}>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  );
                })}
                {filteredRefs.length === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-8">{t('references.noMatches', 'No references match your search.')}</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Knowledge Articles Tab ── */}
        {activeTab === 'articles' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {KNOWLEDGE_ARTICLES.map(article => {
              const meta = ARTICLE_KEYS[article.id];
              const title = meta ? t(meta.title, article.title) : article.title;
              const summary = meta ? t(meta.summary, article.summary) : article.summary;
              const category = t(CATEGORY_KEYS[article.category] ?? article.category, article.category);
              return (
                <Card key={article.id}>
                  <div className="flex items-start justify-between mb-2">
                    <Pill tone="cyan">{category}</Pill>
                    <Lightbulb size={14} className="text-[var(--amber)]" />
                  </div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-1">{title}</h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">{summary}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {article.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-tertiary)]">#{tag}</span>
                    ))}
                  </div>
                  <details className="group">
                    <summary className="text-xs text-[var(--emerald)] cursor-pointer hover:text-[var(--emerald-bright)] transition-colors list-none flex items-center gap-1">
                      <span className="group-open:hidden">{t('references.readMore', 'Read more')}</span>
                      <span className="hidden group-open:inline">{t('references.collapse', 'Collapse')}</span>
                      <ExternalLink size={10} />
                    </summary>
                    <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)] whitespace-pre-line prose prose-sm dark:prose-invert max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]}>{article.content}</Markdown>
                    </div>
                  </details>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── API Reference Tab ── */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>{t('references.section.apiEndpoints', 'REST API Endpoints')}</SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">
                {t('references.api.intro', 'All endpoints are prefixed with')} <code className="text-[11px] bg-white/[0.06] px-1 rounded">/api</code>. {t('references.api.auth', 'Requests require a')} <code className="text-[11px] bg-white/[0.06] px-1 rounded">Bearer</code> {t('references.api.authSuffix', 'token and an')} <code className="text-[11px] bg-white/[0.06] px-1 rounded">X-Organization-Id</code> {t('references.api.apiHeader', 'or')} <code className="text-[11px] bg-white/[0.06] px-1 rounded">X-User-Id</code> {t('references.api.headerSuffix', 'header.')}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="p-2.5 text-left rtl:text-right text-[var(--text-disabled)] font-medium w-16">{t('references.method', 'Method')}</th>
                      <th className="p-2.5 text-left rtl:text-right text-[var(--text-disabled)] font-medium">{t('references.endpoint', 'Endpoint')}</th>
                      <th className="p-2.5 text-left rtl:text-right text-[var(--text-disabled)] font-medium">{t('references.description', 'Description')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {API_ENDPOINTS.map((ep, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="p-2.5 font-mono font-bold text-[11px]"><span className={METHOD_COLORS[ep.method] ?? 'text-[var(--text-secondary)]'}>{ep.method}</span></td>
                        <td className="p-2.5 font-mono text-[var(--text-secondary)]">{ep.path}</td>
                        <td className="p-2.5 text-[var(--text-tertiary)]">{t(`references.api.desc.${i}`, ep.desc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card hover={false}>
              <SectionTitle>{t('references.section.requestFormat', 'Request Format')}</SectionTitle>
              <CodeBlock id="headers" language="HTTP">{`Authorization: Bearer <your-token>
Content-Type: application/json
X-Organization-Id: org_cairo_01
X-User-Id: user_123`}</CodeBlock>
            </Card>

            <Card hover={false}>
              <SectionTitle>{t('references.section.responseFormat', 'Response Format')}</SectionTitle>
              <CodeBlock id="resp-s" language="JSON">{`{ "data": [...], "total": 42, "page": 1 }`}</CodeBlock>
              <div className="mt-3">
                <CodeBlock id="resp-e" language="JSON">{`{ "error": "Unauthorized", "message": "Invalid or expired token" }`}</CodeBlock>
              </div>
            </Card>
          </div>
        )}

        {/* ── Quick Start Tab ── */}
        {activeTab === 'quickstart' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>
                <Zap size={14} className="inline mr-2 text-[var(--emerald)]" />
                {t('references.section.quickstart', 'Quick Start — Connect a New Device')}
              </SectionTitle>
              <div className="space-y-4">
                {[
                  { step: 1, title: t('references.quickstart.step1', 'Install dependencies'),
                    code: `# Arduino IDE: Install PubSubClient library\n# PlatformIO: Add to platformio.ini\nlib_deps = knolleary/PubSubClient@^2.8` },
                  { step: 2, title: t('references.quickstart.step2', 'Configure WiFi and MQTT broker'),
                    code: `#define WIFI_SSID     "YourSSID"\n#define WIFI_PASS     "YourPassword"\n#define MQTT_BROKER   "your-server.com"\n#define MQTT_PORT     1883\n#define MQTT_TOPIC    "pern/sensors/esp32_01/data"` },
                  { step: 3, title: t('references.quickstart.step3', 'Read sensors and publish data'),
                    code: `void publishSensorData() {\n  StaticJsonDocument<256> doc;\n  JsonObject sensors = doc.createNestedObject("sensors");\n  sensors["pm25"] = readPM25();\n  sensors["co2"]  = readCO2();\n  sensors["tmp"]  = readTemperature();\n  sensors["hum"]  = readHumidity();\n  doc["timestamp"] = millis();\n  char buffer[256];\n  serializeJson(doc, buffer);\n  client.publish(MQTT_TOPIC, buffer);\n}` },
                  { step: 4, title: t('references.quickstart.step4', 'Register the device'),
                    code: `curl -X POST https://your-server.com/api/devices \\\n  -H "Authorization: Bearer <token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "ESP32 Cairo 01", "type": "ESP32"}'` },
                  { step: 5, title: t('references.quickstart.step5', 'Verify data flow'),
                    code: `# Dashboard → Live Mode — verify real-time readings\n# Or via MQTT CLI:\nmosquitto_sub -h your-server.com -t "pern/sensors/#"` },
                ].map(s => (
                  <div key={s.step}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--emerald)]/15 text-[var(--emerald)] flex items-center justify-center text-xs font-bold">{s.step}</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{s.title}</span>
                    </div>
                    <CodeBlock id={`qs-${s.step}`} language="C++ / Shell">{s.code}</CodeBlock>
                  </div>
                ))}
              </div>
            </Card>

            <Card hover={false}>
              <SectionTitle>{t('references.section.mqttStructure', 'MQTT Topic Structure')}</SectionTitle>
              <div className="space-y-3">
                {[
                  { topic: 'pern/sensors/{device_id}/data', desc: t('references.mqtt.desc.0', 'Sensor readings from devices (default 5s interval).'), direction: t('references.mqtt.deviceToBroker', 'Device → Broker') },
                  { topic: 'pern/actuators/{device_id}/{actuator}/status', desc: t('references.mqtt.desc.1', 'Actuator state feedback (relays, pumps, fans).'), direction: t('references.mqtt.deviceToBroker', 'Device → Broker') },
                  { topic: 'pern/devices/{device_id}/status', desc: t('references.mqtt.desc.2', 'Device online/offline announcements.'), direction: t('references.mqtt.deviceToBroker', 'Device → Broker') },
                  { topic: 'pern/devices/{device_id}/actuators/{actuator}/command', desc: t('references.mqtt.desc.3', 'Remote actuator control commands from dashboard.'), direction: t('references.mqtt.brokerToDevice', 'Broker → Device') },
                  { topic: 'pern/devices/{device_id}/config', desc: t('references.mqtt.desc.4', 'Runtime configuration pushed to a device.'), direction: t('references.mqtt.brokerToDevice', 'Broker → Device') },
                  { topic: 'pern/devices/{device_id}/ota', desc: t('references.mqtt.desc.5', 'Firmware OTA updates pushed to a device.'), direction: t('references.mqtt.brokerToDevice', 'Broker → Device') },
                ].map((e, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] bg-white/[0.02] border border-white/[0.06]">
                    <code className="text-xs text-[var(--emerald)] font-mono">{e.topic}</code>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-tertiary)]">{e.desc}</span>
                      <Pill tone="slate">{e.direction}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

      </div>
    </motion.div>
  );
}
