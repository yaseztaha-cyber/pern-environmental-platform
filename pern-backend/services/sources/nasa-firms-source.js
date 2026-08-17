/**
 * NASA FIRMS Source Adapter (v3)
 * Fire / thermal anomaly detection via MODIS & VIIRS.
 * Real CSV fetch when NASA_FIRMS_API_KEY is set, simulated fallback otherwise.
 * https://firms.modaps.eosdis.nasa.gov/
 */
const logger = require('../../utils/logger');

const API_KEY = process.env.NASA_FIRMS_API_KEY || '';

function _simulate(lat, lng) {
  return {
    latitude: lat,
    longitude: lng,
    frp: Math.round(Math.random() * 50 * 100) / 100,
    brightness: Math.round((300 + Math.random() * 100) * 100) / 100,
    confidence: Math.round(Math.random() * 100) / 100,
    satellite: Math.random() > 0.5 ? 'VIIRS-SNPP' : 'MODIS-Terra',
    daynight: Math.random() > 0.5 ? 'D' : 'N',
    acq_date: new Date().toISOString().slice(0, 10),
  };
}

function _parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = cells[i]?.trim(); });
    return obj;
  });
}

async function fetchFires(lat, lng, days = 2) {
  if (!API_KEY) {
    logger.debug('[NASA FIRMS] No API key, using simulated data');
    return [_simulate(lat, lng)];
  }
  try {
    // Clamp coordinates into a small bounding box around the point (~0.5 deg)
    const coords = `${Math.max(-180, lng - 0.25)},${Math.max(-90, lat - 0.25)},${Math.min(180, lng + 0.25)},${Math.min(90, lat + 0.25)}`;
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${API_KEY}/VIIRS_SNPP_NRT/${coords}/${days}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`NASA FIRMS HTTP ${res.status}`);
    const text = await res.text();
    const rows = _parseCsv(text);
    if (rows.length === 0) throw new Error('NASA FIRMS no data');
    return rows.map((r) => ({
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      frp: r.frp != null ? parseFloat(r.frp) : null,
      brightness: r.brightness != null ? parseFloat(r.brightness) : null,
      confidence: r.confidence != null ? parseFloat(r.confidence) : null,
      satellite: r.satellite || 'unknown',
      daynight: r.daynight || 'D',
      acq_date: r.acq_date || null,
    }));
  } catch (err) {
    logger.warn('[NASA FIRMS] fetch failed, falling back to simulation', { error: err.message });
    return [_simulate(lat, lng)];
  }
}

module.exports = {
  id: 'nasa_firms',
  baseTrust: 0.80,
  frequencyMinutes: 180,
  isConfigured: () => Boolean(API_KEY),
  fetchFires,
};
