/**
 * PERN v3 — Geo-Aware Compliance Engine
 * Reverse-geocodes GPS coordinates to country, then loads the
 * appropriate regulatory framework for threshold comparisons.
 */
const logger = require('../utils/logger');

const complianceHistory = [];

const FRAMEWORKS = {
  EG: { country: 'Egypt', authority: 'EEAA', framework: 'Law 4/1994', standards: { pm25: { threshold: 70, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 150, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 80, unit: 'ppb', averaging: '1h' }, so2: { threshold: 60, unit: 'ppb', averaging: '24h' }, co: { threshold: 9000, unit: 'ppb', averaging: '8h' } } },
  US: { country: 'United States', authority: 'EPA', framework: 'NAAQS', standards: { pm25: { threshold: 35, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 150, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 100, unit: 'ppb', averaging: '1h' }, o3: { threshold: 70, unit: 'ppb', averaging: '8h' }, so2: { threshold: 75, unit: 'ppb', averaging: '1h' }, co: { threshold: 9000, unit: 'ppb', averaging: '8h' } } },
  GB: { country: 'United Kingdom', authority: 'DEFRA', framework: 'Environment Act 2021', standards: { pm25: { threshold: 25, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 60, unit: 'ppb', averaging: '1h' }, so2: { threshold: 48, unit: 'ppb', averaging: '1h' } } },
  DE: { country: 'Germany', authority: 'UBA', framework: 'EU 2008/50/EC', standards: { pm25: { threshold: 25, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '1h' }, o3: { threshold: 60, unit: 'ppb', averaging: '8h' }, so2: { threshold: 48, unit: 'ppb', averaging: '1h' } } },
  IN: { country: 'India', authority: 'CPCB', framework: 'NAAQS', standards: { pm25: { threshold: 60, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 100, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '24h' }, so2: { threshold: 30, unit: 'ppb', averaging: '24h' }, co: { threshold: 1800, unit: 'ppb', averaging: '8h' } } },
  CN: { country: 'China', authority: 'MEE', framework: 'GB 3095-2012', standards: { pm25: { threshold: 35, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '24h' }, so2: { threshold: 50, unit: 'ppb', averaging: '24h' }, o3: { threshold: 60, unit: 'ppb', averaging: '8h' } } },
  AU: { country: 'Australia', authority: 'NEPC', framework: 'NEPM AAQ', standards: { pm25: { threshold: 25, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '1h' }, so2: { threshold: 20, unit: 'ppb', averaging: '1h' }, o3: { threshold: 40, unit: 'ppb', averaging: '4h' } } },
  JP: { country: 'Japan', authority: 'MOE', framework: 'Environmental Quality Standards', standards: { pm25: { threshold: 35, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 100, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '24h' }, so2: { threshold: 40, unit: 'ppb', averaging: '24h' } } },
  CA: { country: 'Canada', authority: 'CCME', framework: 'AAQS', standards: { pm25: { threshold: 28, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 60, unit: 'ppb', averaging: '1h' }, so2: { threshold: 20, unit: 'ppb', averaging: '1h' }, o3: { threshold: 40, unit: 'ppb', averaging: '8h' } } },
  BR: { country: 'Brazil', authority: 'CONAMA', framework: 'Resolution 491/2018', standards: { pm25: { threshold: 25, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 60, unit: 'ppb', averaging: '1h' }, so2: { threshold: 20, unit: 'ppb', averaging: '24h' }, o3: { threshold: 40, unit: 'ppb', averaging: '8h' } } },
  ZA: { country: 'South Africa', authority: 'NEM:AQA', framework: 'GN 1210/2009', standards: { pm25: { threshold: 40, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 75, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 100, unit: 'ppb', averaging: '1h' }, so2: { threshold: 48, unit: 'ppb', averaging: '24h' } } },
  MX: { country: 'Mexico', authority: 'SALUD', framework: 'NOM-025-SSA1-2021', standards: { pm25: { threshold: 45, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 75, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 53, unit: 'ppb', averaging: '1h' }, so2: { threshold: 30, unit: 'ppb', averaging: '24h' }, o3: { threshold: 41, unit: 'ppb', averaging: '8h' } } },
  RU: { country: 'Russia', authority: 'Rospotrebnadzor', framework: 'GN 2.1.6.3492-17', standards: { pm25: { threshold: 35, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 60, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '1h' }, so2: { threshold: 20, unit: 'ppb', averaging: '1h' }, co: { threshold: 5000, unit: 'ppb', averaging: '8h' } } },
  SA: { country: 'Saudi Arabia', authority: 'PME', framework: 'Ambient Air Quality Standards', standards: { pm25: { threshold: 35, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 80, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '1h' }, so2: { threshold: 30, unit: 'ppb', averaging: '1h' } } },
  AE: { country: 'UAE', authority: 'MOCCAE', framework: 'Cabinet Resolution 39/2019', standards: { pm25: { threshold: 30, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 100, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '1h' }, so2: { threshold: 30, unit: 'ppb', averaging: '1h' } } },
  SG: { country: 'Singapore', authority: 'NEA', framework: 'Targets 2025', standards: { pm25: { threshold: 18, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 25, unit: 'ppb', averaging: '1h' }, so2: { threshold: 20, unit: 'ppb', averaging: '24h' }, o3: { threshold: 40, unit: 'ppb', averaging: '8h' } } },
  KR: { country: 'South Korea', authority: 'MOE', framework: 'Integrated Air Quality Index', standards: { pm25: { threshold: 35, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 30, unit: 'ppb', averaging: '24h' }, so2: { threshold: 15, unit: 'ppb', averaging: '24h' }, o3: { threshold: 30, unit: 'ppb', averaging: '8h' } } },
  NG: { country: 'Nigeria', authority: 'NESREA', framework: 'Air Quality Regulations 2021', standards: { pm25: { threshold: 35, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 75, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 50, unit: 'ppb', averaging: '1h' }, so2: { threshold: 30, unit: 'ppb', averaging: '1h' } } },
  AR: { country: 'Argentina', authority: 'MAyDS', framework: 'Law 20284', standards: { pm25: { threshold: 25, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 50, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 40, unit: 'ppb', averaging: '1h' }, so2: { threshold: 12, unit: 'ppb', averaging: '24h' } } },
  ID: { country: 'Indonesia', authority: 'KLHK', framework: 'PP 41/1999 + ISPU', standards: { pm25: { threshold: 65, unit: 'ug/m3', averaging: '24h' }, pm10: { threshold: 150, unit: 'ug/m3', averaging: '24h' }, no2: { threshold: 80, unit: 'ppb', averaging: '1h' }, so2: { threshold: 45, unit: 'ppb', averaging: '1h' }, co: { threshold: 9000, unit: 'ppb', averaging: '8h' } } },
};

