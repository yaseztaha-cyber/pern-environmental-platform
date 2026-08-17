import { HashRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { OrganizationProvider } from './lib/organization-context';
import OrganizationSwitcher from './components/OrganizationSwitcher';
import DeviceSelector from './components/DeviceSelector';
import AnimatedBackground from './components/AnimatedBackground';
import { DeviceProvider } from './lib/device-context';
import { DataProvider, useData } from './lib/data-provider';
import { AuthProvider, useAuth } from './lib/auth-context';
import RequireAuth from './components/RequireAuth';
import { ToastProvider } from './components/Toast';
import { I18nProvider, useI18n } from './lib/i18n';
import LanguageSwitcher from './components/LanguageSwitcher';
import { CommandPalette } from './components/CommandPalette';
import OnboardingModal from './components/OnboardingModal';
import { Toggle, LoadingState } from './components/ui';
import { PernLogo } from './components/PernLogo';
import MobileBottomNav from './components/MobileBottomNav';
const SignalFlow = lazy(() => import('./components/SignalFlow'));
import {
  LayoutDashboard, Gauge, Cpu, Cable, BrainCircuit, LineChart,
  BarChart3, MessageSquareCode, BellRing, Workflow, Wand2, Sliders, Activity, Wifi,
  Navigation, FileSpreadsheet, ShieldCheck,
  UserCheck, Layers, CheckCheck, GitCompare, Wrench, BookOpenCheck,
  KeyRound, Presentation, PanelLeftClose, PanelLeftOpen,
  ChevronDown, ChevronRight, Beaker, Share2, Database, Satellite, Terminal, Map, ArrowUp
} from 'lucide-react';

// Lazy-loaded pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SensorsPage = lazy(() => import('./pages/Sensors'));
const DevicesPage = lazy(() => import('./pages/Devices'));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail'));
const AlertsPage = lazy(() => import('./pages/Alerts'));
const NotificationsCenter = lazy(() => import('./pages/NotificationsCenter'));
const AutomationPage = lazy(() => import('./pages/Automation'));
const AIPage = lazy(() => import('./pages/AI'));
const PredictionsPage = lazy(() => import('./pages/Predictions'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const VulnerablePage = lazy(() => import('./pages/Vulnerable'));
const DigitalTwinPage = lazy(() => import('./pages/DigitalTwin'));
const CompliancePage = lazy(() => import('./pages/Compliance'));
const ChatbotPage = lazy(() => import('./pages/Chatbot'));
const AnalyticsPage = lazy(() => import('./pages/Analytics'));
const RealDataValidation = lazy(() => import('./pages/RealDataValidation'));
const CompareVirtualSensors = lazy(() => import('./pages/CompareVirtualSensors'));
const RealSensorMap = lazy(() => import('./pages/RealSensorMap'));
const SensorCalibrationPage = lazy(() => import('./pages/SensorCalibration'));
const SecurityAudit = lazy(() => import('./pages/SecurityAudit'));
const ShowcasePage = lazy(() => import('./pages/Showcase'));
const ProtocolStatusDashboard = lazy(() => import('./pages/ProtocolStatus'));
const RuleGeneratorPage = lazy(() => import('./pages/RuleGenerator'));
const VirtualSensorsPage = lazy(() => import('./pages/VirtualSensors'));
const GlobalSensorsV3 = lazy(() => import('./pages/GlobalSensorsV3'));
const DataSources = lazy(() => import('./pages/DataSources'));
const TrustDashboard = lazy(() => import('./pages/TrustDashboard'));
const KnowledgeHub = lazy(() => import('./pages/KnowledgeHub'));
const DeviceHub = lazy(() => import('./pages/DeviceHub'));
const ApiConsole = lazy(() => import('./pages/ApiConsole'));
const MapsWeatherHub = lazy(() => import('./pages/MapsWeatherHub'));
const MonitorHub = lazy(() => import('./pages/MonitorHub'));
const DeviceConnectionPage = lazy(() => import('./pages/DeviceConnection'));
const DeviceSetupGuidePage = lazy(() => import('./pages/DeviceSetupGuide'));
const ConnectionTestPage = lazy(() => import('./pages/ConnectionTest'));
const SystemStatusPage = lazy(() => import('./pages/SystemStatus'));
const WeatherPage = lazy(() => import('./pages/Weather'));
const DeviceLifecyclePage = lazy(() => import('./pages/DeviceLifecycle'));
const DeviceHealthDashboard = lazy(() => import('./pages/DeviceHealthDashboard'));
const HistoryPage = lazy(() => import('./pages/History'));
const FirmwarePage = lazy(() => import('./pages/Firmware'));
const ResearchPage = lazy(() => import('./pages/Research'));
const KnowledgePage = lazy(() => import('./pages/Knowledge'));
const ResourcesPage = lazy(() => import('./pages/Resources'));
const ReferencesPage = lazy(() => import('./pages/References'));
const PlumeMap = lazy(() => import('./pages/PlumeMap'));
const GlobalSensorMap = lazy(() => import('./components/GlobalSensorMap'));
const SupportPage = lazy(() => import('./pages/Support'));

/* ===================== NAVIGATION ===================== */

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { path: '/sensors', label: 'Live Sensors', icon: Gauge },
      { path: '/devices', label: 'Devices', icon: Cpu },
      { path: '/device-hub', label: 'Device Hub', icon: Cable },
      { path: '/monitor-hub', label: 'Monitor Hub', icon: Activity },
      { path: '/maps-weather', label: 'Maps & Weather', icon: Map },
      { path: '/virtual-sensors', label: 'Virtual Sensors', icon: Beaker },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { path: '/ai', label: 'AI Engine', icon: BrainCircuit },
      { path: '/predictions', label: 'Predictions', icon: LineChart },
      { path: '/analytics', label: 'Analytics', icon: BarChart3 },
      { path: '/chatbot', label: 'AI Assistant', icon: MessageSquareCode },
    ],
  },
  {
    title: 'Automation',
    items: [
      { path: '/alerts', label: 'Alerts', icon: BellRing },
      { path: '/notifications', label: 'Notification Center', icon: BellRing },
      { path: '/automation', label: 'Rules', icon: Workflow },
      { path: '/rule-generator', label: 'AI Rule Gen', icon: Wand2 },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: Sliders },
      { path: '/protocol-status', label: 'Protocols', icon: Wifi },
      { path: '/signal-flow', label: 'Signal Flow', icon: Share2 },
    ],
  },
];

