import { HashRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OrganizationProvider } from './lib/organization-context';
import OrganizationSwitcher from './components/OrganizationSwitcher';
import DeviceSelector from './components/DeviceSelector';
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
import MobileBottomNav from './components/MobileBottomNav';
import {
  LayoutDashboard, Gauge, Cpu, Cable, History, Map, BrainCircuit, LineChart,
  BarChart3, MessageSquareCode, BellRing, Workflow, Wand2, Sliders, Activity, Wifi,
  RadioTower, Clock, Stethoscope, Navigation, FileSpreadsheet, CloudRain, ShieldCheck,
  UserCheck, Layers, CheckCheck, GitCompare, Wrench, FlaskConical, BookOpenCheck,
  FolderKanban, Binary, LifeBuoy, KeyRound, Building2, Users, Presentation, PanelLeftClose, PanelLeftOpen,
  ChevronDown, ChevronRight
} from 'lucide-react';

// Lazy-loaded pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SensorsPage = lazy(() => import('./pages/Sensors'));
const DevicesPage = lazy(() => import('./pages/Devices'));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail'));
const AlertsPage = lazy(() => import('./pages/Alerts'));
const AutomationPage = lazy(() => import('./pages/Automation'));
const AIPage = lazy(() => import('./pages/AI'));
const PredictionsPage = lazy(() => import('./pages/Predictions'));
const MapPage = lazy(() => import('./pages/Map'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const DeviceConnectionPage = lazy(() => import('./pages/DeviceConnection'));
const Login = lazy(() => import('./pages/Login'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const VulnerablePage = lazy(() => import('./pages/Vulnerable'));
const DigitalTwinPage = lazy(() => import('./pages/DigitalTwin'));
const ConnectionTestPage = lazy(() => import('./pages/ConnectionTest'));
const CompliancePage = lazy(() => import('./pages/Compliance'));
const ChatbotPage = lazy(() => import('./pages/Chatbot'));
const SystemStatusPage = lazy(() => import('./pages/SystemStatus'));
const WeatherPage = lazy(() => import('./pages/Weather'));
const AnalyticsPage = lazy(() => import('./pages/Analytics'));
const RealDataValidation = lazy(() => import('./pages/RealDataValidation'));
const CompareVirtualSensors = lazy(() => import('./pages/CompareVirtualSensors'));
const RealSensorMap = lazy(() => import('./pages/RealSensorMap'));
const DeviceHealthDashboard = lazy(() => import('./pages/DeviceHealthDashboard'));
const SupportPage = lazy(() => import('./pages/Support'));
const DeviceLifecyclePage = lazy(() => import('./pages/DeviceLifecycle'));
const HistoryPage = lazy(() => import('./pages/History'));
const SensorCalibrationPage = lazy(() => import('./pages/SensorCalibration'));
const OrganizationSettings = lazy(() => import('./pages/OrganizationSettings'));
const TeamMembers = lazy(() => import('./pages/TeamMembers'));
const SecurityAudit = lazy(() => import('./pages/SecurityAudit'));
const FirmwarePage = lazy(() => import('./pages/Firmware'));
const ResearchPage = lazy(() => import('./pages/Research'));
const KnowledgePage = lazy(() => import('./pages/Knowledge'));
const ResourcesPage = lazy(() => import('./pages/Resources'));
const ShowcasePage = lazy(() => import('./pages/Showcase'));
const ProtocolStatusDashboard = lazy(() => import('./pages/ProtocolStatus'));
const RuleGeneratorPage = lazy(() => import('./pages/RuleGenerator'));
const DeviceSetupGuidePage = lazy(() => import('./pages/DeviceSetupGuide'));

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
      { path: '/device-connection', label: 'Connect Device', icon: Cable },
      { path: '/device-setup-guide', label: 'Setup Guide', icon: BookOpenCheck },
      { path: '/history', label: 'History', icon: History },
      { path: '/map', label: 'Map', icon: Map },
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
      { path: '/automation', label: 'Rules', icon: Workflow },
      { path: '/rule-generator', label: 'AI Rule Gen', icon: Wand2 },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: Sliders },
      { path: '/system-status', label: 'Status', icon: Activity },
      { path: '/protocol-status', label: 'Protocols', icon: Wifi },
    ],
  },
];

