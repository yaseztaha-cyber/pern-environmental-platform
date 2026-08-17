/**
 * PERN AI References Module v1.0
 *
 * Central, curated citation database backing every AI-core output
 * (insights, recommendations, predictions). Every reference here is a real
 * standard, guideline, or peer-reviewed publication.
 *
 * Lookups:
 *   - referencesForSensor(sensorKey)  → standards that apply to a parameter
 *   - referencesForDomain(domain)     → references grouped by knowledge domain
 *   - searchReferences(query)         → free-text tag search
 *   - toCitation(ref)                 → human-readable citation string
 */

export type ReferenceKind = 'standard' | 'guideline' | 'research' | 'method';

export interface SourceReference {
  id: string;
  title: string;
  authors: string;
  year: number;
  publisher: string;
  kind: ReferenceKind;
  tags: string[];
  url?: string;
}

export const REFERENCES: SourceReference[] = [
  // ── Air Quality — standards & guidelines ──────────────────────────────────
  { id: 'who-aqg-2021', kind: 'guideline', authors: 'World Health Organization', year: 2021, publisher: 'WHO, Geneva', title: 'WHO Global Air Quality Guidelines 2021', tags: ['air', 'pm25', 'pm10', 'no2', 'o3', 'so2', 'co'], url: 'https://www.who.int/publications/i/item/9789240034228' },
  { id: 'epa-naaqs', kind: 'standard', authors: 'US Environmental Protection Agency', year: 2024, publisher: 'EPA, Washington DC', title: 'National Ambient Air Quality Standards (NAAQS) — PM2.5, PM10, O₃, SO₂, NO₂, CO', tags: ['air', 'pm25', 'pm10', 'o3', 'so2', 'no2', 'co'], url: 'https://www.epa.gov/criteria-air-pollutants/naaqs-table' },
  { id: 'epa-aqi', kind: 'guideline', authors: 'US Environmental Protection Agency', year: 2024, publisher: 'EPA-454/B-24-002', title: 'Technical Assistance Document for the Reporting of Daily Air Quality — the Air Quality Index (AQI)', tags: ['air', 'aqi', 'pm25', 'pm10', 'no2', 'o3', 'so2', 'co'], url: 'https://www.airnow.gov/aqi/' },
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

  // ── Air Quality — health-effects research ─────────────────────────────────
  { id: 'dockery-1993', kind: 'research', authors: 'Dockery, D.W., Pope, C.A., Xu, X. et al.', year: 1993, publisher: 'New England Journal of Medicine 329(24), 1753–1759', title: 'An Association between Air Pollution and Mortality in Six U.S. Cities', tags: ['pm25', 'health', 'mortality', 'air'] },
  { id: 'pope-2002', kind: 'research', authors: 'Pope, C.A., Burnett, R.T., Thun, M.J. et al.', year: 2002, publisher: 'JAMA 287(9), 1132–1141', title: 'Lung Cancer, Cardiopulmonary Mortality, and Long-term Exposure to Fine Particulate Air Pollution', tags: ['pm25', 'health', 'mortality', 'air'] },
  { id: 'burnett-2018', kind: 'research', authors: 'Burnett, R.T., Chen, H., Szyszkowicz, M. et al.', year: 2018, publisher: 'The Lancet Planetary Health 2(10), e451–e462', title: 'Global estimates of mortality associated with long-term exposure to outdoor fine particulate matter (GEMM model)', tags: ['pm25', 'health', 'mortality', 'air'] },
  { id: 'lelieveld-2019', kind: 'research', authors: 'Lelieveld, J., Klingmüller, K., Pozzer, A. et al.', year: 2019, publisher: 'The Lancet Planetary Health 3(7), e292–e300', title: 'Cardiovascular disease burden from ambient air pollution in Europe reassessed', tags: ['air', 'health', 'mortality'] },
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
  { id: 'parsons-2003', kind: 'research', authors: 'Parsons, K.C.', year: 2003, publisher: 'Taylor & Francis, London (2nd ed.)', title: 'Human Thermal Environments', tags: ['thermal', 'comfort', 'ergonomics'] },

  // ── Soil / agriculture ────────────────────────────────────────────────────
  { id: 'fao-56', kind: 'method', authors: 'Allen, R.G., Pereira, L.S., Raes, D. & Smith, M.', year: 1998, publisher: 'FAO Irrigation & Drainage Paper 56, Rome', title: 'Crop evapotranspiration — Guidelines for computing crop water requirements (FAO 56)', tags: ['soil', 'vpd', 'evapotranspiration', 'agriculture'], url: 'https://www.fao.org/3/x0490e/x0490e00.htm' },
  { id: 'usda-nrcs', kind: 'standard', authors: 'USDA Natural Resources Conservation Service', year: 2019, publisher: 'USDA Soil Survey Manual, Handbook 18', title: 'Soil Survey Manual — moisture, temperature and land capability', tags: ['soil', 'agriculture', 'moisture'] },
  { id: 'fao-soil', kind: 'method', authors: 'Food and Agriculture Organization', year: 2023, publisher: 'FAO, Rome', title: 'Standard Operating Procedure for Soil pH, EC, and Moisture', tags: ['soil', 'ph', 'moisture', 'agriculture'] },

  // ── Forecasting & statistics ──────────────────────────────────────────────
  { id: 'fpp3', kind: 'method', authors: 'Hyndman, R.J. & Athanasopoulos, G.', year: 2021, publisher: 'OTexts, Melbourne (3rd ed.)', title: 'Forecasting: Principles and Practice', tags: ['forecast', 'time-series', 'exponential-smoothing'], url: 'https://otexts.com/fpp3' },
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

  // ── Virtual sensor estimation — psychrometrics & methods ──────────────────
  { id: 'alduchov-1996', kind: 'research', authors: 'Alduchov, O.A. & Eskridge, R.E.', year: 1996, publisher: 'Journal of Applied Meteorology 35(4), 601–609', title: 'Improved Magnus form approximation of saturation vapor pressure', tags: ['vapor-pressure', 'dew-point', 'psychrometrics'] },
  { id: 'steadman-1994', kind: 'research', authors: 'Steadman, R.G.', year: 1994, publisher: 'Journal of Applied Meteorology 33(1), 87–104', title: 'Norms of apparent temperature in Australia', tags: ['apparent-temperature', 'thermal', 'heat-index'] },
  { id: 'bom-feels-like', kind: 'method', authors: 'Australian Bureau of Meteorology', year: 2010, publisher: 'BOM, Melbourne', title: 'Apparent Temperature (Feels Like) — calculation methods', tags: ['apparent-temperature', 'thermal', 'heat'] },
  { id: 'vaisala-moisture', kind: 'method', authors: 'Vaisala Oyj', year: 2013, publisher: 'Vaisala, Helsinki (Humidity Conversion Formulas)', title: 'Humidity Conversion Formulas — absolute humidity, mixing ratio, dew point, frost point', tags: ['humidity', 'psychrometrics', 'method'] },
  { id: 'ashrae-fundamentals', kind: 'method', authors: 'ASHRAE', year: 2021, publisher: 'ASHRAE Fundamentals Handbook, SI Edition', title: 'ASHRAE Fundamentals Handbook — Psychrometrics', tags: ['humidity', 'psychrometrics', 'thermal'] },
  { id: 'fanger-1970', kind: 'research', authors: 'Fanger, P.O.', year: 1970, publisher: 'Danish Technical Press, Copenhagen', title: 'Thermal Comfort: Analysis and Applications in Environmental Engineering (PMV/PPD)', tags: ['thermal', 'pmv', 'comfort'] },
  { id: 'stull-2011', kind: 'research', authors: 'Stull, R.', year: 2011, publisher: 'Journal of Applied Meteorology and Climatology 50(11), 2267–2271', title: 'Wet-bulb temperature from relative humidity and air temperature', tags: ['wet-bulb', 'psychrometrics', 'method'] },
  { id: 'hargreaves-1985', kind: 'research', authors: 'Hargreaves, G.H. & Samani, Z.A.', year: 1985, publisher: 'Transactions of the ASAE 28(4), 1202–1206', title: 'Reference crop evapotranspiration from temperature', tags: ['evapotranspiration', 'agriculture', 'hargreaves'] },
  { id: 'cie-085', kind: 'standard', authors: 'CIE', year: 1989, publisher: 'Commission Internationale de l’Éclairage, Vienna', title: 'CIE 085:1989 — Solar Spectral Irradiance', tags: ['solar', 'irradiance', 'light'] },
  { id: 'cie-087', kind: 'standard', authors: 'CIE', year: 2005, publisher: 'Commission Internationale de l’Éclairage, Vienna', title: 'CIE 087:2005 — Characterization of Insolation', tags: ['uv', 'solar', 'light'] },
  { id: 'inada-1976', kind: 'research', authors: 'Inada, K.', year: 1976, publisher: 'Japan Agricultural Research Quarterly 10(3), 108–113', title: 'Spectral luminous efficacy of daylight and its application to PPFD estimation', tags: ['ppfd', 'light', 'photosynthesis'] },
  { id: 'icao-1993', kind: 'standard', authors: 'International Civil Aviation Organization', year: 1993, publisher: 'ICAO Doc 7488-CD, Montreal', title: 'Manual of the ICAO Standard Atmosphere — dry-adiabatic lapse rate (6.5 K/km)', tags: ['atmosphere', 'lapse-rate', 'meteorology'] },
  { id: 'epa-aqs', kind: 'standard', authors: 'US Environmental Protection Agency', year: 2016, publisher: '40 CFR Part 58 — Air Quality Surveillance', title: 'Reference & Equivalent Methods for Criteria Pollutants (AQS / FEM)', tags: ['air', 'monitoring', 'pm25', 'method'] },
  { id: 'epa-method-180', kind: 'standard', authors: 'US Environmental Protection Agency', year: 1993, publisher: 'EPA Method 180.1, Rev 2.0', title: 'Determination of Turbidity by Nephelometry', tags: ['water', 'turbidity', 'method'] },
  { id: 'usgs-twri', kind: 'method', authors: 'US Geological Survey', year: 2019, publisher: 'USGS TWRI Book 9, Ch. A6.7', title: 'Field Measurements of TDS and Turbidity in Water', tags: ['water', 'turbidity', 'tds', 'method'] },
  { id: 'hanwei-mq135', kind: 'research', authors: 'Hanwei Electronics', year: 2016, publisher: 'Hanwei Electronics datasheet MQ-135', title: 'MQ-135 Gas Sensor — sensitivity characteristics (NH₃, NOₓ, smoke, CO₂)', tags: ['sensor', 'mq135', 'calibration', 'air'] },
  { id: 'nws-heat-index', kind: 'guideline', authors: 'NOAA National Weather Service', year: 2024, publisher: 'NWS Heat Index — temperature/humidity chart', title: 'NOAA NWS Heat Index — apparent temperature chart and heat safety', tags: ['thermal', 'heat-index', 'noaa'] },
  { id: 'who-uv', kind: 'guideline', authors: 'World Health Organization, WMO & UNEP', year: 2002, publisher: 'WHO, Geneva', title: 'Global Solar UV Index — A Practical Guide', tags: ['uv', 'health', 'guideline'] },

  // ── Statistical process control & time-series methodology ────────────────
  { id: 'roberts-1959', kind: 'research', authors: 'Roberts, S.W.', year: 1959, publisher: 'Technometrics 1(3), 239–250', title: 'Control chart tests based on geometric moving averages', tags: ['ewma', 'spc', 'exponential-smoothing'] },
  { id: 'wheeler-1992', kind: 'research', authors: 'Wheeler, D.J. & Chambers, D.S.', year: 1992, publisher: 'SPC Press, Knoxville', title: 'Understanding Statistical Process Control', tags: ['spc', 'control-charts', 'runs-tests'] },
  { id: 'fuller-1987', kind: 'research', authors: 'Fuller, W.A.', year: 1987, publisher: 'Wiley, New York', title: 'Measurement Error Models', tags: ['measurement-error', 'regression'] },
  { id: 'diebold-1995', kind: 'research', authors: 'Diebold, F.X. & Mariano, R.S.', year: 1995, publisher: 'Journal of Business & Economic Statistics 13(3), 253–263', title: 'Comparing predictive accuracy', tags: ['forecast', 'hypothesis-test', 'comparison'] },
  { id: 'wei-2006', kind: 'research', authors: 'Wei, W.W.S.', year: 2006, publisher: 'Pearson, Boston (2nd ed.)', title: 'Time Series Analysis: Univariate and Multivariate Methods', tags: ['time-series', 'trend', 'decomposition'] },
  { id: 'makridakis-1993', kind: 'research', authors: 'Makridakis, S.', year: 1993, publisher: 'International Journal of Forecasting 9(4), 527–529', title: 'Accuracy measures: theoretical and practical concerns', tags: ['forecast', 'smape', 'error-metrics'] },
  { id: 'armstrong-1992', kind: 'research', authors: 'Armstrong, J.S. & Collopy, F.', year: 1992, publisher: 'International Journal of Forecasting 8(1), 69–80', title: 'Error measures for generalizing about forecasting methods', tags: ['forecast', 'mape', 'error-metrics'] },

  // ── AI / LLM methodology ──────────────────────────────────────────────────
  { id: 'russell-2021', kind: 'research', authors: 'Russell, S. & Norvig, P.', year: 2021, publisher: 'Pearson, Boston (4th ed.)', title: 'Artificial Intelligence: A Modern Approach', tags: ['ai', 'llm', 'prompting'] },
  { id: 'brown-2020', kind: 'research', authors: 'Brown, T.B., Mann, B., Ryder, N. et al.', year: 2020, publisher: 'Advances in Neural Information Processing Systems 33', title: 'Language Models are Few-Shot Learners', tags: ['ai', 'llm', 'in-context-learning'], url: 'https://arxiv.org/abs/2005.14165' },

  // ── Psychrometrics / water / corrosion methodology ────────────────────────
  { id: 'buck-1981', kind: 'research', authors: 'Buck, A.L.', year: 1981, publisher: 'Journal of Applied Meteorology 20(12), 1527–1532', title: 'New equations for computing vapor pressure and enhancement factor', tags: ['vapor-pressure', 'humidity', 'psychrometrics'] },
  { id: 'oecd-1982', kind: 'guideline', authors: 'Organisation for Economic Co-operation and Development', year: 1982, publisher: 'OECD, Paris', title: 'Eutrophication of Waters: Monitoring, Assessment and Control', tags: ['eutrophication', 'water-quality', 'nutrients'] },
  { id: 'iso-9223', kind: 'standard', authors: 'International Organization for Standardization', year: 2012, publisher: 'ISO, Geneva', title: 'ISO 9223:2012 — Corrosion of metals and alloys — Corrosivity of atmospheres — Classification', tags: ['corrosion', 'standard', 'infrastructure'] },
  { id: 'epa-corrosion', kind: 'research', authors: 'US Environmental Protection Agency', year: 1994, publisher: 'EPA/625/R-95/001, Washington DC', title: 'Corrosion in Water Distribution Systems', tags: ['corrosion', 'water-distribution', 'lsi'] },

  // ── Governance / safety / interface standards ─────────────────────────────
  { id: 'iso-27001', kind: 'standard', authors: 'ISO/IEC', year: 2022, publisher: 'ISO, Geneva', title: 'ISO/IEC 27001:2022 — Information security management systems', tags: ['standard', 'security', 'data-quality'] },
  { id: 'iso-13381', kind: 'standard', authors: 'International Organization for Standardization', year: 2015, publisher: 'ISO, Geneva', title: 'ISO 13381-1:2015 — Condition monitoring and diagnostics of machines — Prognostics', tags: ['standard', 'predictive-maintenance', 'prognostics'] },
  { id: 'iso-13849', kind: 'standard', authors: 'International Organization for Standardization', year: 2015, publisher: 'ISO, Geneva', title: 'ISO 13849-1:2015 — Safety of machinery — Safety-related parts of control systems', tags: ['standard', 'safety', 'validation'] },
  { id: 'ieee-1451', kind: 'standard', authors: 'IEEE', year: 1997, publisher: 'IEEE, New York', title: 'IEEE 1451.2-1997 — Smart Transducer Interface', tags: ['standard', 'sensor', 'transducer'] },

  // ── Wireless signal strength / RSSI ────────────────────────────────────────
  { id: 'friis-1946', kind: 'research', authors: 'Friis, H.T.', year: 1946, publisher: 'Proceedings of the IRE 34(5), 254–260', title: 'A Note on a Simple Transmission Formula (Friis path-loss equation)', tags: ['rssi', 'path-loss', 'rf', 'distance'], url: 'https://doi.org/10.1109/JRPROC.1946.234568' },
  { id: 'itu-p1238', kind: 'standard', authors: 'ITU-R', year: 2021, publisher: 'ITU-R Recommendation P.1238-11, Geneva', title: 'Propagation data and prediction methods for the planning of indoor radiocommunication systems', tags: ['rssi', 'path-loss', 'indoor', 'wifi'] },
  { id: 'ieee-80211', kind: 'standard', authors: 'IEEE', year: 2024, publisher: 'IEEE Std 802.11-2020 (incl. amendments)', title: 'IEEE 802.11 — Wireless LAN Medium Access Control and Physical Layer Specifications (signal strength & RSSI reporting)', tags: ['rssi', 'wifi', 'standard', 'network'] },

  // ── Embedded device health (ESP32-class hardware) ───────────────────────────
  { id: 'esp32-datasheet', kind: 'standard', authors: 'Espressif Systems', year: 2024, publisher: 'Espressif ESP32 Datasheet v4.7', title: 'ESP32 Datasheet — dual-core 240 MHz, memory architecture, radio characteristics', tags: ['esp32', 'cpu', 'heap', 'hardware'], url: 'https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf' },
  { id: 'esp32-trm', kind: 'standard', authors: 'Espressif Systems', year: 2024, publisher: 'Espressif ESP32 Technical Reference Manual', title: 'ESP32 Technical Reference Manual — memory organization and internal memory', tags: ['esp32', 'heap', 'memory', 'hardware'] },
  { id: 'esp-idf-heap', kind: 'method', authors: 'Espressif Systems', year: 2024, publisher: 'ESP-IDF Memory Allocation documentation', title: 'ESP-IDF Heap Memory Allocation — free heap monitoring, fragmentation, low-memory thresholds', tags: ['esp32', 'heap', 'memory-leak', 'method'] },

  // ── Prognostics & remaining useful life ─────────────────────────────────────
  { id: 'jardine-2006', kind: 'research', authors: 'Jardine, A.K.S., Lin, D. & Banjevic, D.', year: 2006, publisher: 'Mechanical Systems and Signal Processing 20(7), 1483–1510', title: 'A review on machinery diagnostics and prognostics implementing condition-based maintenance', tags: ['rul', 'prognostics', 'maintenance', 'condition-based'] },
  { id: 'iso-17359', kind: 'standard', authors: 'International Organization for Standardization', year: 2018, publisher: 'ISO, Geneva', title: 'ISO 17359:2018 — Condition monitoring and diagnostics of machines — General guidelines', tags: ['prognostics', 'condition-monitoring', 'maintenance'] },
  { id: 'weibull-1951', kind: 'research', authors: 'Weibull, W.', year: 1951, publisher: 'Journal of Applied Mechanics 18, 293–297', title: 'A statistical distribution function of wide applicability (Weibull distribution)', tags: ['weibull', 'reliability', 'rul', 'statistics'] },

  // ── Metrology, uncertainty & regression methodology ─────────────────────────
  { id: 'gum-2008', kind: 'method', authors: 'BIPM, IEC, IFCC, ILAC, ISO, IUPAC, IUPAP & OIML', year: 2008, publisher: 'JCGM 100:2008, BIPM, Sèvres', title: 'Evaluation of measurement data — Guide to the expression of uncertainty in measurement (GUM)', tags: ['uncertainty', 'metrology', 'measurement', 'confidence'] },
  { id: 'vim-2012', kind: 'method', authors: 'BIPM, IEC, IFCC, ILAC, ISO, IUPAC, IUPAP & OIML', year: 2012, publisher: 'JCGM 200:2012, BIPM, Sèvres', title: 'International vocabulary of metrology — Basic and general concepts and associated terms (VIM 3)', tags: ['metrology', 'measurement', 'standard'] },
  { id: 'neyman-1937', kind: 'research', authors: 'Neyman, J.', year: 1937, publisher: 'Philosophical Transactions of the Royal Society A 236, 333–380', title: 'Outline of a theory of statistical estimation based on the classical theory of probability (confidence intervals)', tags: ['confidence-interval', 'statistics', 'inference'] },
  { id: 'gauss-1809', kind: 'research', authors: 'Gauss, C.F.', year: 1809, publisher: 'Theoria Motus Corporum Coelestium, Hamburg', title: 'Method of Least Squares — Theoria motus corporum coelestium', tags: ['regression', 'least-squares', 'statistics'] },
  { id: 'galton-1886', kind: 'research', authors: 'Galton, F.', year: 1886, publisher: 'Journal of the Anthropological Institute 15, 246–263', title: 'Regression towards mediocrity in hereditary stature (origin of regression analysis)', tags: ['regression', 'statistics', 'trend'] },
  { id: 'theil-1950', kind: 'research', authors: 'Theil, H.', year: 1950, publisher: 'Proceedings of the International Statistical Conferences, Washington DC', title: 'A rank-invariant method of linear and polynomial regression analysis', tags: ['theil-sen', 'robust-regression', 'trend'] },
  { id: 'sen-1968', kind: 'research', authors: 'Sen, P.K.', year: 1968, publisher: 'Journal of the American Statistical Association 63(324), 1379–1389', title: 'Estimates of the regression coefficient based on Kendall\'s tau (Sen slope estimator)', tags: ['theil-sen', 'robust-regression', 'trend', 'monotonic'] },
];

