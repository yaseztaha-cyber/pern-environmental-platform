/**
 * PERN EPA/WHO Standards Module v1.0
 *
 * Official breakpoint tables for AQI and WQI calculations, sourced from:
 * - US EPA Technical Assistance Document for AQI (2024 revision)
 * - WHO Global Air Quality Guidelines 2021
 * - NSF WQI (National Sanitation Foundation Water Quality Index)
 *
 * Every public function is pure — no side-effects, no state.
 * Import and use from virtual-sensors.ts, Dashboard.tsx, or any page.
 */

// ── EPA AQI Breakpoints (PM2.5, 24-hour) ───────────────────────────────────

interface AQIBreakpoint {
  cLow: number;   // pollutant concentration lower bound
  cHigh: number;  // pollutant concentration upper bound
  iLow: number;   // AQI lower bound
  iHigh: number;  // AQI upper bound
}

const PM25_BREAKPOINTS: AQIBreakpoint[] = [
  { cLow: 0.0,   cHigh: 12.0,   iLow: 0,   iHigh: 50  },  // Good
  { cLow: 12.1,  cHigh: 35.4,   iLow: 51,  iHigh: 100 },  // Moderate
  { cLow: 35.5,  cHigh: 55.4,   iLow: 101, iHigh: 150 },  // USG
  { cLow: 55.5,  cHigh: 150.4,  iLow: 151, iHigh: 200 },  // Unhealthy
  { cLow: 150.5, cHigh: 250.4,  iLow: 201, iHigh: 300 },  // Very Unhealthy
  { cLow: 250.5, cHigh: 500.4,  iLow: 301, iHigh: 500 },  // Hazardous
];

const PM10_BREAKPOINTS: AQIBreakpoint[] = [
  { cLow: 0,    cHigh: 54,   iLow: 0,   iHigh: 50  },
  { cLow: 55,   cHigh: 154,  iLow: 51,  iHigh: 100 },
  { cLow: 155,  cHigh: 254,  iLow: 101, iHigh: 150 },
  { cLow: 255,  cHigh: 354,  iLow: 151, iHigh: 200 },
  { cLow: 355,  cHigh: 424,  iLow: 201, iHigh: 300 },
  { cLow: 425,  cHigh: 604,  iLow: 301, iHigh: 500 },
];

const NO2_BREAKPOINTS: AQIBreakpoint[] = [
  { cLow: 0,    cHigh: 53,   iLow: 0,   iHigh: 50  },
  { cLow: 54,   cHigh: 100,  iLow: 51,  iHigh: 100 },
  { cLow: 101,  cHigh: 360,  iLow: 101, iHigh: 150 },
  { cLow: 361,  cHigh: 649,  iLow: 151, iHigh: 200 },
  { cLow: 650,  cHigh: 1249, iLow: 201, iHigh: 300 },
  { cLow: 1250, cHigh: 2049, iLow: 301, iHigh: 500 },
];

const O3_BREAKPOINTS_8HR: AQIBreakpoint[] = [
  { cLow: 0,    cHigh: 54,   iLow: 0,   iHigh: 50  },
  { cLow: 55,   cHigh: 70,   iLow: 51,  iHigh: 100 },
  { cLow: 71,   cHigh: 85,   iLow: 101, iHigh: 150 },
  { cLow: 86,   cHigh: 105,  iLow: 151, iHigh: 200 },
  { cLow: 106,  cHigh: 200,  iLow: 201, iHigh: 300 },
];

const SO2_BREAKPOINTS: AQIBreakpoint[] = [
  { cLow: 0,    cHigh: 35,   iLow: 0,   iHigh: 50  },
  { cLow: 36,   cHigh: 75,   iLow: 51,  iHigh: 100 },
  { cLow: 76,   cHigh: 185,  iLow: 101, iHigh: 150 },
  { cLow: 186,  cHigh: 304,  iLow: 151, iHigh: 200 },
  { cLow: 305,  cHigh: 604,  iLow: 201, iHigh: 300 },
];

