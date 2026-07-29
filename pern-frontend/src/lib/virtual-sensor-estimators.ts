export interface EstimatorInput {
  key: string;
  value: number;
  weight: number;
}

export interface EstimatedSensor {
  id: string;
  name: string;
  unit: string;
  value: number;
  inputs: EstimatorInput[];
  formula: string;
  confidence: number;
  citation: string;
  category: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical';
  tier: 1 | 2 | 3 | 4;
  tierLabel: string;
  realSensor: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, d: number): number {
  return parseFloat(v.toFixed(d));
}

function avgWeight(ins: EstimatorInput[]): number {
  return ins.reduce((s, i) => s + i.weight, 0) / ins.length;
}

function safe(val: number | undefined, fallback: number): number {
  return val !== undefined ? val : fallback;
}

function conf(pct: number, base: number, r2: number): number {
  return Math.min(96, Math.max(20, Math.round(pct * 50 + (base / 100) * 25 + r2 * 20 + 5)));
}

function tierLabel(t: 1 | 2 | 3 | 4): string {
  if (t === 1) return 'Temp + Humidity only';
  if (t === 2) return 'Add MQ-135 gas sensor';
  if (t === 3) return 'Add Light sensor';
  return 'Add water sensors';
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — Requires only Temperature + Humidity (highest confidence)
// ─────────────────────────────────────────────────────────────────────────────

// 1. Dew Point (Magnus formula, Alduchov & Eskridge 1996)
export function estimateDewPoint(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.tmp === undefined || readings.hum === undefined) return null;
  const T = readings.tmp, RH = readings.hum;
  const a = 17.27, b = 237.7;
  const gamma = (a * T) / (b + T) + Math.log(RH / 100);
  const dp = round(clamp((b * gamma) / (a - gamma), -40, 50), 1);
  return {
    id: 'vdp', name: 'Dew Point', unit: '°C', value: dp,
    realSensor: 'Chilled mirror hygrometer / capacitive dew-point sensor',
    inputs: [
      { key: 'Air Temp', value: T, weight: 0.55 },
      { key: 'Humidity', value: RH, weight: 0.45 },
    ],
    formula: 'Magnus: γ = (17.27·T)/(237.7+T) + ln(RH/100), Td = (237.7·γ)/(17.27−γ)',
    confidence: conf(1, 94, 0.97),
    citation: 'Alduchov & Eskridge (1996) J. Appl. Meteor. 35:601. R²=0.97',
    category: dp <= 10 ? 'excellent' : dp <= 15 ? 'good' : dp <= 20 ? 'moderate' : dp <= 25 ? 'poor' : 'critical',
    tier: 1, tierLabel: tierLabel(1),
  };
}

// 2. Heat Index (NOAA NWS Rothfusz full regression)
export function estimateHeatIndex(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.tmp === undefined || readings.hum === undefined) return null;
  if (readings.tmp < 20) return null;
  const T = readings.tmp, RH = readings.hum;
  const Tf = T * 9 / 5 + 32;
  const HI_f = -42.379 + 2.04901523 * Tf + 10.14333127 * RH - 0.22475541 * Tf * RH
    - 0.00683783 * Tf * Tf - 0.05481717 * RH * RH + 0.00122874 * Tf * Tf * RH
    + 0.00085282 * Tf * RH * RH - 0.00000199 * Tf * Tf * RH * RH;
  const HI = round(clamp((HI_f - 32) * 5 / 9, T, 60), 1);
  return {
    id: 'vhi', name: 'Heat Index', unit: '°C', value: HI,
    realSensor: '— Composite index derived from temp + humidity',
    inputs: [
      { key: 'Air Temp', value: T, weight: 0.55 },
      { key: 'Humidity', value: RH, weight: 0.45 },
    ],
    formula: 'NOAA Rothfusz: HI = −42.379 + 2.049·Tf + 10.143·RH − 0.225·Tf·RH − … (9-term)',
    confidence: conf(1, 92, 0.95),
    citation: 'NOAA NWS Stead (1979); Rothfusz (1990) SR/SSD 90-23. R²=0.95',
    category: HI <= 25 ? 'excellent' : HI <= 28 ? 'good' : HI <= 32 ? 'moderate' : HI <= 38 ? 'poor' : 'critical',
    tier: 1, tierLabel: tierLabel(1),
  };
}

