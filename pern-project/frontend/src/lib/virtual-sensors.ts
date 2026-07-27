/**
 * Virtual Sensors (Soft Sensors) - Computation-Based Environmental Indices
 * 
 * PERN Environmental Intelligence Platform
 * All formulas are derived from physical sensor readings
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
}

// Helper: Categorize value based on thresholds
function categorize(value: number, thresholds: number[]): 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' {
  if (value <= thresholds[0]) return 'excellent';
  if (value <= thresholds[1]) return 'good';
  if (value <= thresholds[2]) return 'moderate';
  if (value <= thresholds[3]) return 'poor';
  return 'critical';
}

// Helper: Calculate weighted confidence based on input quality
function calculateConfidence(inputs: VirtualSensorInput[], baseCoverage: number = 0.9): number {
  if (inputs.length === 0) return 40;
  
  const avgWeight = inputs.reduce((sum, inp) => sum + inp.weight, 0) / inputs.length;
  const coverage = Math.min(inputs.length / 4, 1); // Assume 4 is ideal
  
  return Math.round(
    (coverage * 40 + avgWeight * 35 + baseCoverage * 25) * 100 / 100
  );
}

// 1. Air Quality Index (AQI) - EPA style simplified
export function calculateAQI(readings: Record<string, number>): VirtualSensorResult {
  const pm25 = readings.pm25 ?? readings['pm25'] ?? 25;
  const mq135 = readings.mq ?? readings.mq135 ?? 0.4;
  const humidity = readings.hum ?? readings.humidity ?? 55;
  const temp = readings.tmp ?? readings.temperature ?? 28;

  // Simplified AQI calculation (PM2.5 dominant)
  let aqiValue = 0;
  if (pm25 <= 12) aqiValue = (pm25 / 12) * 50;
  else if (pm25 <= 35) aqiValue = 50 + ((pm25 - 12) / 23) * 50;
  else if (pm25 <= 55) aqiValue = 100 + ((pm25 - 35) / 20) * 50;
  else if (pm25 <= 150) aqiValue = 150 + ((pm25 - 55) / 95) * 100;
  else aqiValue = 250 + Math.min(((pm25 - 150) / 100) * 150, 150);

  // Adjust for gas and humidity
  const gasPenalty = Math.max(0, (mq135 - 0.6) * 30);
  const humidityPenalty = humidity > 75 ? (humidity - 75) * 0.8 : 0;
  aqiValue = Math.min(Math.max(aqiValue + gasPenalty + humidityPenalty, 0), 500);

  const category = categorize(aqiValue, [50, 100, 150, 200, 300]);
  
  return {
    id: 'aqi',
    name: 'Air Quality Index',
    value: Math.round(aqiValue),
    unit: '',
    category,
    inputs: [
      { sensorType: 'pm25', value: pm25, weight: 0.5 },
      { sensorType: 'mq135', value: mq135, weight: 0.25 },
      { sensorType: 'humidity', value: humidity, weight: 0.15 },
      { sensorType: 'temperature', value: temp, weight: 0.1 }
    ],
    formula: 'EPA AQI breakpoints (PM2.5 primary) + MQ135 + Humidity adjustment',
    confidence: calculateConfidence([
      { sensorType: 'pm25', value: pm25, weight: 0.5 },
      { sensorType: 'mq135', value: mq135, weight: 0.25 },
      { sensorType: 'humidity', value: humidity, weight: 0.15 },
      { sensorType: 'temperature', value: temp, weight: 0.1 }
    ]),
    icon: 'Wind',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 2. Water Quality Index (WQI)
export function calculateWQI(readings: Record<string, number>): VirtualSensorResult {
  const ph = readings.ph ?? 7.2;
  const tds = readings.tds ?? 180;
  const waterTemp = readings.wT ?? readings.waterTemp ?? 24;
  const turbidity = readings.tb ?? readings.turbidity ?? 2.8;
  const dissolvedO2 = readings.dO ?? readings.dissolvedO2 ?? 8.5;

  // Weighted WQI (0-100, lower = better)
  let wqi = 0;
  
  // pH score (ideal 7)
  const phScore = Math.abs(ph - 7) * 12;
  
  // TDS score (ideal <300)
  const tdsScore = tds > 500 ? (tds - 500) * 0.08 : 0;
  
  // Turbidity
  const turbScore = turbidity * 8;
  
  // DO (ideal 8-12)
  const doScore = dissolvedO2 < 5 ? (5 - dissolvedO2) * 15 : dissolvedO2 > 14 ? (dissolvedO2 - 14) * 6 : 0;
  
  wqi = Math.min(Math.max(phScore + tdsScore + turbScore + doScore, 5), 100);

  const category = categorize(wqi, [15, 35, 55, 75, 90]);

  return {
    id: 'wqi',
    name: 'Water Quality Index',
    value: Math.round(wqi),
    unit: '',
    category,
    inputs: [
      { sensorType: 'ph', value: ph, weight: 0.3 },
      { sensorType: 'tds', value: tds, weight: 0.25 },
      { sensorType: 'turbidity', value: turbidity, weight: 0.2 },
      { sensorType: 'dissolvedO2', value: dissolvedO2, weight: 0.15 },
      { sensorType: 'waterTemp', value: waterTemp, weight: 0.1 }
    ],
    formula: 'Weighted: pH(30%) + TDS(25%) + Turbidity(20%) + DO(15%) + Temp(10%)',
    confidence: calculateConfidence([
      { sensorType: 'ph', value: ph, weight: 0.3 },
      { sensorType: 'tds', value: tds, weight: 0.25 },
      { sensorType: 'turbidity', value: turbidity, weight: 0.2 },
      { sensorType: 'dissolvedO2', value: dissolvedO2, weight: 0.15 }
    ]),
    icon: 'Droplet',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 3. Environmental Risk Score
export function calculateEnvironmentalRisk(readings: Record<string, number>): VirtualSensorResult {
  const aqi = calculateAQI(readings).value;
  const wqi = calculateWQI(readings).value;
  const mq = readings.mq ?? 0.5;
  const co2 = readings.co2 ?? 420;

  const risk = Math.round(
    (aqi * 0.35) + 
    (wqi * 0.3) + 
    (mq * 40) + 
    ((co2 - 400) / 10 * 0.8)
  );

  const category = categorize(risk, [25, 45, 65, 85, 110]);

  return {
    id: 'risk',
    name: 'Environmental Risk Score',
    value: Math.min(Math.max(risk, 0), 150),
    unit: '',
    category,
    inputs: [
      { sensorType: 'aqi', value: aqi, weight: 0.35 },
      { sensorType: 'wqi', value: wqi, weight: 0.3 },
      { sensorType: 'mq135', value: mq, weight: 0.2 },
      { sensorType: 'co2', value: co2, weight: 0.15 }
    ],
    formula: 'AQI(35%) + WQI(30%) + MQ135(20%) + CO₂ deviation(15%)',
    confidence: 88,
    icon: 'AlertTriangle',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 4. Indoor Air Score
export function calculateIndoorAirScore(readings: Record<string, number>): VirtualSensorResult {
  const co2 = readings.co2 ?? 650;
  const voc = readings.voc ?? 180;
  const temp = readings.tmp ?? 26;
  const humidity = readings.hum ?? 52;

  let score = 100;
  
  // CO2 penalty
  if (co2 > 1000) score -= (co2 - 1000) * 0.08;
  if (co2 > 1500) score -= 25;
  
  // VOC penalty
  score -= (voc / 500) * 30;
  
  // Temp comfort
  if (temp < 18 || temp > 28) score -= 12;
  
  // Humidity
  if (humidity < 30 || humidity > 70) score -= 10;

  score = Math.max(10, Math.min(100, score));

  const category = categorize(100 - score, [15, 30, 45, 60, 80]);

  return {
    id: 'indoor',
    name: 'Indoor Air Score',
    value: Math.round(score),
    unit: '',
    category,
    inputs: [
      { sensorType: 'co2', value: co2, weight: 0.4 },
      { sensorType: 'voc', value: voc, weight: 0.3 },
      { sensorType: 'temperature', value: temp, weight: 0.15 },
      { sensorType: 'humidity', value: humidity, weight: 0.15 }
    ],
    formula: 'CO₂(40%) + VOC(30%) + Temp comfort(15%) + Humidity(15%)',
    confidence: calculateConfidence([
      { sensorType: 'co2', value: co2, weight: 0.4 },
      { sensorType: 'voc', value: voc, weight: 0.3 },
      { sensorType: 'temperature', value: temp, weight: 0.15 }
    ]),
    icon: 'Home',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 5. Corrosion Index (for water infrastructure)
export function calculateCorrosionIndex(readings: Record<string, number>): VirtualSensorResult {
  const ph = readings.ph ?? 7.1;
  const tds = readings.tds ?? 190;
  const dO = readings.dO ?? 8.2;
  const waterTemp = readings.wT ?? 23;

  // Higher = more corrosive
  let index = 0;
  
  if (ph < 7) index += (7 - ph) * 18;
  if (ph > 8.2) index += (ph - 8.2) * 12;
  
  index += (tds / 100) * 4;
  index += (dO - 7) * 3;
  index += Math.abs(waterTemp - 20) * 1.2;

  index = Math.max(5, Math.min(95, index));

  const category = categorize(index, [18, 32, 48, 68, 85]);

  return {
    id: 'corrosion',
    name: 'Corrosion Index',
    value: Math.round(index),
    unit: '',
    category,
    inputs: [
      { sensorType: 'ph', value: ph, weight: 0.45 },
      { sensorType: 'tds', value: tds, weight: 0.25 },
      { sensorType: 'dissolvedO2', value: dO, weight: 0.2 },
      { sensorType: 'waterTemp', value: waterTemp, weight: 0.1 }
    ],
    formula: 'pH deviation(45%) + TDS(25%) + DO(20%) + Temp(10%)',
    confidence: 82,
    icon: 'Shield',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 6. Biological Oxygen Demand (BOD) estimate
export function calculateBOD(readings: Record<string, number>): VirtualSensorResult {
  const dO = readings.dO ?? 8.3;
  const waterTemp = readings.wT ?? 24;
  const tds = readings.tds ?? 175;

  // Estimated BOD (lower DO = higher BOD)
  let bod = Math.max(0.5, (14 - dO) * 1.8 + (waterTemp - 20) * 0.3 + (tds / 200));
  bod = Math.min(bod, 18);

  const category = categorize(bod, [2, 4, 7, 11, 15]);

  return {
    id: 'bod',
    name: 'Biological Oxygen Demand',
    value: parseFloat(bod.toFixed(1)),
    unit: 'mg/L',
    category,
    inputs: [
      { sensorType: 'dissolvedO2', value: dO, weight: 0.6 },
      { sensorType: 'waterTemp', value: waterTemp, weight: 0.25 },
      { sensorType: 'tds', value: tds, weight: 0.15 }
    ],
    formula: 'BOD ≈ (14 - DO) × 1.8 + Temp factor + TDS factor',
    confidence: 75,
    icon: 'FlaskConical',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 7. Thermal Comfort Index
export function calculateThermalComfort(readings: Record<string, number>): VirtualSensorResult {
  const temp = readings.tmp ?? readings.temperature ?? 27;
  const humidity = readings.hum ?? readings.humidity ?? 58;

  // Simplified Heat Index / Discomfort Index
  const hi = -42.379 + 2.04901523 * temp + 10.14333127 * humidity 
           - 0.22475541 * temp * humidity - 0.00683783 * temp * temp 
           - 0.05481717 * humidity * humidity + 0.00122874 * temp * temp * humidity 
           + 0.00085282 * temp * humidity * humidity - 0.00000199 * temp * temp * humidity * humidity;

  let index = Math.max(60, Math.min(hi, 125));

  const category = categorize(index, [72, 82, 92, 105, 118]);

  return {
    id: 'thermal',
    name: 'Thermal Comfort Index',
    value: Math.round(index),
    unit: '',
    category,
    inputs: [
      { sensorType: 'temperature', value: temp, weight: 0.55 },
      { sensorType: 'humidity', value: humidity, weight: 0.45 }
    ],
    formula: 'Rothfuchs Heat Index regression',
    confidence: calculateConfidence([
      { sensorType: 'temperature', value: temp, weight: 0.55 },
      { sensorType: 'humidity', value: humidity, weight: 0.45 }
    ]),
    icon: 'ThermometerSun',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 8. Agricultural Suitability
export function calculateAgriculturalSuitability(readings: Record<string, number>): VirtualSensorResult {
  const soilMoisture = readings.sm ?? readings.soilMoisture ?? 38;
  const ph = readings.ph ?? 7.0;
  const temp = readings.tmp ?? 27;

  let score = 85;
  
  // Soil moisture ideal 25-55%
  if (soilMoisture < 20) score -= (20 - soilMoisture) * 2.2;
  if (soilMoisture > 60) score -= (soilMoisture - 60) * 1.8;
  
  // pH
  if (ph < 6 || ph > 8) score -= 15;
  
  // Temperature
  if (temp < 15 || temp > 35) score -= 12;

  score = Math.max(20, Math.min(100, score));

  const category = categorize(100 - score, [18, 32, 48, 65, 82]);

  return {
    id: 'agri',
    name: 'Agricultural Suitability',
    value: Math.round(score),
    unit: '%',
    category,
    inputs: [
      { sensorType: 'soilMoisture', value: soilMoisture, weight: 0.45 },
      { sensorType: 'ph', value: ph, weight: 0.3 },
      { sensorType: 'temperature', value: temp, weight: 0.25 }
    ],
    formula: 'SoilMoisture(45%) + pH(30%) + Temp(25%)',
    confidence: 79,
    icon: 'Sprout',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 9. Eutrophication Risk
export function calculateEutrophicationRisk(readings: Record<string, number>): VirtualSensorResult {
  const tds = readings.tds ?? 190;
  const ph = readings.ph ?? 7.3;
  const waterTemp = readings.wT ?? 25;
  const dO = readings.dO ?? 8.0;

  let risk = (tds / 12) + (ph - 7) * 8 + (waterTemp - 18) * 1.4 - (dO - 6) * 3.5;
  risk = Math.max(5, Math.min(risk, 95));

  const category = categorize(risk, [22, 38, 55, 72, 88]);

  return {
    id: 'eutro',
    name: 'Eutrophication Risk',
    value: Math.round(risk),
    unit: '',
    category,
    inputs: [
      { sensorType: 'tds', value: tds, weight: 0.35 },
      { sensorType: 'ph', value: ph, weight: 0.25 },
      { sensorType: 'waterTemp', value: waterTemp, weight: 0.25 },
      { sensorType: 'dissolvedO2', value: dO, weight: 0.15 }
    ],
    formula: 'TDS(35%) + pH deviation(25%) + Temp(25%) + DO(15%)',
    confidence: 76,
    icon: 'Waves',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// 10. Human Exposure Index
export function calculateHumanExposureIndex(readings: Record<string, number>): VirtualSensorResult {
  const pm25 = readings.pm25 ?? 22;
  const mq = readings.mq ?? 0.48;
  const co2 = readings.co2 ?? 480;
  const voc = readings.voc ?? 165;
  const temp = readings.tmp ?? 27;

  let exposure = (pm25 * 1.8) + (mq * 55) + ((co2 - 400) / 4) + (voc / 5) + (temp > 32 ? (temp - 32) * 3 : 0);
  exposure = Math.max(15, Math.min(exposure, 180));

  const category = categorize(exposure, [35, 58, 82, 115, 145]);

  return {
    id: 'exposure',
    name: 'Human Exposure Index',
    value: Math.round(exposure),
    unit: '',
    category,
    inputs: [
      { sensorType: 'pm25', value: pm25, weight: 0.3 },
      { sensorType: 'mq135', value: mq, weight: 0.22 },
      { sensorType: 'co2', value: co2, weight: 0.2 },
      { sensorType: 'voc', value: voc, weight: 0.18 },
      { sensorType: 'temperature', value: temp, weight: 0.1 }
    ],
    formula: 'PM2.5(30%) + MQ135(22%) + CO₂(20%) + VOC(18%) + Temp(10%)',
    confidence: calculateConfidence([
      { sensorType: 'pm25', value: pm25, weight: 0.3 },
      { sensorType: 'mq135', value: mq, weight: 0.22 },
      { sensorType: 'co2', value: co2, weight: 0.2 }
    ]),
    icon: 'Users',
    color: category === 'excellent' ? '#10b981' : category === 'good' ? '#22c55e' : category === 'moderate' ? '#eab308' : category === 'poor' ? '#f97316' : '#ef4444'
  };
}

// Main function: Compute all virtual sensors
export function computeAllVirtualSensors(physicalReadings: Record<string, number>): VirtualSensorResult[] {
  return [
    calculateAQI(physicalReadings),
    calculateWQI(physicalReadings),
    calculateEnvironmentalRisk(physicalReadings),
    calculateIndoorAirScore(physicalReadings),
    calculateCorrosionIndex(physicalReadings),
    calculateBOD(physicalReadings),
    calculateThermalComfort(physicalReadings),
    calculateAgriculturalSuitability(physicalReadings),
    calculateEutrophicationRisk(physicalReadings),
    calculateHumanExposureIndex(physicalReadings)
  ];
}

export const VIRTUAL_SENSOR_DEFINITIONS = [
  { id: 'aqi', name: 'Air Quality Index', icon: 'Wind', description: 'EPA-based composite air quality' },
  { id: 'wqi', name: 'Water Quality Index', icon: 'Droplet', description: 'Weighted water health score' },
  { id: 'risk', name: 'Environmental Risk', icon: 'AlertTriangle', description: 'Overall ecosystem risk' },
  { id: 'indoor', name: 'Indoor Air Score', icon: 'Home', description: 'Indoor environment quality' },
  { id: 'corrosion', name: 'Corrosion Index', icon: 'Shield', description: 'Water system corrosion risk' },
  { id: 'bod', name: 'Biological Oxygen Demand', icon: 'FlaskConical', description: 'Estimated organic pollution' },
  { id: 'thermal', name: 'Thermal Comfort', icon: 'ThermometerSun', description: 'Heat stress & comfort' },
  { id: 'agri', name: 'Agricultural Suitability', icon: 'Sprout', description: 'Soil & crop viability' },
  { id: 'eutro', name: 'Eutrophication Risk', icon: 'Waves', description: 'Algal bloom potential' },
  { id: 'exposure', name: 'Human Exposure Index', icon: 'Users', description: 'Human health exposure' }
];
