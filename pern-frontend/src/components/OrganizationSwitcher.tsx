import { useOrganization } from '../lib/organization-context';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function OrganizationSwitcher() {
  const { currentOrganization, organizations, switchOrganization } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, close]);

  if (!currentOrganization) return null;

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-2xl text-sm"
      >
        <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
        <span className="font-medium">{currentOrganization.name}</span>
        <span className="text-emerald-400 text-xs">({currentOrganization.plan})</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-white/10 rounded-2xl shadow-xl z-50">
          <div className="p-3 border-b border-white/10">
            <div className="text-xs text-slate-400 px-3">Switch Organization</div>
          </div>
          
          <div className="py-2">
            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => {
                  switchOrganization(org);
                  close();
                }}
                className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/5 ${currentOrganization.id === org.id ? 'bg-emerald-500/10' : ''}`}
              >
                <div>
                  <div className="font-medium">{org.name}</div>
                  <div className="text-xs text-slate-400">{org.slug}</div>
                </div>
                <div className="text-xs px-2 py-0.5 rounded bg-white/10">
                  {org.plan}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}