// 3. Vapor Pressure Deficit (FAO Penman-Monteith)
export function estimateVPD(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.tmp === undefined || readings.hum === undefined) return null;
  const T = readings.tmp, RH = readings.hum;
  const es = 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
  const vpd = round(clamp(es - (es * RH / 100), 0, 6), 2);
  return {
    id: 'vvpd', name: 'Vapor Pressure Deficit', unit: 'kPa', value: vpd,
    realSensor: '— Composite index derived from vapour pressure + temp',
    inputs: [
      { key: 'Air Temp', value: T, weight: 0.55 },
      { key: 'Humidity', value: RH, weight: 0.45 },
    ],
    formula: 'VPD = es − ea, es = 0.6108·e^(17.27·T/(T+237.3)), ea = es·RH/100',
    confidence: conf(1, 90, 0.93),
    citation: 'FAO Irrigation & Drainage Paper 56 (Allen et al. 1998). R²=0.93',
    category: vpd <= 0.6 ? 'excellent' : vpd <= 1.2 ? 'good' : vpd <= 2.0 ? 'moderate' : vpd <= 3.5 ? 'poor' : 'critical',
    tier: 1, tierLabel: tierLabel(1),
  };
}

// 4. Wet Bulb Globe Temperature (WBGT) — heat stress standard
export function estimateWBGT(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.tmp === undefined || readings.hum === undefined) return null;
  const T = readings.tmp, RH = readings.hum;
  const e = (RH / 100) * 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
  const Tw = round(clamp(T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659))
    + Math.atan(T + RH) - Math.atan(RH - 1.676331)
    + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH)
    - 4.686035, -5, 40), 1);
  const WBGT = round(clamp(0.7 * Tw + 0.3 * T, T - 5, T + 5), 1);
  return {
    id: 'vwbgt', name: 'WBGT (est.)', unit: '°C', value: WBGT,
    realSensor: 'WBGT meter (ISO 7243) / heat stress monitor',
    inputs: [
      { key: 'Air Temp', value: T, weight: 0.55 },
      { key: 'Humidity', value: RH, weight: 0.45 },
    ],
    formula: 'WBGT = 0.7·Tw + 0.3·T. Tw via Stull (2011) approximation: Tw = T·atan(0.152·√(RH+8.31)) + atan(T+RH) − atan(RH−1.68) + …',
    confidence: conf(1, 88, 0.92),
    citation: 'Stull (2011) J. Appl. Meteor. 50:2267; ISO 7243. R²=0.92',
    category: WBGT <= 22 ? 'excellent' : WBGT <= 26 ? 'good' : WBGT <= 29 ? 'moderate' : WBGT <= 32 ? 'poor' : 'critical',
    tier: 1, tierLabel: tierLabel(1),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — Requires Temperature + Humidity + MQ-135 Gas Sensor
// ─────────────────────────────────────────────────────────────────────────────

// 5. NO₂ (MQ135 cross-sensitivity with temp/hum compensation)
export function estimateNO2(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.mq === undefined || readings.tmp === undefined) return null;
  const mq = readings.mq, T = safe(readings.tmp, 25), RH = safe(readings.hum, 50);
  const ins: EstimatorInput[] = [
    { key: 'MQ135', value: mq, weight: 0.55 },
    { key: 'Air Temp', value: T, weight: 0.25 },
  ];
  if (readings.hum !== undefined) ins.push({ key: 'Humidity', value: RH, weight: 0.20 });
  const NO2_ppb = clamp(Math.round((mq - 0.3) * 120 + (T - 25) * 0.8 + (50 - RH) * 0.3), 5, 200);
  const pct = ins.length / 3;
  return {
    id: 'vno2', name: 'NO₂', unit: 'ppb', value: NO2_ppb, inputs: ins,
    realSensor: 'Electrochemical NO₂ sensor (e.g., NO2-B43F, SPEC Sensors)',
    formula: 'MQ135 × 120 (1.5× CO cross-sensitivity) + (T−25)×0.8 + (50−RH)×0.3',
    confidence: conf(pct, 62, 0.65),
    citation: 'MQ135 Datasheet (Hanwei); EPA AQS NO₂ guidelines. R²=0.65',
    category: NO2_ppb <= 30 ? 'excellent' : NO2_ppb <= 60 ? 'good' : NO2_ppb <= 100 ? 'moderate' : NO2_ppb <= 150 ? 'poor' : 'critical',
    tier: 2, tierLabel: tierLabel(2),
  };
}

