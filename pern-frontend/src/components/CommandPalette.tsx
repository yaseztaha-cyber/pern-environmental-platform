import React, { useState, useEffect } from 'react';
import { Search, Monitor, Activity, Bell, Shield, FileText, Settings, Sparkles, Map, Database, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
  onNavigate?: (path: string) => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: React.ElementType;
  path: string;
}

const COMMAND_ITEMS: CommandItem[] = [
  { id: 'dash', title: 'Live System Dashboard', category: 'Navigation', icon: Activity, path: '/dashboard' },
  { id: 'map', title: 'Geospatial Sensor Map', category: 'Navigation', icon: Map, path: '/map' },
  { id: 'devices', title: 'Device Fleet & Management', category: 'Devices', icon: Monitor, path: '/devices' },
  { id: 'virtual', title: 'Virtual Sensor Analytics', category: 'Analytics', icon: Sparkles, path: '/virtual-sensors' },
  { id: 'alerts', title: 'Alert History & Rules', category: 'Alerts', icon: Bell, path: '/alerts' },
  { id: 'automation', title: 'Automation Engine', category: 'Automation', icon: Database, path: '/automation' },
  { id: 'compliance', title: 'Environmental Compliance', category: 'Governance', icon: Shield, path: '/compliance' },
  { id: 'reports', title: 'Executive Reports', category: 'Reports', icon: FileText, path: '/reports' },
  { id: 'settings', title: 'System Settings', category: 'Config', icon: Settings, path: '/settings' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen: isOpenProp, onClose: onCloseProp, onNavigate: onNavigateProp }) => {
  const [query, setQuery] = useState('');
  const [internalOpen, setInternalOpen] = useState(false);

  // Use external props if provided, otherwise manage internally
  const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen;
  const handleClose = onCloseProp || (() => setInternalOpen(false));
  const handleNavigate = onNavigateProp || (() => {});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) handleClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const filtered = COMMAND_ITEMS.filter(item =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden text-slate-100">
        <div className="flex items-center px-4 border-b border-slate-800">
          <Search className="w-5 h-5 text-slate-400 mr-3" />
          <input
            type="text"
            className="w-full bg-transparent py-4 text-slate-100 placeholder-slate-500 focus:outline-none text-base"
            placeholder="Type a command or search... (Esc to cancel)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button onClick={handleClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              No matching commands or pages found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    handleNavigate(item.path);
                    handleClose();
                  }}
                  className="w-full flex items-center px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors text-left group"
                >
                  <div className="p-2 bg-slate-800 group-hover:bg-emerald-500/20 text-emerald-400 rounded-lg mr-3">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200 group-hover:text-emerald-300">
                      {item.title}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 group-hover:text-slate-300">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <span>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">↑</kbd> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">↓</kbd> to navigate</span>
          <span>PERN Environmental Intelligence</span>
        </div>
      </div>
    </div>
  );
};
