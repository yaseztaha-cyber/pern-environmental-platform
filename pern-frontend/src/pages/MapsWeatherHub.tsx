import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, CloudRain, Wind, Satellite, Navigation } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import MapPage from './Map';
import WeatherPage from './Weather';
import PlumeMap from './PlumeMap';
import GlobalSensorsV3 from './GlobalSensorsV3';
import RealSensorMap from './RealSensorMap';

type Tab = 'map' | 'weather' | 'plume' | 'globalv3' | 'realsensor';
const getTabs = (t: (key: string, fallback?: string) => string) => [
  { id: 'map' as const, label: t('nav.globalSensorMap', 'Map'), icon: <Map size={14} /> },
  { id: 'weather' as const, label: t('nav.weather', 'Weather'), icon: <CloudRain size={14} /> },
  { id: 'plume' as const, label: t('mapsWeather.tab.plume', 'Plume Tracker'), icon: <Wind size={14} /> },
  { id: 'globalv3' as const, label: t('nav.globalSensorsV3', 'Global v3'), icon: <Satellite size={14} /> },
  { id: 'realsensor' as const, label: t('nav.realSensorMap', 'Real Sensor Map'), icon: <Navigation size={14} /> },
];

export default function MapsWeatherHub() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('map');
  const tabs = getTabs(t);

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--emerald)]/15 text-[var(--emerald)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'map' && <MapPage />}
          {activeTab === 'weather' && <WeatherPage />}
          {activeTab === 'plume' && <PlumeMap />}
          {activeTab === 'globalv3' && <GlobalSensorsV3 />}
          {activeTab === 'realsensor' && <RealSensorMap />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
