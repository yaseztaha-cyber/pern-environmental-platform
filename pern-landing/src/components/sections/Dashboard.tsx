import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";
import {
  Activity,
  Bell,
  MapPin,
  ShieldCheck,
  Waves,
  Wind,
} from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { Sparkline } from "../ui/Sparkline";
import { sparklineData } from "../../data/content";

gsap.registerPlugin(ScrollTrigger);

function ERIGauge({ value }: { value: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color =
    value < 40 ? "#10B981" : value < 70 ? "#F59E0B" : "#EF4444";
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <svg width="144" height="144" viewBox="0 0 144 144">
        <circle
          cx="72"
          cy="72"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
        />
        <circle
          cx="72"
          cy="72"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 72 72)"
          style={{
            transition: "stroke-dashoffset 1s ease, stroke 0.6s ease",
            filter: `drop-shadow(0 0 12px ${color})`,
          }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-bold tabular-nums" style={{ color }}>
          {value}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400">
          ERI
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [eri, setEri] = useState(28);
  const [alerts, setAlerts] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { rotateX: 15, y: 40 },
        {
          rotateX: 0,
          y: 0,
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            start: "top 80%",
            end: "top 30%",
            scrub: true,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const values = [28, 45, 62, 78, 54, 33];
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % values.length;
      setEri(values[i]);
      setAlerts((a) => (a >= 3 ? 1 : a + 1));
      setNow(new Date());
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section id="dashboard" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <SectionReveal className="mb-12 text-center">
          <SectionHeader
            align="center"
            number="06"
            eyebrow={
              <>
                <Activity className="h-3.5 w-3.5 text-pern-primary" />
                See Everything. Instantly.
              </>
            }
            title="Live Dashboard Preview"
            description="Operator-grade visibility with MQTT ingestion, sub-2s alerts, and standards-compliant risk scoring — all in one glass console."
          />
        </SectionReveal>

        <div className="perspective-1000 dashboard-reflect relative mx-auto max-w-5xl">
          <div
            ref={frameRef}
            className="preserve-3d relative will-change-transform"
            style={{ transformStyle: "preserve-3d" }}
          >
            <GlassCard strong glow className="relative overflow-hidden p-3 sm:p-5">
              {/* Corner badges */}
              <div className="pointer-events-none absolute left-4 top-4 z-10 hidden sm:block">
                <span className="glass rounded-full px-3 py-1 text-[10px] font-medium text-teal-300">
                  Real-time MQTT Ingestion
                </span>
              </div>
              <div className="pointer-events-none absolute right-4 top-4 z-10 hidden sm:block">
                <span className="glass rounded-full px-3 py-1 text-[10px] font-medium text-sky-300">
                  &lt; 2s Alert Latency
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden sm:block">
                <span className="glass rounded-full px-3 py-1 text-[10px] font-medium text-emerald-300">
                  WHO / EPA / NSF Standards Compliant
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden sm:block">
                <span className="glass rounded-full px-3 py-1 text-[10px] font-medium text-violet-300">
                  Multi-Organization RBAC
                </span>
              </div>

              <div className="rounded-2xl border border-white/5 bg-pern-bg/80 p-4 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-pern-primary" />
                    <span className="eyebrow text-xs text-white">
                      PERN Console
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    Live
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-wider text-slate-500 sm:flex-nowrap sm:justify-between">
                  <span>tick #{Math.round(now.getTime() / 2400) % 10000}</span>
                  <span>
                    {now.toLocaleTimeString("en-GB", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
                    GMT+2
                  </span>
                </div>

                <div className="mb-5 flex flex-wrap gap-1.5 sm:hidden">
                  {[
                    ["Real-time MQTT", "text-teal-300"],
                    ["< 2s Alerts", "text-sky-300"],
                    ["WHO / EPA / NSF", "text-emerald-300"],
                    ["Multi-Org RBAC", "text-violet-300"],
                  ].map(([label, color]) => (
                    <span
                      key={label}
                      className={`rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-medium ${color}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <GlassCard className="flex flex-col items-center justify-center p-4">
                    <ERIGauge value={eri} />
                    <div className="mt-2 text-xs text-slate-400">
                      Environmental Risk Index
                    </div>
                  </GlassCard>

                  <GlassCard className="space-y-3 p-4 lg:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Air & Water Trends</span>
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Wind className="h-3 w-3 text-teal-400" /> PM2.5
                        </span>
                        <span className="flex items-center gap-1">
                          <Waves className="h-3 w-3 text-sky-400" /> TDS
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="h-20">
                        <Sparkline data={sparklineData(7, 16)} color="#00D4AA" height={80} />
                      </div>
                      <div className="h-20">
                        <Sparkline data={sparklineData(12, 16)} color="#0EA5E9" height={80} />
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="relative min-h-[160px] overflow-hidden p-4 lg:col-span-2">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-pern-primary" />
                      Nile Delta Sensor Map
                    </div>
                    <div className="relative h-28 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950">
                      {[
                        { t: "18%", l: "30%" },
                        { t: "42%", l: "55%" },
                        { t: "28%", l: "70%" },
                        { t: "60%", l: "40%" },
                      ].map((p, i) => (
                        <span
                          key={i}
                          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pern-primary"
                          style={{ top: p.t, left: p.l }}
                        >
                          <span className="absolute inset-0 animate-ping rounded-full bg-pern-primary/60" />
                        </span>
                      ))}
                      <div className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage:
                            "radial-gradient(circle at 40% 45%, rgba(0,212,170,0.25), transparent 50%), radial-gradient(circle at 65% 40%, rgba(14,165,233,0.2), transparent 45%)",
                        }}
                      />
                    </div>
                  </GlassCard>

                  <GlassCard className="p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                      <Bell className="h-4 w-4 text-amber-400" />
                      Alerts
                    </div>
                    <div className="space-y-2">
                      {["PM2.5 Warning — Tanta", "pH Drift Corrected", "ERI Critical — Zone B"]
                        .slice(0, Math.max(1, alerts))
                        .map((a, i) => (
                          <motion.div
                            key={a}
                            initial={{ opacity: 0, x: 12, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300"
                          >
                            {a}
                            {i === 0 && (
                              <span className="ml-2 text-amber-400">· now</span>
                            )}
                          </motion.div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
                      <ShieldCheck className="h-3 w-3" />
                      Policy engine active
                    </div>
                  </GlassCard>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </section>
  );
}