// ── Domain → reference-id mappings ───────────────────────────────────────────
const DOMAIN_REFS: Record<string, string[]> = {
  air: ['who-aqg-2021', 'epa-naaqs', 'epa-aqi', 'egypt-law4', 'cohen-2017'],
  indoor: ['ashrae-62', 'who-iaq-2010', 'en16798', 'allen-2016'],
  water: ['who-drinking', 'nsf-wqi', 'apha-standard', 'stumm-1996', 'egypt-drinking-458'],
  thermal: ['ashrae-55', 'iso-7730', 'iso-7243', 'iso-11079', 'niosh-heat', 'steadman-1979'],
  soil: ['fao-56', 'usda-nrcs', 'fao-soil'],
  forecast: ['fpp3', 'boxjenkins', 'gardner-2006', 'm5-2022', 'willmott-2005', 'moriasi-2007'],
  quality: ['shewhart-1931', 'montgomery-2009', 'iso-5725', 'gum-2008', 'vim-2012', 'neyman-1937'],
  anomaly: ['iglewicz-1993', 'hampel-1974', 'tukey-1977'],
  correlation: ['pearson-1895'],
  sensors: ['kumar-2015', 'sousan-2016', 'castell-2017', 'venkat-2003'],
  virtual: ['kumar-2015', 'sousan-2016', 'venkat-2003', 'iso-5725', 'epa-aqs', 'hanwei-mq135', 'alduchov-1996', 'stull-2011'],
  network: ['friis-1946', 'itu-p1238', 'ieee-80211'],
  trend: ['gauss-1809', 'galton-1886', 'theil-1950', 'sen-1968', 'moriasi-2007'],
  prognostics: ['iso-13381', 'jardine-2006', 'iso-17359', 'weibull-1951'],
  metrology: ['gum-2008', 'vim-2012', 'neyman-1937', 'iso-5725'],
  'device-health': ['esp32-datasheet', 'esp32-trm', 'esp-idf-heap', 'iso-13381', 'jardine-2006', 'iso-17359', 'weibull-1951', 'gum-2008', 'vim-2012'],
};

