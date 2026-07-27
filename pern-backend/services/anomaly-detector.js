/**
 * Anomaly Detector — lightweight Z-score based anomaly detection for sensor values.
 */

const windowSize = 50;

class AnomalyDetector {
  constructor() {
    this.deviceWindows = new Map();
  }

  analyze(deviceId, sensor, value) {
    const key = `${deviceId}:${sensor}`;
    if (!this.deviceWindows.has(key)) {
      this.deviceWindows.set(key, []);
    }
    const window = this.deviceWindows.get(key);
    window.push(value);
    if (window.length > windowSize) window.shift();

    if (window.length < 10) return { isAnomaly: false };

    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return { isAnomaly: false };

    const zScore = Math.abs((value - mean) / stdDev);
    const threshold = 3.0;

    if (zScore > threshold) {
      return {
        isAnomaly: true,
        zScore: Math.round(zScore * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        reason: `${sensor} value ${value} deviates ${zScore.toFixed(1)}σ from mean ${mean.toFixed(1)} (device: ${deviceId})`,
      };
    }

    return { isAnomaly: false };
  }
}

module.exports = new AnomalyDetector();