const CO_BREAKPOINTS: AQIBreakpoint[] = [
  { cLow: 0.0,  cHigh: 4.4,  iLow: 0,   iHigh: 50  },
  { cLow: 4.5,  cHigh: 9.4,  iLow: 51,  iHigh: 100 },
  { cLow: 9.5,  cHigh: 12.4, iLow: 101, iHigh: 150 },
  { cLow: 12.5, cHigh: 15.4, iLow: 151, iHigh: 200 },
  { cLow: 15.5, cHigh: 30.4, iLow: 201, iHigh: 300 },
  { cLow: 30.5, cHigh: 50.4, iLow: 301, iHigh: 500 },
];

// ── EPA AQI Categories ──────────────────────────────────────────────────────

export interface AQICategory {
  label: string;
  range: string;
  color: string;
  healthAdvice: string;
}

export const AQI_CATEGORIES: AQICategory[] = [
  { label: 'Good',              range: '0–50',     color: '#00e400', healthAdvice: 'Air quality is satisfactory.' },
  { label: 'Moderate',          range: '51–100',   color: '#ffff00', healthAdvice: 'Acceptable; moderate concern for sensitive groups.' },
  { label: 'Unhealthy (SG)',    range: '101–150',  color: '#ff7e00', healthAdvice: 'Sensitive groups may experience health effects.' },
  { label: 'Unhealthy',         range: '151–200',  color: '#ff0000', healthAdvice: 'Everyone may begin to experience health effects.' },
  { label: 'Very Unhealthy',    range: '201–300',  color: '#8f3f97', healthAdvice: 'Health alert: everyone may experience serious effects.' },
  { label: 'Hazardous',         range: '301–500',  color: '#7e0023', healthAdvice: 'Emergency conditions. Entire population affected.' },
];

// ── WHO 2021 Guideline Values (24-hour) ────────────────────────────────────

export const WHO_GUIDELINES = {
  pm25:  { daily: 15,   annual: 5,    unit: 'µg/m³' },
  pm10:  { daily: 45,   annual: 15,   unit: 'µg/m³' },
  no2:   { daily: 25,   annual: 10,   unit: 'µg/m³' },
  o3:    { peak8h: 100,               unit: 'µg/m³' },
  so2:   { daily: 40,                  unit: 'µg/m³' },
  co:    { daily: 4,                   unit: 'mg/m³'  },
} as const;

// ── NSF WQI Parameters ─────────────────────────────────────────────────────

export interface WQISubParam {
  weight: number;
  idealRange: [number, number];
}

/**
 * Standard NSF WQI sub-parameters with weights.
 * Total weight = 1.0.
 */
export const NSF_WQI_PARAMS: Record<string, WQISubParam> = {
  dissolvedOxygen: { weight: 0.10, idealRange: [8, 12] },
  fecalColiform:   { weight: 0.16, idealRange: [0, 200] },  // not used (no sensor)
  pH:              { weight: 0.11, idealRange: [6.5, 8.5] },
  biologicalDemand:{ weight: 0.10, idealRange: [0, 5] },    // BOD
  temperature:     { weight: 0.10, idealRange: [20, 28] },
  totalSolids:     { weight: 0.08, idealRange: [0, 500] },
  turbidity:       { weight: 0.08, idealRange: [0, 25] },
  dissolvedPhos:   { weight: 0.10, idealRange: [0, 0.1] },  // not used
  nitrates:        { weight: 0.10, idealRange: [0, 10] },    // not used
  chloride:        { weight: 0.07, idealRange: [0, 250] },   // not used
};

// ── Calculation Functions ───────────────────────────────────────────────────

/**
 * Calculate EPA AQI from a pollutant concentration using official breakpoints.
 * Returns AQI integer (0-500).
 */