// ── Sensor (parameter) → reference-id mappings ───────────────────────────────
const SENSOR_REFS: Record<string, string[]> = {
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
  light: ['fao-56', 'usda-nrcs', 'cie-085', 'cie-087'],
  uv: ['cie-087', 'who-uv', 'cie-085'],
  rssi: ['friis-1946', 'itu-p1238', 'ieee-80211'],
  wifi: ['itu-p1238', 'ieee-80211'],
  heap: ['esp32-datasheet', 'esp32-trm', 'esp-idf-heap'],
  cpu: ['esp32-datasheet', 'esp32-trm'],
};

const INDEXED = new Map<string, SourceReference>(REFERENCES.map(r => [r.id, r]));

/** Get a single reference by id. */
export function getReference(id: string): SourceReference | undefined {
  return INDEXED.get(id);
}

/** References that apply to a sensor / parameter key (e.g. 'pm25', 'dO'). */
export function referencesForSensor(key: string): SourceReference[] {
  const ids = SENSOR_REFS[key] ?? SENSOR_REFS[key.toLowerCase()] ?? [];
  return ids.map(id => INDEXED.get(id)).filter((r): r is SourceReference => Boolean(r));
}

/** References grouped under a knowledge domain ('air', 'water', 'thermal', ...). */
export function referencesForDomain(domain: string): SourceReference[] {
  const ids = DOMAIN_REFS[domain] ?? [];
  return ids.map(id => INDEXED.get(id)).filter((r): r is SourceReference => Boolean(r));
}

