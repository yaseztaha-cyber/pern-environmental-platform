/**
 * PERN Backend AI References
 * Central citation database backing every backend AI analysis output.
 * Mirrors pern-frontend/src/lib/ai-references.ts IDs so citations stay
 * coherent across the stack. Every entry is a real standard, guideline,
 * or peer-reviewed publication.
 */

const REFERENCES = [
  // ── Air quality — standards & guidelines ─────────────────────────────────
  { id: 'who-aqg-2021', kind: 'guideline', authors: 'World Health Organization', year: 2021, publisher: 'WHO, Geneva', title: 'WHO Global Air Quality Guidelines 2021', tags: ['air', 'pm25', 'pm10', 'no2', 'o3', 'so2', 'co'] },
  { id: 'epa-naaqs', kind: 'standard', authors: 'US Environmental Protection Agency', year: 2024, publisher: 'EPA, Washington DC', title: 'National Ambient Air Quality Standards (NAAQS) — PM2.5, PM10, O₃, SO₂, NO₂, CO', tags: ['air', 'pm25', 'pm10', 'o3', 'so2', 'no2', 'co'] },
  { id: 'epa-aqi', kind: 'guideline', authors: 'US Environmental Protection Agency', year: 2024, publisher: 'EPA-454/B-24-002', title: 'Technical Assistance Document for the Reporting of Daily Air Quality — the Air Quality Index (AQI)', tags: ['air', 'aqi', 'pm25', 'pm10', 'no2', 'o3', 'so2', 'co'] },
  { id: 'who-iaq-2010', kind: 'guideline', authors: 'World Health Organization Regional Office for Europe', year: 2010, publisher: 'WHO, Copenhagen', title: 'WHO Guidelines for Indoor Air Quality: Selected Pollutants (CO, NO₂, VOC, formaldehyde)', tags: ['indoor', 'air', 'voc', 'co', 'no2', 'co2'] },
  { id: 'ashrae-62', kind: 'standard', authors: 'ASHRAE', year: 2022, publisher: 'ASHRAE, Atlanta', title: 'ASHRAE Standard 62.1-2022 — Ventilation for Acceptable Indoor Air Quality', tags: ['indoor', 'ventilation', 'co2', 'air'] },
  { id: 'en16798', kind: 'standard', authors: 'CEN', year: 2019, publisher: 'European Committee for Standardization', title: 'EN 16798-1:2019 — Energy performance of buildings — Indoor environmental input parameters', tags: ['indoor', 'co2', 'thermal', 'ventilation'] },
  { id: 'egypt-law4', kind: 'standard', authors: 'Arab Republic of Egypt', year: 2009, publisher: 'Egyptian Environmental Affairs Agency, Cairo', title: 'Law No. 4 of 1994 for the Protection of the Environment (amended 9/2009) — ambient air quality limits', tags: ['air', 'egypt', 'standard'] },
  { id: 'egypt-drinking-458', kind: 'standard', authors: 'Ministry of Health and Population, Egypt', year: 2007, publisher: 'Decree 458/2007, Cairo', title: 'Egyptian Standards for Drinking Water (Decree 458/2007)', tags: ['water', 'egypt', 'drinking'] },
  { id: 'egypt-1048', kind: 'standard', authors: 'Egyptian Organization for Standardization', year: 2018, publisher: 'EOS 1048/2018, Cairo', title: 'Egyptian Standard 1048 — Drinking Water (2018 revision)', tags: ['water', 'egypt', 'drinking'] },
  { id: 'osha-co', kind: 'standard', authors: 'US Occupational Safety and Health Administration', year: 1978, publisher: 'OSHA 29 CFR 1910.1000', title: 'OSHA Permissible Exposure Limits — Carbon Monoxide (50 ppm TWA)', tags: ['co', 'occupational', 'air'] },
  { id: 'niosh-co', kind: 'standard', authors: 'CDC / National Institute for Occupational Safety and Health', year: 2019, publisher: 'NIOSH Pocket Guide to Chemical Hazards', title: 'NIOSH REL — Carbon Monoxide (35 ppm TWA, 200 ppm ceiling)', tags: ['co', 'occupational', 'air'] },
  { id: 'osha-nh3', kind: 'standard', authors: 'US Occupational Safety and Health Administration', year: 1978, publisher: 'OSHA 29 CFR 1910.1000', title: 'OSHA PEL — Ammonia (50 ppm TWA)', tags: ['nh3', 'occupational'] },
  { id: 'niosh-nh3', kind: 'standard', authors: 'CDC / National Institute for Occupational Safety and Health', year: 2019, publisher: 'NIOSH Pocket Guide to Chemical Hazards', title: 'NIOSH REL — Ammonia (25 ppm TWA, 35 ppm STEL)', tags: ['nh3', 'occupational'] },
  { id: 'who-nh3', kind: 'guideline', authors: 'World Health Organization', year: 1986, publisher: 'WHO Regional Office for Europe, Copenhagen', title: 'WHO Air Quality Guidelines for Europe — Ammonia (200 µg/m³ community exposure)', tags: ['nh3', 'air'] },

  // ── Air quality — health-effects research ─────────────────────────────────
  { id: 'dockery-1993', kind: 'research', authors: 'Dockery, D.W., Pope, C.A., Xu, X. et al.', year: 1993, publisher: 'New England Journal of Medicine 329(24), 1753–1759', title: 'An Association between Air Pollution and Mortality in Six U.S. Cities', tags: ['pm25', 'health', 'mortality', 'air'] },
  { id: 'pope-2002', kind: 'research', authors: 'Pope, C.A., Burnett, R.T., Thun, M.J. et al.', year: 2002, publisher: 'JAMA 287(9), 1132–1141', title: 'Lung Cancer, Cardiopulmonary Mortality, and Long-term Exposure to Fine Particulate Air Pollution', tags: ['pm25', 'health', 'mortality', 'air'] },
  { id: 'burnett-2018', kind: 'research', authors: 'Burnett, R.T., Chen, H., Szyszkowicz, M. et al.', year: 2018, publisher: 'The Lancet Planetary Health 2(10), e451–e462', title: 'Global estimates of mortality associated with long-term exposure to outdoor fine particulate matter (GEMM model)', tags: ['pm25', 'health', 'mortality', 'air'] },
  { id: 'cohen-2017', kind: 'research', authors: 'Cohen, A.J., Brauer, M., Burnett, R. et al.', year: 2017, publisher: 'The Lancet 389(10082), 1907–1918', title: 'Estimates and 25-year trends of the global burden of disease attributable to ambient air pollution (GBD)', tags: ['air', 'health', 'pm25'] },
  { id: 'allen-2016', kind: 'research', authors: 'Allen, J.G., MacNaughton, P., Satish, U. et al.', year: 2016, publisher: 'Environmental Health Perspectives 124(6), 805–812', title: 'Associations of Cognitive Function Scores with Carbon Dioxide, Ventilation, and Volatile Organic Compound Exposures in Office Workers', tags: ['co2', 'cognition', 'indoor', 'ventilation'] },
  { id: 'satish-2012', kind: 'research', authors: 'Satish, U., Mendell, M.J., Shekhar, K. et al.', year: 2012, publisher: 'Environmental Health Perspectives 120(12), 1671–1677', title: 'Is CO₂ an Indoor Pollutant? Direct Effects of Low-to-Moderate CO₂ Concentrations on Human Decision-Making Performance', tags: ['co2', 'cognition', 'indoor'] },

  // ── Low-cost sensor networks ──────────────────────────────────────────────
  { id: 'kumar-2015', kind: 'research', authors: 'Kumar, P., Morawska, L., Martani, C. et al.', year: 2015, publisher: 'Environment International 75, 199–205', title: 'The rise of low-cost sensing for managing air pollution in cities', tags: ['sensor', 'pm25', 'air', 'low-cost'] },
  { id: 'sousan-2016', kind: 'research', authors: 'Sousan, S., Koehler, K., Thomas, G. et al.', year: 2016, publisher: 'Journal of Occupational and Environmental Hygiene 13(5), 363–373', title: 'Inter-comparison of low-cost sensors for measuring the mass concentration of occupational aerosols (AQ-SPEC)', tags: ['sensor', 'pm25', 'calibration', 'air'] },
  { id: 'castell-2017', kind: 'research', authors: 'Castell, N., Dauge, F.R., Schneider, P. et al.', year: 2017, publisher: 'Environment International 106, 234–244', title: 'Can commercial low-cost sensor platforms contribute to air quality monitoring and exposure estimates?', tags: ['sensor', 'air', 'networks'] },

  // ── Water quality ─────────────────────────────────────────────────────────
  { id: 'who-drinking', kind: 'guideline', authors: 'World Health Organization', year: 2022, publisher: 'WHO, Geneva (4th ed. + addendum)', title: 'Guidelines for Drinking-water Quality', tags: ['water', 'ph', 'tds', 'turbidity', 'drinking'] },
  { id: 'epa-do', kind: 'standard', authors: 'US Environmental Protection Agency', year: 2023, publisher: 'EPA, Washington DC (CWA §304(a))', title: 'Ambient Water Quality Criteria — Dissolved Oxygen (≥ 5–6 mg/L for aquatic life)', tags: ['water', 'dO', 'aquatic'] },
  { id: 'nsf-wqi', kind: 'method', authors: 'Brown, R.M., McClelland, N.I., Deininger, R.A. & Tozer, R.G.', year: 1970, publisher: 'Water & Sewage Works 117(10), 339–343', title: 'A Water Quality Index — Do We Dare? (NSF WQI)', tags: ['water', 'wqi', 'index'] },
  { id: 'epa-swtr', kind: 'standard', authors: 'US Environmental Protection Agency', year: 1989, publisher: '40 CFR 141.71', title: 'Surface Water Treatment Rule — turbidity performance standard (≤ 0.5–1 NTU)', tags: ['water', 'turbidity', 'treatment'] },
  { id: 'apha-standard', kind: 'method', authors: 'APHA, AWWA, WEF', year: 2023, publisher: 'American Public Health Association, Washington DC', title: 'Standard Methods for the Examination of Water and Wastewater (24th ed.)', tags: ['water', 'laboratory', 'method'] },
  { id: 'stumm-1996', kind: 'research', authors: 'Stumm, W. & Morgan, J.J.', year: 1996, publisher: 'Wiley, New York (3rd ed.)', title: 'Aquatic Chemistry: Chemical Equilibria and Rates in Natural Waters', tags: ['water', 'ph', 'carbonate', 'chemistry'] },
  { id: 'emerson-1975', kind: 'research', authors: 'Emerson, K., Russo, R.C., Lund, R.E. & Thurston, R.V.', year: 1975, publisher: 'Journal of the Fisheries Research Board of Canada 32(12), 2379–2383', title: 'Aqueous ammonia equilibrium calculations — effect of pH and temperature', tags: ['water', 'nh3', 'aquaculture'] },

  // ── Thermal comfort ───────────────────────────────────────────────────────
  { id: 'ashrae-55', kind: 'standard', authors: 'ASHRAE', year: 2023, publisher: 'ASHRAE, Atlanta', title: 'ASHRAE Standard 55-2023 — Thermal Environmental Conditions for Human Occupancy', tags: ['thermal', 'comfort', 'humidity', 'hvac'] },
  { id: 'iso-7730', kind: 'standard', authors: 'International Organization for Standardization', year: 2005, publisher: 'ISO, Geneva', title: 'ISO 7730:2005 — Ergonomics of the thermal environment — PMV and PPD', tags: ['thermal', 'comfort', 'pmv'] },
  { id: 'iso-11079', kind: 'standard', authors: 'International Organization for Standardization', year: 2007, publisher: 'ISO, Geneva', title: 'ISO 11079:2007 — Ergonomics — Evaluation of cold environments (IREQ)', tags: ['thermal', 'cold', 'comfort'] },
  { id: 'iso-7243', kind: 'standard', authors: 'International Organization for Standardization', year: 2017, publisher: 'ISO, Geneva', title: 'ISO 7243:2017 — Ergonomics — Heat stress — WBGT estimation', tags: ['thermal', 'heat', 'wbgt'] },
  { id: 'niosh-heat', kind: 'standard', authors: 'CDC / National Institute for Occupational Safety and Health', year: 2016, publisher: 'DHHS (NIOSH) Publication 2016-106', title: 'NIOSH Criteria for a Recommended Standard: Occupational Exposure to Heat and Hot Environments', tags: ['thermal', 'heat', 'occupational'] },
  { id: 'steadman-1979', kind: 'research', authors: 'Steadman, R.G.', year: 1979, publisher: 'Journal of Applied Meteorology 18(7), 861–873', title: 'The assessment of sultriness. Part I: A temperature-humidity index', tags: ['thermal', 'heat-index', 'humidity'] },
  { id: 'rothfusz-1990', kind: 'method', authors: 'Rothfusz, L.P.', year: 1990, publisher: 'NOAA NWS Southern Region SR/SSD 90-23', title: 'The Heat Index Equation', tags: ['thermal', 'heat-index', 'noaa'] },

  // ── Soil / agriculture ────────────────────────────────────────────────────
  { id: 'fao-56', kind: 'method', authors: 'Allen, R.G., Pereira, L.S., Raes, D. & Smith, M.', year: 1998, publisher: 'FAO Irrigation & Drainage Paper 56, Rome', title: 'Crop evapotranspiration — Guidelines for computing crop water requirements (FAO 56)', tags: ['soil', 'vpd', 'evapotranspiration', 'agriculture'] },
  { id: 'usda-nrcs', kind: 'standard', authors: 'USDA Natural Resources Conservation Service', year: 2019, publisher: 'USDA Soil Survey Manual, Handbook 18', title: 'Soil Survey Manual — moisture, temperature and land capability', tags: ['soil', 'agriculture', 'moisture'] },
  { id: 'fao-soil', kind: 'method', authors: 'Food and Agriculture Organization', year: 2023, publisher: 'FAO, Rome', title: 'Standard Operating Procedure for Soil pH, EC, and Moisture', tags: ['soil', 'ph', 'moisture', 'agriculture'] },

  // ── Forecasting & statistics ──────────────────────────────────────────────
  { id: 'fpp3', kind: 'method', authors: 'Hyndman, R.J. & Athanasopoulos, G.', year: 2021, publisher: 'OTexts, Melbourne (3rd ed.)', title: 'Forecasting: Principles and Practice', tags: ['forecast', 'time-series', 'exponential-smoothing'] },
  { id: 'boxjenkins', kind: 'method', authors: 'Box, G.E.P., Jenkins, G.M., Reinsel, G.C. & Ljung, G.M.', year: 2015, publisher: 'Wiley (5th ed.)', title: 'Time Series Analysis: Forecasting and Control', tags: ['forecast', 'arima', 'time-series'] },
  { id: 'gardner-2006', kind: 'research', authors: 'Gardner, E.S.', year: 2006, publisher: 'International Journal of Forecasting 22(4), 637–666', title: 'Exponential smoothing — The state of the art', tags: ['forecast', 'exponential-smoothing', 'holt-winters'] },
  { id: 'm5-2022', kind: 'research', authors: 'Makridakis, S., Spiliotis, E. & Assimakopoulos, V.', year: 2022, publisher: 'International Journal of Forecasting 38(2), 583–602', title: 'M5 Accuracy competition: Results, findings, and conclusions', tags: ['forecast', 'ensemble', 'time-series'] },
  { id: 'willmott-2005', kind: 'research', authors: 'Willmott, C.J. & Matsuura, K.', year: 2005, publisher: 'Climate Research 30(1), 79–82', title: 'Advantages of the mean absolute error (MAE) over the root mean square error (RMSE) in assessing average model performance', tags: ['error-metrics', 'mae', 'rmse', 'forecast'] },
  { id: 'moriasi-2007', kind: 'research', authors: 'Moriasi, D.N., Arnold, J.G., Van Liew, M.W. et al.', year: 2007, publisher: 'Transactions of the ASABE 50(3), 885–900', title: 'Model evaluation guidelines for systematic quantification of accuracy in watershed simulations', tags: ['error-metrics', 'r-squared', 'model-evaluation'] },
  { id: 'shewhart-1931', kind: 'research', authors: 'Shewhart, W.A.', year: 1931, publisher: 'Van Nostrand, New York', title: 'Economic Control of Quality of Manufactured Product', tags: ['spc', 'control-limits', 'quality'] },
  { id: 'montgomery-2009', kind: 'method', authors: 'Montgomery, D.C.', year: 2009, publisher: 'Wiley (6th ed.)', title: 'Introduction to Statistical Quality Control', tags: ['spc', 'ewma', 'process-capability'] },
  { id: 'tukey-1977', kind: 'research', authors: 'Tukey, J.W.', year: 1977, publisher: 'Addison-Wesley, Reading, MA', title: 'Exploratory Data Analysis', tags: ['outliers', 'eda', 'box-plot'] },
  { id: 'iglewicz-1993', kind: 'research', authors: 'Iglewicz, B. & Hoaglin, D.C.', year: 1993, publisher: 'ASQC Basic References in Quality Control, Vol. 16', title: 'How to Detect and Handle Outliers', tags: ['outliers', 'mad', 'z-score'] },
  { id: 'hampel-1974', kind: 'research', authors: 'Hampel, F.R.', year: 1974, publisher: 'Journal of the American Statistical Association 69(346), 383–393', title: 'The influence curve and its role in robust estimation', tags: ['outliers', 'robust-estimation', 'mad'] },
  { id: 'pearson-1895', kind: 'research', authors: 'Pearson, K.', year: 1895, publisher: 'Philosophical Transactions of the Royal Society A 187, 253–318', title: 'Mathematical contributions to the theory of evolution. III. Regression, heredity, and panmixia', tags: ['correlation', 'statistics'] },
  { id: 'venkat-2003', kind: 'research', authors: 'Venkatasubramanian, V., Rengaswamy, R., Yin, K. & Kavuri, S.N.', year: 2003, publisher: 'Computers & Chemical Engineering 27(3), 293–346', title: 'A review of process fault detection and diagnosis', tags: ['fault-detection', 'diagnosis', 'sensor-validation'] },
  { id: 'iso-5725', kind: 'standard', authors: 'International Organization for Standardization', year: 1994, publisher: 'ISO, Geneva', title: 'ISO 5725-1:1994 — Accuracy (trueness and precision) of measurement methods and results', tags: ['measurement-error', 'repeatability', 'standard'] },
  { id: 'who-uv', kind: 'guideline', authors: 'World Health Organization, WMO & UNEP', year: 2002, publisher: 'WHO, Geneva', title: 'Global Solar UV Index — A Practical Guide', tags: ['uv', 'health', 'guideline'] },
];

