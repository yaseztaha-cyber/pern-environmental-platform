import { useState } from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen, BookMarked, FlaskConical, ExternalLink,
  FileText, Quote, Globe, Check, Copy,
  Code, Radio, Zap, Cpu,
  Lightbulb, Beaker, BrainCircuit, ShieldCheck, Wrench,
  Droplets, Sprout, Waves, Home, Thermometer, Cloud, Sun
} from 'lucide-react';
import { PageHeader, Card, SectionTitle, Pill, Btn } from '../components/ui';

function CodeBlock({ id, language, children }: { id: string; language: string; children: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }
  return (
    <div className="relative group rounded-[var(--radius-sm)] bg-black/30 border border-white/[0.06] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)] border-b border-white/[0.06]">
        <span className="text-[10px] text-[var(--text-disabled)] font-mono uppercase">{language}</span>
        <button onClick={() => copyText(children)} aria-label="Copy code" className="text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors" title="Copy">
          {copied === id ? <Check size={12} className="text-[var(--emerald)]" /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="p-3 text-xs text-[var(--text-secondary)] font-mono overflow-x-auto leading-relaxed">{children}</pre>
    </div>
  );
}

const SCIENTIFIC_REFERENCES = [
  { id: 'fpp3', icon: <BrainCircuit size={16} />, title: 'Forecasting: Principles and Practice (3rd ed.)', authors: 'Hyndman, R.J. & Athanasopoulos, G.', year: 2021, publisher: 'OTexts, Melbourne', doi: 'https://otexts.com/fpp3', tags: ['time-series', 'forecasting', 'exponential-smoothing'] },
  { id: 'm5', icon: <BarChart3 size={16} />, title: 'M5 Accuracy Competition — Forecasting at Scale', authors: 'Makridakis, S., Spiliotis, E. & Assimakopoulos, V.', year: 2020, publisher: 'International Journal of Forecasting 38(2), 583–602', tags: ['forecasting', 'ensemble', 'competition'] },
  { id: 'holt', icon: <TrendUp size={16} />, title: 'Exponential smoothing — The state of the art', authors: 'Gardner, E.S.', year: 2006, publisher: 'International Journal of Forecasting 22(4), 637–666', tags: ['exponential-smoothing', 'damping'] },
  { id: 'boxjenkins', icon: <BarChart3 size={16} />, title: 'Time Series Analysis: Forecasting and Control (4th ed.)', authors: 'Box, G.E.P., Jenkins, G.M. & Reinsel, G.C.', year: 2008, publisher: 'Wiley', tags: ['time-series', 'arima', 'confidence-intervals'] },
  { id: 'shewhart', icon: <ShieldCheck size={16} />, title: 'Economic Control of Quality of Manufactured Product', authors: 'Shewhart, W.A.', year: 1931, publisher: 'Van Nostrand, New York', tags: ['spc', 'control-limits', 'quality'] },
  { id: 'montgomery', icon: <ShieldCheck size={16} />, title: 'Introduction to Statistical Quality Control (6th ed.)', authors: 'Montgomery, D.C.', year: 2009, publisher: 'Wiley', tags: ['spc', 'ewma', 'process-capability', 'cv'] },
  { id: 'iso5725', icon: <FileText size={16} />, title: 'ISO 5725-1:1994 — Accuracy of measurement methods and results', authors: 'International Organization for Standardization', year: 1994, publisher: 'ISO, Geneva', tags: ['standard', 'measurement-error', 'repeatability'] },
  { id: 'iso27001', icon: <ShieldCheck size={16} />, title: 'ISO/IEC 27001:2022 — Information security management systems', authors: 'ISO/IEC', year: 2022, publisher: 'ISO, Geneva', tags: ['standard', 'security', 'data-quality'] },
  { id: 'iso13381', icon: <Wrench size={16} />, title: 'ISO 13381-1:2015 — Condition monitoring — Prognostics', authors: 'International Organization for Standardization', year: 2015, publisher: 'ISO, Geneva', tags: ['standard', 'predictive-maintenance', 'prognostics'] },
  { id: 'iso13849', icon: <ShieldCheck size={16} />, title: 'ISO 13849-1:2015 — Safety of machinery — Control systems', authors: 'International Organization for Standardization', year: 2015, publisher: 'ISO, Geneva', tags: ['standard', 'safety', 'validation'] },
  { id: 'ieee1451', icon: <Cpu size={16} />, title: 'IEEE 1451.2-1997 — Smart Transducer Interface', authors: 'IEEE', year: 1997, publisher: 'IEEE, New York', tags: ['standard', 'sensor', 'transducer'] },
  { id: 'iglewicz', icon: <Beaker size={16} />, title: 'How to Detect and Handle Outliers', authors: 'Iglewicz, B. & Hoaglin, D.C.', year: 1993, publisher: 'ASQC Basic References in Quality Control, Vol. 16', tags: ['outliers', 'mad', 'z-score'] },
  { id: 'hampel', icon: <FlaskConical size={16} />, title: 'The influence curve and its role in robust estimation', authors: 'Hampel, F.R.', year: 1974, publisher: 'J. Amer. Statist. Assoc. 69(346), 383–393', tags: ['robust-estimation', 'mad', 'outliers'] },
  { id: 'tukey', icon: <BookOpen size={16} />, title: 'Exploratory Data Analysis', authors: 'Tukey, J.W.', year: 1977, publisher: 'Addison-Wesley, Reading, MA', tags: ['eda', 'box-plot', 'outlier'] },
  { id: 'roberts', icon: <BarChart3 size={16} />, title: 'Control chart tests based on geometric moving averages', authors: 'Roberts, S.W.', year: 1959, publisher: 'Technometrics 1(3), 239–250', tags: ['ewma', 'exponential-smoothing', 'spc'] },
  { id: 'fuller', icon: <BarChart3 size={16} />, title: 'Measurement Error Models', authors: 'Fuller, W.A.', year: 1987, publisher: 'Wiley, New York', tags: ['measurement-error', 'regression'] },
  { id: 'pearson', icon: <BrainCircuit size={16} />, title: 'Mathematical contributions to the theory of evolution. III. Regression, heredity, and panmixia', authors: 'Pearson, K.', year: 1895, publisher: 'Phil. Trans. R. Soc. Lond. A 187, 253–318', tags: ['correlation', 'statistics', 'split-half'] },
  { id: 'wheeler', icon: <ShieldCheck size={16} />, title: 'Understanding Statistical Process Control (2nd ed.)', authors: 'Wheeler, D.J. & Chambers, D.S.', year: 1992, publisher: 'SPC Press, Knoxville', tags: ['spc', 'runs-tests', 'control-charts'] },
  { id: 'ashrae55', icon: <Globe size={16} />, title: 'ASHRAE Standard 55-2023 — Thermal Environmental Conditions for Human Occupancy', authors: 'ASHRAE', year: 2023, publisher: 'ASHRAE, Atlanta', tags: ['standard', 'thermal-comfort', 'hvac'] },
  { id: 'whoaq', icon: <Globe size={16} />, title: 'WHO Global Air Quality Guidelines 2021', authors: 'World Health Organization', year: 2021, publisher: 'WHO, Geneva', tags: ['standard', 'air-quality', 'pm25', 'no2'] },
  { id: 'whoiaq', icon: <Globe size={16} />, title: 'WHO Guidelines for Indoor Air Quality: Selected Pollutants', authors: 'World Health Organization', year: 2010, publisher: 'WHO Regional Office for Europe', tags: ['standard', 'indoor-air', 'guidelines'] },
  { id: 'whodw', icon: <Globe size={16} />, title: 'Guidelines for Drinking-water Quality (4th ed.)', authors: 'World Health Organization', year: 2017, publisher: 'WHO, Geneva', tags: ['standard', 'water-quality', 'drinking-water'] },
  { id: 'usepaaqi', icon: <Globe size={16} />, title: 'Technical Assistance Document for the Reporting of Daily Air Quality — AQI', authors: 'US Environmental Protection Agency', year: 2024, publisher: 'EPA-454/B-24-002', tags: ['standard', 'aqi', 'air-quality'] },
  { id: 'nsfwqi', icon: <Beaker size={16} />, title: 'A Water Quality Index — Do We Dare?', authors: 'Brown, R.M., McClelland, N.I., Deininger, R.A. & Tozer, R.G.', year: 1970, publisher: 'Water & Sewage Works 117(10), 339–343', tags: ['wqi', 'water-quality', 'index'] },
  { id: 'iso7243', icon: <FlaskConical size={16} />, title: 'ISO 7243:2017 — Ergonomics — Heat stress — WBGT estimation', authors: 'International Organization for Standardization', year: 2017, publisher: 'ISO, Geneva', tags: ['standard', 'heat-stress', 'wbgt'] },
  { id: 'steadman', icon: <FlaskConical size={16} />, title: 'The assessment of sultriness. Part I: A temperature-humidity index', authors: 'Steadman, R.G.', year: 1979, publisher: 'J. Appl. Meteorol. 18(7), 861–873', tags: ['humidex', 'heat-index', 'thermal'] },
  { id: 'parsons', icon: <BookOpen size={16} />, title: 'Human Thermal Environments (2nd ed.)', authors: 'Parsons, K.C.', year: 2003, publisher: 'Taylor & Francis, London', tags: ['thermal-comfort', 'heat-stress', 'ergonomics'] },
  { id: 'apha', icon: <BookMarked size={16} />, title: 'Standard Methods for the Examination of Water and Wastewater (24th ed.)', authors: 'APHA, AWWA, WEF', year: 2023, publisher: 'American Public Health Association, Washington DC', tags: ['standard', 'water-quality', 'laboratory'] },
  { id: 'cdcniosh', icon: <ShieldCheck size={16} />, title: 'NIOSH Criteria for a Recommended Standard: Occupational Exposure to Heat', authors: 'CDC / NIOSH', year: 2016, publisher: 'DHHS (NIOSH) Publication 2016-106', tags: ['standard', 'heat-stress', 'occupational'] },
  { id: 'makridakis1993', icon: <BrainCircuit size={16} />, title: 'Accuracy measures: theoretical and practical concerns', authors: 'Makridakis, S.', year: 1993, publisher: 'International Journal of Forecasting 9(4), 527–529', tags: ['forecasting', 'smape', 'error-metrics'] },
  { id: 'armstrong', icon: <BarChart3 size={16} />, title: 'Error measures for generalizing about forecasting methods', authors: 'Armstrong, J.S. & Collopy, F.', year: 1992, publisher: 'International Journal of Forecasting 8(1), 69–80', tags: ['forecasting', 'error-metrics', 'mape'] },
  { id: 'diebold', icon: <BrainCircuit size={16} />, title: 'Comparing predictive accuracy', authors: 'Diebold, F.X. & Mariano, R.S.', year: 1995, publisher: 'J. Business & Economic Statistics 13(3), 253–263', tags: ['forecasting', 'hypothesis-test', 'comparison'] },
  { id: 'wei', icon: <BookOpen size={16} />, title: 'Time Series Analysis: Univariate and Multivariate Methods (2nd ed.)', authors: 'Wei, W.W.S.', year: 2006, publisher: 'Pearson, Boston', tags: ['time-series', 'trend', 'decomposition'] },
  { id: 'venkat', icon: <FlaskConical size={16} />, title: 'A review of process fault detection and diagnosis', authors: 'Venkatasubramanian, V., Rengaswamy, R., Yin, K. & Kavuri, S.N.', year: 2003, publisher: 'Computers & Chemical Engineering 27(3), 293–346', tags: ['fault-detection', 'diagnosis', 'sensor-validation'] },
  { id: 'russell', icon: <BrainCircuit size={16} />, title: 'Artificial Intelligence: A Modern Approach (4th ed.)', authors: 'Russell, S. & Norvig, P.', year: 2021, publisher: 'Pearson, Boston', tags: ['ai', 'llm', 'prompting'] },
  { id: 'brown2020', icon: <BrainCircuit size={16} />, title: 'Language Models are Few-Shot Learners', authors: 'Brown, T.B. et al.', year: 2020, publisher: 'NeurIPS 2020', tags: ['ai', 'llm', 'in-context-learning'] },

  // ── Virtual Sensor Estimators & Indices ──
  { id: 'alduchov1996', icon: <Thermometer size={16} />, title: 'Improved Magnus form approximation of saturation vapor pressure', authors: 'Alduchov, O.A. & Eskridge, R.E.', year: 1996, publisher: 'J. Appl. Meteor. 35(4), 601–609', tags: ['vapor-pressure', 'dew-point', 'magnus-formula'] },
  { id: 'buck1981', icon: <Thermometer size={16} />, title: 'New equations for computing vapor pressure and enhancement factor', authors: 'Buck, A.L.', year: 1981, publisher: 'J. Appl. Meteor. 20(12), 1527–1532', tags: ['vapor-pressure', 'humidity', 'psychrometrics'] },
  { id: 'stull2011', icon: <Thermometer size={16} />, title: 'Wet-bulb temperature from relative humidity and air temperature', authors: 'Stull, R.', year: 2011, publisher: 'J. Appl. Meteor. Climatol. 50(11), 2267–2269', tags: ['wbgt', 'wet-bulb', 'heat-stress'] },
  { id: 'rothfusz1990', icon: <Thermometer size={16} />, title: 'The Heat Index equation (NOAA NWS SR/SSD 90-23)', authors: 'Rothfusz, L.P.', year: 1990, publisher: 'NOAA NWS Southern Region, Fort Worth, TX', tags: ['heat-index', 'thermal-comfort', 'noaa'] },
  { id: 'fao56', icon: <Sprout size={16} />, title: 'Crop evapotranspiration — Guidelines for computing crop water requirements (FAO 56)', authors: 'Allen, R.G., Pereira, L.S., Raes, D. & Smith, M.', year: 1998, publisher: 'FAO Irrigation & Drainage Paper 56, Rome', tags: ['evapotranspiration', 'vpd', 'crop-water', 'fao'] },
  { id: 'hargreaves1985', icon: <Sprout size={16} />, title: 'Reference crop evapotranspiration from temperature', authors: 'Hargreaves, G.H. & Samani, Z.A.', year: 1985, publisher: 'Trans. ASAE 1(2), 96–99', tags: ['evapotranspiration', 'hargreaves', 'temperature'] },
  { id: 'cie087', icon: <Sun size={16} />, title: 'CIE 087:2005 Characterization of UV / CIE 085:1989 Solar Spectral Irradiance', authors: 'Commission Internationale de l\'Éclairage', year: 2005, publisher: 'CIE, Vienna', tags: ['uv-index', 'solar-radiation', 'luminous-efficacy'] },
  { id: 'inada1976', icon: <Sun size={16} />, title: 'Spectral luminous efficacy in photosynthesis', authors: 'Inada, K.', year: 1976, publisher: 'J. Agric. Meteorol. 32(3), 113–123', tags: ['ppfd', 'photosynthesis', 'lux-conversion'] },
  { id: 'mq135', icon: <FlaskConical size={16} />, title: 'MQ-135 Gas Sensor Datasheet — NH₃, NOx, CO₂, Smoke detection', authors: 'Hanwei Electronics', year: 2015, publisher: 'Zhengzhou Winsen Electronics, China', tags: ['gas-sensor', 'mq135', 'semiconductor'] },
  { id: 'ashrae62', icon: <Home size={16} />, title: 'ASHRAE Standard 62.1-2022 — Ventilation for Acceptable Indoor Air Quality', authors: 'ASHRAE', year: 2022, publisher: 'ASHRAE, Atlanta', tags: ['standard', 'ventilation', 'indoor-air', 'co2'] },
  { id: 'stumm1996', icon: <Droplets size={16} />, title: 'Aquatic Chemistry: Chemical Equilibria and Rates in Natural Waters (3rd ed.)', authors: 'Stumm, W. & Morgan, J.J.', year: 1996, publisher: 'Wiley, New York', tags: ['aquatic-chemistry', 'ph', 'carbonate', 'water-quality'] },
  { id: 'emerson1975', icon: <Droplets size={16} />, title: 'Aqueous ammonia equilibrium calculations', authors: 'Emerson, K., Russo, R.C., Lund, R.E. & Thurston, R.V.', year: 1975, publisher: 'J. Fish. Res. Board Can. 32(12), 2379–2383', tags: ['ammonia', 'nh3', 'equilibrium', 'aquaculture'] },
  { id: 'usgsTWRI', icon: <BookMarked size={16} />, title: 'USGS TWRI Book 9 — Handbooks for Water-Resources Investigations', authors: 'US Geological Survey', year: 1979, publisher: 'USGS, Reston, VA', tags: ['water-quality', 'tds', 'turbidity', 'field-methods'] },
  { id: 'willmott2005', icon: <BarChart3 size={16} />, title: 'Advantages of MAE over RMSE in assessing average model performance', authors: 'Willmott, C.J. & Matsuura, K.', year: 2005, publisher: 'Climate Research 30(1), 79–82', tags: ['confidence', 'error-metrics', 'mae', 'rmse'] },
  { id: 'moriasi2007', icon: <BarChart3 size={16} />, title: 'Model evaluation guidelines for systematic quantification of accuracy in watershed simulations', authors: 'Moriasi, D.N. et al.', year: 2007, publisher: 'Trans. ASABE 50(3), 885–900', tags: ['confidence', 'model-evaluation', 'r-squared'] },
  { id: 'oecd1982', icon: <Waves size={16} />, title: 'Eutrophication of Waters: Monitoring, Assessment and Control', authors: 'OECD', year: 1982, publisher: 'OECD, Paris', tags: ['eutrophication', 'water-quality', 'nutrients'] },
  { id: 'iso9223', icon: <ShieldCheck size={16} />, title: 'ISO 9223:2012 — Corrosion of metals — Corrosivity of atmospheres — Classification', authors: 'International Organization for Standardization', year: 2012, publisher: 'ISO, Geneva', tags: ['standard', 'corrosion', 'infrastructure'] },
  { id: 'epacorrosion', icon: <ShieldCheck size={16} />, title: 'Corrosion in Water Distribution Systems (EPA/625/R-95/001)', authors: 'US Environmental Protection Agency', year: 1994, publisher: 'EPA Office of Research & Development', tags: ['corrosion', 'water-distribution', 'lsi'] },
  { id: 'faosoil', icon: <Sprout size={16} />, title: 'Standard Operating Procedure for Soil pH, EC, and Moisture', authors: 'FAO', year: 2023, publisher: 'FAO, Rome', tags: ['soil', 'ph', 'moisture', 'agriculture'] },
  { id: 'usdanrcs', icon: <Sprout size={16} />, title: 'USDA-NRCS Soil Survey Manual (Handbook 18)', authors: 'USDA Natural Resources Conservation Service', year: 2019, publisher: 'USDA, Washington DC', tags: ['soil', 'agriculture', 'crop-growth', 'temperature'] },
];

const KNOWLEDGE_ARTICLES = [
  {
    id: 'air-quality-1', title: 'Understanding Indoor Air Quality', category: 'Air Quality',
    summary: 'Key pollutants, safe thresholds, and monitoring practices for indoor environments.',
    content: `Indoor air quality (IAQ) is a critical factor in building health and occupant well-being. Key pollutants include:
**CO₂ (Carbon Dioxide):** Normal outdoor ~420 ppm, acceptable indoor <1000 ppm, above 2000 ppm drowsiness.
**PM2.5 (Fine Particulate Matter):** WHO guideline <15 µg/m³ annual, <45 µg/m³ 24-hour. Sources: cooking, smoking, infiltration.
**CO (Carbon Monoxide):** Safe <9 ppm 8-hr avg. Above 35 ppm immediate health risk.
**SO₂ and NO₂:** Primarily combustion sources; trigger asthma and respiratory irritation.`,
    tags: ['air-quality', 'CO2', 'PM2.5', 'monitoring'],
  },
  {
    id: 'ehi-1', title: 'The Environmental Health Index (EHI)', category: 'Metrics',
    summary: 'How EHI combines multiple sensor readings into a unified health score using weighted sub-indices.',
    content: `The Environmental Health Index (EHI) is a composite metric: EHI = Σ wᵢ·fᵢ.
**Weights:** Temperature 0.15, Humidity 0.15, Pressure 0.05, CO₂ 0.20, PM2.5 0.20, CO 0.10, SO₂ 0.075, NO₂ 0.075.
**Score ranges:** 80–100 Excellent, 60–79 Good, 40–59 Moderate, 20–39 Poor, 0–19 Critical.`,
    tags: ['EHI', 'metrics', 'scoring', 'formula'],
  },
  {
    id: 'predictive-1', title: 'Predictive Analytics', category: 'Analytics',
    summary: 'Holt-Winters, Holt\'s DES, and ensemble methods for environmental trend forecasting.',
    content: `**Holt-Winters Triple ES:** Best for data with trends and seasonality — captures level, trend, and seasonal components.
**Holt's Double ES:** Level and trend without seasonality.
**Ensemble Methods:** Weighted average of multiple predictors, with confidence intervals.
**Applications:** HVAC optimization, maintenance forecasting, air quality early warning.`,
    tags: ['analytics', 'prediction', 'forecasting'],
  },
  {
    id: 'sensors-1', title: 'Sensor Placement Best Practices', category: 'Hardware',
    summary: 'Optimal placement strategies for temperature, CO₂, PM2.5, and humidity sensors.',
    content: `**Temperature & Humidity:** Mount at 1.2–1.5m height (breathing zone), away from sunlight and heat sources.
**CO₂ Sensors:** Central location, away from windows and doors.
**PM2.5 Sensors:** Central position, away from cooking areas and HVAC vents.
**General:** Document locations, calibrate on installation, quarterly maintenance.`,
    tags: ['sensors', 'placement', 'hardware', 'calibration'],
  },
  {
    id: 'automation-1', title: 'Setting Up Automation Rules', category: 'Automation',
    summary: 'Threshold, time-based, and compound rules for environmental automation.',
    content: `**Threshold Rules:** Trigger actions when sensor values cross limits. E.g., temperature > 28°C → activate cooling.
**Time-based Rules:** Scheduled actions. E.g., EVERY 30 minutes → log data.
**Compound Rules:** Combined conditions. E.g., temperature > 26°C AND humidity > 70% → dehumidifier.
**Best Practices:** Conservative thresholds, add hysteresis, cooldown periods for equipment.`,
    tags: ['automation', 'rules', 'threshold'],
  },
  {
    id: 'troubleshooting-1', title: 'Common Sensor Issues', category: 'Troubleshooting',
    summary: 'Diagnosing and resolving zero readings, erratic data, drift, and network problems.',
    content: `**Zero/Null Readings:** Check power, network, restart sensor, verify firmware.
**Erratic Readings:** Check interference sources, loose connections, allow 30-min stabilization.
**Drift Over Time:** Normal for gas sensors; recalibrate regularly; replace if drift >10%.
**Network Issues:** Verify MQTT broker, WiFi signal, firewall rules, device credentials.
**Data Gaps:** Check battery, transmission intervals, database capacity, API rate limits.`,
    tags: ['troubleshooting', 'maintenance', 'debugging'],
  },
];

const API_ENDPOINTS = [
  { method: 'GET', path: '/api/devices', desc: 'List all registered devices' },
  { method: 'POST', path: '/api/devices', desc: 'Register a new device' },
  { method: 'GET', path: '/api/devices/:id/readings', desc: 'Get historical sensor readings' },
  { method: 'POST', path: '/api/ehi-history', desc: 'Persist an EHI data point' },
  { method: 'GET', path: '/api/ehi-history', desc: 'Retrieve EHI history' },
  { method: 'GET', path: '/api/alerts', desc: 'List active alerts' },
  { method: 'POST', path: '/api/alerts', desc: 'Create a new alert rule' },
  { method: 'POST', path: '/api/alerts/:id/acknowledge', desc: 'Acknowledge an alert' },
  { method: 'GET', path: '/api/thresholds', desc: 'List configured sensor thresholds' },
  { method: 'POST', path: '/api/thresholds', desc: 'Save or update a threshold' },
];

const METHOD_COLORS: Record<string, string> = { GET: 'text-[var(--emerald)]', POST: 'text-[var(--cyan)]', PUT: 'text-[var(--amber)]', DELETE: 'text-[var(--rose)]' };

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, type: 'spring' as const, stiffness: 70 } }) };

