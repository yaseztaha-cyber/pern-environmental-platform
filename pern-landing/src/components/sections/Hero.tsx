import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, ChevronDown } from "lucide-react";
import { HeroScene } from "../three/HeroScene";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { liveStats } from "../../data/content";
import { useCountUp } from "../../hooks/useCountUp";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { usePlatformAvailable } from "../../utils/platform";
import { scrollToId } from "../../utils/scroll";

function StatItem({
  label,
  value,
  enabled,
}: {
  label: string;
  value: number;
  enabled: boolean;
}) {
  const n = useCountUp(value, enabled);
  return (
    <div className="flex min-w-[110px] flex-col items-center px-3 py-1 sm:min-w-[130px]">
      <span className="text-lg font-semibold tabular-nums text-white sm:text-2xl">
        {n}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-slate-400 sm:text-xs">
        {label}
      </span>
    </div>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const [statsOn, setStatsOn] = useState(false);
  const reducedMotion = prefersReducedMotion();
  const platform = usePlatformAvailable();

  useEffect(() => {
    if (reducedMotion) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(
        root.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.4 }
      )
        .fromTo(
          ".hero-line",
          { y: 80, opacity: 0, clipPath: "inset(0 0 100% 0)" },
          {
            y: 0,
            opacity: 1,
            clipPath: "inset(0 0 0% 0)",
            duration: 0.9,
            stagger: 0.12,
          },
          0.35
        )
        .fromTo(
          ".hero-sub",
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7 },
          0.85
        )
        .fromTo(
          ".hero-cta",
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6 },
          1.1
        )
        .fromTo(
          ".hero-stats",
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7 },
          1.0
        )
        .fromTo(
          ".hero-ticker",
          { opacity: 0 },
          { opacity: 1, duration: 0.6 },
          1.25
        );

      gsap.delayedCall(1.0, () => setStatsOn(true));
    }, root);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const ctx = gsap.context(() => {
      const deepX = gsap.quickTo(".parallax-deep", "x", {
        duration: 0.8,
        ease: "power3.out",
      });
      const deepY = gsap.quickTo(".parallax-deep", "y", {
        duration: 0.8,
        ease: "power3.out",
      });
      const midX = gsap.quickTo(".parallax-mid", "x", {
        duration: 0.9,
        ease: "power3.out",
      });
      const midY = gsap.quickTo(".parallax-mid", "y", {
        duration: 0.9,
        ease: "power3.out",
      });
      const onMove = (e: MouseEvent) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        deepX(nx * -26);
        deepY(ny * -20);
        midX(nx * -12);
        midY(ny * -10);
      };
      window.addEventListener("mousemove", onMove);
      return () => window.removeEventListener("mousemove", onMove);
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="hero"
      ref={root}
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-24 pb-24"
    >
      <div
        aria-hidden
        className="parallax-deep pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <div className="hero-core absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-[42rem] sm:w-[42rem]" />
        <div
          className="orb drift-a left-[-8%] top-[12%] h-[16rem] w-[22rem]"
          style={{ background: "radial-gradient(circle, rgba(0,212,170,0.28), transparent 70%)" }}
        />
        <div
          className="orb drift-b right-[-6%] top-[38%] h-[14rem] w-[18rem]"
          style={{ background: "radial-gradient(circle, rgba(14,165,233,0.22), transparent 70%)" }}
        />
        <div
          className="orb drift-a left-[10%] top-[62%] h-[12rem] w-[16rem]"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,0.18), transparent 70%)" }}
        />
      </div>
      <HeroScene />

      <div className="parallax-mid relative z-10 mx-auto flex max-w-5xl flex-col items-center px-5 pb-20 text-center sm:pb-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.6 }}
        >
          <Pill className="mb-8">
            <Sparkles className="h-3.5 w-3.5 text-pern-primary" />
            AI-Powered Environmental Intelligence
          </Pill>
        </motion.div>

        <h1 className="heading-xl mb-6">
          <span className="hero-line block text-gradient">Predictive</span>
          <span className="hero-line block text-gradient-cool">Environmental</span>
          <span className="hero-line block text-gradient">Risk Network</span>
        </h1>

        <p className="hero-sub mx-auto mb-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
          Real-time monitoring, 24-hour pollution forecasting, and unified risk
          scoring for air, water, and soil. Built for the Nile Delta. Deployable
          anywhere.
        </p>

        <div className="hero-cta mb-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Button size="lg" href={platform.resolve()} className="shine">
            Enter the Platform
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => scrollToId("dashboard")}
          >
            Explore the Dashboard
          </Button>
        </div>

        <div className="hero-boot eyebrow flex items-center gap-3 text-[10px] text-slate-400 sm:text-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span>
            LINKING SENSOR GRID
          </span>
          <span className="hidden text-slate-500 sm:inline">▸</span>
          <span className="hidden text-emerald-300 sm:inline">
            04 NODES ONLINE
          </span>
          <span className="stream-cursor text-pern-primary">_</span>
        </div>

        <div className="hero-stats mt-12 w-full">
          <div className="glass glass-glow flex flex-wrap items-center justify-center gap-1 rounded-[1.75rem] px-2 py-3 sm:gap-0 sm:px-4">
            {liveStats.map((s, i) => (
              <div key={s.label} className="flex items-center">
                <StatItem label={s.label} value={s.value} enabled={statsOn} />
                {i < liveStats.length - 1 && (
                  <div className="hidden h-8 w-px bg-white/10 sm:block" />
                )}
              </div>
            ))}
          </div>
          <p className="hero-ticker eyebrow mt-3 text-center text-[10px] text-slate-500 sm:text-xs">
            LIVE TELEMETRY · AQI{" "}
            <span className="text-slate-200">042</span> · PM2.5{" "}
            <span className="text-slate-200">18 µg/m³</span> · WATER TDS{" "}
            <span className="text-slate-200">210 ppm</span> · SOIL pH{" "}
            <span className="text-slate-200">7.2</span> · UPDATED{" "}
            <span className="text-pern-primary">4s ago</span>
          </p>
        </div>
      </div>

      <button
        onClick={() => scrollToId("problem")}
        aria-label="Scroll to content"
        data-cursor="hover"
        className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 rounded-full p-2 text-slate-500 transition hover:text-white sm:block"
      >
        <ChevronDown className="h-5 w-5 animate-bounce" />
      </button>
    </section>
  );
}
