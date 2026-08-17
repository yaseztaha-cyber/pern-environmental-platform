/**
 * PERN AI Copilot
 * Tool-grounded Q&A over live platform data. Every answer is grounded in
 * deterministic data pulled from the DB (latest readings, per-sensor stats,
 * anomalies, compliance, alerts) — the LLM (when available) only narrates
 * over those facts. No-LLM path returns a fully deterministic answer.
 */

const db = require('../db');
const logger = require('../utils/logger');
const { callJSON } = require('./llm-client');
const { withCache, cacheKey } = require('./ai-cache');
const complianceEngine = require('./compliance-engine');
const trustEngine = require('./trust-engine');
const {
  SENSOR_THRESHOLDS,
  assessSensorStatus,
  computeSeriesStats,
  deriveRiskLevel,
  computeHealthScore,
  latestReadings,
  buildReadingMatrix,
} = require('./analysis-engine');
const { searchReferences } = require('./ai-references');

const COMPLIANCE_KEYS = new Set(['pm25', 'pm10', 'no2', 'so2', 'o3', 'co']);

// Registry of capabilities surfaced to the frontend Copilot UI.
const TOOLS = [
  { id: 'status', name: 'Live monitoring status', description: 'Latest reading per sensor per device with threshold status.' },
  { id: 'trends', name: 'Trend analysis', description: 'Direction, volatility and recent trajectory of each sensor series.' },
  { id: 'anomalies', name: 'Anomaly detection', description: 'Z-score deviations from each device/sensor baseline.' },
  { id: 'compliance', name: 'Regulatory compliance', description: 'Cross-check against WHO/EPA/EU/UK/Egypt frameworks for the current location.' },
  { id: 'alerts', name: 'Alert & event history', description: 'Most recent triggered alerts and automation rules.' },
  { id: 'trust', name: 'Data confidence', description: 'Sensor trust/confidence given recent consistency.' },
  { id: 'forecast', name: 'Forecast & prediction', description: 'Near-term trajectory projection for monitored parameters.' },
  { id: 'maintenance', name: 'Device maintenance', description: 'Maintenance/health indicators per connected device.' },
];

// Keyword → intent matchers used by the deterministic (no-LLM) answer path.
const INTENT_MATCHERS = [
  { intent: 'greeting', re: /\b(hi|hello|hey|salam|marhaba|good (morning|evening|afternoon)|assalam)\b/i },
  { intent: 'help', re: /\b(help|what can you do|capabil|how do you work|what do you do)\b/i },
  { intent: 'air', re: /\b(pm2\.?5|pm10|pm\b|particulate|aqi|air quality|dust|pollut)\b/i },
  { intent: 'water', re: /\b(water|ph\b|tds|dissolved|oxygen|turbidity|aqua|wqi)\b/i },
  { intent: 'temp', re: /\b(temp|celsius|heat|hot|cold|thermal|fahrenheit)\b/i },
  { intent: 'humidity', re: /\b(humidity|moisture|damp|wet)\b/i },
  { intent: 'co2', re: /\b(co2|carbon dioxide|ventilat|indoor air)\b/i },
  { intent: 'forecast', re: /\b(forecast|predict|future|next (hour|hours|day|days)|trending (up|down)|outlook)\b/i },
  { intent: 'maintenance', re: /\b(mainten|service|replace|calibrat|battery|firmware|fix|repair|upgrade)\b/i },
  { intent: 'devices', re: /\b(device|sensor|how many|which sensor|count|nodes|connected)\b/i },
  { intent: 'anomalies', re: /\b(anomal|outlier|unusual|abnormal|spike|deviat)\b/i },
  { intent: 'trends', re: /\b(trend|rising|dropping|increas|decreas|direction|slope|trajectory)\b/i },
  { intent: 'compliance', re: /\b(compli|regulat|limit|legal|standard|who|epa|threshold|exceed)\b/i },
  { intent: 'alerts', re: /\b(alert|warning|event|notification|trigger)\b/i },
  { intent: 'recommend', re: /\b(recommend|suggest|advice|what should|action|mitigat)\b/i },
  { intent: 'compare', re: /\b(compare|versus|vs\b|which is (worse|better|higher|lower)|difference)\b/i },
  { intent: 'health', re: /\b(health|ehi|score|index|risk|overall|how (are|am) (we|i))\b/i },
];