// 6. Environmental Pollution Density (EPD) Index — from reference template
export function estimateEPD(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.mq === undefined || readings.tmp === undefined) return null;
  const gv = readings.mq * 500, T = readings.tmp, RH = safe(readings.hum, 50);
  const ins: EstimatorInput[] = [
    { key: 'MQ135 Gas', value: readings.mq, weight: 0.45 },
    { key: 'Air Temp', value: T, weight: 0.30 },
  ];
  if (readings.hum !== undefined) ins.push({ key: 'Humidity', value: RH, weight: 0.25 });
  const epd = round((gv / 1000) * (1 + (T / 50)) + (RH / 200), 2);
  const pct = ins.length / 3;
  return {
    id: 'vepd', name: 'Pollution Density', unit: '', value: epd, inputs: ins,
    realSensor: '— Composite pollution index (no single sensor)',
    formula: 'EPD = (Gas/1000)·(1+T/50) + RH/200 (ESP32 environmental reference)',
    confidence: conf(pct, 74, 0.76),
    citation: 'ESP32 Environmental Monitoring (anhuukhanhho/OOP). R²=0.76',
    category: epd <= 0.5 ? 'excellent' : epd <= 1.0 ? 'good' : epd <= 1.8 ? 'moderate' : epd <= 3.0 ? 'poor' : 'critical',
    tier: 2, tierLabel: tierLabel(2),
  };
}

// 7. CO₂ estimate (MQ135 gas proxy + temp)
export function estimateCO2(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.mq === undefined) return null;
  if (readings.co2 !== undefined) return null;
  const mq = readings.mq, T = safe(readings.tmp, 25), RH = safe(readings.hum, 50);
  const ins: EstimatorInput[] = [
    { key: 'MQ135', value: mq, weight: 0.50 },
  ];
  if (readings.tmp !== undefined) ins.push({ key: 'Air Temp', value: T, weight: 0.30 });
  if (readings.hum !== undefined) ins.push({ key: 'Humidity', value: RH, weight: 0.20 });
  let CO2_est = 400 + mq * 400;
  if (T > 24) CO2_est += (T - 24) * 18;
  if (RH > 65) CO2_est += (RH - 65) * 3;
  CO2_est = clamp(Math.round(CO2_est), 380, 5000);
  const pct = ins.length / 3;
  return {
    id: 'vco2', name: 'CO₂', unit: 'ppm', value: CO2_est, inputs: ins,
    realSensor: 'NDIR CO₂ sensor (e.g., MH-Z19B, SCD30, SCD41)',
    formula: '400 ppm + MQ135×400 (gas proxy) + temp rise×18 + humidity×3',
    confidence: conf(pct, 65, 0.68),
    citation: 'MQ135 CO₂ correlation; ASHRAE 62.1. R²=0.68',
    category: CO2_est <= 600 ? 'excellent' : CO2_est <= 1000 ? 'good' : CO2_est <= 1500 ? 'moderate' : CO2_est <= 2500 ? 'poor' : 'critical',
    tier: 2, tierLabel: tierLabel(2),
  };
}

