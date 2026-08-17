/**
 * Unified Virtual Sensor System
 * Combines computed (10) + estimated (17) virtual sensors in one API.
 */
import { computeDynamicVirtualSensors, getComputedSensorSummary, VIRTUAL_SENSOR_METADATA, type VirtualSensorResult } from './virtual-sensors';
import { computeEstimatedSensors, getEstimatedSensorSummary, getUnlockedTiers, ESTIMATOR_METADATA, type EstimatedSensor } from './virtual-sensor-estimators';

export interface UnifiedSensorGroup {
  computed: VirtualSensorResult[];
  estimated: EstimatedSensor[];
}

export interface UnifiedSensorSummary {
  computed: { total: number; avgConfidence: number; highConf: number; available: number; missing: number };
  estimated: { total: number; avgConfidence: number; highConf: number; byTier: Record<number, number> };
  grandTotal: number;
  unlockedTiers: number[];
}

export interface UnifiedSensorEntry {
  id: string;
  name: string;
  unit: string;
  value: number;
  category: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical';
  confidence: number;
  source: 'computed' | 'estimated';
  tier?: number;
  formula: string;
}

/**
 * Compute both computed + estimated virtual sensors from physical readings.
 */
export function computeUnifiedVirtualSensors(physicalReadings: Record<string, number>): UnifiedSensorGroup {
  return {
    computed: computeDynamicVirtualSensors(physicalReadings),
    estimated: computeEstimatedSensors(physicalReadings).all,
  };
}

/**
 * Get aggregate summary across both computed and estimated sensors.
 */
export function getUnifiedSensorSummary(physicalReadings: Record<string, number>, group: UnifiedSensorGroup): UnifiedSensorSummary {
  const computedSummary = getComputedSensorSummary(group.computed);
  const estimatedSummary = getEstimatedSensorSummary(group.estimated);
  const physicalKeys = Object.keys(physicalReadings);
  return {
    computed: {
      total: computedSummary.total,
      avgConfidence: computedSummary.avgConfidence,
      highConf: computedSummary.highConf,
      available: computedSummary.available,
      missing: computedSummary.missing,
    },
    estimated: {
      total: estimatedSummary.total,
      avgConfidence: estimatedSummary.avgConfidence,
      highConf: estimatedSummary.highConf,
      byTier: estimatedSummary.byTier,
    },
    grandTotal: computedSummary.total + estimatedSummary.total,
    unlockedTiers: getUnlockedTiers(physicalKeys),
  };
}

/**
 * Flatten both groups into a single list for list views.
 */
export function flattenUnifiedSensors(group: UnifiedSensorGroup): UnifiedSensorEntry[] {
  const entries: UnifiedSensorEntry[] = [];
  for (const c of group.computed) {
    entries.push({ id: c.id, name: c.name, unit: c.unit, value: c.value, category: c.category, confidence: c.confidence, source: 'computed', formula: c.formula });
  }
  for (const e of group.estimated) {
    entries.push({ id: e.id, name: e.name, unit: e.unit, value: e.value, category: e.category, confidence: e.confidence, source: 'estimated', tier: e.tier, formula: e.formula });
  }
  return entries;
}

/**
 * Get metadata for a sensor by ID, searching both computed and estimated metadata.
 */
export function getSensorMetaById(id: string): { name: string; unit: string; description: string; typicalRange: [number, number]; source: 'computed' | 'estimated' } | null {
  const computed = VIRTUAL_SENSOR_METADATA.find(m => m.id === id);
  if (computed) return { name: computed.name, unit: computed.unit, description: computed.description, typicalRange: computed.typicalRange, source: 'computed' };

  const estimated = ESTIMATOR_METADATA.find(m => m.id === id);
  if (estimated) return { name: estimated.name, unit: estimated.unit, description: estimated.description, typicalRange: estimated.typicalRange, source: 'estimated' };

  return null;
}