function detectIntents(q) {
  const intents = [];
  for (const m of INTENT_MATCHERS) {
    if (m.re.test(q)) intents.push(m.intent);
  }
  if (intents.length === 0) intents.push('overview');
  return intents;
}

/** Deterministic follow-up suggestions derived from the detected intent + live context. */
function suggestFollowups(intents, ctx) {
  const tips = [];
  const worst = (ctx.assessments || []).filter(a => a.level !== 'normal');
  const hasConcern = worst.length > 0;
  const anomalies = ctx.anomalies || [];

  if (intents.includes('air') || intents.includes('health')) {
    tips.push('Which parameter is closest to exceeding its limit?');
    tips.push('How does the current AQI compare to the last 24 hours?');
  }
  if (intents.includes('water')) {
    tips.push('What is driving the water quality index?');
    tips.push('Are pH and dissolved oxygen correlated?');
  }
  if (intents.includes('temp') || intents.includes('humidity')) {
    tips.push('Is there a correlation between temperature and humidity?');
  }
  if (intents.includes('forecast')) {
    tips.push('What is the projected EHI for the next 24 hours?');
    tips.push('Which sensor is forecast to worsen?');
  }
  if (intents.includes('maintenance')) {
    tips.push('Which devices may need calibration soon?');
    tips.push('Which sensors show signs of drift or fault?');
  }
  if (intents.includes('compliance')) {
    tips.push('Which regulation applies to this location?');
    tips.push('How far over the limit is each exceedance?');
  }
  if (hasConcern) {
    tips.push(`What should I do about ${worst[0].label}?`);
  }
  if (anomalies.length > 0 && !intents.includes('anomalies')) {
    tips.push('Explain the latest anomaly in detail.');
  }
  if (intents.includes('recommend')) {
    tips.push('What automation rules would help right now?');
  }
  if (intents.includes('devices')) {
    tips.push('Which device has the most recent readings?');
    tips.push('How many devices are offline?');
  }

  // De-duplicate, cap at 4.
  const seen = new Set();
  const unique = tips.filter(t => !seen.has(t) && seen.add(t));
  return unique.slice(0, 4);
}

async function gatherContext({ deviceId, limit = 60, lat, lng, countryCode }) {
  const rows = deviceId
    ? await db.getDeviceReadings(deviceId, limit)
    : await db.getRecentReadings(limit);
  const rowsSafe = Array.isArray(rows) ? rows : [];

  const devices = await db.getDevices().catch(() => []);
  const alerts = await db.getAlerts?.(undefined, 20).catch(() => []) || [];

  const current = latestReadings(rowsSafe);
  const matrix = buildReadingMatrix(rowsSafe);
  const assessments = Object.entries(current)
    .map(([sensor, value]) => assessSensorStatus(sensor, value))
    .filter(Boolean);

  const stats = Object.entries(matrix)
    .filter(([, v]) => v.length >= 2)
    .map(([sensor, values]) => ({
      sensor,
      ...computeSeriesStats(values),
      latest: values[values.length - 1],
      status: assessSensorStatus(sensor, values[values.length - 1])?.level || 'normal',
    }))
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, normal: 2 };
      return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
    });

  const healthScore = computeHealthScore(assessments);
  const riskLevel = deriveRiskLevel({
    worstStatus: assessments.some(a => a.level === 'critical') ? 'critical'
      : assessments.some(a => a.level === 'warning') ? 'warning' : 'normal',
    trendDirection: stats.some(s => s.direction === 'increasing') ? 'increasing' : 'stable',
    volatility: stats.some(s => s.volatility === 'high') ? 'high' : 'low',
  });

  const anomalies = [];
  for (const [sensor, values] of Object.entries(matrix)) {
    if (values.length >= 10) {
      const window = values.slice(0, -1);
      const last = values[values.length - 1];
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const sd = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length);
      if (sd > 0 && Math.abs(last - mean) / sd > 3) {
        anomalies.push({ sensor, zScore: (last - mean) / sd, value: last });
      }
    }
  }

  const cc = (countryCode || complianceEngine.detectCountry(lat, lng)) || 'US';
  const complianceInput = {};
  for (const [k, v] of Object.entries(current)) {
    if (COMPLIANCE_KEYS.has(k) && typeof v === 'number') complianceInput[k] = v;
  }
  const compliance = complianceEngine.checkCompliance(cc, complianceInput);

  const confidence = trustEngine.computeConfidence('physical', {}, []);

  return {
    deviceCount: Array.isArray(devices) ? devices.length : 0,
    readingCount: rowsSafe.length,
    current,
    assessments,
    stats,
    healthScore,
    riskLevel,
    anomalies,
    compliance,
    alerts: Array.isArray(alerts) ? alerts.slice(0, 10) : [],
    confidence: confidence.overall,
  };
}

