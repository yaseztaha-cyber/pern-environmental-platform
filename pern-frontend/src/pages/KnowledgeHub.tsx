import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, FolderKanban, Quote, FlaskConical } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import Knowledge from './Knowledge';
import ResourcesPage from './Resources';
import ReferencesPage from './References';
import ResearchPage from './Research';

type Tab = 'articles' | 'resources' | 'references' | 'research';

export default function KnowledgeHub() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('articles');

  const tabs = [
    { id: 'articles' as const, label: t('knowledge.tabs.articles', 'Articles'), icon: <BookOpen size={14} /> },
    { id: 'resources' as const, label: t('knowledge.tabs.resources', 'Resources'), icon: <FolderKanban size={14} /> },
    { id: 'references' as const, label: t('knowledge.tabs.references', 'References'), icon: <Quote size={14} /> },
    { id: 'research' as const, label: t('knowledge.tabs.research', 'Research'), icon: <FlaskConical size={14} /> },
  ];

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
          {activeTab === 'articles' && <Knowledge />}
          {activeTab === 'resources' && <ResourcesPage />}
          {activeTab === 'references' && <ReferencesPage />}
          {activeTab === 'research' && <ResearchPage />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
