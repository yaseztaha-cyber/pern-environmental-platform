import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Cpu,
  Network,
  Server,
  Database,
  LayoutDashboard,
  Radio,
} from "lucide-react";
import { architectureLayers } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { cn } from "../../utils/cn";

gsap.registerPlugin(ScrollTrigger);

const icons = [Cpu, Network, Server, Database, LayoutDashboard];

export function Architecture() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (isMobile || prefersReducedMotion()) return;
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const ctx = gsap.context(() => {
      const totalScroll = track.scrollWidth - window.innerWidth;
      const rail = railRef.current;
      if (rail) gsap.set(rail, { scaleX: 0 });

      gsap.to(track, {
        x: () => -totalScroll,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${totalScroll}`,
          pin: true,
          scrub: 0.4,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (rail) gsap.set(rail, { scaleX: self.progress });
          },
        },
      });
    }, section);

    return () => ctx.revert();
  }, [isMobile]);

  return (
    <section
      id="architecture"
      ref={sectionRef}
      className="relative overflow-hidden"
    >
      <div className={cn(!isMobile && "h-screen")}>
        <div
          className={cn(
            "pointer-events-none absolute left-0 top-0 z-20 h-full w-full",
            !isMobile && "bg-gradient-to-b from-pern-bg/60 via-transparent to-transparent"
          )}
        />
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 hidden h-[2px] justify-center lg:flex">
          <div className="w-full max-w-7xl">
            <div className="h-px w-full bg-white/5" />
            <div ref={railRef} className="progress-rail -mt-px w-full" />
          </div>
        </div>
        <div className="section-pad pb-6 pt-24">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              number="02"
              eyebrow={
                <>
                  <Radio className="h-3.5 w-3.5 text-pern-primary" />
                  System Design
                </>
              }
              title="Five Layers of Intelligence"
              description="From field devices to predictive dashboards — a unified stack for environmental intelligence across the Nile Delta."
            />
          </div>
        </div>

        <div
          ref={trackRef}
          className={cn(
            "flex gap-6 px-5 pb-16 sm:px-10",
            isMobile && "flex-col",
            !isMobile && "will-change-transform"
          )}
          style={!isMobile ? { width: "max-content" } : undefined}
        >
          {architectureLayers.map((layer, i) => {
            const Icon = icons[i];
            return (
              <GlassCard
                key={layer.id}
                solid
                className={cn(
                  "relative flex flex-col overflow-hidden p-8",
                  isMobile ? "w-full" : "h-[min(60vh,520px)] w-[min(85vw,420px)] shrink-0"
                )}
              >
                <div
                  className="absolute -right-10 -top-10 h-40 w-40 rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${layer.accent}45, transparent 70%)`,
                  }}
                />
                <div className="mb-6 flex items-center justify-between">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{
                      background: `${layer.accent}22`,
                      color: layer.accent,
                      boxShadow: `0 0 12px -4px ${layer.accent}`,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-medium uppercase tracking-widest text-slate-500">
                    Layer 0{i + 1}
                  </span>
                </div>
                <h3 className="heading-md mb-3 text-white">{layer.title}</h3>
                <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-400">
                  {layer.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {layer.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                {!isMobile && i < architectureLayers.length - 1 && (
                  <div className="pointer-events-none absolute -right-3 top-1/2 hidden h-px w-6 bg-gradient-to-r from-teal-400/60 to-transparent lg:block" />
                )}
              </GlassCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
