import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CircuitBoard, Coins } from "lucide-react";
import { competitors, hardwareComponents } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { cn } from "../../utils/cn";

gsap.registerPlugin(ScrollTrigger);

export function Hardware() {
  const tableRef = useRef<HTMLDivElement>(null);
  const explodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const table = tableRef.current;
    if (!table) return;
    const rows = table.querySelectorAll(".hw-row");
    const ctx = gsap.context(() => {
      gsap.fromTo(
        rows,
        { opacity: 0, x: -24 },
        {
          opacity: 1,
          x: 0,
          stagger: 0.08,
          duration: 0.5,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: table,
            start: "top 75%",
          },
        }
      );
    }, table);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = explodeRef.current;
    if (!el) return;
    const parts = el.querySelectorAll(".hw-part");
    const ctx = gsap.context(() => {
      gsap.fromTo(
        parts,
        {
          y: (i) => (i % 2 === 0 ? -80 : 80),
          x: (i) => (i - 2) * 40,
          opacity: 0,
          rotate: (i) => (i - 2) * 12,
        },
        {
          y: 0,
          x: 0,
          opacity: 1,
          rotate: 0,
          stagger: 0.08,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            start: "top 70%",
            end: "top 30%",
            scrub: 0.8,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section id="hardware" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <SectionReveal className="mb-12">
          <SectionHeader
            number="10"
            eyebrow={
              <>
                <CircuitBoard className="h-3.5 w-3.5 text-pern-primary" />
                Elite Performance. Accessible Price.
              </>
            }
            title="Hardware & Cost"
            description="A complete multi-parameter node for roughly $100 USD — air, water, and soil intelligence without enterprise lock-in."
          />
        </SectionReveal>

        <div className="grid gap-8 lg:grid-cols-2">
          <SectionReveal>
            <div
              ref={explodeRef}
              className="relative mb-8 flex h-56 items-center justify-center"
            >
              {["ESP32", "PMS5003", "MQ135", "DHT22", "TDS/pH"].map((label, i) => (
                <div
                  key={label}
                  className="hw-part glass absolute flex h-16 w-16 items-center justify-center rounded-2xl text-[10px] font-semibold text-teal-200 sm:h-20 sm:w-20 sm:text-xs"
                  style={{
                    left: `calc(50% + ${(i - 2) * 18}%)`,
                    transform: "translateX(-50%)",
                    zIndex: 5 - Math.abs(i - 2),
                  }}
                >
                  {label}
                </div>
              ))}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(45,212,191,0.12), transparent 70%)",
                }}
              />
            </div>

            <GlassCard ref={tableRef as never} className="overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] border-b border-white/10 px-5 py-3 text-xs uppercase tracking-wider text-slate-500">
                <span>Component</span>
                <span>Prototype Cost</span>
              </div>
              {hardwareComponents.map((row) => (
                <div
                  key={row.component}
                  className="hw-row grid grid-cols-[1fr_auto] border-b border-white/5 px-5 py-3 text-sm last:border-0"
                >
                  <span className="text-slate-300">{row.component}</span>
                  <span className="font-medium tabular-nums text-white">
                    {row.cost}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto] bg-pern-primary/10 px-5 py-4 text-sm font-semibold">
                <span className="text-pern-primary">Total</span>
                <span className="text-pern-primary">5,000 EGP (~$100 USD)</span>
              </div>
            </GlassCard>
          </SectionReveal>

          <SectionReveal delay={0.1}>
            <div className="grid gap-4 sm:grid-cols-2">
              {competitors.map((c) => (
                <GlassCard
                  key={c.name}
                  glow={Boolean(c.highlight)}
                  className={cn(
                    "card-lift p-5",
                    c.highlight && "conic-border ring-1 ring-pern-primary/40"
                  )}
                >
                  <div className="mb-1 text-sm font-semibold text-white">
                    {c.name}
                  </div>
                  <div
                    className={cn(
                      "mb-3 font-mono text-lg font-bold",
                      c.highlight ? "text-pern-primary" : "text-slate-200"
                    )}
                  >
                    {c.price}
                  </div>
                  <ul className="space-y-1">
                    {c.notes.map((n) => (
                      <li key={n} className="text-xs text-slate-400">
                        · {n}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              ))}
            </div>

            <GlassCard
              glow
              className="mt-6 flex items-start gap-3 p-5 animate-pulse-glow"
            >
              <Coins className="mt-0.5 h-5 w-5 shrink-0 text-pern-primary" />
              <p className="text-sm leading-relaxed text-slate-300">
                At 1,000 units:{" "}
                <span className="font-semibold text-white">4,150 EGP</span> per
                node. Sold at{" "}
                <span className="font-semibold text-white">6,000–8,000 EGP</span>{" "}
                with dashboard subscription.
              </p>
            </GlassCard>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