const DOMAIN_REFS = {
  air: ['who-aqg-2021', 'epa-naaqs', 'epa-aqi', 'egypt-law4', 'cohen-2017'],
  indoor: ['ashrae-62', 'who-iaq-2010', 'en16798', 'allen-2016'],
  water: ['who-drinking', 'nsf-wqi', 'apha-standard', 'stumm-1996', 'egypt-drinking-458'],
  thermal: ['ashrae-55', 'iso-7730', 'iso-7243', 'iso-11079', 'niosh-heat', 'steadman-1979'],
  soil: ['fao-56', 'usda-nrcs', 'fao-soil'],
  forecast: ['fpp3', 'boxjenkins', 'gardner-2006', 'm5-2022', 'willmott-2005', 'moriasi-2007'],
  quality: ['shewhart-1931', 'montgomery-2009', 'iso-5725'],
  anomaly: ['iglewicz-1993', 'hampel-1974', 'tukey-1977'],
  correlation: ['pearson-1895'],
  sensors: ['kumar-2015', 'sousan-2016', 'castell-2017', 'venkat-2003'],
  virtual: ['kumar-2015', 'sousan-2016', 'venkat-2003', 'iso-5725'],
};

const SENSOR_REFS = {
  pm25: ['who-aqg-2021', 'epa-naaqs', 'epa-aqi', 'burnett-2018', 'dockery-1993', 'pope-2002', 'kumar-2015', 'sousan-2016'],
  pm10: ['who-aqg-2021', 'epa-naaqs', 'epa-aqi', 'egypt-law4'],
  co2: ['ashrae-62', 'en16798', 'who-iaq-2010', 'allen-2016', 'satish-2012'],
  co: ['who-iaq-2010', 'osha-co', 'niosh-co', 'epa-naaqs'],
  no2: ['who-aqg-2021', 'epa-naaqs', 'who-iaq-2010', 'egypt-law4'],
  o3: ['who-aqg-2021', 'epa-naaqs', 'epa-aqi'],
  so2: ['who-aqg-2021', 'epa-naaqs', 'egypt-law4'],
  voc: ['who-iaq-2010', 'ashrae-62', 'en16798'],
  nh3: ['niosh-nh3', 'osha-nh3', 'who-nh3', 'emerson-1975'],
  mq: ['kumar-2015', 'venkat-2003', 'sousan-2016'],
  tmp: ['ashrae-55', 'iso-7730', 'iso-7243', 'niosh-heat', 'steadman-1979'],
  hum: ['ashrae-55', 'en16798', 'steadman-1979', 'rothfusz-1990'],
  wT: ['nsf-wqi', 'who-drinking', 'stumm-1996'],
  ph: ['who-drinking', 'nsf-wqi', 'stumm-1996', 'fao-soil'],
  dO: ['epa-do', 'nsf-wqi', 'apha-standard'],
  tds: ['who-drinking', 'egypt-drinking-458', 'egypt-1048', 'nsf-wqi'],
  tb: ['who-drinking', 'epa-swtr', 'apha-standard'],
  sm: ['usda-nrcs', 'fao-soil', 'fao-56'],
  light: ['fao-56', 'usda-nrcs'],
  uv: ['who-uv'],
};

const INDEXED = new Map(REFERENCES.map(r => [r.id, r]));

function getReference(id) {
  return INDEXED.get(id);
}

function referencesForSensor(key) {
  const ids = SENSOR_REFS[key] || SENSOR_REFS[String(key).toLowerCase()] || [];
  return ids.map(id => INDEXED.get(id)).filter(Boolean);
}

function referencesForDomain(domain) {
  const ids = DOMAIN_REFS[domain] || [];
  return ids.map(id => INDEXED.get(id)).filter(Boolean);
}

function toCitation(ref) {
  return `${ref.title} — ${ref.authors} (${ref.year}). ${ref.publisher}`;
}

function searchReferences(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return REFERENCES.filter(r =>
    r.title.toLowerCase().includes(q) ||
    r.authors.toLowerCase().includes(q) ||
    r.publisher.toLowerCase().includes(q) ||
    r.tags.some(t => t.toLowerCase().includes(q))
  );
}

module.exports = {
  REFERENCES,
  getReference,
  referencesForSensor,
  referencesForDomain,
  searchReferences,
  toCitation,
};