function deterministicAnswer(question, ctx) {
  const q = String(question || '').toLowerCase();
  const intents = detectIntents(q);
  const parts = [];

  if (!ctx.readingCount) {
    return {
      answer: 'No monitoring data is available yet. Connect a device to start asking questions about live conditions.',
      cited: [],
      followups: ['How do I connect a device?', 'What sensors are supported?', 'How is the health score computed?'],
    };
  }

  const formatSensor = (label, value, unit) => `${label} ${value}${unit ? ` ${unit}` : ''}`;
  const worst = ctx.assessments.filter(a => a.level !== 'normal');

  // ── Intent-driven answers (deterministic, grounded) ──
  if (intents.includes('greeting')) {
    parts.push('Hello! I am the PERN environmental copilot, grounded in your live sensor data.');
    parts.push('Ask me about air quality, water quality, trends, anomalies, compliance, forecasts, maintenance or recommendations.');
  }

  if (intents.includes('help') || intents.includes('greeting')) {
    parts.push(`I can analyze ${ctx.assessments.length} monitored parameters across ${ctx.deviceCount} device(s), explain trends and anomalies, check compliance, and recommend actions.`);
  }

  if (intents.includes('air')) {
    const airKeys = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'co'];
    const airSensors = airKeys.map(k => ctx.assessments.find(a => a.sensor === k)).filter(Boolean);
    if (airSensors.length > 0) {
      parts.push(`Air quality: ${airSensors.map(a => formatSensor(a.label, a.value, a.unit)).join(', ')}.`);
      const bad = airSensors.filter(a => a.level !== 'normal');
      if (bad.length > 0) parts.push(`${bad.map(a => a.label).join(', ')} ${bad.length > 1 ? 'are' : 'is'} outside the recommended range.`);
    } else {
      parts.push('No particulate/gas air sensors are reporting right now.');
    }
  }

  if (intents.includes('water')) {
    const waterKeys = ['ph', 'tds', 'dO', 'wT', 'tb'];
    const waterSensors = waterKeys.map(k => ctx.assessments.find(a => a.sensor === k)).filter(Boolean);
    if (waterSensors.length > 0) {
      parts.push(`Water quality: ${waterSensors.map(a => formatSensor(a.label, a.value, a.unit)).join(', ')}.`);
      const bad = waterSensors.filter(a => a.level !== 'normal');
      if (bad.length > 0) parts.push(`${bad.map(a => a.label).join(', ')} ${bad.length > 1 ? 'are' : 'is'} outside the recommended range.`);
    } else {
      parts.push('No water-quality sensors are reporting right now.');
    }
  }

  if (intents.includes('temp')) {
    const t = ctx.assessments.find(a => a.sensor === 'tmp');
    parts.push(t ? `Temperature is ${formatSensor(t.label, t.value, t.unit)} (${t.level}).` : 'No temperature sensor is reporting.');
    const wt = ctx.assessments.find(a => a.sensor === 'wT');
    if (wt) parts.push(`Water temperature is ${formatSensor(wt.label, wt.value, wt.unit)} (${wt.level}).`);
  }

  if (intents.includes('humidity')) {
    const h = ctx.assessments.find(a => a.sensor === 'hum');
    parts.push(h ? `Relative humidity is ${formatSensor(h.label, h.value, h.unit)} (${h.level}).` : 'No humidity sensor is reporting.');
  }

  if (intents.includes('co2')) {
    const c = ctx.assessments.find(a => a.sensor === 'co2');
    parts.push(c ? `CO₂ is ${formatSensor(c.label, c.value, c.unit)} (${c.level}).` : 'No CO₂ sensor is reporting.');
  }

  if (intents.includes('devices')) {
    parts.push(`You have ${ctx.deviceCount} connected device(s) and ${ctx.readingCount} readings in the current window.`);
    if (ctx.alerts && ctx.alerts.length > 0) parts.push(`${ctx.alerts.length} recent alert(s) are active.`);
  }

  if (intents.includes('forecast')) {
    const rising = ctx.stats.filter(s => s.direction === 'increasing');
    if (rising.length > 0) parts.push(`Rising trends to watch: ${rising.slice(0, 3).map(s => `${s.sensor} (${s.slope ? s.slope.toFixed(2) : 'N/A'}/h)`).join(', ')}.`);
    else parts.push('No parameters are currently on a strong rising trajectory.');
    parts.push(`Health score is ${ctx.healthScore}/100 — ${ctx.riskLevel} risk.`);
  }

  if (intents.includes('maintenance')) {
    const volatile = ctx.stats.filter(s => s.volatility === 'high');
    if (volatile.length > 0) parts.push(`High-volatility sensors (candidates for recalibration): ${volatile.slice(0, 3).map(s => s.sensor).join(', ')}.`);
    else parts.push('No sensors show abnormally high volatility in the current window.');
    if (ctx.anomalies.length > 0) parts.push(`${ctx.anomalies.length} anomaly/anomalies detected — often a sign of sensor fault or an environmental event.`);
  }

  if (intents.includes('anomalies')) {
    parts.push(ctx.anomalies.length > 0
      ? `Anomalies: ${ctx.anomalies.map(a => `${a.sensor} at ${a.zScore.toFixed(1)}σ`).slice(0, 5).join('; ')}.`
      : 'No anomalies detected in the current window.');
  }

  if (intents.includes('trends')) {
    const moving = ctx.stats.filter(s => s.direction !== 'stable');
    parts.push(moving.length > 0
      ? `Trending sensors: ${moving.map(s => `${s.sensor} ${s.direction} (avg ${s.avg})`).slice(0, 5).join('; ')}.`
      : 'No sensor shows a strong directional trend over the window.');
  }

  if (intents.includes('compliance')) {
    parts.push(ctx.compliance.exceedances?.length > 0
      ? `Regulatory exceedances under ${ctx.compliance.framework}: ${ctx.compliance.exceedances.map(e => `${e.parameter} at ${e.exceeded_by}% over limit`).join('; ')}.`
      : `Compliant under the ${ctx.compliance.framework} (${ctx.compliance.authority}).`);
  }

  if (intents.includes('alerts')) {
    parts.push(ctx.alerts.length > 0
      ? `Most recent alerts: ${ctx.alerts.map(a => a.title || `${a.sensor} ${a.detail}`).slice(0, 5).join('; ')}.`
      : 'No recent alerts have been triggered.');
  }

  if (intents.includes('recommend')) {
    const recs = [];
    if (ctx.compliance.exceedances?.length > 0) {
      for (const e of ctx.compliance.exceedances.slice(0, 3)) recs.push(`reduce ${e.parameter} levels — currently ${e.exceeded_by}% over the ${e.averaging || ''} limit`);
    }
    for (const a of worst.slice(0, 3)) recs.push(`address ${a.label} (${a.level}, value ${a.value}${a.unit ? ` ${a.unit}` : ''})`);
    if (recs.length === 0) recs.push('keep current conditions — everything is within range');
    parts.push(`Recommended actions: ${recs.join('; ')}.`);
  }

  if (intents.includes('compare')) {
    const sorted = [...ctx.stats].sort((a, b) => {
      const rank = { critical: 0, warning: 1, normal: 2 };
      return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
    });
    if (sorted.length >= 2) {
      const [first, second] = sorted;
      parts.push(`Comparing status: ${first.sensor} (${first.status}) vs ${second.sensor} (${second.status}). ${first.sensor} needs more attention.`);
    }
  }

  // Always append an overall health summary unless already covered.
  if (!intents.includes('health') && !intents.includes('overview') && !intents.includes('greeting')) {
    parts.push(`Overall health score ${ctx.healthScore}/100 (risk: ${ctx.riskLevel}) across ${ctx.assessments.length} parameters and ${ctx.deviceCount} device(s).`);
  }

  // Catch-all when nothing matched above (pure "what is X" questions).
  if (parts.length === 0) {
    const affected = worst.slice(0, 3);
    parts.push(affected.length > 0
      ? `Parameters needing attention: ${affected.map(a => `${a.label} (${a.level})`).join('; ')}.`
      : 'All monitored parameters are within their recommended ranges.');
    parts.push(`Overall health score ${ctx.healthScore}/100 (risk: ${ctx.riskLevel}).`);
  }

  const answer = parts.join(' ');
  const citedKeys = new Set([
    ...worst.map(a => a.sensor),
    ...(ctx.compliance.exceedances || []).map(e => e.parameter),
  ]);
  const cited = [];
  for (const key of citedKeys) {
    const refs = searchReferences(key).slice(0, 1);
    for (const r of refs) cited.push(`${r.title} — ${r.authors} (${r.year}).`);
  }
  return {
    answer,
    cited: cited.slice(0, 5),
    followups: suggestFollowups(intents, ctx),
  };
}