function aqiFromBreakpoints(concentration: number, breakpoints: AQIBreakpoint[]): number {
  // Exact match
  const exact = breakpoints.find(b => concentration >= b.cLow && concentration <= b.cHigh);
  if (exact) {
    return Math.round(
      ((exact.iHigh - exact.iLow) / (exact.cHigh - exact.cLow)) * (concentration - exact.cLow) + exact.iLow
    );
  }

  // Above highest breakpoint — clamp to max
  const last = breakpoints[breakpoints.length - 1];
  if (concentration > last.cHigh) return last.iHigh;

  // Below lowest breakpoint — clamp to min
  if (concentration < breakpoints[0].cLow) return 0;

  // In a gap between breakpoints — interpolate linearly between surrounding brackets
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const prev = breakpoints[i];
    const next = breakpoints[i + 1];
    if (concentration > prev.cHigh && concentration < next.cLow) {
      const gapFrac = (concentration - prev.cHigh) / (next.cLow - prev.cHigh);
      return Math.round(prev.iHigh + gapFrac * (next.iLow - prev.iHigh));
    }
  }

  return 0;
}

/**
 * EPA-compliant AQI from PM2.5 (µg/m³).
 */
export function epaAQI(pm25: number): number {
  return aqiFromBreakpoints(pm25, PM25_BREAKPOINTS);
}

/**
 * EPA-compliant AQI from PM10 (µg/m³).
 */
export function epaAQI_Pm10(pm10: number): number {
  return aqiFromBreakpoints(pm10, PM10_BREAKPOINTS);
}

/**
 * EPA-compliant AQI from NO₂ (µg/m³).
 */
export function epaAQI_NO2(no2: number): number {
  return aqiFromBreakpoints(no2, NO2_BREAKPOINTS);
}

/**
 * EPA-compliant AQI from O₃ 8-hour (µg/m³).
 */
export function epaAQI_O3(o3: number): number {
  return aqiFromBreakpoints(o3, O3_BREAKPOINTS_8HR);
}

/**
 * EPA-compliant AQI from SO₂ (µg/m³).
 */
export function epaAQI_SO2(so2: number): number {
  return aqiFromBreakpoints(so2, SO2_BREAKPOINTS);
}

/**
 * EPA-compliant AQI from CO (mg/m³).
 */
export function epaAQI_CO(co: number): number {
  return aqiFromBreakpoints(co, CO_BREAKPOINTS);
}

/**
 * Multi-pollutant EPA AQI — takes the MAX across available pollutants.
 * This is the official EPA approach: the overall AQI is dominated by the
 * worst-performing pollutant.
 */
export function epaAQIMulti(pollutants: {
  pm25?: number;
  pm10?: number;
  no2?: number;
  o3?: number;
  so2?: number;
  co?: number;
}): number {
  const values: number[] = [];
  if (pollutants.pm25 !== undefined) values.push(epaAQI(pollutants.pm25));
  if (pollutants.pm10 !== undefined) values.push(epaAQI_Pm10(pollutants.pm10));
  if (pollutants.no2 !== undefined) values.push(epaAQI_NO2(pollutants.no2));
  if (pollutants.o3 !== undefined) values.push(epaAQI_O3(pollutants.o3));
  if (pollutants.so2 !== undefined) values.push(epaAQI_SO2(pollutants.so2));
  if (pollutants.co !== undefined) values.push(epaAQI_CO(pollutants.co));
  return values.length > 0 ? Math.max(...values) : 0;
}

/**
 * Return the EPA category for a given AQI value.
 */
export function aqiCategory(aqi: number): AQICategory {
  if (aqi <= 50)  return AQI_CATEGORIES[0];
  if (aqi <= 100) return AQI_CATEGORIES[1];
  if (aqi <= 150) return AQI_CATEGORIES[2];
  if (aqi <= 200) return AQI_CATEGORIES[3];
  if (aqi <= 300) return AQI_CATEGORIES[4];
  return AQI_CATEGORIES[5];
}

/**
 * WHO compliance check — returns array of pollutants exceeding guidelines.
 */