const COUNTRY_BBOX = {
  EG: { north: 32, south: 22, east: 37, west: 25 },
  US: { north: 50, south: 24, east: -66, west: -126 },
  GB: { north: 60, south: 49, east: 2, west: -9 },
  DE: { north: 56, south: 47, east: 16, west: 5 },
  IN: { north: 38, south: 6, east: 98, west: 66 },
  CN: { north: 54, south: 18, east: 135, west: 73 },
  AU: { north: -10, south: -44, east: 155, west: 112 },
  JP: { north: 46, south: 30, east: 147, west: 129 },
  CA: { north: 72, south: 41, east: -52, west: -142 },
  BR: { north: 5, south: -34, east: -34, west: -74 },
  ZA: { north: -22, south: -35, east: 33, west: 16 },
  MX: { north: 33, south: 14, east: -86, west: -119 },
  RU: { north: 72, south: 41, east: 180, west: 19 },
  SA: { north: 31, south: 16, east: 56, west: 34 },
  AE: { north: 26, south: 22, east: 57, west: 51 },
  SG: { north: 1.5, south: 1.1, east: 104.2, west: 103.5 },
  KR: { north: 39, south: 33, east: 130, west: 124 },
  NG: { north: 14, south: 4, east: 15, west: 2 },
  AR: { north: -21, south: -56, east: -53, west: -74 },
  ID: { north: 6, south: -11, east: 142, west: 95 },
};

