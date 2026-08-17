/**
 * Sensor.Community Source Adapter (v3)
 * Citizen-science PM sensor network (no auth required).
 * Real HTTP fetch with simulated fallback.
 * https://github.com/opendata-stuttgart/sensors-software
 */
const logger = require('../../utils/logger');

function _simulate(lat, lng) {
  const urbanFactor = Math.min(1, Math.max(0.1,
    (Math.abs(lat - 30) < 5 && Math.abs(lng - 31) < 3) ? 0.9 : 0.5
  ));
  return {
    pm25: 12 + urbanFactor * 35,
    pm10: 20 + urbanFactor * 50,
    temperature: 22 + Math.random() * 8,
    humidity: 40 + Math.random() * 30,
    pressure: 1000 + Math.round(Math.random() * 15),
  };
}

function _normalize(raw) {
  return {
    pm25: raw.pm25 ?? null,
    pm10: raw.pm10 ?? null,
    temperature: raw.temperature ?? null,
    humidity: raw.humidity ?? null,
    pressure: raw.pressure ?? null,
  };
}

async function fetchByBox(north, south, east, west) {
  try {
    const res = await fetch(
      `https://data.sensor.community/airrohr/v1/box/area/${south},${north},${west},${east}?format=json`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Sensor.Community HTTP ${res.status}`);
    const data = await res.json();
    const readings = (Array.isArray(data) ? data : []).slice(0, 20).map((item) => {
      const sensors = item.sensordatavalues || [];
      const val = (type) => {
        const s = sensors.find((x) => x.value_type === type);
        return s && s.value != null ? parseFloat(s.value) : null;
      };
      return {
        location: item.location?.city || 'Unknown',
        latitude: item.location?.latitude ?? null,
        longitude: item.location?.longitude ?? null,
        ..._normalize({ pm25: val('P2'), pm10: val('P1'), temperature: val('temperature'), humidity: val('humidity'), pressure: val('pressure') }),
      };
    });
    if (readings.length === 0) throw new Error('Sensor.Community no data');
    return readings;
  } catch (err) {
    logger.warn('[Sensor.Community] fetch failed, falling back to simulation', { error: err.message });
    return [{ location: 'Simulated', latitude: (south + north) / 2, longitude: (west + east) / 2, ..._normalize(_simulate((south + north) / 2, (west + east) / 2)) }];
  }
}

async function fetchByCountry(country = 'EG') {
  try {
    const res = await fetch(
      `https://data.sensor.community/airrohr/v1/filter/country=${country}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Sensor.Community HTTP ${res.status}`);
    const data = await res.json();
    const readings = (Array.isArray(data) ? data : []).slice(0, 20).map((item) => {
      const sensors = item.sensordatavalues || [];
      const val = (type) => {
        const s = sensors.find((x) => x.value_type === type);
        return s && s.value != null ? parseFloat(s.value) : null;
      };
      return {
        location: item.location?.city || 'Unknown',
        latitude: item.location?.latitude ?? null,
        longitude: item.location?.longitude ?? null,
        ..._normalize({ pm25: val('P2'), pm10: val('P1'), temperature: val('temperature'), humidity: val('humidity'), pressure: val('pressure') }),
      };
    });
    if (readings.length === 0) throw new Error('Sensor.Community no data');
    return readings;
  } catch (err) {
    logger.warn('[Sensor.Community] fetchByCountry failed, falling back to simulation', { error: err.message });
    return [{ location: 'Simulated', latitude: 30, longitude: 31, ..._normalize(_simulate(30, 31)) }];
  }
}

module.exports = {
  id: 'sensor_community',
  baseTrust: 0.50,
  frequencyMinutes: 30,
  isConfigured: () => true,
  fetchByBox,
  fetchByCountry,
};
