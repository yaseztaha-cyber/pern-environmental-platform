/**
 * MobileBottomNav — sticky bottom navigation bar for mobile screens.
 */

import { Link, useLocation } from 'react-router';
import { LayoutDashboard, Gauge, BellRing, BrainCircuit, MoreHorizontal } from 'lucide-react';
import { useI18n } from '../lib/i18n';

const NAV_I18N: Record<string, string> = {
  '/': 'nav.dashboard',
  '/sensors': 'nav.liveSensors',
  '/alerts': 'nav.alerts',
  '/ai': 'nav.aiEngine',
  '/settings': 'nav.settings',
};

const navItems = [
  { path: '/', icon: LayoutDashboard },
  { path: '/sensors', icon: Gauge },
  { path: '/alerts', icon: BellRing },
  { path: '/ai', icon: BrainCircuit },
  { path: '/settings', icon: MoreHorizontal },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const { t } = useI18n();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-1)]/95 backdrop-blur-xl border-t border-[var(--border)] safe-area-bottom" aria-label="Mobile navigation">
      <div className="flex items-center justify-around h-14">
        {navItems.map(({ path, icon: Icon }) => {
          const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className={`mobile-nav-link flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
                isActive
                  ? 'active text-[var(--emerald)]'
                  : 'text-[var(--text-disabled)] active:text-[var(--text-secondary)]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className="text-[10px] font-medium">{t(NAV_I18N[path])}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