class ComplianceEngine {
  listFrameworks() {
    return Object.entries(FRAMEWORKS).map(([code, fw]) => ({ country_code: code, ...fw }));
  }

  getFramework(countryCode) {
    return FRAMEWORKS[countryCode?.toUpperCase()] || null;
  }

  detectCountry(lat, lng) {
    for (const [code, bbox] of Object.entries(COUNTRY_BBOX)) {
      if (lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east) {
        return code;
      }
    }
    return 'US';
  }

  checkCompliance(countryCode, readings) {
    const framework = this.getFramework(countryCode);
    if (!framework) return { compliant: true, exceedances: [] };
    const exceedances = [];
    for (const [param, value] of Object.entries(readings)) {
      const standard = framework.standards[param];
      if (standard && value > standard.threshold) {
        exceedances.push({ parameter: param, value, limit: standard.threshold, unit: standard.unit, averaging: standard.averaging, exceeded_by: Math.round((value / standard.threshold - 1) * 100) });
      }
    }
    return { country: framework.country, framework: framework.framework, authority: framework.authority, compliant: exceedances.length === 0, exceedances };
  }

  generateReport(orgId, lat, lng, readings) {
    const countryCode = this.detectCountry(lat, lng);
    const framework = this.getFramework(countryCode);
    const compliance = this.checkCompliance(countryCode, readings);
    const report = {
      id: 'cr-' + Date.now(),
      organization_id: orgId,
      generated_at: new Date().toISOString(),
      location: { latitude: lat, longitude: lng, country: framework?.country || 'Unknown', country_code: countryCode },
      framework: framework ? { name: framework.framework, authority: framework.authority } : null,
      compliance,
      summary: compliance.compliant ? 'All parameters within regulatory limits' : `${compliance.exceedances.length} exceedance(s) detected`,
    };
    complianceHistory.unshift(report);
    if (complianceHistory.length > 1000) complianceHistory.length = 1000;
    return report;
  }

  getHistory(limit = 50, countryCode) {
    let results = complianceHistory;
    if (countryCode) results = results.filter(r => r.location?.country_code === countryCode.toUpperCase());
    return results.slice(0, limit);
  }

  getTrends(countryCode, days = 7) {
    const reports = countryCode ? this.getHistory(500, countryCode) : this.getHistory(500);
    const cutoff = Date.now() - days * 86400000;
    const recent = reports.filter(r => new Date(r.generated_at).getTime() > cutoff);
    const total = recent.length;
    const compliant = recent.filter(r => r.compliance?.compliant).length;
    const withExceedances = recent.filter(r => r.compliance?.exceedances?.length > 0);
    const paramTrends = {};
    withExceedances.forEach(r => r.compliance.exceedances.forEach(e => {
      if (!paramTrends[e.parameter]) paramTrends[e.parameter] = { count: 0, avg_exceedance: 0 };
      paramTrends[e.parameter].count++;
      paramTrends[e.parameter].avg_exceedance += e.exceeded_by || 0;
    }));
    Object.values(paramTrends).forEach((t) => t.avg_exceedance = Math.round(t.avg_exceedance / t.count));
    return {
      period_days: days,
      total_reports: total,
      compliant_reports: compliant,
      non_compliant_reports: total - compliant,
      compliance_rate: total ? Math.round((compliant / total) * 100) : 100,
      top_exceedances: Object.entries(paramTrends).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([k, v]) => ({ parameter: k, ...v })),
    };
  }

  getStats() {
    return {
      total_reports: complianceHistory.length,
      unique_countries: [...new Set(complianceHistory.map(r => r.location?.country_code).filter(Boolean))].length,
      last_report: complianceHistory[0] || null,
    };
  }
}

module.exports = new ComplianceEngine();
