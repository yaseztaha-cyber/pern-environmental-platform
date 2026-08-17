/**
 * PERN Evidence-Based Recommendation Engine
 * 
 * Generates recommendations based on:
 * - WHO Air Quality Guidelines 2021
 * - US EPA AQI Categories
 * - Egyptian Environmental Standards
 * - Vulnerable Group Sensitivity Factors
 */

import { referencesForSensor, referencesForDomain, type SourceReference } from './ai-references';

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  source: string;
  references?: SourceReference[];
  affectedGroups?: string[];
}

export function generateRecommendations(data: {
  ehi: number;
  pm25: number;
  ph: number;
  temperature: number;
  humidity: number;
  co2: number;
  tds?: number;
  dissolvedOxygen?: number;
  pm10?: number;
  turbidity?: number;
  voc?: number;
  gas?: number;
  soilMoisture?: number;
  light?: number;
  ammonia?: number;
  virtualSensors: Array<{ name: string; value: number; category: string }>;
  hasRealData?: Record<string, boolean>;
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
      references: referencesForSensor('pm25'),
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
      source: 'WHO Indoor Air Quality Guidelines',
      references: referencesForSensor('co2'),
      affectedGroups: ['Occupants', 'Children']
    });
  }

  if (data.pm10 !== undefined && data.pm10 > 45) {
    recommendations.push({
      id: 'air-3',
      title: 'Dust & Coarse Particle Advisory',
      description: `PM10 is at ${data.pm10} µg/m³ (WHO 24h limit: 45). Reduce dust-generating activity and use filtration.`,
      priority: data.pm10 > 100 ? 'high' : 'medium',
      category: 'Air Quality',
      source: 'WHO Air Quality Guidelines 2021',
      references: referencesForSensor('pm10'),
      affectedGroups: ['Children', 'Elderly', 'Respiratory Patients']
    });
  }

  if (data.humidity > 70) {
    recommendations.push({
      id: 'air-4',
      title: 'Dehumidify Enclosed Spaces',
      description: `Humidity is at ${data.humidity}% — above the 70% threshold where mold and condensation risk rises. Use dehumidifiers or increase ventilation.`,
      priority: data.humidity > 85 ? 'high' : 'medium',
      category: 'Indoor Air',
      source: 'WHO + ASHRAE 62.1 Indoor Humidity Guidelines',
      references: referencesForSensor('hum'),
      affectedGroups: ['Occupants', 'Asthma Patients', 'Infants']
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
      source: 'WHO Drinking Water Guidelines',
      references: referencesForSensor('ph'),
    });
  }

  if (data.tds !== undefined && data.tds > 500) {
    const tdsSeverity = data.tds > 1000 ? 'high' : 'medium';
    recommendations.push({
      id: 'water-2',
      title: 'High Total Dissolved Solids',
      description: `TDS is at ${data.tds} ppm (WHO limit: 500 ppm). ${data.tds > 1000 ? 'Water is unsuitable for drinking without treatment.' : 'Consider filtration or source investigation.'}`,
      priority: tdsSeverity,
      category: 'Water Quality',
      source: 'WHO Drinking Water Guidelines',
      references: referencesForSensor('tds'),
    });
  }

  if (data.dissolvedOxygen !== undefined && data.dissolvedOxygen < 6) {
    recommendations.push({
      id: 'water-3',
      title: 'Low Dissolved Oxygen',
      description: `DO is at ${data.dissolvedOxygen} mg/L — below the 6 mg/L threshold for healthy aquatic life. Consider aeration or investigate organic pollution sources.`,
      priority: 'high',
      category: 'Water Quality',
      source: 'US EPA Ambient Water Quality Criteria',
      references: referencesForSensor('dO'),
    });
  }

  if (data.tds !== undefined && data.tds > 500) {
    recommendations.push({
      id: 'water-4',
      title: 'Salinity & Mineral Load Advisory',
      description: `High TDS makes water taste salty and can stress crops and aquatic life. Test source water and consider RO filtration for drinking use.`,
      priority: data.tds > 1000 ? 'high' : 'medium',
      category: 'Water Quality',
      source: 'WHO Drinking Water Guidelines',
      references: referencesForSensor('tds'),
    });
  }

  if (data.temperature !== undefined && data.temperature > 28) {
    recommendations.push({
      id: 'water-5',
      title: 'Warm Water Stress Advisory',
      description: `Water temperature is at ${data.temperature}°C — warm water holds less oxygen and speeds algal growth. Shade water bodies and monitor DO closely.`,
      priority: data.temperature > 35 ? 'high' : 'medium',
      category: 'Water Quality',
      source: 'WHO + EPA Aquatic Life Criteria',
      references: referencesForSensor('wT'),
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
      references: referencesForDomain('thermal'),
      affectedGroups: ['Elderly', 'Children', 'Outdoor Workers']
    });
  }

  if (data.temperature < 10) {
    recommendations.push({
      id: 'comfort-2',
      title: 'Cold Stress Advisory',
      description: `Temperature is at ${data.temperature}°C — cold stress risk for prolonged exposure. Ensure adequate heating and protective clothing.`,
      priority: 'medium',
      category: 'Thermal Comfort',
      source: 'ISO 11079 Cold Environments',
      references: referencesForDomain('thermal'),
      affectedGroups: ['Elderly', 'Children', 'Outdoor Workers']
    });
  }

  // === Additional Pollutant Recommendations ===
  if (data.voc !== undefined && data.voc > 500) {
    recommendations.push({
      id: 'air-voc',
      title: 'Elevated VOC Levels',
      description: `Volatile organic compounds are at ${data.voc} ppb — above the 500 ppb guideline. Ventilate and identify indoor sources (paints, cleaners, furniture).`,
      priority: data.voc > 800 ? 'high' : 'medium',
      category: 'Indoor Air',
      source: 'WHO Indoor Air Quality Guidelines',
      references: referencesForSensor('voc'),
      affectedGroups: ['Occupants', 'Asthma Patients', 'Pregnant Women']
    });
  }

  if (data.gas !== undefined && data.gas > 0.5) {
    recommendations.push({
      id: 'air-gas',
      title: 'Gas / Leak Detection Advisory',
      description: `Gas sensor reading is elevated (${data.gas}). Check for LPG/smoke leaks immediately and ventilate the area.`,
      priority: data.gas > 0.8 ? 'high' : 'medium',
      category: 'Safety',
      source: 'Occupational Safety Guidelines',
      references: referencesForSensor('mq'),
      affectedGroups: ['All Occupants']
    });
  }

  // === Water Additional Recommendations ===
  if (data.turbidity !== undefined && data.turbidity > 25) {
    recommendations.push({
      id: 'water-tb',
      title: 'High Water Turbidity',
      description: `Turbidity is at ${data.turbidity} NTU — cloudy water can harbour pathogens and clog irrigation. Use sediment filtration and check upstream sources.`,
      priority: data.turbidity > 50 ? 'high' : 'medium',
      category: 'Water Quality',
      source: 'WHO Drinking Water Guidelines',
      references: referencesForSensor('tb'),
    });
  }

  // === Agriculture / Soil Recommendations ===
  if (data.soilMoisture !== undefined && data.soilMoisture > 70) {
    recommendations.push({
      id: 'agri-sm',
      title: 'Saturated Soil — Drainage Needed',
      description: `Soil moisture is at ${data.soilMoisture}% — risk of root rot and oxygen depletion. Improve drainage and delay irrigation.`,
      priority: data.soilMoisture > 90 ? 'high' : 'medium',
      category: 'Agriculture',
      source: 'FAO Irrigation Guidelines',
      references: referencesForSensor('sm'),
      affectedGroups: ['Crops', 'Farmers']
    });
  }

  if (data.light !== undefined && data.light > 100000) {
    recommendations.push({
      id: 'agri-light',
      title: 'Extreme Light Exposure',
      description: `Light intensity is very high at ${data.light} lux — potential heat/light stress for crops and risk of sunburn for workers. Provide shade or adjust schedules.`,
      priority: 'low',
      category: 'Agriculture',
      source: 'FAO Crop Light Requirements',
      references: referencesForSensor('light'),
      affectedGroups: ['Crops', 'Outdoor Workers']
    });
  }

  if (data.ammonia !== undefined && data.ammonia > 25) {
    recommendations.push({
      id: 'air-nh3',
      title: 'Elevated Ammonia Levels',
      description: `Ammonia is at ${data.ammonia} ppm — can irritate airways and harm crops. Identify livestock/waste sources and improve ventilation.`,
      priority: data.ammonia > 50 ? 'high' : 'medium',
      category: 'Indoor Air',
      source: 'WHO Indoor Air Quality Guidelines',
      references: referencesForSensor('nh3'),
      affectedGroups: ['Occupants', 'Respiratory Patients', 'Livestock']
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
      source: 'PERN Scientific Analysis',
      references: [...referencesForDomain('air'), ...referencesForDomain('water'), ...referencesForDomain('thermal')],
    });
  } else if (data.ehi < 65) {
    recommendations.push({
      id: 'general-2',
      title: 'Targeted Improvement',
      description: `EHI is moderate. Focus mitigation efforts on the lowest-performing sub-indices.`,
      priority: 'medium',
      category: 'General',
      source: 'PERN Scientific Analysis',
      references: [...referencesForDomain('air'), ...referencesForDomain('water'), ...referencesForDomain('thermal')],
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
      source: 'PERN Virtual Sensor Analysis',
      references: referencesForDomain('sensors'),
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}