function TrendUp(props: { size?: number; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
}

function BarChart3(props: { size?: number; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>;
}

export default function ReferencesPage() {
  const [activeTab, setActiveTab] = useState<'references' | 'articles' | 'api' | 'quickstart'>('references');
  const [searchRef, setSearchRef] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const filteredRefs = SCIENTIFIC_REFERENCES.filter(r => {
    const matchesSearch = !searchRef || r.title.toLowerCase().includes(searchRef.toLowerCase()) || r.authors.toLowerCase().includes(searchRef.toLowerCase()) || r.tags.some(t => t.includes(searchRef.toLowerCase()));
    const matchesTags = selectedTags.size === 0 || r.tags.some(t => selectedTags.has(t));
    return matchesSearch && matchesTags;
  });

  const allTags = Array.from(new Set(SCIENTIFIC_REFERENCES.flatMap(r => r.tags))).sort();

  const tabs = [
    { id: 'references' as const, label: 'Scientific References', icon: <Quote size={14} /> },
    { id: 'articles' as const, label: 'Knowledge Articles', icon: <BookOpen size={14} /> },
    { id: 'api' as const, label: 'API Reference', icon: <Code size={14} /> },
    { id: 'quickstart' as const, label: 'Quick Start', icon: <Zap size={14} /> },
  ];

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-[1100px] mx-auto">
      <PageHeader
        title="References"
        subtitle="Scientific citations · Knowledge articles · API reference · Quick-start guides"
        right={<Pill tone="emerald">v2.7</Pill>}
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 p-1 rounded-[var(--radius-md)] bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
        {tabs.map(tab => (
          <Btn key={tab.id} onClick={() => setActiveTab(tab.id)} variant="ghost" size="sm" className={`whitespace-nowrap ${activeTab === tab.id ? '!bg-[var(--emerald)]/15 !text-[var(--emerald)]' : ''}`}>
            <span className="flex items-center gap-1.5">{tab.icon}{tab.label}</span>
          </Btn>
        ))}
      </div>

      <div className="animate-fade-in">

        {/* ── Scientific References Tab ── */}
        {activeTab === 'references' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>
                <Quote size={14} className="inline mr-2 text-[var(--emerald)]" />
                Scientific References
              </SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] leading-relaxed mb-5">
                All algorithms and methodologies used in the PERN platform are grounded in peer-reviewed
                scientific literature and international standards. Each reference is cited in the source
                code via JSDoc headers with numbered tags (<code className="text-[11px] bg-white/[0.06] px-1 rounded">[1]</code>,
                <code className="text-[11px] bg-white/[0.06] px-1 rounded">[2]</code>, …) that trace directly to the
                relevant equation, threshold, or design decision.
              </p>

              {/* Search */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Quote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input type="text" value={searchRef} onChange={e => setSearchRef(e.target.value)} placeholder="Search references by title, author, or tag..." className="w-full pl-10 pr-4 py-2 border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--bg-primary)] text-[var(--text-primary)]" />
                </div>
              </div>

              {/* Tag filters */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {allTags.map(tag => (
                  <button key={tag} onClick={() => {
                    const next = new Set(selectedTags);
                    next.has(tag) ? next.delete(tag) : next.add(tag);
                    setSelectedTags(next);
                  }} className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                    selectedTags.has(tag) ? 'bg-[var(--emerald)]/15 text-[var(--emerald)] border-[var(--emerald)]/30' : 'bg-white/[0.03] text-[var(--text-tertiary)] border-white/[0.08] hover:text-[var(--text-secondary)]'
                  }`}>
                    {tag}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                {filteredRefs.map((ref, i) => (
                  <a key={ref.id} href={ref.doi || '#'} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] hover:bg-white/[0.03] transition-colors group">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--emerald)]/10 text-[var(--emerald)] flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--emerald)] transition-colors">{ref.title}</div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{ref.authors} ({ref.year})</div>
                      <div className="text-[11px] text-[var(--text-disabled)]">{ref.publisher}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ref.tags.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 bg-white/[0.04] rounded text-[var(--text-disabled)]">#{t}</span>)}
                      </div>
                    </div>
                    {ref.doi && <ExternalLink size={12} className="shrink-0 text-[var(--text-disabled)] mt-1" />}
                  </a>
                ))}
                {filteredRefs.length === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No references match your search.</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Knowledge Articles Tab ── */}
        {activeTab === 'articles' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {KNOWLEDGE_ARTICLES.map(article => (
              <Card key={article.id}>
                <div className="flex items-start justify-between mb-2">
                  <Pill tone="cyan">{article.category}</Pill>
                  <Lightbulb size={14} className="text-[var(--amber)]" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-1">{article.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-3">{article.summary}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {article.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-tertiary)]">#{tag}</span>
                  ))}
                </div>
                <details className="group">
                  <summary className="text-xs text-[var(--emerald)] cursor-pointer hover:text-[var(--emerald-bright)] transition-colors list-none flex items-center gap-1">
                    <span className="group-open:hidden">Read more</span>
                    <span className="hidden group-open:inline">Collapse</span>
                    <ExternalLink size={10} />
                  </summary>
                  <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)] whitespace-pre-line prose prose-sm dark:prose-invert max-w-none">
                    <Markdown remarkPlugins={[remarkGfm]}>{article.content}</Markdown>
                  </div>
                </details>
              </Card>
            ))}
          </div>
        )}

        {/* ── API Reference Tab ── */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>REST API Endpoints</SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">
                All endpoints are prefixed with <code className="text-[11px] bg-white/[0.06] px-1 rounded">/api</code>.
                Requests require a <code className="text-[11px] bg-white/[0.06] px-1 rounded">Bearer</code> token
                and an <code className="text-[11px] bg-white/[0.06] px-1 rounded">X-Organization-Id</code> or <code className="text-[11px] bg-white/[0.06] px-1 rounded">X-User-Id</code> header.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="p-2.5 text-left text-[var(--text-disabled)] font-medium w-16">Method</th>
                      <th className="p-2.5 text-left text-[var(--text-disabled)] font-medium">Endpoint</th>
                      <th className="p-2.5 text-left text-[var(--text-disabled)] font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {API_ENDPOINTS.map((ep, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="p-2.5 font-mono font-bold text-[11px]"><span className={METHOD_COLORS[ep.method] ?? 'text-[var(--text-secondary)]'}>{ep.method}</span></td>
                        <td className="p-2.5 font-mono text-[var(--text-secondary)]">{ep.path}</td>
                        <td className="p-2.5 text-[var(--text-tertiary)]">{ep.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card hover={false}>
              <SectionTitle>Request Format</SectionTitle>
              <CodeBlock id="headers" language="HTTP">{`Authorization: Bearer <your-token>
Content-Type: application/json
X-Organization-Id: org_cairo_01
X-User-Id: user_123`}</CodeBlock>
            </Card>

            <Card hover={false}>
              <SectionTitle>Response Format</SectionTitle>
              <CodeBlock id="resp-s" language="JSON">{`{ "data": [...], "total": 42, "page": 1 }`}</CodeBlock>
              <div className="mt-3">
                <CodeBlock id="resp-e" language="JSON">{`{ "error": "Unauthorized", "message": "Invalid or expired token" }`}</CodeBlock>
              </div>
            </Card>
          </div>
        )}

        {/* ── Quick Start Tab ── */}
        {activeTab === 'quickstart' && (
          <div className="space-y-6">
            <Card hover={false}>
              <SectionTitle>
                <Zap size={14} className="inline mr-2 text-[var(--emerald)]" />
                Quick Start — Connect a New Device
              </SectionTitle>
              <div className="space-y-4">
                {[
                  { step: 1, title: 'Install dependencies',
                    code: `# Arduino IDE: Install PubSubClient library\n# PlatformIO: Add to platformio.ini\nlib_deps = knolleary/PubSubClient@^2.8` },
                  { step: 2, title: 'Configure WiFi and MQTT broker',
                    code: `#define WIFI_SSID     "YourSSID"\n#define WIFI_PASS     "YourPassword"\n#define MQTT_BROKER   "your-server.com"\n#define MQTT_PORT     1883\n#define MQTT_TOPIC    "pern/sensors/esp32_01/data"` },
                  { step: 3, title: 'Read sensors and publish data',
                    code: `void publishSensorData() {\n  StaticJsonDocument<256> doc;\n  JsonObject sensors = doc.createNestedObject("sensors");\n  sensors["pm25"] = readPM25();\n  sensors["co2"]  = readCO2();\n  sensors["tmp"]  = readTemperature();\n  sensors["hum"]  = readHumidity();\n  doc["timestamp"] = millis();\n  char buffer[256];\n  serializeJson(doc, buffer);\n  client.publish(MQTT_TOPIC, buffer);\n}` },
                  { step: 4, title: 'Register the device',
                    code: `curl -X POST https://your-server.com/api/devices \\\n  -H "Authorization: Bearer <token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "ESP32 Cairo 01", "type": "ESP32"}'` },
                  { step: 5, title: 'Verify data flow',
                    code: `# Dashboard → Live Mode — verify real-time readings\n# Or via MQTT CLI:\nmosquitto_sub -h your-server.com -t "pern/sensors/#"` },
                ].map(s => (
                  <div key={s.step}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--emerald)]/15 text-[var(--emerald)] flex items-center justify-center text-xs font-bold">{s.step}</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{s.title}</span>
                    </div>
                    <CodeBlock id={`qs-${s.step}`} language="C++ / Shell">{s.code}</CodeBlock>
                  </div>
                ))}
              </div>
            </Card>

            <Card hover={false}>
              <SectionTitle>MQTT Topic Structure</SectionTitle>
              <div className="space-y-3">
                {[
                  { topic: 'pern/sensors/{device_id}/data', desc: 'Sensor readings from devices (default 5s interval).', direction: 'Device → Broker' },
                  { topic: 'pern/actuators/{device_id}/{actuator}/status', desc: 'Actuator state feedback (relays, pumps, fans).', direction: 'Device → Broker' },
                  { topic: 'pern/devices/{device_id}/status', desc: 'Device online/offline announcements.', direction: 'Device → Broker' },
                  { topic: 'pern/actuators/{device_id}/{actuator}/set', desc: 'Remote actuator control commands from dashboard.', direction: 'Broker → Device' },
                ].map((e, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] bg-white/[0.02] border border-white/[0.06]">
                    <code className="text-xs text-[var(--emerald)] font-mono">{e.topic}</code>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-tertiary)]">{e.desc}</span>
                      <Pill tone="slate">{e.direction}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

      </div>
    </motion.div>
  );
}
