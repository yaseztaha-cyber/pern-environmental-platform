import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Activity, RadioTower } from 'lucide-react';
import HistoryPage from './History';
import SystemStatus from './SystemStatus';
import ConnectionTest from './ConnectionTest';

type Tab = 'history' | 'status' | 'connection';
const tabs = [
  { id: 'history' as const, label: 'History', icon: <History size={14} /> },
  { id: 'status' as const, label: 'System Status', icon: <Activity size={14} /> },
  { id: 'connection' as const, label: 'Connection Test', icon: <RadioTower size={14} /> },
];

export default function MonitorHub() {
  const [activeTab, setActiveTab] = useState<Tab>('history');

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
          {activeTab === 'history' && <HistoryPage />}
          {activeTab === 'status' && <SystemStatus />}
          {activeTab === 'connection' && <ConnectionTest />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
