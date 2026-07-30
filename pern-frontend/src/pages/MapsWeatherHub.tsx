import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, CloudRain, Wind } from 'lucide-react';
import MapPage from './Map';
import WeatherPage from './Weather';
import PlumeMap from './PlumeMap';

type Tab = 'map' | 'weather' | 'plume';
const tabs = [
  { id: 'map' as const, label: 'Map', icon: <Map size={14} /> },
  { id: 'weather' as const, label: 'Weather', icon: <CloudRain size={14} /> },
  { id: 'plume' as const, label: 'Plume Tracker', icon: <Wind size={14} /> },
];

export default function MapsWeatherHub() {
  const [activeTab, setActiveTab] = useState<Tab>('map');

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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
