/**
 * PERN Scientific EHI v2.0
 * 
 * Aligned with WHO Air Quality Guidelines 2021 and EPA AQI methodology.
 * This is a more scientifically grounded version of the Environmental Health Index.
 */

export interface SubIndex {
  name: string;
  value: number;
  weight: number;
  source: string;
}

/**
 * Calculate Air Quality Sub-Index (0-100 scale, lower = worse health impact)
 * Based on EPA AQI breakpoints for PM2.5, inverted so higher pollution = lower score.
 */
function calculateAirSubIndex(pm25: number): number {
  if (pm25 <= 12)  return 100 - (pm25 / 12) * 20;       // 80-100 (Good)
  if (pm25 <= 35)  return 80 - ((pm25 - 12) / 23) * 25;  // 55-80  (Moderate)
  if (pm25 <= 55)  return 55 - ((pm25 - 35) / 20) * 15;  // 40-55  (USG)
  if (pm25 <= 150) return 40 - ((pm25 - 55) / 95) * 25;  // 15-40  (Unhealthy)
  return Math.max(0, 15 - ((pm25 - 150) / 100) * 15);    // 0-15   (Hazardous)
}

/**
 * Calculate Water Quality Sub-Index (simplified Weighted WQI)
 */
function calculateWaterSubIndex(ph: number, tds: number, dO: number): number {
  let score = 100;

  // pH deviation from ideal (7.5 — midpoint of EPA 6.5-8.5 range)
  const phDeviation = Math.abs(ph - 7.5);
  score -= phDeviation * 12;

  // TDS penalty
  if (tds > 500) score -= (tds - 500) * 0.08;

  // Dissolved Oxygen
  if (dO < 6) score -= (6 - dO) * 10;

  return Math.max(10, Math.min(100, score));
}

/**
 * Main Scientific EHI Calculation
 *
 * Computes ONLY from real sensor inputs. Sub-indices whose required inputs
 * are missing are excluded and their weight is redistributed. If no real
 * data is present at all, returns null so the UI can show an empty state
 * instead of fabricating a score.
 */
export function calculateScientificEHI(readings: Record<string, number>): ScientificEHIResult | null {
  const hasData = Object.keys(readings).length > 0;
  if (!hasData) return null;

  const subIndices: SubIndex[] = [];

  if (readings.pm25 !== undefined) {
    subIndices.push({
      name: 'Air Quality',
      value: Math.round(calculateAirSubIndex(readings.pm25)),
      weight: 0.30,
      source: 'US EPA AQI Breakpoints + WHO 2021'
    });
  }
  if (readings.ph !== undefined && readings.tds !== undefined && readings.dO !== undefined) {
    subIndices.push({
      name: 'Water Quality',
      value: Math.round(calculateWaterSubIndex(readings.ph, readings.tds, readings.dO)),
      weight: 0.25,
      source: 'Weighted WQI (WHO/EPA aligned)'
    });
  }
  if (readings.tmp !== undefined) {
    subIndices.push({
      name: 'Human Comfort',
      value: Math.round(100 - Math.abs(readings.tmp - 26) * 3.2),
      weight: 0.20,
      source: 'ASHRAE 55 Thermal Comfort'
    });
  }
  if (readings.hum !== undefined) {
    const humFactor = readings.hum > 35 && readings.hum < 80 ? 60 : 30;
    const tempBonus = readings.tmp !== undefined && readings.tmp >= 18 && readings.tmp <= 30 ? 10 : 0;
    subIndices.push({
      name: 'Ecosystem Stress',
      value: Math.round(humFactor + tempBonus),
      weight: 0.15,
      source: 'Humidity + Temperature Ecological Indicators'
    });
  }
  if (readings.co2 !== undefined) {
    subIndices.push({
      name: 'Atmospheric Load',
      value: Math.round(Math.max(30, 100 - ((readings.co2 - 400) / 10))),
      weight: 0.10,
      source: 'WHO Indoor Air Guidelines'
    });
  }

  if (subIndices.length === 0) return null;

  // Redistribute weight across available sub-indices
  const totalWeight = subIndices.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.round(
    subIndices.reduce((sum, s) => sum + s.value * (s.weight / totalWeight), 0)
  );

  const finalScore = Math.max(18, Math.min(96, score));

  let category = 'Critical';
  if (finalScore >= 80) category = 'Excellent';
  else if (finalScore >= 60) category = 'Good';
  else if (finalScore >= 40) category = 'Moderate';
  else if (finalScore >= 20) category = 'Poor';

  // Confidence based on coverage (how many sub-indices have data) and weight completeness
  const maxPossibleWeight = 1.0;
  const coverageRatio = totalWeight / maxPossibleWeight;
  const indexCount = subIndices.length;
  const maxIndices = 5;
  const coverageScore = Math.round(coverageRatio * 60 + (indexCount / maxIndices) * 40);
  const confidence = Math.min(98, Math.max(30, coverageScore));

  return {
    score: finalScore,
    category,
    subIndices,
    confidence,
    method: 'WHO + EPA Aligned Composite Index (real inputs only)'
  };
}

export interface ScientificEHIResult {
  score: number;
  category: string;
  subIndices: SubIndex[];
  confidence: number;
  method: string;
}