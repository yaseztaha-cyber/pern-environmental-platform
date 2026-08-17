import { motion } from "framer-motion";
import { Layers, Cpu, ArrowRight, BrainCircuit } from "lucide-react";
import { SensorCarousel3D } from "../three/SensorCarousel3D";
import { virtualSensors, virtualSensorFusions } from "../../data/content";
import { AnimatedGauge } from "../ui/AnimatedGauge";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { cn } from "../../utils/cn";

const tierColor = (tier: number) => {
  if (tier === 1) return "#00D4AA";
  if (tier === 2) return "#0EA5E9";
  if (tier === 3) return "#F59E0B";
  return "#A78BFA";
};

const tierLabel = (tier: number) => {
  if (tier === 1) return "Direct fusion";
  if (tier === 2) return "Composite index";
  if (tier === 3) return "Derived metric";
  return "Advanced model";
};

function FusionStrip() {
  return (
    <GlassCard className="relative overflow-hidden p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(0,212,170,0.1), transparent 70%)",
        }}
      />
      <div className="mb-5 flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-pern-primary" />
        <h3 className="eyebrow text-sm text-white">How virtual sensors are born</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {virtualSensorFusions.map((vs, i) => {
          const color = vs.color;
          return (
            <motion.div
              key={vs.name}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="relative flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-white">
                    {vs.name}
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                    style={{ background: `${color}22`, color }}
                  >
                    T{vs.tier}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
                  {vs.feeds.join(" + ")}
                </div>
                <div className="truncate text-[10px] text-slate-500">
                  {vs.formula}
                </div>
              </div>
              {i < virtualSensorFusions.length - 1 && (
                <ArrowRight className="hidden h-3 w-3 flex-none text-slate-600 lg:block" />
              )}
            </motion.div>
          );
        })}
      </div>
    </GlassCard>
  );
}

export function Sensors() {
  return (
    <section id="sensors" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <SectionReveal>
          <SectionHeader
            number="03"
            eyebrow={
              <>
                <Cpu className="h-3.5 w-3.5 text-pern-primary" />
                Sensor Universe
              </>
            }
            title="14 Physical. 10 Virtual."
            description="Drag the sensor ring to explore every physical node. Hover a card for live sparklines. Virtual indices fuse raw telemetry into decision-ready intelligence."
          />
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <SensorCarousel3D />
        </SectionReveal>

        <SectionReveal delay={0.15} className="mt-16">
          <FusionStrip />
        </SectionReveal>

        <SectionReveal delay={0.2} className="mt-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-pern-secondary" />
              <h3 className="eyebrow text-sm text-white">Virtual Sensor Live Indices</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: tierColor(t) }}
                  />
                  {tierLabel(t)}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {virtualSensors.map((vs, i) => {
              const color = tierColor(vs.tier);
              return (
                <motion.div
                  key={vs.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i % 5) * 0.07 }}
                >
                  <GlassCard className="card-lift flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-white/15">
                    <AnimatedGauge value={vs.value} color={color} />
                    <div>
                      <div className="text-sm font-semibold text-white">{vs.name}</div>
                      <span
                        className={cn(
                          "mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        )}
                        style={{
                          background: `${color}22`,
                          color,
                        }}
                      >
                        Tier {vs.tier}
                      </span>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
