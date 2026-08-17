import { motion } from "framer-motion";
import { Boxes, BrainCircuit, BellRing, ArrowRight, Cpu } from "lucide-react";
import { platformPipeline } from "../../data/content";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";

const stageIcons = [Boxes, BrainCircuit, BellRing];

export function Platform() {
  return (
    <section id="platform" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <SectionReveal className="mb-14">
          <SectionHeader
            number="05"
            eyebrow={
              <>
                <Cpu className="h-3.5 w-3.5 text-pern-secondary" />
                End to End
              </>
            }
            title="One Pipeline. Live Everything."
            description="From field sensors to operator alerts in under a second — telemetry flows through a single, observable pipeline with AI woven in at every hop."
          />
        </SectionReveal>

        <div className="relative grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
          {platformPipeline.map((stage, i) => {
            const Icon = stageIcons[i];
            return (
              <div key={stage.stage} className="flex items-stretch gap-4">
                <SectionReveal delay={i * 0.08} className="flex-1">
                  <motion.div
                    whileHover={{ y: -6 }}
                    transition={{ type: "spring", stiffness: 240, damping: 20 }}
                    className="glass glass-glow card-lift group relative h-full overflow-hidden rounded-[1.75rem] p-6"
                  >
                    <div
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-px"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${stage.accent}, transparent)`,
                      }}
                    />
                    <div
                      aria-hidden
                      className="absolute -right-10 -top-10 h-28 w-28 rounded-full"
                      style={{
                        background: `radial-gradient(circle, ${stage.accent}33, transparent 70%)`,
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <span
                        className="eyebrow text-[10px]"
                        style={{ color: stage.accent }}
                      >
                        {stage.stage}
                      </span>
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl"
                        style={{
                          background: `${stage.accent}1f`,
                          color: stage.accent,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-white">
                      {stage.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      {stage.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {stage.items.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                </SectionReveal>
                {i < platformPipeline.length - 1 && (
                  <div className="hidden items-center lg:flex">
                    <ArrowRight
                      className="h-5 w-5 animate-pulse text-slate-500"
                      aria-hidden
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <SectionReveal delay={0.15}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-[1.75rem] border border-white/5 bg-white/[0.02] px-6 py-6 sm:flex-row sm:gap-8">
            {[
              ["< 1s", "edge → dashboard latency"],
              ["24h", "rolling forecast horizon"],
              ["3 bands", "Safe · Warning · Critical"],
              ["4 protocols", "MQTT · HTTP · CoAP · LoRaWAN"],
            ].map(([value, label]) => (
              <div key={label} className="flex items-baseline gap-2 text-center">
                <span className="font-display text-xl font-semibold text-white sm:text-2xl">
                  {value}
                </span>
                <span className="max-w-[8rem] text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