/** Free-text search over title, authors, publisher and tags. */
export function searchReferences(query: string): SourceReference[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return REFERENCES.filter(r =>
    r.title.toLowerCase().includes(q) ||
    r.authors.toLowerCase().includes(q) ||
    r.publisher.toLowerCase().includes(q) ||
    r.tags.some(t => t.toLowerCase().includes(q))
  );
}

/** Human-readable citation string for a reference. */
export function toCitation(r: SourceReference): string {
  return `${r.title} — ${r.authors} (${r.year}). ${r.publisher}`;
}

/** Short title used as an inline chip label. */
export function toChipLabel(r: SourceReference): string {
  return `${r.title} (${r.year})`;
}

/** Map a list of references to compact citation strings. */
export function toCitations(refs: SourceReference[]): string[] {
  return refs.map(toCitation);
}

// ── Usage traceability ───────────────────────────────────────────────────────
// Domain + sensor mappings live here so any consumer can answer
// "where is this reference used?" without importing estimator internals.
// Estimator-level usage is merged at the UI layer from ESTIMATOR_REFS.

export interface ReferenceUsage {
  kind: 'domain' | 'sensor';
  label: string;
}

export function getReferenceUsage(id: string): ReferenceUsage[] {
  const usages: ReferenceUsage[] = [];
  for (const [domain, ids] of Object.entries(DOMAIN_REFS)) {
    if (ids.includes(id)) usages.push({ kind: 'domain', label: domain });
  }
  for (const [sensor, ids] of Object.entries(SENSOR_REFS)) {
    if (ids.includes(id)) usages.push({ kind: 'sensor', label: sensor });
  }
  return usages;
}

