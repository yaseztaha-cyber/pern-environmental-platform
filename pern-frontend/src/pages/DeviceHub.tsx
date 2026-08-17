import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cable, BookOpen, Clock, Heart, Binary } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import DeviceConnection from './DeviceConnection';
import DeviceSetupGuide from './DeviceSetupGuide';
import DeviceLifecyclePage from './DeviceLifecycle';
import DeviceHealthDashboard from './DeviceHealthDashboard';
import FirmwarePage from './Firmware';

type Tab = 'connect' | 'guide' | 'lifecycle' | 'health' | 'firmware';

export default function DeviceHub() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('connect');

  const tabs = [
    { id: 'connect' as const, label: t('deviceHub.tab.connect', 'Connect'), icon: <Cable size={14} /> },
    { id: 'guide' as const, label: t('deviceHub.tab.guide', 'Setup Guide'), icon: <BookOpen size={14} /> },
    { id: 'lifecycle' as const, label: t('deviceHub.tab.lifecycle', 'Lifecycle'), icon: <Clock size={14} /> },
    { id: 'health' as const, label: t('deviceHub.tab.health', 'Health'), icon: <Heart size={14} /> },
    { id: 'firmware' as const, label: t('deviceHub.tab.firmware', 'Firmware'), icon: <Binary size={14} /> },
  ];

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex gap-1 mb-6 p-1 rounded-lg overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
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
          {activeTab === 'connect' && <DeviceConnection />}
          {activeTab === 'guide' && <DeviceSetupGuide />}
          {activeTab === 'lifecycle' && <DeviceLifecyclePage />}
          {activeTab === 'health' && <DeviceHealthDashboard />}
          {activeTab === 'firmware' && <FirmwarePage />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