async function runCopilotImpl({ question, deviceId, limit = 60, lat, lng, countryCode } = {}) {
  if (!question || typeof question !== 'string' || question.trim().length < 3) {
    return { answer: 'Ask me a question about your monitoring data.', cited: [], tools: TOOLS, grounded: false, error: 'Question too short', followups: ['What is the current air quality status?', 'Are there any anomalies right now?'] };
  }

  const ctx = await gatherContext({ deviceId, limit, lat, lng, countryCode });

  // Always compute the deterministic ground truth first.
  const { answer: fallback, cited, followups } = deterministicAnswer(question, ctx);

  const systemPrompt = `You are an environmental monitoring copilot grounded strictly in the provided data.
Answer the user's question using ONLY the JSON facts supplied. Never invent numbers or standards.
Return STRICT JSON only:
{ "answer": "concise factual answer referencing specific values", "confidence": 0.0-1.0 }
If the data does not answer the question, say what data would be needed.`;

  const userPrompt = `Question: ${question}
Device count: ${ctx.deviceCount}
Latest readings: ${JSON.stringify(ctx.current)}
Per-sensor status: ${JSON.stringify(ctx.assessments)}
Series stats (avg/min/max/direction/volatility): ${JSON.stringify(ctx.stats.slice(0, 10))}
Anomalies: ${JSON.stringify(ctx.anomalies)}
Compliance (${ctx.compliance.framework}): ${JSON.stringify(ctx.compliance)}
Recent alerts: ${JSON.stringify(ctx.alerts.slice(0, 5))}
Health score: ${ctx.healthScore} (risk ${ctx.riskLevel})
Base every claim on these facts only.`;

  const hasData = ctx.readingCount > 0;
  let llm = null;
  if (hasData) {
    const { data, meta } = await callJSON({ system: systemPrompt, user: userPrompt, temperature: 0.2, maxTokens: 400 });
    if (!meta.error && data?.answer) llm = data;
  }

  return {
    generatedAt: new Date().toISOString(),
    question,
    answer: llm?.answer || fallback,
    confidence: llm?.confidence ?? (ctx.readingCount ? 0.8 : 0.3),
    grounded: Boolean(ctx.readingCount),
    deterministic: !llm,
    tools: TOOLS,
    followups,
    context: {
      deviceCount: ctx.deviceCount,
      readingCount: ctx.readingCount,
      healthScore: ctx.healthScore,
      riskLevel: ctx.riskLevel,
      anomalies: ctx.anomalies.length,
      statuses: ctx.assessments.map(a => ({ sensor: a.sensor, label: a.label, level: a.level, value: a.value, unit: a.unit })),
      compliance: { framework: ctx.compliance.framework, compliant: ctx.compliance.compliant, exceedances: (ctx.compliance.exceedances || []).slice(0, 3) },
      recentAlerts: ctx.alerts.slice(0, 5),
    },
    cited,
    references: cited,
  };
}