// ── Export formats (BibTeX / CSV) ────────────────────────────────────────────

/** BibTeX entry for a single reference. */
export function toBibTeX(r: SourceReference): string {
  const key = r.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const type = r.kind === 'research' || r.kind === 'method' ? 'article' : 'misc';
  const author = r.authors.replace(/\s*&\s*/g, ' and ');
  const lines = [
    `@${type}{${key},`,
    `  title = {${r.title}},`,
    `  author = {${author}},`,
    `  year = {${r.year}},`,
    `  note = {${r.publisher}},`,
  ];
  if (r.url) lines.push(`  url = {${r.url}},`);
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
  lines.push('}');
  return lines.join('\n');
}

/** Concatenated BibTeX export for a list of references. */
export function toBibTeXCollection(refs: SourceReference[]): string {
  return refs.map(toBibTeX).join('\n\n');
}

/** CSV rows (without header) for a list of references. */
export function toReferenceCSV(refs: SourceReference[]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const header = ['id', 'kind', 'title', 'authors', 'year', 'publisher', 'tags', 'url'];
  const rows = refs.map(r => [
    esc(r.id), esc(r.kind), esc(r.title), esc(r.authors), String(r.year),
    esc(r.publisher), esc(r.tags.join(' ')), esc(r.url || ''),
  ].join(','));
  return [header.join(','), ...rows].join('\n');
}