/* Secondary nav (collapsed section) */
const secondarySections: NavSection[] = [
  {
    title: 'More',
    items: [
      { path: '/connection-test', label: 'Connection Test', icon: RadioTower },
      { path: '/device-lifecycle', label: 'Device Lifecycle', icon: Clock },
      { path: '/device-health', label: 'Device Health', icon: Stethoscope },
      { path: '/real-sensor-map', label: 'Real Sensor Map', icon: Navigation },
      { path: '/reports', label: 'Reports', icon: FileSpreadsheet },
      { path: '/weather', label: 'Weather', icon: CloudRain },
      { path: '/compliance', label: 'Compliance', icon: ShieldCheck },
      { path: '/vulnerable', label: 'Vulnerable Groups', icon: UserCheck },
      { path: '/digital-twin', label: 'Digital Twin', icon: Layers },
      { path: '/real-data-validation', label: 'Data Validation', icon: CheckCheck },
      { path: '/compare-virtual-sensors', label: 'Virtual Compare', icon: GitCompare },
      { path: '/calibration', label: 'Calibration', icon: Wrench },
      { path: '/research', label: 'Research', icon: FlaskConical },
      { path: '/knowledge', label: 'Knowledge', icon: BookOpenCheck },
      { path: '/resources', label: 'Resources', icon: FolderKanban },
      { path: '/firmware', label: 'Firmware', icon: Binary },
      { path: '/support', label: 'Support', icon: LifeBuoy },
      { path: '/security-audit', label: 'Security', icon: KeyRound },
      { path: '/organization-settings', label: 'Organization', icon: Building2 },
      { path: '/team', label: 'Team', icon: Users },
      { path: '/showcase', label: 'Showcase', icon: Presentation },
    ],
  },
];