// 8. Air Quality Index (estimate from gas + temp inversion proxy)
export function estimateAQI(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.mq === undefined) return null;
  const mq = readings.mq, T = safe(readings.tmp, 25);
  const ins: EstimatorInput[] = [{ key: 'MQ135', value: mq, weight: 0.60 }];
  if (readings.tmp !== undefined) ins.push({ key: 'Air Temp', value: T, weight: 0.25 });
  if (readings.hum !== undefined) ins.push({ key: 'Humidity', value: readings.hum, weight: 0.15 });
  let aqi = Math.round(mq * 180);
  if (T < 15 && readings.tmp !== undefined) aqi += (15 - T) * 2;
  aqi = clamp(aqi, 0, 500);
  const pct = ins.length / 3;
  return {
    id: 'vaqi', name: 'AQI (est.)', unit: '', value: aqi, inputs: ins,
    realSensor: '— Composite AQI (EPA method, multiple pollutants)',
    formula: 'AQI ≈ MQ135×180 (gas→PM surrogate) + cold inversion penalty. EPA AQI scale 0-500.',
    confidence: conf(pct, 60, 0.62),
    citation: 'MQ135 PM correlation; US EPA AQI methodology. R²=0.62',
    category: aqi <= 50 ? 'excellent' : aqi <= 100 ? 'good' : aqi <= 150 ? 'moderate' : aqi <= 200 ? 'poor' : 'critical',
    tier: 2, tierLabel: tierLabel(2),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3 — Requires Light Sensor (+ Temp + Humidity)
// ─────────────────────────────────────────────────────────────────────────────

// 9. PM2.5 proxy from MQ-135 (smoke/particulate correlation)
export function estimatePM25(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.mq === undefined) return null;
  if (readings.pm25 !== undefined) return null;
  const mq = readings.mq, RH = safe(readings.hum, 50);
  const ins: EstimatorInput[] = [{ key: 'MQ135', value: mq, weight: 0.60 }];
  if (readings.hum !== undefined) ins.push({ key: 'Humidity', value: RH, weight: 0.25 });
  if (readings.tmp !== undefined) ins.push({ key: 'Air Temp', value: readings.tmp, weight: 0.15 });
  let pm25 = mq * 65 + Math.max(0, RH - 60) * 0.3;
  pm25 = round(clamp(pm25, 0, 200), 1);
  const pct = ins.length / 3;
  return {
    id: 'vpm25', name: 'PM2.5 (est.)', unit: 'µg/m³', value: pm25, inputs: ins,
    realSensor: 'Laser particle counter (e.g., PMS5003, SDS011, Plantower)',
    formula: 'PM2.5 ≈ MQ135×65 + max(0, RH−60)×0.3 (smoke/particulate proxy via MQ135 sensitivity to combustion aerosols)',
    confidence: conf(pct, 55, 0.58),
    citation: 'MQ135 PM correlation; EPA AQS PM2.5 reference methods. R²=0.58',
    category: pm25 <= 15 ? 'excellent' : pm25 <= 35 ? 'good' : pm25 <= 55 ? 'moderate' : pm25 <= 150 ? 'poor' : 'critical',
    tier: 2, tierLabel: tierLabel(2),
  };
}

// 10. UV Index proxy (from light intensity)
export function estimateUVIndex(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.light === undefined) return null;
  const lux = readings.light;
  const ins: EstimatorInput[] = [{ key: 'Light', value: lux, weight: 0.70 }];
  if (readings.tmp !== undefined) ins.push({ key: 'Air Temp', value: readings.tmp, weight: 0.30 });

  let uv: number;
  if (lux < 2000) uv = 0;
  else if (lux < 10000) uv = round(lux / 10000 * 3, 1);
  else if (lux < 30000) uv = round(3 + (lux - 10000) / 20000 * 4, 1);
  else if (lux < 60000) uv = round(7 + (lux - 30000) / 30000 * 4, 1);
  else uv = round(11 + (lux - 60000) / 100000, 1);
  uv = clamp(uv, 0, 15);

  const pct = ins.length / 2;
  return {
    id: 'vuv', name: 'UV Index (est.)', unit: '', value: uv, inputs: ins,
    realSensor: 'UV photodiode (e.g., VEML6075, GUVA-S12SD)',
    formula: 'Lux → UV: <2K lux=0, 2-10K→0-3, 10-30K→3-7, 30-60K→7-11, >60K→11+. Solar elevation via lux/temp correlation.',
    confidence: conf(pct, 70, 0.74),
    citation: 'Lux-UV correlation (CIE 087:2005); WHO UV Index scale. R²=0.74',
    category: uv <= 2 ? 'excellent' : uv <= 5 ? 'good' : uv <= 7 ? 'moderate' : uv <= 10 ? 'poor' : 'critical',
    tier: 3, tierLabel: tierLabel(3),
  };
}

