/**
 * PERN Dynamic Virtual Sensors (Soft Sensors) v3.1
 * 
 * Smart system that:
 * - Detects which physical sensors are available from the device
 * - Only computes virtual sensors when sufficient inputs exist
 * - Provides confidence scores based on data quality
 * - Uses scientific formulas from environmental monitoring literature
 * 
 * 10 virtual sensors:
 * 1. Air Quality Index (AQI)
 * 2. Water Quality Index (WQI)
 * 3. Environmental Risk Score
 * 4. Thermal Comfort Index
 * 5. Indoor Air Score
 * 6. Corrosion Index
 * 7. Biological Oxygen Demand (BOD)
 * 8. Agricultural Suitability
 * 9. Eutrophication Risk
 * 10. Human Exposure Index
 */

export interface VirtualSensorInput {
  sensorType: string;
  value: number;
  weight: number;
}

export interface VirtualSensorResult {
  id: string;
  name: string;
  value: number;
  unit: string;
  category: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical';
  inputs: VirtualSensorInput[];
  formula: string;
  confidence: number;
  icon: string;
  color: string;
  missingInputs?: string[];
}

// ==================== HELPER FUNCTIONS ====================

function categorize(value: number, thresholds: number[]): 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' {
  if (value <= thresholds[0]) return 'excellent';
  if (value <= thresholds[1]) return 'good';
  if (value <= thresholds[2]) return 'moderate';
  if (value <= thresholds[3]) return 'poor';
  return 'critical';
}

function calculateConfidence(inputs: VirtualSensorInput[], requiredCount: number): number {
  if (inputs.length === 0) return 0;
  const coverage = Math.min(inputs.length / requiredCount, 1);
  const avgWeight = inputs.reduce((sum, inp) => sum + inp.weight, 0) / inputs.length;
  let confidence = (coverage * 55) + (avgWeight * 30) + 15;
  return Math.min(Math.max(Math.round(confidence), 35), 98);
}

function colorFor(category: string): string {
  if (category === 'excellent') return '#10b981';
  if (category === 'good') return '#22c55e';
  if (category === 'moderate') return '#eab308';
  if (category === 'poor') return '#f97316';
  return '#ef4444';
}

// ==================== VIRTUAL SENSOR FUNCTIONS ====================

import { epaAQIMulti, aqiCategory } from './epa-standards';

