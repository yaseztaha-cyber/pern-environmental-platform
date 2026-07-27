import { useState, useEffect } from 'react';
import { Cpu, Activity, Bell, Clock, Users, Rocket, Target } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Pill, StatCard, LoadingState, SectionTitle } from '../components/ui';

interface TeamPerson {
  name: string;
  role: string;
  focus: string;
}

const SUPERVISOR: TeamPerson = { name: 'Manal Abdel Fattah Khalil Ramia', role: 'Supervisor', focus: 'Project Guidance' };
const TEAM: TeamPerson[] = [
  { name: 'Ahmed Mohamed Mahmoud Ali', role: 'Team Member', focus: 'Backend & IoT' },
  { name: 'Mohamed Nour Eldeen Nazeer', role: 'Team Member', focus: 'Frontend & UI/UX' },
  { name: 'Yaseen Taha Husseiny El Nasher', role: 'Admin', focus: 'Full-Stack & DevOps' },
  { name: 'Eyad Sherrif Abdallah El Bagory', role: 'Team Member', focus: 'Data Science & AI' },
];

const CAPABILITIES = [
  { icon: Cpu, label: 'Multi-protocol IoT Ingestion', desc: 'MQTT, HTTP, WebSocket support' },
  { icon: Activity, label: 'Real-time Analytics', desc: 'Live sensor dashboards & charts' },
  { icon: Bell, label: 'Smart Alerting', desc: 'Configurable thresholds & notifications' },
  { icon: Target, label: 'AI Recommendations', desc: 'OpenRouter-powered suggestions' },
  { icon: Clock, label: 'Historical Trends', desc: 'Time-series storage & playback' },
  { icon: Rocket, label: 'Prediction Engine', desc: 'Forecast environmental indices' },
];

const ROADMAP = [
  { label: 'Mobile companion app', status: 'planned' as const },
  { label: 'Multi-region federation', status: 'planned' as const },
  { label: 'Custom widget builder', status: 'planned' as const },
];

export default function ShowcasePage() {
  const [deviceCount, setDeviceCount] = useState(0);
  const [totalReadings, setTotalReadings] = useState(0);
  const [alertStats, setAlertStats] = useState<any>({});
  const [uptime, setUptime] = useState<string>('--');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.getDevices(),
      apiClient.getSensorReadings(1),
      apiClient.getAlertStats(),
      fetch('/api/health').then((r) => r.json()).catch(() => ({})),
    ]).then(([devices, readings, alerts, health]) => {
      setDeviceCount(Array.isArray(devices) ? devices.length : 0);
      setTotalReadings(Array.isArray(readings) ? readings.length : 0);
      setAlertStats(alerts || {});
      setUptime(health.uptime ?? health.uptimeSeconds ?? '--');
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState label="Loading platform stats..." />;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="PERN Platform"
        subtitle="Pollution & Environmental Risk Navigator — STEM Gharbiya 2026"
      />

      <Card hover={false} className="p-6 md:p-8 mb-6 stagger-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--emerald)] to-[#059669] flex items-center justify-center">
            <span className="text-white text-xl font-bold">P</span>
          </div>
          <div>
            <div className="text-xl font-bold">Environmental Intelligence Platform</div>
            <div className="text-sm text-[var(--text-tertiary)]">Full-stack IoT monitoring system</div>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          PERN is a full-stack environmental monitoring platform that ingests real sensor data over
          MQTT, HTTP, and WebSocket protocols. It computes scientific water/air quality indices using
          WHO and EPA-aligned methodologies, provides AI-powered recommendations, and visualizes
          everything in a live dashboard with historical analytics and prediction capabilities.
        </p>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 grid-entrance">
        <StatCard
          label="Connected Devices"
          value={deviceCount}
          icon={<Cpu size={18} />}
          accent="emerald"
        />
        <StatCard
          label="Total Readings"
          value={totalReadings}
          icon={<Activity size={18} />}
          accent="cyan"
        />
        <StatCard
          label="Active Alerts"
          value={alertStats.active ?? alertStats.total ?? 0}
          icon={<Bell size={18} />}
          accent="amber"
        />
        <StatCard
          label="Uptime"
          value={typeof uptime === 'number' ? `${Math.floor(uptime / 3600)}h` : uptime}
          icon={<Clock size={18} />}
          accent="blue"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6 grid-entrance">
        <Card hover={false}>
          <div className="font-semibold mb-4">Platform Capabilities</div>
          <div className="grid grid-cols-1 gap-2">
            {CAPABILITIES.map((c) => (
              <div key={c.label} className="flex items-center gap-3 py-2 px-3 rounded-[var(--radius-xs)] bg-[var(--surface)]">
                <c.icon size={16} className="text-[var(--emerald)] shrink-0" />
                <div>
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-[10px] text-[var(--text-disabled)]">{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card hover={false}>
          <div className="font-semibold mb-4">Roadmap</div>
          <div className="space-y-3">
            {ROADMAP.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <Rocket size={14} className="text-[var(--violet)] shrink-0" />
                <span className="text-sm">{item.label}</span>
                <Pill tone="violet">{item.status}</Pill>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-6">
        <SectionTitle>
          <Users size={16} className="text-[var(--emerald)] inline" />
          {' '}Team
        </SectionTitle>
        <Card hover={false}>
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--border)]">
            <div className="w-10 h-10 rounded-full bg-[var(--emerald-dim)] flex items-center justify-center text-[var(--emerald)] font-semibold text-sm">
              {SUPERVISOR.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{SUPERVISOR.name}</span>
                <Pill tone="emerald">Supervisor</Pill>
              </div>
              <div className="text-[11px] text-[var(--text-disabled)]">{SUPERVISOR.focus}</div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 pt-4">
            {TEAM.map((m) => (
              <div key={m.name} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/[0.05] flex items-center justify-center text-[var(--text-tertiary)] font-semibold text-xs">
                  {m.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{m.name.split(' ').slice(0, 2).join(' ')}</span>
                    <Pill tone={m.role === 'Admin' ? 'emerald' : 'slate'}>{m.role}</Pill>
                  </div>
                  <div className="text-[10px] text-[var(--text-disabled)]">{m.focus}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="text-center text-[10px] text-[var(--text-disabled)] pb-4">
        STEM Gharbiya · Grade 11 · 2026
      </div>
    </div>
  );
}