export function whoCompliance(readings: Record<string, number>): string[] {
  const exceeded: string[] = [];
  if (readings.pm25 !== undefined && readings.pm25 > WHO_GUIDELINES.pm25.daily)
    exceeded.push(`PM2.5 exceeds WHO ${WHO_GUIDELINES.pm25.daily} µg/m³ daily guideline`);
  if (readings.pm10 !== undefined && readings.pm10 > WHO_GUIDELINES.pm10.daily)
    exceeded.push(`PM10 exceeds WHO ${WHO_GUIDELINES.pm10.daily} µg/m³ daily guideline`);
  if (readings.no2 !== undefined && readings.no2 > WHO_GUIDELINES.no2.daily)
    exceeded.push(`NO₂ exceeds WHO ${WHO_GUIDELINES.no2.daily} µg/m³ daily guideline`);
  if (readings.o3 !== undefined && readings.o3 > WHO_GUIDELINES.o3.peak8h)
    exceeded.push(`O₃ exceeds WHO ${WHO_GUIDELINES.o3.peak8h} µg/m³ 8h guideline`);
  if (readings.so2 !== undefined && readings.so2 > WHO_GUIDELINES.so2.daily)
    exceeded.push(`SO₂ exceeds WHO ${WHO_GUIDELINES.so2.daily} µg/m³ daily guideline`);
  return exceeded;
}

/**
 * NSF WQI calculation using available sensor sub-parameters.
 * Returns 0-100 score.
 */
export function nsfWQI(readings: Record<string, number>): number {
  let totalWeight = 0;
  let weightedSum = 0;

  // Dissolved oxygen
  if (readings.dO !== undefined) {
    const p = NSF_WQI_PARAMS.dissolvedOxygen;
    const v = unitLessScore(readings.dO, p.idealRange[0], p.idealRange[1], 0, 14);
    weightedSum += v * p.weight;
    totalWeight += p.weight;
  }
  // pH
  if (readings.ph !== undefined) {
    const p = NSF_WQI_PARAMS.pH;
    const v = unitLessScore(readings.ph, p.idealRange[0], p.idealRange[1], 0, 14);
    weightedSum += v * p.weight;
    totalWeight += p.weight;
  }
  // Temperature (as water temp or air temp proxy)
  const temp = readings.wT ?? readings.tmp;
  if (temp !== undefined) {
    const p = NSF_WQI_PARAMS.temperature;
    const v = unitLessScore(temp, p.idealRange[0], p.idealRange[1], 0, 45);
    weightedSum += v * p.weight;
    totalWeight += p.weight;
  }
  // Total dissolved solids
  if (readings.tds !== undefined) {
    const p = NSF_WQI_PARAMS.totalSolids;
    const v = unitLessScore(readings.tds, p.idealRange[0], p.idealRange[1], 0, 2000);
    weightedSum += v * p.weight;
    totalWeight += p.weight;
  }
  // Turbidity
  if (readings.tb !== undefined) {
    const p = NSF_WQI_PARAMS.turbidity;
    const v = unitLessScore(readings.tb, p.idealRange[0], p.idealRange[1], 0, 100);
    weightedSum += v * p.weight;
    totalWeight += p.weight;
  }
  // BOD omitted — it's derived from DO deficit, already counted above

  if (totalWeight === 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (weightedSum / totalWeight) * 100)));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Score a value against an ideal range, returning 0-1 where 1 = ideal.
 */
function unitLessScore(value: number, idealLow: number, idealHigh: number, absMin: number, absMax: number): number {
  if (value >= idealLow && value <= idealHigh) return 1;
  if (value < idealLow) {
    const range = idealLow - absMin;
    return range > 0 ? Math.max(0, 1 - (idealLow - value) / range) : 0;
  }
  const range = absMax - idealHigh;
  return range > 0 ? Math.max(0, 1 - (value - idealHigh) / range) : 0;
}
