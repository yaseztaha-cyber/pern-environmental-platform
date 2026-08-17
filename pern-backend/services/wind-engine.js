/**
 * PERN v3 — Wind & Pollution Trajectory AI
 * Open-Meteo based wind forecasting + forward plume trajectory model.
 */
const logger = require('../utils/logger');
const db = require('../db');

class WindEngine {
  constructor() {
    this.cachedForecasts = new Map();
    this.plumeEvents = [];
  }

  async fetchForecast(lat, lng) {
    const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = this.cachedForecasts.get(cacheKey);
    if (cached && Date.now() - cached.ts < 3600000) return cached.data;

    let data;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=windspeed_10m,winddirection_10m,temperature_2m&forecast_days=2&timezone=UTC`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const body = await res.json();
      const hourly = body.hourly || {};
      data = {
        latitude: lat, longitude: lng, forecasted_at: new Date().toISOString(),
        source: 'open-meteo',
        hourly: (hourly.time || []).map((t, i) => ({
          hour: i,
          wind_speed: Math.round((hourly.windspeed_10m?.[i] || 0) * 10) / 10,
          wind_direction: Math.round(hourly.winddirection_10m?.[i] || 0),
          temperature: Math.round((hourly.temperature_2m?.[i] || 0) * 10) / 10,
          time: t,
        })),
      };
      // Persist wind trajectories for the first 12 forecast hours
      for (let i = 0; i < Math.min(12, data.hourly.length); i++) {
        const h = data.hourly[i];
        db.saveWindTrajectory({
          latitude: lat, longitude: lng, altitude: 10,
          windSpeed: h.wind_speed, windDirection: h.wind_direction,
          forecastHorizon: i, forecastedAt: h.time,
        });
      }
    } catch (err) {
      logger.warn('[Wind] Open-Meteo failed, using simulated forecast', { error: err.message });
      data = {
        latitude: lat, longitude: lng, forecasted_at: new Date().toISOString(),
        source: 'simulated',
        hourly: Array.from({ length: 48 }, (_, i) => ({
          hour: i, wind_speed: Math.round((2 + Math.random() * 15) * 10) / 10,
          wind_direction: Math.round(Math.random() * 360),
          temperature: Math.round((15 + Math.random() * 20) * 10) / 10,
        })),
      };
    }
    this.cachedForecasts.set(cacheKey, { data, ts: Date.now() });
    return data;
  }

  calculatePlumePath(originLat, originLng, pollutant, hours) {
    const forecast = this.cachedForecasts.get(`${originLat.toFixed(2)},${originLng.toFixed(2)}`);
    const trajectory = [];
    let lat = originLat, lng = originLng;
    const speedKmh = 10;
    for (let h = 0; h < (hours || 24); h++) {
      const wind = forecast?.data?.hourly?.[h] || { wind_speed: 10, wind_direction: 180 };
      const rad = (wind.wind_direction || 180) * Math.PI / 180;
      const dist = (wind.wind_speed || 10) * speedKmh / 111;
      lat += dist * Math.cos(rad) * 0.01;
      lng += dist * Math.sin(rad) * 0.01;
      const concentration = Math.max(0, 100 - h * 4);
      trajectory.push({ hour: h, lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000, concentration: Math.round(concentration) });
    }
    return { origin: { lat: originLat, lng: originLng }, pollutant: pollutant || 'PM2.5', trajectory };
  }

  findUpstreamSources(lat, lng, radiusKm) {
    return { target: { lat, lng }, radius_km: radiusKm || 50, sources: [
      { name: 'Industrial Zone', lat: lat + 0.5, lng: lng - 0.3, estimated_contribution: 'High', distance_km: Math.round(radiusKm * 0.6) },
    ], wind_direction: 'NW', message: 'Simulated upstream analysis' };
  }

  predictDownwindImpact(sourceLat, sourceLng, pollutant) {
    const path = this.calculatePlumePath(sourceLat, sourceLng, pollutant, 24);
    const affected = path.trajectory.filter(p => p.concentration > 50).map(p => ({ lat: p.lat, lng: p.lng, estimated_concentration: p.concentration }));
    return { source: { lat: sourceLat, lng: sourceLng }, pollutant, affected_areas: affected, total_affected: affected.length };
  }

  detectPlumeEvents(lat, lng, readings) {
    const event = { id: `plume_${Date.now()}`, detected_at: new Date().toISOString(), source_lat: lat, source_lon: lng, pollutant: 'PM2.5', trajectory_path: this.calculatePlumePath(lat, lng, 'PM2.5', 12).trajectory, affected_regions: ['Downwind area'], severity: readings?.pm25 > 100 ? 'critical' : 'moderate' };
    this.plumeEvents.push(event);
    if (this.plumeEvents.length > 100) this.plumeEvents.splice(0, this.plumeEvents.length - 100);
    db.savePlumeEvent({
      sourceLat: lat, sourceLon: lng, pollutant: event.pollutant,
      concentration: readings?.pm25 ?? null,
      trajectoryPath: event.trajectory_path,
      affectedRegions: event.affected_regions,
    });
    return event;
  }

  getStoredTrajectories(region, hours) {
    return this.plumeEvents.filter(e => e.affected_regions.some(r => r.toLowerCase().includes((region || '').toLowerCase()))).slice(-(hours || 24));
  }

  getPlumeEvents() { return this.plumeEvents; }
}

module.exports = new WindEngine();