/* Secondary nav (collapsed section) */
const secondarySections: NavSection[] = [
  {
    title: 'More',
    items: [
      { path: '/real-sensor-map', label: 'Real Sensor Map', icon: Navigation },
      { path: '/reports', label: 'Reports', icon: FileSpreadsheet },
      { path: '/compliance', label: 'Compliance', icon: ShieldCheck },
      { path: '/vulnerable', label: 'Vulnerable Groups', icon: UserCheck },
      { path: '/digital-twin', label: 'Digital Twin', icon: Layers },
      { path: '/real-data-validation', label: 'Data Validation', icon: CheckCheck },
      { path: '/compare-virtual-sensors', label: 'Virtual Compare', icon: GitCompare },
      { path: '/calibration', label: 'Calibration', icon: Wrench },
      { path: '/global-sensors-v3', label: 'Global v3', icon: Satellite },
      { path: '/data-sources', label: 'Data Sources', icon: Database },
      { path: '/knowledge-hub', label: 'Knowledge Hub', icon: BookOpenCheck },
      { path: '/api-console', label: 'API Console', icon: Terminal },
      { path: '/trust', label: 'Trust', icon: ShieldCheck },
      { path: '/security-audit', label: 'Security', icon: KeyRound },
      { path: '/support', label: 'Support', icon: MessageSquareCode },
      { path: '/showcase', label: 'Showcase', icon: Presentation },
    ],
  },
];

