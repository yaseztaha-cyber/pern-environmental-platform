/**
 * Data Retention Service — periodically cleans old sensor data based on retention policies.
 */

const db = require('../db');
const logger = require('../utils/logger');

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
};
