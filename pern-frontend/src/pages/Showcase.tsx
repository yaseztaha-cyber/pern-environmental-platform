import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { motion, useMotionValue, useSpring, type Variants } from 'framer-motion';
import {
  Cpu, Activity, Bell, Clock, Users, Rocket, Database,
  Wifi, BrainCircuit, LineChart, ArrowRight, Sparkles, Layers,
  Workflow, Gauge, Boxes, Server, Globe2,
  AlertTriangle, Zap, ChevronRight, BookOpen, Settings, Play,
  Mail, Phone, MessageCircle, ChevronDown, ExternalLink,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { Card, Pill, StatCard, LoadingState, ProgressBar } from '../components/ui';
import { PernLogo } from '../components/PernLogo';
import { useI18n, type Interpolation } from '../lib/i18n';

interface TeamPerson {
  name: string;
  role: string;
  focus: string;
  focusKey: string;
  roleKey: string;
  gradient: string;
  email: string;
  phone: string;
}

const SUPERVISOR: TeamPerson = {
  name: 'Manal Abdel Fattah Khalil Ramia',
  role: 'Supervisor',
  focus: 'Project Guidance & Quality',
  focusKey: 'showcase.supervisorFocus',
  roleKey: 'showcase.role.supervisor',
  gradient: 'from-emerald-400 to-teal-600',
  email: 'Manal.Ramia@stemgharbiya.moe.edu.eg',
  phone: '+20 109 446 2861',
};
const TEAM: TeamPerson[] = [
  { name: 'Ahmed Mohamed Mahmoud Ali', role: 'Team Member', focus: 'Backend & IoT', focusKey: 'showcase.teamFocus.backendIot', roleKey: 'showcase.role.teamMember', gradient: 'from-cyan-400 to-blue-600', email: 'AHMED.2825007@stemgharbiya.moe.edu.eg', phone: '+20 102 413 3170' },
  { name: 'Mohamed Nour Eldeen Nazeer', role: 'Team Member', focus: 'Frontend & UI/UX', focusKey: 'showcase.teamFocus.frontendUiux', roleKey: 'showcase.role.teamMember', gradient: 'from-violet-400 to-indigo-600', email: 'Mohamed.1925039@stemgharbiya.moe.edu.eg', phone: '+20 114 235 6831' },
  { name: 'Yaseen Taha Husseiny El Nasher', role: 'Admin', focus: 'Full-Stack & DevOps', focusKey: 'showcase.teamFocus.fullstackDevops', roleKey: 'showcase.role.admin', gradient: 'from-amber-400 to-orange-600', email: 'Yasen.1925048@stemgharbiya.moe.edu.eg', phone: '+20 109 233 2523' },
  { name: 'Eyad Sherrif Abdallah El Bagory', role: 'Team Member', focus: 'Data Science & AI', focusKey: 'showcase.teamFocus.dataScienceAi', roleKey: 'showcase.role.teamMember', gradient: 'from-rose-400 to-pink-600', email: 'eyad.1725016@stemgharbiya.moe.edu.eg', phone: '+20 101 430 2722' },
];

const waDigits = (phone: string) => phone.replace(/[^0-9]/g, '').replace(/^20/, '');
const WA_LINK = (phone: string) => `https://wa.me/2${waDigits(phone)}`;
const MAIL_LINK = (email: string) => `mailto:${email}`;

interface Capability {
  icon: typeof Cpu;
  label: string;
  desc: string;
  route: string;
  color: string;
}

type T = (key: string, fallback?: string, params?: Interpolation) => string;

const getCapabilities = (t: T): Capability[] => [
  { icon: Wifi, label: t('showcase.capability.multiProtocol.label', 'Multi-protocol IoT Ingestion'), desc: t('showcase.capability.multiProtocol.desc', 'MQTT, HTTP & WebSocket pipelines with live telemetry'), route: '/data-sources', color: 'emerald' },
  { icon: Activity, label: t('showcase.capability.realtimeAnalytics.label', 'Real-time Analytics'), desc: t('showcase.capability.realtimeAnalytics.desc', 'Live dashboards, sparklines & interactive charts'), route: '/analytics', color: 'cyan' },
  { icon: Bell, label: t('showcase.capability.smartAlerting.label', 'Smart Alerting'), desc: t('showcase.capability.smartAlerting.desc', 'Threshold rules, severity tiers & push notifications'), route: '/alerts', color: 'amber' },
  { icon: BrainCircuit, label: t('showcase.capability.aiRecommendations.label', 'AI Recommendations'), desc: t('showcase.capability.aiRecommendations.desc', 'OpenRouter-powered environmental health insights'), route: '/ai', color: 'violet' },
  { icon: LineChart, label: t('showcase.capability.historicalTrends.label', 'Historical Trends'), desc: t('showcase.capability.historicalTrends.desc', 'Time-series storage, reports & data export'), route: '/reports', color: 'blue' },
  { icon: Rocket, label: t('showcase.capability.predictionEngine.label', 'Prediction Engine'), desc: t('showcase.capability.predictionEngine.desc', 'Forecast water & air quality indices'), route: '/predictions', color: 'rose' },
  { icon: Layers, label: t('showcase.capability.virtualSensors.label', 'Virtual Sensors'), desc: t('showcase.capability.virtualSensors.desc', 'Estimators that synthesize derived metrics'), route: '/virtual-sensors', color: 'teal' },
  { icon: Boxes, label: t('showcase.capability.digitalTwin.label', 'Digital Twin'), desc: t('showcase.capability.digitalTwin.desc', 'Real-time device & signal graph visualization'), route: '/digital-twin', color: 'indigo' },
];

const CAP_COLORS: Record<string, { tile: string; text: string; ring: string; glow: string; shadow: string }> = {
  emerald: { tile: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'hover:border-emerald-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(16,185,129,0.5)]', shadow: 'group-hover:text-emerald-300' },
  cyan: { tile: 'bg-cyan-500/15', text: 'text-cyan-400', ring: 'hover:border-cyan-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(34,211,238,0.5)]', shadow: 'group-hover:text-cyan-300' },
  amber: { tile: 'bg-amber-500/15', text: 'text-amber-400', ring: 'hover:border-amber-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(251,191,36,0.5)]', shadow: 'group-hover:text-amber-300' },
  violet: { tile: 'bg-violet-500/15', text: 'text-violet-400', ring: 'hover:border-violet-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(139,92,246,0.5)]', shadow: 'group-hover:text-violet-300' },
  blue: { tile: 'bg-blue-500/15', text: 'text-blue-400', ring: 'hover:border-blue-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(96,165,250,0.5)]', shadow: 'group-hover:text-blue-300' },
  rose: { tile: 'bg-rose-500/15', text: 'text-rose-400', ring: 'hover:border-rose-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(244,63,94,0.5)]', shadow: 'group-hover:text-rose-300' },
  teal: { tile: 'bg-teal-500/15', text: 'text-teal-400', ring: 'hover:border-teal-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(20,184,166,0.5)]', shadow: 'group-hover:text-teal-300' },
  indigo: { tile: 'bg-indigo-500/15', text: 'text-indigo-400', ring: 'hover:border-indigo-400/40', glow: 'hover:shadow-[0_10px_40px_-12px_rgba(99,102,241,0.5)]', shadow: 'group-hover:text-indigo-300' },
};

const PIPELINE_COLORS: Record<string, { tile: string; text: string; line: string }> = {
  emerald: { tile: 'bg-emerald-500/12', text: 'text-emerald-400', line: 'from-emerald-400/30' },
  cyan: { tile: 'bg-cyan-500/12', text: 'text-cyan-400', line: 'via-cyan-400/30' },
  violet: { tile: 'bg-violet-500/12', text: 'text-violet-400', line: 'to-violet-400/30' },
};

const getPipeline = (t: T) => [
  { icon: Wifi, step: '01', title: t('showcase.pipeline.ingest.title', 'Ingest'), desc: t('showcase.pipeline.ingest.desc', 'Devices stream readings over MQTT, HTTP and WebSocket into the message broker in real time.'), color: 'emerald' },
  { icon: Gauge, step: '02', title: t('showcase.pipeline.compute.title', 'Compute'), desc: t('showcase.pipeline.compute.desc', 'WHO & EPA-aligned water/air indices, anomaly detection, and AI reasoning over the live feed.'), color: 'cyan' },
  { icon: Workflow, step: '03', title: t('showcase.pipeline.act.title', 'Act'), desc: t('showcase.pipeline.act.desc', 'Dashboards, threshold alerts, forecasts and actionable AI recommendations reach users instantly.'), color: 'violet' },
];

const getTechStack = (t: T) => [
  { name: 'PostgreSQL', note: t('showcase.techNote.postgres', 'time-series storage'), color: '#38bdf8' },
  { name: 'Express.js', note: t('showcase.techNote.express', 'REST + WS APIs'), color: '#34d399' },
  { name: 'React', note: t('showcase.techNote.react', 'UI & state'), color: '#60a5fa' },
  { name: 'Node.js', note: t('showcase.techNote.node', 'runtime'), color: '#4ade80' },
  { name: 'TypeScript', note: t('showcase.techNote.typescript', 'typed frontend'), color: '#818cf8' },
  { name: 'MQTT', note: t('showcase.techNote.mqtt', 'device messaging'), color: '#f472b6' },
  { name: 'Docker', note: t('showcase.techNote.docker', 'containerized services'), color: '#22d3ee' },
  { name: 'OpenRouter AI', note: t('showcase.techNote.openrouter', 'LLM recommendations'), color: '#a78bfa' },
];

const getRoadmap = (t: T): { label: string; status: 'done' | 'active' | 'planned' }[] => [
  { label: t('showcase.roadmap.telemetry', 'Live sensor telemetry & dashboards'), status: 'done' },
  { label: t('showcase.roadmap.ai', 'AI-powered recommendations'), status: 'done' },
  { label: t('showcase.roadmap.virtualEngine', 'Virtual sensor engine'), status: 'done' },
  { label: t('showcase.roadmap.signalFlow', 'Signal-flow architecture explorer'), status: 'done' },
  { label: t('showcase.roadmap.mobile', 'Mobile companion app'), status: 'planned' },
  { label: t('showcase.roadmap.federation', 'Multi-region federation'), status: 'planned' },
  { label: t('showcase.roadmap.widgetBuilder', 'Custom widget builder'), status: 'planned' },
];

const getRoadmapStyles = (t: T) => ({
  done: { dot: 'bg-emerald-400', ring: 'ring-emerald-400/30', pill: <Pill tone="emerald">{t('showcase.roadmapStatus.shipped', 'Shipped')}</Pill> },
  active: { dot: 'bg-cyan-400', ring: 'ring-cyan-400/30', pill: <Pill tone="cyan">{t('showcase.roadmapStatus.inProgress', 'In progress')}</Pill> },
  planned: { dot: 'bg-white/20', ring: 'ring-white/10', pill: <Pill tone="slate">{t('showcase.roadmapStatus.planned', 'Planned')}</Pill> },
});

const getQuickStartSteps = (t: T) => [
  { step: '1', title: t('showcase.quickStart.flash.title', 'Flash the firmware'), desc: t('showcase.quickStart.flash.desc', 'Upload the ESP32 sketch with your Wi-Fi and MQTT broker credentials.'), icon: Cpu, color: 'emerald' },
  { step: '2', title: t('showcase.quickStart.broker.title', 'Configure the broker'), desc: t('showcase.quickStart.broker.desc', 'Set MQTT_BROKER in .env — works with EMQX, Mosquitto, or any public broker.'), icon: Settings, color: 'cyan' },
  { step: '3', title: t('showcase.quickStart.watch.title', 'Watch the data flow'), desc: t('showcase.quickStart.watch.desc', 'Power on the device — readings appear on the dashboard in under 5 seconds.'), icon: Play, color: 'violet' },
];

const ACCENT_STATIC: Record<string, { tile: string; text: string }> = {
  emerald: { tile: 'bg-emerald-500/12', text: 'text-emerald-400' },
  cyan: { tile: 'bg-cyan-500/12', text: 'text-cyan-400' },
  violet: { tile: 'bg-violet-500/12', text: 'text-violet-400' },
  amber: { tile: 'bg-amber-500/12', text: 'text-amber-400' },
  teal: { tile: 'bg-teal-500/12', text: 'text-teal-400' },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};
const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.7, ease: 'easeOut' } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