/* Translation key mapping for nav items (path → i18n key) */
const NAV_I18N: Record<string, string> = {
  '/': 'nav.dashboard',
  '/sensors': 'nav.liveSensors',
  '/devices': 'nav.devices',
  '/device-connection': 'nav.connectDevice',
  '/device-setup-guide': 'nav.setupGuide',
  '/history': 'nav.history',
  '/map': 'nav.map',
  '/ai': 'nav.aiEngine',
  '/predictions': 'nav.predictions',
  '/analytics': 'nav.analytics',
  '/chatbot': 'nav.aiAssistant',
  '/alerts': 'nav.alerts',
  '/automation': 'nav.rules',
  '/rule-generator': 'nav.aiRuleGen',
  '/settings': 'nav.settings',
  '/system-status': 'nav.status',
  '/protocol-status': 'nav.protocols',
  '/connection-test': 'nav.connectionTest',
  '/device-lifecycle': 'nav.deviceLifecycle',
  '/device-health': 'nav.deviceHealth',
  '/real-sensor-map': 'nav.realSensorMap',
  '/reports': 'nav.reports',
  '/weather': 'nav.weather',
  '/compliance': 'nav.compliance',
  '/vulnerable': 'nav.vulnerableGroups',
  '/digital-twin': 'nav.digitalTwin',
  '/real-data-validation': 'nav.dataValidation',
  '/compare-virtual-sensors': 'nav.virtualCompare',
  '/calibration': 'nav.calibration',
  '/research': 'nav.research',
  '/knowledge': 'nav.knowledge',
  '/resources': 'nav.resources',
  '/firmware': 'nav.firmware',
  '/support': 'nav.support',
  '/security-audit': 'nav.security',
  '/organization-settings': 'nav.organization',
  '/team': 'nav.team',
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
        className="lg:hidden fixed top-3 left-3 z-50 p-2.5 rounded-[var(--radius-sm)] glass"
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
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--emerald)] to-emerald-600 flex items-center justify-center shrink-0 shadow-glow-sm">
              <span className="text-white font-bold text-sm">P</span>
            </div>
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
          <aside className="absolute left-0 top-0 h-full w-72 bg-[var(--bg-1)] border-r border-[var(--border)] flex flex-col animate-slide-in-left shadow-glass-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--emerald)] to-emerald-600 flex items-center justify-center shadow-glow-sm">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
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
  const { isLive, mqttConnected, reconnecting, lastUpdate } = useData();
  if (!isLive) return null;

  let label: string;
  let bgClass: string;
  if (mqttConnected) {
    label = `LIVE — Streaming via MQTT${lastUpdate ? ` · ${new Date(lastUpdate).toLocaleTimeString()}` : ''}`;
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

/* ===================== PAGE WRAPPER ===================== */

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ===================== APP CONTENT ===================== */

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t } = useI18n();
  const location = useLocation();

  return (
    <div className="flex h-screen bg-[var(--bg-0)] text-[var(--text-primary)] relative overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Background orbs — ocean depths */}
      <div className="floating-orbs" aria-hidden="true">
        <div className="orb orb-emerald w-[350px] h-[350px] top-[15%] left-[10%]" style={{ animationDelay: '0s', opacity: 0.07 }} />
        <div className="orb orb-cyan w-[300px] h-[300px] top-[55%] left-[60%]" style={{ animationDelay: '-10s', opacity: 0.05 }} />
        <div className="orb orb-violet w-[250px] h-[250px] top-[25%] right-[10%]" style={{ animationDelay: '-20s', opacity: 0.04 }} />
      </div>

      <Sidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-[260px]'} transition-[margin] duration-200`}>
        <OnboardingModal />

        {/* Header */}
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

        <LiveStatusBar />

        {/* Scrollable content — pb-16 on mobile for bottom nav clearance */}
        <main id="main-content" className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pb-20 lg:pb-8 relative z-10" role="main" aria-label="Main content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
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
                      <Route path="/automation" element={<AutomationPage />} />
                      <Route path="/ai" element={<AIPage />} />
                      <Route path="/predictions" element={<PredictionsPage />} />
                      <Route path="/map" element={<MapPage />} />
                      <Route path="/real-sensor-map" element={<RealSensorMap />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/device-connection" element={<DeviceConnectionPage />} />
                      <Route path="/device-setup-guide" element={<DeviceSetupGuidePage />} />
                      <Route path="/connection-test" element={<ConnectionTestPage />} />
                      <Route path="/system-status" element={<SystemStatusPage />} />
                      <Route path="/weather" element={<WeatherPage />} />
                      <Route path="/compliance" element={<CompliancePage />} />
                      <Route path="/vulnerable" element={<VulnerablePage />} />
                      <Route path="/digital-twin" element={<DigitalTwinPage />} />
                      <Route path="/chatbot" element={<ChatbotPage />} />
                      <Route path="/analytics" element={<AnalyticsPage />} />
                      <Route path="/device-lifecycle" element={<DeviceLifecyclePage />} />
                      <Route path="/device-health" element={<DeviceHealthDashboard />} />
                      <Route path="/support" element={<SupportPage />} />
                      <Route path="/history" element={<HistoryPage />} />
                      <Route path="/calibration" element={<SensorCalibrationPage />} />
                      <Route path="/firmware" element={<FirmwarePage />} />
                      <Route path="/research" element={<ResearchPage />} />
                      <Route path="/knowledge" element={<KnowledgePage />} />
                      <Route path="/resources" element={<ResourcesPage />} />
                      <Route path="/showcase" element={<ShowcasePage />} />
                      <Route path="/organization-settings" element={<OrganizationSettings />} />
                      <Route path="/team" element={<TeamMembers />} />
                      <Route path="/security-audit" element={<SecurityAudit />} />
                      <Route path="/protocol-status" element={<ProtocolStatusDashboard />} />
                      <Route path="/rule-generator" element={<RuleGeneratorPage />} />
                      <Route path="/real-data-validation" element={<RealDataValidation />} />
                      <Route path="/compare-virtual-sensors" element={<CompareVirtualSensors />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </RequireAuth>
                } />
              </Routes>
            </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <MobileBottomNav />
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