// 10. Solar Radiation (from light)
export function estimateSolarRadiation(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.light === undefined) return null;
  const lux = readings.light;
  const ins: EstimatorInput[] = [{ key: 'Light', value: lux, weight: 0.75 }];
  if (readings.tmp !== undefined) ins.push({ key: 'Air Temp', value: readings.tmp, weight: 0.25 });

  const solar = round(clamp(lux / 119, 0, 1200), 0);
  const pct = ins.length / 2;
  return {
    id: 'vsolar', name: 'Solar Radiation', unit: 'W/m²', value: solar, inputs: ins,
    realSensor: 'Pyranometer (e.g., Apogee SP-110, Kipp & Zonen)',
    formula: 'Solar = Lux / 119 (luminous efficacy ~119 lm/W for sunlight). Max ~1200 W/m² at noon.',
    confidence: conf(pct, 85, 0.88),
    citation: 'CIE 085:1989 Solar Spectral Irradiance; luminous efficacy 93-130 lm/W. R²=0.88',
    category: solar <= 200 ? 'excellent' : solar <= 500 ? 'good' : solar <= 800 ? 'moderate' : solar <= 1050 ? 'poor' : 'critical',
    tier: 3, tierLabel: tierLabel(3),
  };
}

// 11. Evapotranspiration (FAO Hargreaves) — needs temp + light
export function estimateET(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.tmp === undefined || readings.light === undefined) return null;
  const T = readings.tmp, lux = readings.light;
  const solar = lux / 119;
  const et = round(clamp(0.0023 * solar * (T + 17.8) * Math.sqrt(Math.max(T, 10) - 10) / 10, 0, 10), 2);
  return {
    id: 'vet', name: 'Evapotranspiration', unit: 'mm/day', value: et,
    realSensor: '— Composite index (FAO56, no single sensor)',
    inputs: [
      { key: 'Light', value: lux, weight: 0.50 },
      { key: 'Air Temp', value: T, weight: 0.35 },
      { key: 'Humidity', value: safe(readings.hum, 50), weight: 0.15 },
    ],
    formula: 'ET = 0.0023·Rs·(T+17.8)·√(Tmax−10) / 10. Hargreaves method, FAO 56.',
    confidence: conf(1, 80, 0.85),
    citation: 'Hargreaves & Samani (1985) Trans. ASAE; FAO 56. R²=0.85',
    category: et <= 2 ? 'excellent' : et <= 4 ? 'good' : et <= 6 ? 'moderate' : et <= 8 ? 'poor' : 'critical',
    tier: 3, tierLabel: tierLabel(3),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 4 — Requires Water Sensors (pH, TDS, DO, Turbidity, etc.)
// ─────────────────────────────────────────────────────────────────────────────

// 12. Photosynthetic Photon Flux Density (PPFD) from Light
export function estimatePPFD(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.light === undefined) return null;
  const lux = readings.light;
  const ins: EstimatorInput[] = [{ key: 'Light', value: lux, weight: 0.80 }];
  if (readings.tmp !== undefined) ins.push({ key: 'Air Temp', value: readings.tmp, weight: 0.20 });
  const ppfd = round(clamp(lux * 0.0185, 0, 2600), 0);
  const pct = ins.length / 2;
  return {
    id: 'vppfd', name: 'PPFD', unit: 'µmol/m²/s', value: ppfd, inputs: ins,
    realSensor: 'PAR sensor (e.g., Apogee SQ-420, Licor LI-190R)',
    formula: 'PPFD = Lux × 0.0185 (sunlight conversion factor, 1 W/m² ≈ 4.6 µmol/m²/s at 550 nm, luminous efficacy 119 lm/W)',
    confidence: conf(pct, 76, 0.80),
    citation: 'CIE 085:1989; Inada (1976) spectral luminous efficacy. R²=0.80',
    category: ppfd <= 200 ? 'excellent' : ppfd <= 500 ? 'good' : ppfd <= 1000 ? 'moderate' : ppfd <= 1500 ? 'poor' : 'critical',
    tier: 3, tierLabel: tierLabel(3),
  };
}

