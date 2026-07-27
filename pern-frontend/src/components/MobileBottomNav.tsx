/**
 * MobileBottomNav — sticky bottom navigation bar for mobile screens.
 */

import { Link, useLocation } from 'react-router';
import { LayoutDashboard, Gauge, BellRing, BrainCircuit, MoreHorizontal } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/sensors', label: 'Sensors', icon: Gauge },
  { path: '/alerts', label: 'Alerts', icon: BellRing },
  { path: '/ai', label: 'AI', icon: BrainCircuit },
  { path: '/settings', label: 'More', icon: MoreHorizontal },
];

export default function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-1)]/95 backdrop-blur-xl border-t border-[var(--border)] safe-area-bottom" aria-label="Mobile navigation">
      <div className="flex items-center justify-around h-14">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
                isActive
                  ? 'text-[var(--emerald)]'
                  : 'text-[var(--text-disabled)] active:text-[var(--text-secondary)]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