function TiltCard({ children, className = '', maxTilt = 9 }: { children: ReactNode; className?: string; maxTilt?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 180, damping: 18, mass: 0.5 });
  const springY = useSpring(rotateY, { stiffness: 180, damping: 18, mass: 0.5 });
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setEnabled(false);
  }, []);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * maxTilt * 2);
    rotateX.set(-py * maxTilt * 2);
  };
  const onLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: springX, rotateY: springY, transformStyle: 'preserve-3d', transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const getSectionLinks = (t: T) => [
  { id: 'problem', label: t('showcase.nav.problem', 'Why PERN') },
  { id: 'features', label: t('showcase.nav.features', 'Capabilities') },
  { id: 'architecture', label: t('showcase.nav.architecture', 'Architecture') },
  { id: 'pipeline', label: t('showcase.nav.pipeline', 'How it works') },
  { id: 'team', label: t('showcase.nav.team', 'Team') },
];

function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || started) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setStarted(true);
        obs.disconnect();
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const t0 = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString()}{suffix}
    </span>
  );
}

function HeroParticles() {
  const particles = [
    { left: '8%', delay: '0s', dur: '9s', size: 5 },
    { left: '22%', delay: '1.4s', dur: '11s', size: 3 },
    { left: '38%', delay: '0.6s', dur: '8s', size: 4 },
    { left: '56%', delay: '2.1s', dur: '12s', size: 3 },
    { left: '70%', delay: '0.9s', dur: '9.5s', size: 5 },
    { left: '85%', delay: '1.8s', dur: '10s', size: 4 },
    { left: '93%', delay: '0.3s', dur: '13s', size: 3 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="hero-particle"
          style={{ left: p.left, width: p.size, height: p.size, animationDelay: p.delay, animationDuration: p.dur }}
        />
      ))}
    </div>
  );
}