/**
 * Build a live context object shaped for the legacy chatbot service
 * (ai-service.buildSystemPrompt / handleToolCalls). Maps current readings,
 * devices and health into the flat keys the chatbot expects.
 */
async function buildLiveContext(input = {}) {
  const ctx = await gatherContext(input);
  const s = {};
  for (const { sensor, latest } of ctx.stats) {
    s[sensor] = latest;
  }
  return {
    ehi: ctx.healthScore,
    pm25: s.pm25,
    ph: s.ph,
    temperature: s.tmp,
    humidity: s.hum,
    co2: s.co2,
    tds: s.tds,
    dO: s.dO,
    voc: s.voc,
    mq: s.mq,
    sm: s.sm,
    wT: s.wT,
    tb: s.tb,
    physical: { ...ctx.current },
    connectedDevices: ctx.deviceCount || 'N/A',
    activeRules: 0,
    actuatorsRunning: 'None',
    location: input.location || 'Unknown',
    lat: input.lat,
    lng: input.lng,
    live: {
      deviceCount: ctx.deviceCount,
      readingCount: ctx.readingCount,
      healthScore: ctx.healthScore,
      riskLevel: ctx.riskLevel,
      anomalies: ctx.anomalies,
      compliance: ctx.compliance,
      alerts: ctx.alerts,
      stats: ctx.stats.slice(0, 10),
      statuses: ctx.assessments.map(a => ({ sensor: a.sensor, label: a.label, level: a.level, value: a.value, unit: a.unit })),
    },
  };
}

