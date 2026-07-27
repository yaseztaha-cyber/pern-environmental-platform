/**
 * PERN Evidence-Based Recommendation Engine
 * 
 * Generates recommendations based on:
 * - WHO Air Quality Guidelines 2021
 * - US EPA AQI Categories
 * - Egyptian Environmental Standards
 * - Vulnerable Group Sensitivity Factors
 */

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  source: string;
  affectedGroups?: string[];
}

export function generateRecommendations(data: {
  ehi: number;
  pm25: number;
  ph: number;
  temperature: number;
  humidity: number;
  co2: number;
  virtualSensors: Array<{ name: string; value: number; category: string }>;
}): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // === Air Quality Recommendations ===
  if (data.pm25 > 35) {
    recommendations.push({
      id: 'air-1',
      title: 'Reduce Outdoor Exposure',
      description: `PM2.5 is at ${data.pm25} µg/m³ (WHO 24h limit: 15). Sensitive groups should limit prolonged outdoor activity.`,
      priority: 'high',
      category: 'Air Quality',
      source: 'WHO Air Quality Guidelines 2021',
      affectedGroups: ['Children', 'Elderly', 'Respiratory Patients', 'Pregnant Women']
    });
  }

  if (data.co2 > 1000) {
    recommendations.push({
      id: 'air-2',
      title: 'Improve Ventilation',
      description: `CO₂ levels are elevated (${data.co2} ppm). Increase fresh air circulation, especially in enclosed spaces.`,
      priority: 'medium',
      category: 'Indoor Air',
      source: 'WHO Indoor Air Quality Guidelines'
    });
  }

  // === Water Quality Recommendations ===
  if (data.ph < 6.5 || data.ph > 8.5) {
    recommendations.push({
      id: 'water-1',
      title: 'Monitor Water pH',
      description: `pH is outside optimal range (${data.ph}). Consider water treatment or source investigation.`,
      priority: 'medium',
      category: 'Water Quality',
      source: 'WHO Drinking Water Guidelines'
    });
  }

  // === Thermal Comfort Recommendations ===
  if (data.temperature > 32 || (data.temperature > 30 && data.humidity > 70)) {
    recommendations.push({
      id: 'comfort-1',
      title: 'Heat Stress Advisory',
      description: `High temperature and humidity combination increases heat stress risk. Ensure hydration and cooling measures.`,
      priority: 'high',
      category: 'Thermal Comfort',
      source: 'ASHRAE Standard 55 + WHO Heat Guidelines',
      affectedGroups: ['Elderly', 'Children', 'Outdoor Workers']
    });
  }

  // === General EHI-based Recommendations ===
  if (data.ehi < 50) {
    recommendations.push({
      id: 'general-1',
      title: 'Comprehensive Environmental Review',
      description: `Overall EHI is low (${data.ehi}). Conduct a full environmental assessment focusing on dominant risk factors.`,
      priority: 'high',
      category: 'General',
      source: 'PERN Scientific Analysis'
    });
  } else if (data.ehi < 65) {
    recommendations.push({
      id: 'general-2',
      title: 'Targeted Improvement',
      description: `EHI is moderate. Focus mitigation efforts on the lowest-performing sub-indices.`,
      priority: 'medium',
      category: 'General',
      source: 'PERN Scientific Analysis'
    });
  }

  // === Virtual Sensor Insights ===
  const poorSensors = data.virtualSensors.filter(vs => 
    vs.category === 'poor' || vs.category === 'critical'
  );

  if (poorSensors.length > 0) {
    recommendations.push({
      id: 'sensor-1',
      title: 'Address Critical Virtual Sensors',
      description: `The following indicators show concerning values: ${poorSensors.map(s => s.name).join(', ')}. Prioritize investigation.`,
      priority: 'high',
      category: 'Monitoring',
      source: 'PERN Virtual Sensor Analysis'
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}