/* Translation key mapping for nav items (path → i18n key) */
const NAV_I18N: Record<string, string> = {
  '/': 'nav.dashboard',
  '/sensors': 'nav.liveSensors',
  '/devices': 'nav.devices',
  '/device-hub': 'nav.deviceHub',
  '/monitor-hub': 'nav.monitorHub',
  '/maps-weather': 'nav.mapsWeather',
  '/ai': 'nav.aiEngine',
  '/predictions': 'nav.predictions',
  '/analytics': 'nav.analytics',
  '/chatbot': 'nav.aiAssistant',
  '/alerts': 'nav.alerts',
  '/notifications': 'nav.notifications',
  '/automation': 'nav.rules',
  '/rule-generator': 'nav.aiRuleGen',
  '/settings': 'nav.settings',
  '/system-status': 'nav.status',
  '/protocol-status': 'nav.protocols',
  '/real-sensor-map': 'nav.realSensorMap',
  '/reports': 'nav.reports',
  '/compliance': 'nav.compliance',
  '/vulnerable': 'nav.vulnerableGroups',
  '/digital-twin': 'nav.digitalTwin',
  '/real-data-validation': 'nav.dataValidation',
  '/compare-virtual-sensors': 'nav.virtualCompare',
  '/virtual-sensors': 'nav.virtualSensors',
  '/signal-flow': 'nav.signalFlow',
  '/calibration': 'nav.calibration',
  '/global-sensors-v3': 'nav.globalSensorsV3',
  '/data-sources': 'nav.dataSources',
  '/knowledge-hub': 'nav.knowledgeHub',
  '/api-console': 'nav.apiConsole',
  '/trust': 'nav.trust',
  '/device-health': 'nav.deviceHealth',
  '/history': 'nav.history',
  '/support': 'nav.support',
  '/security-audit': 'nav.security',
  '/showcase': 'nav.showcase',
};

const SECTION_I18N: Record<string, string> = {
  'Overview': 'nav.overview',
  'Monitoring': 'nav.monitoring',
  'Intelligence': 'nav.intelligence',
  'Automation': 'nav.automation',
  'System': 'nav.system',
  'More': 'nav.more',
};

function useTranslatedNavSections() {
  const { t } = useI18n();
  return useMemo(() => {
    const sections = navSections.map(s => ({
      ...s,
      title: t(SECTION_I18N[s.title] || s.title),
      items: s.items.map(i => ({ ...i, label: t(NAV_I18N[i.path] || i.label) })),
    }));
    const secondary = secondarySections.map(s => ({
      ...s,
      title: t(SECTION_I18N[s.title] || s.title),
      items: s.items.map(i => ({ ...i, label: t(NAV_I18N[i.path] || i.label) })),
    }));
    return { sections, secondary };
  }, [t]);
}

/* ===================== COMPONENTS ===================== */

