/**
 * Data Retention Service — periodically cleans old data.
 * 1. Policy-based cleanup (user-configurable data_retention_policies) for sensor_readings.
 * 2. Global v3.1 retention policy for data-fabric tables:
 *    - Raw external readings: 90 days
 *    - Sensor confidence scores: 30 days (recomputed, not kept forever)
 *    - Wind trajectories: 7 days (forecasts become obsolete)
 *    - Plume events: 90 days
 * Compliance reports (PDF) are retained indefinitely.
 */

const db = require('../db');
const logger = require('../utils/logger');

const RETENTION_RULES = [
  { table: 'external_readings', column: 'timestamp', days: 90 },
  { table: 'sensor_confidence_scores', column: 'last_evaluated_at', days: 30 },
  { table: 'wind_trajectories', column: 'created_at', days: 7 },
  { table: 'plume_events', column: 'detected_at', days: 90 },
];

let intervalId = null;

module.exports = {
  start(intervalMs = 3600000) {
    if (intervalId) return;
    intervalId = setInterval(async () => {
      try {
        const deleted = await db.cleanupOldData();
        if (deleted > 0) {
          logger.info(`[DataRetention] Cleaned ${deleted} old readings`);
        }
        const summary = await db.runRetention(RETENTION_RULES);
        logger.info(`[DataRetention] Global purge ${JSON.stringify(summary)}`);
      } catch (err) {
        logger.error('[DataRetention] Cleanup failed', { error: err.message });
      }
    }, intervalMs);
    logger.info(`[DataRetention] Started (interval: ${intervalMs / 1000}s)`);
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  RETENTION_RULES,
};