async function runCopilot(input = {}) {
  const key = cacheKey(['ai-copilot', input]);
  return withCache(key, 60000, () => runCopilotImpl(input));
}

/**
 * Streaming copilot: streams the deterministic answer word-by-word for instant
 * UI feedback, then augments with an LLM narration when available. `onChunk`
 * receives partial text; resolves with the full response object.
 */
async function streamCopilot({ onChunk, ...rest } = {}) {
  if (!rest.question || typeof rest.question !== 'string' || rest.question.trim().length < 3) {
    const short = { answer: 'Ask me a question about your monitoring data.', cited: [], tools: TOOLS, grounded: false, error: 'Question too short', followups: ['What is the current air quality status?', 'Are there any anomalies right now?'] };
    if (onChunk) onChunk(short.answer);
    return short;
  }

  const ctx = await gatherContext(rest);
  const { answer: fallback, cited, followups } = deterministicAnswer(rest.question, ctx);

  // Stream the deterministic ground truth immediately — no LLM wait.
  if (onChunk) {
    for (const word of fallback.split(/(\s+)/)) onChunk(word);
  }

  const systemPrompt = `You are an environmental monitoring copilot grounded strictly in the provided data.
Answer the user's question using ONLY the JSON facts supplied. Never invent numbers or standards.
Return STRICT JSON only:
{ "answer": "concise factual answer referencing specific values", "confidence": 0.0-1.0 }
If the data does not answer the question, say what data would be needed.`;

  const userPrompt = `Question: ${rest.question}
Device count: ${ctx.deviceCount}
Latest readings: ${JSON.stringify(ctx.current)}
Per-sensor status: ${JSON.stringify(ctx.assessments)}
Series stats (avg/min/max/direction/volatility): ${JSON.stringify(ctx.stats.slice(0, 10))}
Anomalies: ${JSON.stringify(ctx.anomalies)}
Compliance (${ctx.compliance.framework}): ${JSON.stringify(ctx.compliance)}
Recent alerts: ${JSON.stringify(ctx.alerts.slice(0, 5))}
Health score: ${ctx.healthScore} (risk ${ctx.riskLevel})
Base every claim on these facts only.`;

  let llm = null;
  if (ctx.readingCount > 0) {
    const { data, meta } = await callJSON({ system: systemPrompt, user: userPrompt, temperature: 0.2, maxTokens: 400 });
    if (!meta.error && data?.answer) llm = data;
  }

  return {
    generatedAt: new Date().toISOString(),
    question: rest.question,
    answer: llm?.answer || fallback,
    confidence: llm?.confidence ?? (ctx.readingCount ? 0.8 : 0.3),
    grounded: Boolean(ctx.readingCount),
    deterministic: !llm,
    tools: TOOLS,
    followups,
    context: {
      deviceCount: ctx.deviceCount,
      readingCount: ctx.readingCount,
      healthScore: ctx.healthScore,
      riskLevel: ctx.riskLevel,
      anomalies: ctx.anomalies.length,
      statuses: ctx.assessments.map(a => ({ sensor: a.sensor, label: a.label, level: a.level, value: a.value, unit: a.unit })),
      compliance: { framework: ctx.compliance.framework, compliant: ctx.compliance.compliant, exceedances: (ctx.compliance.exceedances || []).slice(0, 3) },
      recentAlerts: ctx.alerts.slice(0, 5),
    },
    cited,
    references: cited,
  };
}

module.exports = { runCopilot, streamCopilot, gatherContext, buildLiveContext, deterministicAnswer, detectIntents, TOOLS };