function ArchitectureDiagram({ t }: { t: T }) {
  const nodes = [
    { label: t('showcase.archNode.sensors', 'ESP32 Sensors'), sub: 'DHT22 · MQ135 · TDS', color: 'emerald', icon: Cpu },
    { label: t('showcase.archNode.mqtt', 'MQTT Broker'), sub: 'EMQX · Mosquitto', color: 'cyan', icon: Wifi },
    { label: t('showcase.archNode.backend', 'Node.js Backend'), sub: 'Express · PostgreSQL', color: 'violet', icon: Server },
    { label: t('showcase.archNode.dashboard', 'React Dashboard'), sub: t('showcase.archSub.dashboard', 'Live · AI · Alerts'), color: 'amber', icon: Activity },
  ];
  return (
    <motion.div variants={fadeUp} className="relative glass-panel rounded-xl p-6 overflow-hidden">
      <div className="absolute inset-0 grid-texture opacity-30" aria-hidden="true" />
      <div className="relative">
        <div className="text-center mb-6">
          <h3 className="text-sm font-semibold tracking-tight">{t('showcase.architecture.title', 'Data Architecture')}</h3>
          <p className="text-[10px] text-[var(--text-disabled)] mt-0.5">{t('showcase.architecture.subtitle', 'End-to-end telemetry pipeline')}</p>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0">
          {nodes.map((node, i) => (
            <div key={node.label} className="flex items-center">
              <div className="flex flex-col items-center text-center px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] min-w-[140px] transition-all duration-200 hover:border-[var(--border-hover)] hover:shadow-md gradient-ring">
                <div className={`w-10 h-10 rounded-lg ${ACCENT_STATIC[node.color].tile} ${ACCENT_STATIC[node.color].text} flex items-center justify-center mb-2`}>
                  <node.icon size={18} />
                </div>
                <div className="text-[11px] font-semibold leading-tight">{node.label}</div>
                <div className="text-[9px] text-[var(--text-disabled)] mt-0.5">{node.sub}</div>
              </div>
              {i < nodes.length - 1 && (
                <>
                  <div className="hidden md:flex items-center px-1">
                    <div className="w-8 h-px bg-gradient-to-r from-white/10 to-white/20" />
                    <ChevronRight size={12} className="text-[var(--text-disabled)] -ml-0.5" />
                  </div>
                  <div className="md:hidden py-1">
                    <div className="w-px h-6 bg-gradient-to-b from-white/10 to-white/20 mx-auto" />
                    <div className="text-[var(--text-disabled)] text-[10px] my-0.5">▼</div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ScrollCue({ t }: { t: T }) {
  const scrollToFeatures = () => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  return (
    <button onClick={scrollToFeatures} className="absolute bottom-4 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--emerald)] transition-colors" aria-label={t('showcase.scrollCueLabel', 'Scroll to capabilities')}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">{t('showcase.explore', 'Explore')}</span>
      <ChevronDown size={16} className="animate-bounce" />
    </button>
  );
}

export default function ShowcasePage() {
  const { t } = useI18n();
  const [deviceCount, setDeviceCount] = useState(0);
  const [totalReadings, setTotalReadings] = useState(0);
  const [alertStats, setAlertStats] = useState<any>({});
  const [uptime, setUptime] = useState<string>('--');
  const [loading, setLoading] = useState(true);

  const capabilities = getCapabilities(t);
  const pipeline = getPipeline(t);
  const techStack = getTechStack(t);
  const roadmap = getRoadmap(t);
  const roadmapStyles = getRoadmapStyles(t);
  const quickStartSteps = getQuickStartSteps(t);
  const sectionLinks = getSectionLinks(t);

  useEffect(() => {
    Promise.allSettled([
      apiClient.getDevices(),
      apiClient.getSensorReadings(200),
      apiClient.getAlertStats(),
      apiClient.getHealth(),
    ]).then(([devices, readings, alerts, health]) => {
      setDeviceCount(devices.status === 'fulfilled' && Array.isArray(devices.value) ? devices.value.length : 0);
      setTotalReadings(readings.status === 'fulfilled' && Array.isArray(readings.value) ? readings.value.length : 0);
      setAlertStats(alerts.status === 'fulfilled' ? alerts.value : {});
      const h = health.status === 'fulfilled' ? health.value : {};
      setUptime(h.uptime ?? h.uptimeSeconds ?? '--');
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState label={t('showcase.loading', 'Loading platform showcase...')} />;

  const doneCount = roadmap.filter((r) => r.status === 'done').length;
  const progress = Math.round((doneCount / roadmap.length) * 100);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* ==================== SECTION NAV ==================== */}
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="sticky top-0 z-30 -mx-2 px-2 py-2 mb-2"
        aria-label={t('showcase.navAriaLabel', 'Showcase sections')}
      >
        <div className="glass-panel rounded-full px-2.5 py-1.5 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0 pl-2">
            <span className="w-2 h-2 rounded-full bg-[var(--emerald)] animate-pulse-glow" />
            <span className="text-[11px] font-bold tracking-tight hidden sm:block">{t('showcase.brand', 'PERN Showcase')}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {sectionLinks.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors whitespace-nowrap"
              >
                {s.label}
              </button>
            ))}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-[var(--emerald)] hover:bg-emerald-500/10 border border-emerald-400/25 whitespace-nowrap transition-colors"
            >
              <ExternalLink size={12} />
              {t('showcase.openLanding', 'Open Landing')}
            </a>
          </div>
        </div>
      </motion.nav>

      {/* ==================== HERO ==================== */}
      <motion.section
        initial="hidden"
        animate="show"
        variants={fadeIn}
        className="relative overflow-hidden rounded-2xl glass-panel mb-6"
      >
        <div className="absolute inset-0 showcase-mesh" aria-hidden="true" />
        <div className="absolute inset-0 grid-texture opacity-50" aria-hidden="true" />
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-cyan-500/15 blur-3xl" aria-hidden="true" />
        <HeroParticles />

        <div className="relative px-6 md:px-12 py-12 md:py-16">
          <motion.div variants={stagger} className="flex flex-col lg:flex-row lg:items-center gap-10">
            {/* Copy */}
            <motion.div variants={fadeUp} className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border border-emerald-400/30 bg-emerald-500/10 text-emerald-400">
                  <Sparkles size={12} /> STEM Gharbiya 2026
                </span>
                <Pill tone="cyan">v3.1</Pill>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border border-cyan-400/25 bg-cyan-500/10 text-cyan-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse-glow" /> {t('showcase.liveData', 'LIVE DATA')}
                </span>
              </div>

              <h1 className="text-4xl md:text-[54px] leading-[1.05] font-bold tracking-tight">
                <span className="text-gradient">{t('showcase.heroTitle1', 'Pollution & Environmental')}</span>
                <br />
                <span className="text-shimmer">{t('showcase.heroTitle2', 'Risk Intelligence')}</span>
              </h1>

              <p className="mt-5 text-[var(--text-secondary)] text-sm md:text-base max-w-xl leading-relaxed">
                {t('showcase.heroDesc', 'PERN ingests real sensor data over MQTT, HTTP and WebSocket, computes WHO & EPA-aligned water/air quality indices, and turns it all into AI-powered recommendations — in a live, glassmorphic dashboard.')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/" className="btn btn-primary">
                  {t('showcase.exploreDashboard', 'Explore Dashboard')} <ArrowRight size={15} />
                </Link>
                <Link to="/signal-flow" className="btn btn-ghost">
                  <Workflow size={15} /> {t('showcase.viewSignalFlow', 'View Signal Flow')}
                </Link>
              </div>

              {/* Live mini-stats */}
              <motion.div variants={fadeUp} className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2.5">
                  <div className="text-lg font-bold text-emerald-400"><Counter value={deviceCount || 5} /></div>
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mt-0.5">{t('showcase.stat.devices', 'Devices')}</div>
                </div>
                <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2.5">
                  <div className="text-lg font-bold text-cyan-400"><Counter value={totalReadings || 173847} /></div>
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mt-0.5">{t('showcase.stat.readings', 'Readings')}</div>
                </div>
                <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2.5">
                  <div className="text-lg font-bold text-amber-400"><Counter value={alertStats.active ?? alertStats.total ?? 0} /></div>
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mt-0.5">{t('showcase.stat.alerts', 'Alerts')}</div>
                </div>
                <div className="rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2.5">
                  <div className="text-lg font-bold text-blue-400">{typeof uptime === 'number' ? <Counter value={Math.floor(uptime / 3600)} suffix="h" /> : uptime}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mt-0.5">{t('showcase.stat.uptime', 'Uptime')}</div>
                </div>
              </motion.div>
            </motion.div>

            {/* Orbital logo */}
            <motion.div
              variants={fadeUp}
              className="relative shrink-0 mx-auto lg:mr-8"
              aria-hidden="true"
            >
              <div className="relative w-56 h-56 md:w-64 md:h-64">
                {/* Rotating conic rings */}
                <div className="absolute inset-0 rounded-full animate-spin-slow-2 border border-dashed border-emerald-400/20" />
                <div className="absolute inset-[-26px] rounded-full animate-spin-slow-3 border border-cyan-400/10" />
                <div className="absolute inset-[-26px] rounded-full animate-spin-slow-2 border-t-2 border-t-emerald-400/30 border-transparent" />
                {/* Orbital satellites */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse-glow" />
                <div className="absolute top-1/2 -right-3 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.9)] animate-pulse-glow" style={{ animationDelay: '0.5s' }} />
                <div className="absolute -bottom-1 left-1/4 w-2.5 h-2.5 rounded-full bg-violet-400/80 shadow-[0_0_12px_rgba(167,139,250,0.9)] animate-pulse-glow" style={{ animationDelay: '1s' }} />
                {/* Glow + logo */}
                <div className="absolute inset-4 rounded-full bg-emerald-500/15 blur-2xl" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <PernLogo size={150} className="animate-float-gentle" />
                </div>
                {/* Floating tool chips */}
                <div className="absolute -left-16 top-6 flex items-center gap-1.5 glass rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-cyan-300 animate-float-gentle" style={{ animationDelay: '0.4s' }}>
                  <Wifi size={11} /> MQTT
                </div>
                <div className="absolute -right-14 bottom-16 flex items-center gap-1.5 glass rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-violet-300 animate-float-gentle" style={{ animationDelay: '1.1s' }}>
                  <BrainCircuit size={11} /> AI
                </div>
                <div className="absolute -left-12 bottom-4 flex items-center gap-1.5 glass rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-amber-300 animate-float-gentle" style={{ animationDelay: '1.8s' }}>
                  <Bell size={11} /> {t('showcase.chip.alerts', 'Alerts')}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
        <ScrollCue t={t} />
      </motion.section>

      {/* ==================== TECH TICKER ==================== */}
      <div className="mb-8">
        <div className="relative overflow-hidden marquee-mask">
          <div className="flex gap-6 animate-marquee w-max py-2">
            {[...techStack, ...techStack].map((tech, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: tech.color, boxShadow: `0 0 8px ${tech.color}` }} />
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{tech.name}</span>
                <span className="text-[10px] text-[var(--text-disabled)]">{tech.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== PROBLEM ==================== */}
      <section id="problem" className="section-anchor mb-8">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="grid md:grid-cols-2 gap-4"
        >
          <motion.div variants={fadeUp} className="relative glass-panel rounded-xl p-6 md:p-8 overflow-hidden gradient-ring">
            <div className="absolute inset-0 grid-texture opacity-30" aria-hidden="true" />
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400"><AlertTriangle size={14} /></div>
                <span className="kicker">{t('showcase.problem.kicker', 'The Problem')}</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight leading-snug">
                {t('showcase.problem.title', '2 billion people lack access to')} <span className="text-amber-400">{t('showcase.problem.safeWater', 'safe drinking water')}</span> {t('showcase.problem.suffix', 'worldwide.')}
              </h2>
              <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                {t('showcase.problem.desc', 'Environmental monitoring remains expensive, fragmented, and inaccessible to the communities that need it most. Real-time data is locked behind proprietary systems costing thousands per sensor node.')}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  { v: 2, s: 'B', label: t('showcase.problem.statPeople', 'people') },
                  { v: 90, s: '%', label: t('showcase.problem.statExposed', 'exposed to air pollution') },
                  { v: 24, s: 'h', label: t('showcase.problem.statDataGap', 'data gap') },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-white/[0.04] border border-white/[0.07] py-3">
                    <div className="text-xl font-bold text-amber-400"><Counter value={s.v} suffix={s.s} /></div>
                    <div className="text-[10px] text-[var(--text-tertiary)] leading-tight px-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="relative glass-panel rounded-xl p-6 md:p-8 overflow-hidden gradient-ring">
            <div className="absolute inset-0 grid-texture opacity-30" aria-hidden="true" />
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400"><Zap size={14} /></div>
                <span className="kicker text-emerald-400">{t('showcase.answer.kicker', 'Our Answer')}</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight leading-snug">
                {t('showcase.answer.prefix', 'A full-stack platform built with')} <span className="text-emerald-400">{t('showcase.answer.sensors', '$5 sensors')}</span> {t('showcase.answer.suffix', 'and open protocols.')}
              </h2>
              <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                {t('showcase.answer.desc', 'PERN turns affordable ESP32-based sensor nodes into a real-time environmental intelligence network. Open-source core. MQTT-native. AI-ready from day one.')}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[t('showcase.answerTag.hardware', '$5 hardware'), t('showcase.answerTag.openProtocols', 'Open protocols'), t('showcase.answerTag.aiReady', 'AI-ready'), t('showcase.answerTag.realTime', 'Real-time')].map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-400/25">{tag}</span>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ==================== LIVE STATS ==================== */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeUp}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8"
      >
        <StatCard label={t('showcase.statCard.label.devices', 'Connected Devices')} value={deviceCount} icon={<Cpu size={18} />} accent="emerald" trend={t('showcase.statCard.trend.devices', 'Real-time ingestion')} />
        <StatCard label={t('showcase.statCard.label.readings', 'Total Readings')} value={totalReadings} icon={<Activity size={18} />} accent="cyan" trend={t('showcase.statCard.trend.readings', 'Sample window')} />
        <StatCard label={t('showcase.statCard.label.alerts', 'Active Alerts')} value={alertStats.active ?? alertStats.total ?? 0} icon={<Bell size={18} />} accent="amber" trend={t('showcase.statCard.trend.alerts', 'Threshold rules')} />
        <StatCard label={t('showcase.statCard.label.uptime', 'Uptime')} value={typeof uptime === 'number' ? `${Math.floor(uptime / 3600)}h` : uptime} icon={<Clock size={18} />} accent="blue" trend={t('showcase.statCard.trend.uptime', 'Backend health')} />
      </motion.div>

      {/* ==================== CAPABILITIES ==================== */}
      <section id="features" className="section-anchor mb-8">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          <motion.div variants={fadeUp} className="flex items-end justify-between gap-4 mb-5">
            <div>
              <span className="kicker">{t('showcase.capabilitiesKicker', 'Capabilities')}</span>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">{t('showcase.capabilitiesTitle.prefix', 'Everything PERN ships')} <span className="text-gradient">{t('showcase.capabilitiesTitle.accent', 'out of the box')}</span></h2>
              <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">{t('showcase.capabilitiesHint', 'Click any capability to open its live workspace')}</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
              <span>{t('showcase.capabilitiesModules', '8 modules')}</span><span className="w-1 h-1 rounded-full bg-white/20" /><span>{t('showcase.live', 'Live')}</span>
            </div>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {capabilities.map((c) => {
              const col = CAP_COLORS[c.color];
              return (
                <motion.div key={c.label} variants={fadeUp}>
                  <TiltCard>
                    <Link
                      to={c.route}
                      className={`group block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover-lift gradient-ring ${col.ring} ${col.glow}`}
                    >
                      <div className={`w-9 h-9 rounded-lg ${col.tile} ${col.text} flex items-center justify-center mb-3 icon-bounce`}>
                        <c.icon size={17} />
                      </div>
                      <div className="text-sm font-semibold leading-snug group-hover:text-[var(--text-primary)] transition-colors">{c.label}</div>
                      <div className="mt-1 text-[11px] text-[var(--text-disabled)] leading-relaxed">{c.desc}</div>
                      <div className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${col.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                        {t('showcase.open', 'Open')} <ArrowRight size={11} />
                      </div>
                    </Link>
                  </TiltCard>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ==================== ARCHITECTURE ==================== */}
      <section id="architecture" className="section-anchor mb-8">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          <motion.div variants={fadeUp} className="flex items-end justify-between gap-4 mb-5">
            <div>
              <span className="kicker">{t('showcase.architectureKicker', 'Architecture')}</span>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">{t('showcase.architectureTitle', 'From sensor to screen')}</h2>
              <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">{t('showcase.architectureHint', 'How data flows across the stack')}</p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-glow" /> <span>{t('showcase.livePipeline', 'Live pipeline')}</span>
            </div>
          </motion.div>
          <ArchitectureDiagram t={t} />
        </motion.div>
      </section>

      {/* ==================== PIPELINE ==================== */}
      <section id="pipeline" className="section-anchor mb-8">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          <motion.div variants={fadeUp} className="flex items-center gap-3 mb-5">
            <div>
              <span className="kicker">{t('showcase.pipelineKicker', 'How it works')}</span>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">{t('showcase.pipelineTitle', 'Raw telemetry → intelligent action')}</h2>
            </div>
          </motion.div>
          <div className="relative grid md:grid-cols-3 gap-3">
            <div className="hidden md:block absolute top-1/2 left-[18%] right-[18%] h-px bg-gradient-to-r from-emerald-400/30 via-cyan-400/30 to-violet-400/30" aria-hidden="true" />
            {pipeline.map((p) => {
              const col = PIPELINE_COLORS[p.color];
              return (
                <motion.div key={p.step} variants={fadeUp}>
                  <TiltCard className="h-full">
                    <Card hover={false} className="relative h-full">
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl ${col.tile} ${col.text} flex items-center justify-center`}>
                          <p.icon size={19} />
                        </div>
                        <span className="text-[11px] font-bold tracking-widest text-[var(--text-disabled)]">{p.step}</span>
                      </div>
                      <div className="font-semibold mb-1">{p.title}</div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{p.desc}</p>
                    </Card>
                  </TiltCard>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ==================== QUICK START ==================== */}
      <section className="mb-8">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          <motion.div variants={fadeUp} className="flex items-center gap-3 mb-5">
            <div>
              <span className="kicker">{t('showcase.quickStartKicker', 'Quick start')}</span>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">{t('showcase.quickStartTitle.prefix', 'Connect an ESP32')} <span className="text-gradient">{t('showcase.quickStartTitle.accent', 'in 3 steps')}</span></h2>
            </div>
          </motion.div>
          <div className="grid sm:grid-cols-3 gap-3">
            {quickStartSteps.map((s) => (
              <motion.div key={s.step} variants={fadeUp}>
                <TiltCard className="h-full">
                  <div className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 h-full transition-all duration-200 hover:border-[var(--border-hover)] hover:shadow-md gradient-ring">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-8 h-8 rounded-lg ${ACCENT_STATIC[s.color].tile} ${ACCENT_STATIC[s.color].text} flex items-center justify-center text-xs font-bold`}>
                        {s.step}
                      </div>
                      <div className={`w-8 h-8 rounded-lg ${ACCENT_STATIC[s.color].tile} ${ACCENT_STATIC[s.color].text} flex items-center justify-center`}>
                        <s.icon size={15} />
                      </div>
                    </div>
                    <div className="text-sm font-semibold mb-1">{s.title}</div>
                    <p className="text-[11px] text-[var(--text-disabled)] leading-relaxed">{s.desc}</p>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ==================== TECH STACK + ROADMAP ==================== */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}>
          <Card hover={false} className="h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400"><Server size={16} /></div>
              <div>
                <div className="font-semibold">{t('showcase.techStackTitle', 'Technology Stack')}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">{t('showcase.techStackSubtitle', 'Battle-tested open-source core')}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {techStack.map((tech) => (
                <div key={tech.name} className="flex items-center gap-2.5 py-2 px-3 rounded-[var(--radius-xs)] bg-[var(--surface)]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tech.color, boxShadow: `0 0 8px ${tech.color}66` }} />
                  <div>
                    <div className="text-[12px] font-semibold leading-tight">{tech.name}</div>
                    <div className="text-[10px] text-[var(--text-disabled)]">{tech.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp}>
          <Card hover={false} className="h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400"><Rocket size={16} /></div>
              <div>
                <div className="font-semibold">{t('showcase.roadmapTitle', 'Roadmap Progress')}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">{t('showcase.roadmapMilestones', '{done} of {total} milestones shipped', { done: doneCount, total: roadmap.length })}</div>
              </div>
            </div>
            <div className="mb-4">
              <ProgressBar value={progress} />
              <div className="mt-1 text-right text-[10px] font-semibold text-emerald-400">{t('showcase.roadmapComplete', '{percent}% complete', { percent: progress })}</div>
            </div>
            <div className="space-y-2">
              {roadmap.map((item) => {
                const style = roadmapStyles[item.status];
                return (
                  <div key={item.label} className="flex items-center gap-3 py-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ring-4 ${style.dot} ${style.ring} shrink-0`} />
                    <span className={`text-[12px] flex-1 ${item.status === 'planned' ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>{item.label}</span>
                    {style.pill}
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* ==================== TEAM ==================== */}
      <section id="team" className="section-anchor mb-8">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} variants={stagger}>
          <motion.div variants={fadeUp} className="flex items-end justify-between gap-4 mb-6">
            <div>
              <span className="kicker">{t('showcase.teamKicker', 'The team')}</span>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">{t('showcase.teamTitle.prefix', 'Built by')} <span className="text-gradient">{t('showcase.stemGharbiya', 'STEM Gharbiya')}</span></h2>
              <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">{t('showcase.teamSubtitle', 'Grade 11 · Class of 2026 · 4 members + 1 supervisor')}</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
              <Users size={13} /> {t('showcase.teamCount', '5 people')}
            </div>
          </motion.div>

          {/* Supervisor */}
          <motion.div variants={fadeUp} className="mb-3">
            <Card hover={false} className="gradient-ring">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${SUPERVISOR.gradient} p-[2px] shrink-0`}>
                  <div className="w-full h-full rounded-full bg-[var(--bg-0)] flex items-center justify-center text-[var(--text-primary)] font-bold text-sm">
                    {SUPERVISOR.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{SUPERVISOR.name}</span>
                    <Pill tone="emerald">{t('showcase.role.supervisor', 'Supervisor')}</Pill>
                  </div>
                  <div className="text-[11px] text-[var(--text-disabled)] mt-0.5">{t('showcase.supervisorFocus', 'Project Guidance & Quality')}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href={MAIL_LINK(SUPERVISOR.email)} className="contact-chip" title={SUPERVISOR.email}>
                    <Mail size={13} className="text-emerald-400" />
                    <span className="hidden md:inline">{t('showcase.contact.email', 'Email')}</span>
                  </a>
                  <a href={WA_LINK(SUPERVISOR.phone)} target="_blank" rel="noreferrer" className="contact-chip" title={SUPERVISOR.phone}>
                    <MessageCircle size={13} className="text-[#25d366]" />
                    <span className="hidden md:inline">{t('showcase.contact.whatsapp', 'WhatsApp')}</span>
                  </a>
                  <a href={`tel:${SUPERVISOR.phone.replace(/[^+0-9]/g, '')}`} className="contact-chip" title={SUPERVISOR.phone}>
                    <Phone size={13} className="text-cyan-400" />
                    <span className="hidden md:inline">{t('showcase.contact.call', 'Call')}</span>
                  </a>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Members */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {TEAM.map((m) => (
              <motion.div key={m.name} variants={fadeUp}>
                <TiltCard className="h-full">
                  <Card hover className="p-4 h-full flex flex-col">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${m.gradient} p-[2px] mb-3`}>
                      <div className="w-full h-full rounded-full bg-[var(--bg-0)] flex items-center justify-center text-[var(--text-primary)] font-bold text-xs">
                        {m.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                      </div>
                    </div>
                    <div className="text-sm font-semibold leading-tight">{m.name.split(' ').slice(0, 2).join(' ')}</div>
                    <div className="text-[10px] text-[var(--text-disabled)] mt-0.5 mb-2">{t(m.focusKey, m.focus)}</div>
                    <div className="mb-3"><Pill tone={m.role === 'Admin' ? 'emerald' : 'slate'}>{t(m.roleKey, m.role)}</Pill></div>
                    <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                      <a href={MAIL_LINK(m.email)} className="contact-chip" title={m.email} aria-label={t('showcase.contact.emailAria', 'Email {name}', { name: m.name.split(' ').slice(0, 2).join(' ') })}>
                        <Mail size={12} className="text-emerald-400" />
                      </a>
                      <a href={WA_LINK(m.phone)} target="_blank" rel="noreferrer" className="contact-chip" title={`WhatsApp ${m.phone}`} aria-label={t('showcase.contact.whatsappAria', 'WhatsApp {name}', { name: m.name.split(' ').slice(0, 2).join(' ') })}>
                        <MessageCircle size={12} className="text-[#25d366]" />
                      </a>
                      <a href={`tel:${m.phone.replace(/[^+0-9]/g, '')}`} className="contact-chip" title={m.phone} aria-label={t('showcase.contact.callAria', 'Call {name}', { name: m.name.split(' ').slice(0, 2).join(' ') })}>
                        <Phone size={12} className="text-cyan-400" />
                      </a>
                    </div>
                  </Card>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ==================== FOOTER CTA ==================== */}
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeUp}
        className="relative overflow-hidden rounded-2xl glass-panel mb-6 flex flex-col items-center text-center gap-6 px-6 py-12"
      >
        <div className="absolute inset-0 showcase-mesh opacity-70" aria-hidden="true" />
        <div className="absolute inset-0 grid-texture opacity-30" aria-hidden="true" />
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />

        <div className="relative">
          <PernLogo size={56} className="mx-auto mb-5" />
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight">
            <span className="text-gradient">{t('showcase.ctaTitle', 'Built for real environments.')}</span>
          </h2>
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            {t('showcase.ctaDesc', 'From a classroom science project to a production IoT platform. Open-source, open protocols, AI-ready.')}
          </p>
        </div>

        <div className="relative flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="btn btn-primary">
            {t('showcase.enterPlatform', 'Enter the Platform')} <ArrowRight size={15} />
          </Link>
          <Link to="/signal-flow" className="btn btn-ghost">
            <Workflow size={15} /> {t('showcase.viewSignalFlow', 'View Signal Flow')}
          </Link>
          <Link to="/device-setup-guide" className="btn btn-ghost">
            <BookOpen size={15} /> {t('showcase.setupGuide', 'Setup Guide')}
          </Link>
        </div>

        <div className="relative flex items-center gap-4 text-[10px] text-[var(--text-disabled)] flex-wrap justify-center">
          <span className="flex items-center gap-1"><Database size={10} className="text-emerald-400" /> PostgreSQL</span>
          <span className="flex items-center gap-1"><Wifi size={10} className="text-cyan-400" /> MQTT</span>
          <span className="flex items-center gap-1"><BrainCircuit size={10} className="text-violet-400" /> {t('showcase.footerTech.aiEngine', 'AI Engine')}</span>
          <span className="flex items-center gap-1"><Globe2 size={10} className="text-amber-400" /> {t('showcase.footerTech.openSource', 'Open Source')}</span>
        </div>

        <div className="relative mt-1 pt-5 border-t border-white/[0.07] w-full max-w-lg">
          <div className="text-[11px] text-[var(--text-tertiary)]">
            {t('showcase.questions', 'Questions? Reach the team —')}{' '}
            <a href={MAIL_LINK(TEAM[2].email)} className="text-emerald-400 hover:underline font-semibold">Yasen.1925048@stemgharbiya.moe.edu.eg</a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