// 1. Air Quality Index (AQI) - EPA standard
export function calculateAQI(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['pm25'];

  if (readings.pm25 !== undefined) availableInputs.push({ sensorType: 'pm25', value: readings.pm25, weight: 0.55 });
  if (readings.pm10 !== undefined) availableInputs.push({ sensorType: 'pm10', value: readings.pm10, weight: 0.15 });
  if (readings.no2 !== undefined) availableInputs.push({ sensorType: 'no2', value: readings.no2, weight: 0.08 });
  if (readings.o3 !== undefined) availableInputs.push({ sensorType: 'o3', value: readings.o3, weight: 0.07 });
  if (readings.so2 !== undefined) availableInputs.push({ sensorType: 'so2', value: readings.so2, weight: 0.05 });
  if (readings.co !== undefined) availableInputs.push({ sensorType: 'co', value: readings.co, weight: 0.05 });
  if (readings.mq !== undefined) availableInputs.push({ sensorType: 'mq135', value: readings.mq, weight: 0.05 });

  if (availableInputs.length < 1) return null;

  // Multi-pollutant EPA AQI (official method: worst pollutant wins)
  const aqi = epaAQIMulti({
    pm25: readings.pm25,
    pm10: readings.pm10,
    no2: readings.no2,
    o3: readings.o3,
    so2: readings.so2,
    co: readings.co,
  });

  // Adjust for MQ135 (non-EPA sensor) — additive penalty above threshold
  let adjustedAqi = aqi;
  if (readings.mq !== undefined && readings.mq > 1.0) {
    adjustedAqi = Math.min(500, aqi + (readings.mq - 1.0) * 30);
  }

  const cat = aqiCategory(adjustedAqi);
  const category = cat.label.includes('Good') ? 'excellent' as const
    : cat.label === 'Moderate' ? 'good' as const
    : cat.label.includes('USG') || cat.label.includes('SG') ? 'moderate' as const
    : cat.label === 'Unhealthy' ? 'poor' as const
    : 'critical' as const;

  return {
    id: 'aqi', name: 'Air Quality Index', value: Math.round(adjustedAqi), unit: '', category,
    inputs: availableInputs,
    formula: 'EPA AQI breakpoints (PM2.5/PM10/NO₂/O₃/SO₂/CO multi-pollutant) + MQ135',
    confidence: calculateConfidence(availableInputs, 4),
    icon: 'Wind', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 2. Water Quality Index (WQI)
export function calculateWQI(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['ph', 'tds'];

  if (readings.ph !== undefined) availableInputs.push({ sensorType: 'ph', value: readings.ph, weight: 0.32 });
  if (readings.tds !== undefined) availableInputs.push({ sensorType: 'tds', value: readings.tds, weight: 0.28 });
  if (readings.tb !== undefined) availableInputs.push({ sensorType: 'turbidity', value: readings.tb, weight: 0.22 });
  if (readings.dO !== undefined) availableInputs.push({ sensorType: 'dissolvedO2', value: readings.dO, weight: 0.12 });
  if (readings.wT !== undefined) availableInputs.push({ sensorType: 'waterTemp', value: readings.wT, weight: 0.06 });

  if (availableInputs.length < 2) return null;

  const ph = readings.ph;
  const tds = readings.tds;
  const tb = readings.tb;
  const dO = readings.dO;

  let wqi = 0;
  if (ph !== undefined) wqi += Math.abs(ph - 7.5) * 18;
  if (tds !== undefined) wqi += tds > 500 ? (tds - 500) * 0.085 : 0;
  if (tb !== undefined) wqi += tb * 7.5;
  if (dO !== undefined) wqi += dO < 6 ? (6 - dO) * 12 : 0;
  wqi = Math.max(5, Math.min(100, wqi));

  const category = categorize(wqi, [18, 35, 55, 75, 90]);
  return {
    id: 'wqi', name: 'Water Quality Index', value: Math.round(wqi), unit: '', category,
    inputs: availableInputs,
    formula: 'Additive penalty: pH deviation(32%) + TDS excess(28%) + Turbidity(22%) + DO deficit(12%) + WaterTemp(6%)',
    confidence: calculateConfidence(availableInputs, 4),
    icon: 'Droplet', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 3. Environmental Risk Score
export function calculateEnvironmentalRisk(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['pm25', 'ph'];

  if (readings.pm25 !== undefined) availableInputs.push({ sensorType: 'pm25', value: readings.pm25, weight: 0.35 });
  if (readings.ph !== undefined) availableInputs.push({ sensorType: 'ph', value: readings.ph, weight: 0.25 });
  if (readings.mq !== undefined) availableInputs.push({ sensorType: 'mq135', value: readings.mq, weight: 0.22 });
  if (readings.co2 !== undefined) availableInputs.push({ sensorType: 'co2', value: readings.co2, weight: 0.18 });

  if (availableInputs.length < 2) return null;

  const aqiVal = readings.pm25 ? (readings.pm25 * 1.7) : 0;
  const wqiVal = readings.ph ? Math.abs(readings.ph - 7.5) * 15 : 0;
  let risk = Math.round((aqiVal * 0.35) + (wqiVal * 0.3));
  if (readings.mq !== undefined) risk += readings.mq * 45 * 0.22;
  if (readings.co2 !== undefined) risk += (readings.co2 - 400) * 0.08 * 0.18;
  risk = Math.max(5, risk);

  const category = categorize(risk, [28, 48, 68, 88, 115]);
  return {
    id: 'risk', name: 'Environmental Risk Score', value: Math.min(Math.max(risk, 5), 140), unit: '', category,
    inputs: availableInputs,
    formula: 'PM2.5(35%) + pH deviation(25%) + MQ135(22%) + CO₂(18%)',
    confidence: calculateConfidence(availableInputs, 3),
    icon: 'AlertTriangle', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 4. Thermal Comfort Index
export function calculateThermalComfort(readings: Record<string, number>): VirtualSensorResult | null {
  if (readings.tmp === undefined || readings.hum === undefined) return null;

  const temp = readings.tmp;
  const hum = readings.hum;
  const tempF = temp * 9 / 5 + 32;
  const hi = -42.379 + 2.04901523*tempF + 10.14333127*hum - 0.22475541*tempF*hum
           - 0.00683783*tempF*tempF - 0.05481717*hum*hum + 0.00122874*tempF*tempF*hum
           + 0.00085282*tempF*hum*hum - 0.00000199*tempF*tempF*hum*hum;

  const index = Math.max(60, Math.min(hi, 125));
  const category = categorize(index, [72, 82, 92, 105, 118]);

  return {
    id: 'thermal', name: 'Thermal Comfort Index', value: Math.round(index), unit: '', category,
    inputs: [
      { sensorType: 'temperature', value: temp, weight: 0.55 },
      { sensorType: 'humidity', value: hum, weight: 0.45 }
    ],
    formula: 'Rothfuchs Heat Index regression (Temp + Humidity)',
    confidence: 92,
    icon: 'ThermometerSun', color: colorFor(category),
    missingInputs: []
  };
}

// 5. Indoor Air Score
export function calculateIndoorAirScore(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['co2'];

  if (readings.co2 !== undefined) availableInputs.push({ sensorType: 'co2', value: readings.co2, weight: 0.4 });
  if (readings.voc !== undefined) availableInputs.push({ sensorType: 'voc', value: readings.voc, weight: 0.3 });
  if (readings.tmp !== undefined) availableInputs.push({ sensorType: 'temperature', value: readings.tmp, weight: 0.15 });
  if (readings.hum !== undefined) availableInputs.push({ sensorType: 'humidity', value: readings.hum, weight: 0.15 });

  if (availableInputs.length < 2) return null;

  let score = 100;
  if (readings.co2 !== undefined) {
    const co2 = readings.co2;
    if (co2 > 1000) score -= (co2 - 1000) * 0.08;
    if (co2 > 1500) score -= ((co2 - 1500) / 1000) * 25;
  }
  if (readings.voc !== undefined) score -= (readings.voc / 500) * 28;
  if (readings.tmp !== undefined && (readings.tmp < 18 || readings.tmp > 28)) score -= 12;
  if (readings.hum !== undefined && (readings.hum < 30 || readings.hum > 70)) score -= 10;

  score = Math.max(12, Math.min(100, score));
  const category = categorize(100 - score, [15, 30, 45, 62, 80]);

  return {
    id: 'indoor', name: 'Indoor Air Score', value: Math.round(score), unit: '', category,
    inputs: availableInputs,
    formula: 'CO₂(40%) + VOC(30%) + Temp comfort(15%) + Humidity(15%)',
    confidence: calculateConfidence(availableInputs, 3),
    icon: 'Home', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 6. Corrosion Index (for water infrastructure)
export function calculateCorrosionIndex(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['ph', 'tds'];

  if (readings.ph !== undefined) availableInputs.push({ sensorType: 'ph', value: readings.ph, weight: 0.45 });
  if (readings.tds !== undefined) availableInputs.push({ sensorType: 'tds', value: readings.tds, weight: 0.25 });
  if (readings.dO !== undefined) availableInputs.push({ sensorType: 'dissolvedO2', value: readings.dO, weight: 0.2 });
  if (readings.wT !== undefined) availableInputs.push({ sensorType: 'waterTemp', value: readings.wT, weight: 0.1 });

  if (availableInputs.length < 2) return null;

  const ph = readings.ph;
  const tds = readings.tds;
  const dO = readings.dO;
  const wT = readings.wT;

  let index = 0;
  if (ph !== undefined) {
    if (ph < 7) index += (7 - ph) * 18;
    if (ph > 8.2) index += (ph - 8.2) * 12;
  }
  if (tds !== undefined) index += (tds / 100) * 4;
  if (dO !== undefined) index -= (dO - 7) * 3;
  if (wT !== undefined) index += Math.abs(wT - 20) * 1.2;
  index = Math.max(5, Math.min(95, index));

  const category = categorize(index, [18, 32, 48, 68, 85]);
  return {
    id: 'corrosion', name: 'Corrosion Index', value: Math.round(index), unit: '', category,
    inputs: availableInputs,
    formula: 'pH deviation(45%) + TDS(25%) - DO protection(20%) + Temp(10%)',
    confidence: calculateConfidence(availableInputs, 3),
    icon: 'Shield', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 7. Biological Oxygen Demand (BOD) estimate
export function calculateBOD(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['dO'];

  if (readings.dO !== undefined) availableInputs.push({ sensorType: 'dissolvedO2', value: readings.dO, weight: 0.6 });
  if (readings.wT !== undefined) availableInputs.push({ sensorType: 'waterTemp', value: readings.wT, weight: 0.25 });
  if (readings.tds !== undefined) availableInputs.push({ sensorType: 'tds', value: readings.tds, weight: 0.15 });

  if (availableInputs.length < 1 || readings.dO === undefined) return null;

  const dO = readings.dO;
  const wT = readings.wT;
  const tds = readings.tds;

  let bod = (14 - dO) * 1.8;
  if (wT !== undefined) bod += (wT - 20) * 0.3;
  if (tds !== undefined) bod += (tds / 200);
  bod = Math.max(0.5, Math.min(bod, 18));

  const category = categorize(bod, [2, 4, 7, 11, 15]);
  return {
    id: 'bod', name: 'Biological Oxygen Demand', value: parseFloat(bod.toFixed(1)), unit: 'mg/L', category,
    inputs: availableInputs,
    formula: 'BOD ≈ (14 - DO) × 1.8 + Temp factor + TDS factor',
    confidence: calculateConfidence(availableInputs, 2),
    icon: 'FlaskConical', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 8. Agricultural Suitability
export function calculateAgriculturalSuitability(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['sm'];

  if (readings.sm !== undefined) availableInputs.push({ sensorType: 'soilMoisture', value: readings.sm, weight: 0.45 });
  if (readings.ph !== undefined) availableInputs.push({ sensorType: 'ph', value: readings.ph, weight: 0.3 });
  if (readings.tmp !== undefined) availableInputs.push({ sensorType: 'temperature', value: readings.tmp, weight: 0.25 });

  if (availableInputs.length < 1) return null;

  const sm = readings.sm;
  const ph = readings.ph;
  const tmp = readings.tmp;

  let score = 100;
  if (sm !== undefined) {
    if (sm < 20) score -= (20 - sm) * 2.2;
    if (sm > 60) score -= (sm - 60) * 1.8;
  }
  if (ph !== undefined && (ph < 6 || ph > 8)) score -= 15;
  if (tmp !== undefined && (tmp < 15 || tmp > 35)) score -= 12;
  score = Math.max(20, Math.min(100, score));

  const category = categorize(100 - score, [18, 32, 48, 65, 82]);
  return {
    id: 'agri', name: 'Agricultural Suitability', value: Math.round(score), unit: '%', category,
    inputs: availableInputs,
    formula: 'SoilMoisture(45%) + pH(30%) + Temp(25%)',
    confidence: calculateConfidence(availableInputs, 2),
    icon: 'Sprout', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 9. Eutrophication Risk
export function calculateEutrophicationRisk(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['tds', 'ph'];

  if (readings.tds !== undefined) availableInputs.push({ sensorType: 'tds', value: readings.tds, weight: 0.35 });
  if (readings.ph !== undefined) availableInputs.push({ sensorType: 'ph', value: readings.ph, weight: 0.25 });
  if (readings.wT !== undefined) availableInputs.push({ sensorType: 'waterTemp', value: readings.wT, weight: 0.25 });
  if (readings.dO !== undefined) availableInputs.push({ sensorType: 'dissolvedO2', value: readings.dO, weight: 0.15 });

  if (availableInputs.length < 2 || readings.tds === undefined) return null;

  const tds = readings.tds;
  const ph = readings.ph;
  const wT = readings.wT;
  const dO = readings.dO;

  let risk = (tds / 12);
  if (ph !== undefined) risk += (ph - 7) * 8;
  if (wT !== undefined) risk += (wT - 18) * 1.4;
  if (dO !== undefined) risk -= (dO - 6) * 3.5;
  risk = Math.max(5, Math.min(risk, 95));

  const category = categorize(risk, [22, 38, 55, 72, 88]);
  return {
    id: 'eutro', name: 'Eutrophication Risk', value: Math.round(risk), unit: '', category,
    inputs: availableInputs,
    formula: 'TDS(35%) + pH deviation(25%) + Temp(25%) + DO(15%)',
    confidence: calculateConfidence(availableInputs, 3),
    icon: 'Waves', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// 10. Human Exposure Index
export function calculateHumanExposureIndex(readings: Record<string, number>): VirtualSensorResult | null {
  const availableInputs: VirtualSensorInput[] = [];
  const required = ['pm25'];

  if (readings.pm25 !== undefined) availableInputs.push({ sensorType: 'pm25', value: readings.pm25, weight: 0.3 });
  if (readings.mq !== undefined) availableInputs.push({ sensorType: 'mq135', value: readings.mq, weight: 0.22 });
  if (readings.co2 !== undefined) availableInputs.push({ sensorType: 'co2', value: readings.co2, weight: 0.2 });
  if (readings.voc !== undefined) availableInputs.push({ sensorType: 'voc', value: readings.voc, weight: 0.18 });
  if (readings.tmp !== undefined) availableInputs.push({ sensorType: 'temperature', value: readings.tmp, weight: 0.1 });

  if (availableInputs.length < 1 || readings.pm25 === undefined) return null;

  const pm25 = readings.pm25;
  const mq = readings.mq;
  const co2 = readings.co2;
  const voc = readings.voc;
  const tmp = readings.tmp;

  let exposure = (pm25 * 1.8);
  if (mq !== undefined) exposure += mq * 55;
  if (co2 !== undefined) exposure += (co2 - 400) / 4;
  if (voc !== undefined) exposure += voc / 5;
  if (tmp !== undefined && tmp > 32) exposure += (tmp - 32) * 3;
  exposure = Math.max(15, Math.min(exposure, 180));

  const category = categorize(exposure, [35, 58, 82, 115, 145]);
  return {
    id: 'exposure', name: 'Human Exposure Index', value: Math.round(exposure), unit: '', category,
    inputs: availableInputs,
    formula: 'PM2.5(30%) + MQ135(22%) + CO₂(20%) + VOC(18%) + Temp(10%)',
    confidence: calculateConfidence(availableInputs, 3),
    icon: 'Users', color: colorFor(category),
    missingInputs: required.filter(r => readings[r] === undefined)
  };
}

// ==================== MAIN DYNAMIC COMPUTATION ====================

export function computeDynamicVirtualSensors(physicalReadings: Record<string, number>): VirtualSensorResult[] {
  const results: VirtualSensorResult[] = [];

  const aqi = calculateAQI(physicalReadings); if (aqi) results.push(aqi);
  const wqi = calculateWQI(physicalReadings); if (wqi) results.push(wqi);
  const risk = calculateEnvironmentalRisk(physicalReadings); if (risk) results.push(risk);
  const thermal = calculateThermalComfort(physicalReadings); if (thermal) results.push(thermal);
  const indoor = calculateIndoorAirScore(physicalReadings); if (indoor) results.push(indoor);
  const corrosion = calculateCorrosionIndex(physicalReadings); if (corrosion) results.push(corrosion);
  const bod = calculateBOD(physicalReadings); if (bod) results.push(bod);
  const agri = calculateAgriculturalSuitability(physicalReadings); if (agri) results.push(agri);
  const eutro = calculateEutrophicationRisk(physicalReadings); if (eutro) results.push(eutro);
  const exposure = calculateHumanExposureIndex(physicalReadings); if (exposure) results.push(exposure);

  return results;
}

// Legacy compatibility
export function computeAllVirtualSensors(physicalReadings: Record<string, number>): VirtualSensorResult[] {
  return computeDynamicVirtualSensors(physicalReadings);
}

// ==================== METADATA & HELPERS ====================

export interface VirtualSensorMeta {
  id: string;
  name: string;
  icon: string;
  category: 'air' | 'water' | 'environmental' | 'agricultural' | 'health';
  description: string;
  typicalRange: [number, number];
  unit: string;
  requiredInputs: string[];
  improvementTip: string;
}

export const VIRTUAL_SENSOR_METADATA: VirtualSensorMeta[] = [
  { id: 'aqi', name: 'Air Quality Index', icon: 'Wind', category: 'air', unit: '',
    description: 'EPA multi-pollutant composite air quality index', typicalRange: [0, 500],
    requiredInputs: ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co'],
    improvementTip: 'Reduce PM2.5 & NO₂ emissions; improve ventilation' },
  { id: 'wqi', name: 'Water Quality Index', icon: 'Droplet', category: 'water', unit: '',
    description: 'Weighted water health score from pH, TDS, turbidity & DO', typicalRange: [5, 100],
    requiredInputs: ['ph', 'tds', 'tb', 'dO'],
    improvementTip: 'Neutralize pH; reduce TDS via filtration; aerate to raise DO' },
  { id: 'risk', name: 'Environmental Risk', icon: 'AlertTriangle', category: 'environmental', unit: '',
    description: 'Overall ecosystem risk combining air & water hazards', typicalRange: [5, 140],
    requiredInputs: ['pm25', 'ph', 'mq', 'co2'],
    improvementTip: 'Mitigate pollution sources; improve waste management' },
  { id: 'indoor', name: 'Indoor Air Score', icon: 'Home', category: 'air', unit: '',
    description: 'Indoor environment quality based on CO₂, VOC, temp & humidity', typicalRange: [12, 100],
    requiredInputs: ['co2', 'voc', 'tmp', 'hum'],
    improvementTip: 'Increase ventilation; use air purifiers; control humidity' },
  { id: 'thermal', name: 'Thermal Comfort', icon: 'ThermometerSun', category: 'environmental', unit: '',
    description: 'Heat stress index from Rothfusz regression (temp + humidity)', typicalRange: [60, 125],
    requiredInputs: ['tmp', 'hum'],
    improvementTip: 'Use HVAC shading; reduce humidity; schedule outdoor work wisely' },
  { id: 'corrosion', name: 'Corrosion Index', icon: 'Shield', category: 'water', unit: '',
    description: 'Water infrastructure corrosion risk from pH, TDS, DO & temp', typicalRange: [5, 95],
    requiredInputs: ['ph', 'tds', 'dO', 'wT'],
    improvementTip: 'Maintain pH 7–8; reduce TDS; monitor dissolved oxygen' },
  { id: 'bod', name: 'Biological Oxygen Demand', icon: 'FlaskConical', category: 'water', unit: 'mg/L',
    description: 'Estimated organic pollution from DO deficit', typicalRange: [0.5, 18],
    requiredInputs: ['dO', 'wT', 'tds'],
    improvementTip: 'Reduce organic runoff; aerate water bodies' },
  { id: 'agri', name: 'Agricultural Suitability', icon: 'Sprout', category: 'agricultural', unit: '%',
    description: 'Soil & crop viability from moisture, pH & temperature', typicalRange: [20, 100],
    requiredInputs: ['sm', 'ph', 'tmp'],
    improvementTip: 'Irrigate to maintain 20–60% moisture; amend soil pH' },
  { id: 'eutro', name: 'Eutrophication Risk', icon: 'Waves', category: 'water', unit: '',
    description: 'Algal bloom potential from TDS, pH, water temp & DO', typicalRange: [5, 95],
    requiredInputs: ['tds', 'ph', 'wT', 'dO'],
    improvementTip: 'Reduce nutrient runoff; control TDS; maintain DO > 6 mg/L' },
  { id: 'exposure', name: 'Human Exposure Index', icon: 'Users', category: 'health', unit: '',
    description: 'Human health exposure level from PM2.5, gas, CO₂, VOC & temp', typicalRange: [15, 180],
    requiredInputs: ['pm25', 'mq', 'co2', 'voc'],
    improvementTip: 'Use personal protective equipment; improve air filtration' },
];

/** Legacy alias — use VIRTUAL_SENSOR_METADATA for richer data */
export const VIRTUAL_SENSOR_DEFINITIONS = VIRTUAL_SENSOR_METADATA.map(
  m => ({ id: m.id, name: m.name, icon: m.icon, description: m.description })
);

/** Get which physical sensors are needed for a given computed sensor */
export function getRequiredInputsFor(sensorId: string): string[] {
  const meta = VIRTUAL_SENSOR_METADATA.find(m => m.id === sensorId);
  return meta ? meta.requiredInputs : [];
}

/** Get aggregate summary across computed virtual sensors */
export function getComputedSensorSummary(results: VirtualSensorResult[]): {
  total: number; avgConfidence: number; highConf: number;
  byCategory: Record<string, number>; available: number; missing: number;
} {
  const total = results.length;
  const avgConfidence = total > 0
    ? Math.round(results.reduce((s, r) => s + r.confidence, 0) / total)
    : 0;
  const highConf = results.filter(r => r.confidence >= 70).length;
  const byCategory: Record<string, number> = {};
  for (const r of results) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  return { total, avgConfidence, highConf, byCategory, available: total, missing: VIRTUAL_SENSOR_METADATA.length - total };
}

/**
 * Calibrates confidence based on input data noise.
 * Higher noise = lower confidence. Call after computeDynamicVirtualSensors.
 */
export function calibrateConfidence(result: VirtualSensorResult, noiseFactor = 0): VirtualSensorResult {
  if (noiseFactor <= 0) return result;
  const reduction = Math.min(20, Math.round(noiseFactor * 15));
  return { ...result, confidence: Math.max(25, result.confidence - reduction) };
}

/**
 * Downsamples telemetry data array for smooth chart rendering.
 */
export function downsampleTelemetryData<T>(data: T[], maxPoints = 50): T[] {
  if (!Array.isArray(data) || data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const sampled: T[] = [];
  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }
  // Always include the most recent data point
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }
  return sampled;
}

