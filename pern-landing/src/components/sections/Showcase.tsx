import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useInView } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Cpu,
  LineChart,
  MapPin,
  Radar,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { ShowcaseScene } from "../three/ShowcaseScene";
import { Button } from "../ui/Button";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { useCountUp } from "../../hooks/useCountUp";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { usePlatformAvailable } from "../../utils/platform";
import { scrollToId } from "../../utils/scroll";
import { deployments } from "../../data/content";

gsap.registerPlugin(ScrollTrigger);

const metrics = [
  { value: 94, suffix: "%", label: "Forecast Accuracy" },
  { value: 24, suffix: "h", label: "Ahead Forecasts" },
  { value: 14, suffix: "", label: "Sensor Types" },
  { value: 304, suffix: "", label: "Automated Tests" },
];

const features = [
  {
    icon: Zap,
    title: "Predictive Engine",
    desc: "Flags pollution spikes up to 24 hours before they hit.",
  },
  {
    icon: Cpu,
    title: "Distributed Grid",
    desc: "ESP32 nodes and gateways that keep working offline.",
  },
  {
    icon: LineChart,
    title: "Real-Time Dashboard",
    desc: "Every reading streamed live into one unified risk view.",
  },
  {
    icon: ShieldCheck,
    title: "Zero-Carbon Hardware",
    desc: "Low-power, locally built sensors for the Nile Delta.",
  },
];

function MetricTile({
  value,
  suffix,
  label,
  enabled,
}: {
  value: number;
  suffix: string;
  label: string;
  enabled: boolean;
}) {
  const n = useCountUp(value, enabled);
  return (
    <GlassCard glow className="card-lift p-5 text-center">
      <div className="text-3xl font-bold tabular-nums text-white sm:text-4xl">
        {n}
        <span className="text-pern-primary">{suffix}</span>
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-wider text-slate-400">
        {label}
      </div>
    </GlassCard>
  );
}

export function Showcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const platform = usePlatformAvailable();
  const inView = useInView(sectionRef, { once: true, margin: "-15% 0px" });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top 75%",
        end: "bottom 25%",
        scrub: 1,
        onUpdate: (self) => {
          progressRef.current = self.progress;
        },
      });

      gsap.fromTo(
        ".showcase-feature",
        { y: 34, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.1,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 72%" },
        }
      );

      gsap.fromTo(
        ".showcase-panel",
        { y: 40, opacity: 0, scale: 0.96 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 68%" },
        }
      );
    }, section);

    return () => {
      progressRef.current = 0;
      ctx.revert();
    };
  }, []);

  return (
    <section
      id="showcase"
      ref={sectionRef}
      className="relative overflow-hidden"
    >
      <ShowcaseScene progressRef={progressRef} />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_0%,#020617_80%)]" />

      <div className="section-pad relative z-10">
        <div className="mx-auto max-w-7xl">
          <SectionReveal className="mb-10">
            <SectionHeader
              number="11"
              eyebrow={
                <span className="flex items-center gap-2">
                  <Radar className="h-3.5 w-3.5 text-pern-primary" />
                  Proven in the Field
                </span>
              }
              title={
                <span className="text-gradient-shimmer">From Sensor to Signal.</span>
              }
              description="A full pipeline from dusty field nodes to predictive intelligence — built, deployed, and validated across the Nile Delta."
            />
          </SectionReveal>

          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <div className="grid gap-4 sm:grid-cols-2">
                {features.map((f) => (
                  <GlassCard
                    key={f.title}
                    glow
                    className="showcase-feature card-lift p-5"
                  >
                    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-pern-primary/15 text-pern-primary ring-1 ring-pern-primary/20">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mb-1 text-sm font-semibold text-white">
                      {f.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-400">
                      {f.desc}
                    </p>
                  </GlassCard>
                ))}
              </div>

              <div className="showcase-feature mt-6 flex flex-wrap gap-3">
                <Button size="lg" href={platform.resolve()} className="shine">
                  Enter the Platform
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => scrollToId("dashboard")}
                >
                  See Live Dashboard
                </Button>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="grid grid-cols-2 gap-4">
                {metrics.map((m) => (
                  <MetricTile
                    key={m.label}
                    value={m.value}
                    suffix={m.suffix}
                    label={m.label}
                    enabled={inView}
                  />
                ))}
              </div>

              <GlassCard className="showcase-panel mt-4 p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pern-primary">
                  <Activity className="h-3.5 w-3.5" />
                  Deployed &amp; Validated
                </div>
                <div className="flex flex-col gap-2.5">
                  {deployments.map((d) => (
                    <div
                      key={d.title}
                      className="flex items-start gap-2.5 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/5"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pern-secondary" />
                      <div>
                        <div className="text-sm font-medium text-white">
                          {d.title}
                        </div>
                        <div className="text-xs text-slate-400">{d.location}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