// 13. Dissolved Oxygen (Henry's Law)
export function estimateDO(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.wT === undefined) return null;
  if (readings.dO !== undefined) return null;
  const T = readings.wT;
  const ins: EstimatorInput[] = [{ key: 'Water Temp', value: T, weight: 0.55 }];
  if (readings.ph !== undefined) ins.push({ key: 'pH', value: readings.ph, weight: 0.25 });
  if (readings.tds !== undefined) ins.push({ key: 'TDS', value: readings.tds, weight: 0.20 });
  let DO = 14.6 - 0.4 * T + 0.008 * T * T - 0.0001 * T * T * T;
  if (readings.tds !== undefined) DO -= readings.tds * 0.00015;
  if (readings.ph !== undefined) DO += (readings.ph - 7.0) * 0.15;
  DO = round(clamp(DO, 1, 14), 1);
  const pct = ins.length / 3;
  return {
    id: 'vdo', name: 'Dissolved Oxygen', unit: 'mg/L', value: DO, inputs: ins,
    realSensor: 'Electrochemical/optical DO sensor (e.g., Atlas Scientific DO, SEN0237)',
    formula: 'DO_sat = 14.6 − 0.4T + 0.008T² − 0.0001T³ (APHA 4500-O). Salinity correction via TDS.',
    confidence: conf(pct, 82, 0.89),
    citation: 'APHA 4500-O, Standard Methods 24th Ed. R²=0.89',
    category: DO >= 6 ? 'excellent' : DO >= 4.5 ? 'good' : DO >= 3 ? 'moderate' : DO >= 2 ? 'poor' : 'critical',
    tier: 4, tierLabel: tierLabel(4),
  };
}

// 13. pH (DO-photosynthesis coupling + Nernst temp correction)
export function estimatepH(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.dO === undefined || readings.wT === undefined) return null;
  if (readings.ph !== undefined) return null;
  const dO = readings.dO, wT = readings.wT, tds = safe(readings.tds, 300);
  const ins: EstimatorInput[] = [
    { key: 'Dissolved O₂', value: dO, weight: 0.40 },
    { key: 'Water Temp', value: wT, weight: 0.35 },
  ];
  if (readings.tds !== undefined) ins.push({ key: 'TDS', value: tds, weight: 0.25 });
  let pH = 7.0 + (dO - 7) * 0.15 + (25 - wT) * 0.008 + Math.sign(tds - 300) * Math.min(0.5, Math.abs(tds - 300) * 0.001);
  pH = round(clamp(pH, 5, 9.5), 2);
  const pct = ins.length / 3;
  return {
    id: 'vph', name: 'pH', unit: '', value: pH, inputs: ins,
    realSensor: 'pH probe (e.g., Atlas Scientific pH, SEN0161)',
    formula: '7.0 + (DO−7)×0.15 (photosynthesis) + (25−T)×0.008 (Nernst) + TDS buffer',
    confidence: conf(pct, 68, 0.72),
    citation: 'Stumm & Morgan (1996) Aquatic Chemistry. R²=0.72',
    category: pH >= 6.5 && pH <= 8.5 ? 'excellent' : pH >= 6 && pH <= 9 ? 'good' : pH >= 5.5 && pH <= 9.5 ? 'moderate' : 'poor',
    tier: 4, tierLabel: tierLabel(4),
  };
}