function NavLink({ item, collapsed }: { item: NavItem; collapsed?: boolean }) {
  const location = useLocation();
  const isActive = location.pathname === item.path;
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      className={`nav-link ${isActive ? 'active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
    >
      <Icon size={17} className="nav-icon shrink-0" />
      {!collapsed && <span className="nav-label truncate">{item.label}</span>}
    </Link>
  );
}

function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const { sections: navSectionsT, secondary: secondarySectionsT } = useTranslatedNavSections();

  // Check if any secondary item is active
  const hasActiveSecondary = secondarySectionsT.some(s =>
    s.items.some(i => location.pathname === i.path)
  );

  const toggleMobile = useCallback(() => setMobileOpen(p => !p), []);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={toggleMobile}
        className="lg:hidden fixed top-3 left-3 rtl:left-auto rtl:right-3 z-50 p-2.5 rounded-[var(--radius-sm)] glass"
        aria-label="Toggle navigation"
      >
        <div className="space-y-1">
          <div className="w-4.5 h-[2px] bg-[var(--text-secondary)] rounded" />
          <div className="w-4.5 h-[2px] bg-[var(--text-secondary)] rounded" />
          <div className="w-3 h-[2px] bg-[var(--text-secondary)] rounded" />
        </div>
      </button>

      {/* Desktop sidebar */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} hidden lg:flex`} role="navigation" aria-label="Main navigation">
        {/* Brand */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5 sidebar-brand">
              <PernLogo size={34} />
              {!collapsed && (
                <div className="sidebar-brand-text">
                  <div className="font-bold text-[15px] tracking-tight leading-none">PERN</div>
                  <div className="text-[9px] text-[var(--emerald)] tracking-[0.15em] font-semibold mt-0.5">EIQ PLATFORM</div>
                </div>
              )}
            </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-[var(--radius-xs)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors hidden lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1" role="navigation" aria-label="Main navigation">
          {navSectionsT.map((section, idx) => (
            <div key={idx} className="mb-4">
              {!collapsed && (
                <div className="px-2.5 py-1.5 section-label">{section.title}</div>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <NavLink key={item.path} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}

          {/* More section (collapsible) */}
          {!collapsed && (
            <div className="mb-4">
                <button
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                    hasActiveSecondary || moreOpen
                      ? 'text-[var(--text-secondary)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {moreOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>{secondarySectionsT[0]?.title || 'More'}</span>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </button>
              {moreOpen && (
                <div className="mt-1 space-y-0.5 animate-fade-in">
                  {secondarySectionsT[0].items.map(item => (
                    <NavLink key={item.path} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
        <div className="px-4 py-3 border-t border-[var(--border)]">
          <div className="sidebar-footer-text text-[10px] text-[var(--text-disabled)] text-center">
            STEM Gharbiya 2026
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 rtl:left-auto rtl:right-0 top-0 h-full w-72 sidebar-mobile border-r rtl:border-r-0 rtl:border-l border-[var(--border)] flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <PernLogo size={34} />
                <div>
                  <div className="font-bold text-[15px] tracking-tight">PERN</div>
                  <div className="text-[9px] text-[var(--emerald)] tracking-[0.15em] font-semibold">EIQ PLATFORM</div>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-[var(--text-tertiary)] p-1 hover:text-[var(--text-secondary)] transition-colors">
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1" role="navigation">
              {navSectionsT.map((section, idx) => (
                <div key={idx} className="mb-4">
                  <div className="px-2.5 py-1.5 section-label">{section.title}</div>
                  <div className="space-y-0.5">
                    {section.items.map(item => (
                      <div key={item.path} onClick={() => setMobileOpen(false)}>
                        <NavLink item={item} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

function LiveModeToggle() {
  const { isLive, setLiveMode, mqttConnected } = useData();
  return (
    <div className="flex items-center gap-2.5 glass rounded-full px-3 py-1.5 transition-all duration-200">
      <div className={`w-2 h-2 rounded-full transition-colors duration-200 ${isLive && mqttConnected ? 'bg-[var(--emerald)] shadow-glow-sm' : 'bg-white/15'}`} />
      <span className="text-xs font-medium hidden sm:inline text-[var(--text-secondary)]">Live</span>
      <Toggle checked={isLive} onChange={setLiveMode} />
    </div>
  );
}

function AuthMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  if (!isAuthenticated) {
    return (
      <button
        onClick={() => navigate('/login')}
        className="px-3 py-1.5 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] transition-all duration-200 hover:border-[var(--border-hover)]"
      >
        Sign in
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
        {user?.name || user?.email || 'Signed in'}
      </span>
      <button
        onClick={() => { logout(); navigate('/login'); }}
        className="px-3 py-1.5 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-xs font-medium text-[var(--text-secondary)] border border-[var(--border)] transition-all duration-200 hover:border-[var(--border-hover)]"
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  );
}

function LiveStatusBar() {
  const { isLive, mqttConnected, reconnecting, lastUpdate, liveDevice } = useData();
  if (!isLive) return null;

  let label: string;
  let bgClass: string;
  if (mqttConnected) {
    label = `LIVE — ${liveDevice ? `${liveDevice} · ` : ''}Streaming via MQTT${lastUpdate ? ` · ${new Date(lastUpdate).toLocaleTimeString()}` : ''}`;
    bgClass = 'bg-[var(--emerald)]/10 text-[var(--emerald)] border-b border-[var(--emerald)]/20';
  } else if (reconnecting) {
    label = 'Reconnecting to MQTT broker…';
    bgClass = 'bg-[var(--amber-dim)] text-[var(--amber)] border-b border-[var(--amber)]/20';
  } else {
    label = 'Connecting to MQTT broker…';
    bgClass = 'bg-[var(--amber-dim)] text-[var(--amber)] border-b border-[var(--amber)]/20';
  }

  return (
    <div className={`text-center py-1.5 text-[11px] font-medium tracking-wide ${bgClass}`}>
      {label}
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <LoadingState />
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
      <div className="text-[80px] font-bold text-white/[0.06] leading-none">404</div>
      <h1 className="text-xl font-semibold mt-2">Page not found</h1>
      <p className="text-[var(--text-tertiary)] text-sm mt-2 max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="btn btn-primary mt-6">
        <LayoutDashboard size={16} /> Back to Dashboard
      </Link>
    </div>
  );
}

/* ===================== APP CONTENT ===================== */

function BackToTop() {
  const [visible, setVisible] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mainRef.current = document.getElementById('main-content');
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setVisible(el.scrollTop > 400);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;
  return (
    <button
      onClick={() => { mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
      className="fixed bottom-20 lg:bottom-6 right-5 rtl:right-auto rtl:left-5 z-40 p-3 rounded-full glass shadow-glass-lg text-[var(--text-secondary)] hover:text-[var(--emerald)] border border-[var(--border)] hover:border-[var(--emerald-glow)] transition-all duration-200 animate-fade-in-up"
      aria-label="Back to top"
      title="Back to top"
    >
      <ArrowUp size={18} />
    </button>
  );
}

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t } = useI18n();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Scroll to top of the main scroll container on route change
  useEffect(() => {
    const el = document.getElementById('main-content');
    if (el) el.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-[var(--bg-0)] text-[var(--text-primary)] relative overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Ambient layered background — nebula, aurora, spiral galaxy, blueprint grid */}
      <div className="aurora-backdrop" aria-hidden="true">
        <div className="aurora-galaxy" />
        <div className="aurora-beam a1" />
        <div className="aurora-beam a2" />
        <div className="aurora-beam a3" />
        <div className="aurora-grid" />
        <div className="aurora-vignette" />
      </div>
      <AnimatedBackground />
      {/* Floating glow orbs — ocean depths */}
      <div className="floating-orbs" aria-hidden="true">
        <div className="orb orb-emerald w-[380px] h-[380px] top-[12%] left-[8%]" style={{ animationDelay: '0s', opacity: 0.1 }} />
        <div className="orb orb-cyan w-[320px] h-[320px] top-[55%] left-[58%]" style={{ animationDelay: '-9s', opacity: 0.08 }} />
        <div className="orb orb-violet w-[280px] h-[280px] top-[20%] right-[8%]" style={{ animationDelay: '-17s', opacity: 0.07 }} />
        <div className="orb orb-indigo w-[240px] h-[240px] bottom-[8%] left-[30%]" style={{ animationDelay: '-25s', opacity: 0.06 }} />
        <div className="orb orb-blue w-[220px] h-[220px] bottom-[20%] right-[25%]" style={{ animationDelay: '-4s', opacity: 0.06 }} />
      </div>

      {isAuthenticated && <Sidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />}

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden ${!isAuthenticated ? '' : sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-[260px]'} transition-[margin] duration-200`}>
        {isAuthenticated && <OnboardingModal />}

        {/* Header */}
        {isAuthenticated && (
          <header className="h-12 border-b border-[var(--border)] bg-[var(--bg-1)]/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6 shrink-0 relative z-30">
            <div className="hidden md:block lg:ml-0 text-[11px] text-[var(--emerald)] font-semibold tracking-[0.12em] uppercase">
              {t('header.platform')}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <LiveModeToggle />
              <div className="w-px h-4 bg-[var(--border)] hidden sm:block" />
              <OrganizationSwitcher />
              <DeviceSelector />
              <LanguageSwitcher />
              <AuthMenu />
              <div className="px-2 py-0.5 bg-[var(--emerald-dim)] text-[var(--emerald)] rounded-full text-[10px] font-semibold hidden sm:block">
                v2.7
              </div>
            </div>
          </header>
        )}

        {isAuthenticated && <LiveStatusBar />}

        {/* Scrollable content — pb-16 on mobile for bottom nav clearance */}
        <main id="main-content" className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pb-20 lg:pb-8 relative z-10" role="main" aria-label="Main content">
          <AnimatePresence>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <PageErrorBoundary resetKey={location.pathname}>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/*" element={
                  <RequireAuth>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/sensors" element={<SensorsPage />} />
                      <Route path="/devices" element={<DevicesPage />} />
                      <Route path="/devices/:deviceId" element={<DeviceDetail />} />
                      <Route path="/alerts" element={<AlertsPage />} />
                      <Route path="/notifications" element={<NotificationsCenter />} />
                      <Route path="/automation" element={<AutomationPage />} />
                      <Route path="/ai" element={<AIPage />} />
                      <Route path="/predictions" element={<PredictionsPage />} />
                      <Route path="/real-sensor-map" element={<RealSensorMap />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/compliance" element={<CompliancePage />} />
                      <Route path="/vulnerable" element={<VulnerablePage />} />
                      <Route path="/digital-twin" element={<DigitalTwinPage />} />
                      <Route path="/chatbot" element={<ChatbotPage />} />
                      <Route path="/analytics" element={<AnalyticsPage />} />
                      <Route path="/calibration" element={<SensorCalibrationPage />} />
                      <Route path="/showcase" element={<ShowcasePage />} />
                      <Route path="/security-audit" element={<SecurityAudit />} />
                      <Route path="/protocol-status" element={<ProtocolStatusDashboard />} />
                      <Route path="/signal-flow" element={<SignalFlow />} />
                      <Route path="/rule-generator" element={<RuleGeneratorPage />} />
                      <Route path="/real-data-validation" element={<RealDataValidation />} />
                      <Route path="/compare-virtual-sensors" element={<CompareVirtualSensors />} />
                      <Route path="/virtual-sensors" element={<VirtualSensorsPage />} />
                      <Route path="/global-sensors-v3" element={<GlobalSensorsV3 />} />
                      <Route path="/data-sources" element={<DataSources />} />
                      <Route path="/trust" element={<TrustDashboard />} />
                      <Route path="/knowledge-hub" element={<KnowledgeHub />} />
                      <Route path="/device-hub" element={<DeviceHub />} />
                      <Route path="/api-console" element={<ApiConsole />} />
                      <Route path="/maps-weather" element={<MapsWeatherHub />} />
                      <Route path="/monitor-hub" element={<MonitorHub />} />
                      <Route path="/device-connection" element={<DeviceConnectionPage />} />
                      <Route path="/device-setup-guide" element={<DeviceSetupGuidePage />} />
                      <Route path="/connection-test" element={<ConnectionTestPage />} />
                      <Route path="/system-status" element={<SystemStatusPage />} />
                      <Route path="/weather" element={<WeatherPage />} />
                      <Route path="/device-lifecycle" element={<DeviceLifecyclePage />} />
                      <Route path="/device-health" element={<DeviceHealthDashboard />} />
                      <Route path="/history" element={<HistoryPage />} />
                      <Route path="/firmware" element={<FirmwarePage />} />
                      <Route path="/research" element={<ResearchPage />} />
                      <Route path="/knowledge" element={<KnowledgePage />} />
                      <Route path="/resources" element={<ResourcesPage />} />
                      <Route path="/references" element={<ReferencesPage />} />
                      <Route path="/plume-map" element={<PlumeMap />} />
                      <Route path="/map" element={<div className="p-4"><GlobalSensorMap /></div>} />
                      <Route path="/support" element={<SupportPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </RequireAuth>
                } />
              </Routes>
            </Suspense>
              </PageErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>

        {isAuthenticated && <MobileBottomNav />}
        {isAuthenticated && <BackToTop />}
      </div>
    </div>
  );
}

/* ===================== ROOT ===================== */

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <I18nProvider>
          <AuthProvider>
            <DeviceProvider>
              <DataProvider>
                <OrganizationProvider>
                  <ToastProvider>
                    <CommandPalette />
                    <AppContent />
                  </ToastProvider>
                </OrganizationProvider>
              </DataProvider>
            </DeviceProvider>
          </AuthProvider>
        </I18nProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