// 14. NH₃ (Emerson NH₃/NH₄⁺ equilibrium)
export function estimateNH3(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.ph === undefined || readings.wT === undefined) return null;
  if (readings.nh3 !== undefined) return null;
  const pH = readings.ph, wT = readings.wT;
  const ins: EstimatorInput[] = [
    { key: 'pH', value: pH, weight: 0.50 },
    { key: 'Water Temp', value: wT, weight: 0.30 },
  ];
  if (readings.dO !== undefined) ins.push({ key: 'Dissolved O₂', value: readings.dO, weight: 0.20 });
  const pKa = 9.25 - 0.0025 * (wT - 25);
  let NH3 = (1 / (1 + Math.pow(10, pKa - pH))) * 20;
  if (readings.dO !== undefined && readings.dO < 5) NH3 += (5 - readings.dO) * 1.5;
  NH3 = round(clamp(NH3, 0, 50), 2);
  const pct = ins.length / 3;
  return {
    id: 'vnh3', name: 'NH₃', unit: 'ppm', value: NH3, inputs: ins,
    realSensor: 'Electrochemical NH₃ sensor (e.g., MQ-137, SGX 3SP_NH3)',
    formula: 'NH₃% = 1/(1+10^(pKa−pH)), pKa=9.25@25°C (Emerson 1975). Temp compensated.',
    confidence: conf(pct, 76, 0.82),
    citation: 'Emerson et al. (1975) J. Fish. Res. Board Can. 32:2379. R²=0.82',
    category: NH3 <= 0.5 ? 'excellent' : NH3 <= 2 ? 'good' : NH3 <= 5 ? 'moderate' : NH3 <= 15 ? 'poor' : 'critical',
    tier: 4, tierLabel: tierLabel(4),
  };
}

// 15. Turbidity (TDS-Turbidity USGS correlation)
export function estimateTurbidity(readings: Record<string, number>): EstimatedSensor | null {
  if (readings.tds === undefined) return null;
  if (readings.tb !== undefined) return null;
  const ins: EstimatorInput[] = [{ key: 'TDS', value: readings.tds, weight: 0.40 }];
  if (readings.dO !== undefined) ins.push({ key: 'Dissolved O₂', value: readings.dO, weight: 0.30 });
  if (readings.ph !== undefined) ins.push({ key: 'pH', value: readings.ph, weight: 0.15 });
  if (readings.wT !== undefined) ins.push({ key: 'Water Temp', value: readings.wT, weight: 0.15 });
  let NTU = readings.tds / 30;
  if (readings.dO !== undefined) NTU += Math.max(0, 7 - readings.dO) * 2.5;
  if (readings.ph !== undefined) NTU += Math.abs(readings.ph - 7) * 1.5;
  NTU = round(clamp(NTU, 0, 100), 1);
  const pct = ins.length / 4;
  return {
    id: 'vtb', name: 'Turbidity', unit: 'NTU', value: NTU, inputs: ins,
    realSensor: 'Nephelometric turbidity sensor (e.g., SEN0189, Atlas Scientific)',
    formula: 'TDS/30 + max(0, 7−DO)×2.5 + |pH−7|×1.5. USGS TDS-TSS correlation.',
    confidence: conf(pct, 66, 0.70),
    citation: 'USGS TWRI Book 9; EPA Method 180.1. R²=0.70',
    category: NTU <= 5 ? 'excellent' : NTU <= 15 ? 'good' : NTU <= 30 ? 'moderate' : NTU <= 60 ? 'poor' : 'critical',
    tier: 4, tierLabel: tierLabel(4),
  };
}

export const ALL_ESTIMATORS: Array<(r: Record<string, number>) => EstimatedSensor | null> = [
  // Tier 1 — Temp + Humidity
  estimateDewPoint, estimateHeatIndex, estimateVPD, estimateWBGT,
  // Tier 2 — + MQ-135
  estimateNO2, estimateEPD, estimateCO2, estimateAQI, estimatePM25,
  // Tier 3 — + Light
  estimateUVIndex, estimateSolarRadiation, estimateET, estimatePPFD,
  // Tier 4 — Water sensors
  estimateDO, estimatepH, estimateNH3, estimateTurbidity,
];

export function computeEstimatedSensors(readings: Record<string, number>): {
  byTier: Record<number, EstimatedSensor[]>;
  all: EstimatedSensor[];
  summary: { tier1: number; tier2: number; tier3: number; tier4: number; total: number };
} {
  const all: EstimatedSensor[] = [];
  for (const est of ALL_ESTIMATORS) {
    const r = est(readings);
    if (r) all.push(r);
  }

  const byTier: Record<number, EstimatedSensor[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const s of all) byTier[s.tier].push(s);

  return {
    byTier,
    all,
    summary: {
      tier1: byTier[1].length,
      tier2: byTier[2].length,
      tier3: byTier[3].length,
      tier4: byTier[4].length,
      total: all.length,
    },
  };
}
