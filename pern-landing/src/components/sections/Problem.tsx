import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AlertTriangle, Wind } from "lucide-react";
import { GlassOrbScene } from "../three/GlassOrbScene";
import { problemLabels } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

gsap.registerPlugin(ScrollTrigger);

export function Problem() {
  const sectionRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const pmRef = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);

  useEffect(() => {
    const el = sectionRef.current;
    const bar = barRef.current;
    const cards = cardsRef.current;
    const pm = pmRef.current;
    if (!el || !bar || !cards || !pm) return;
    if (prefersReducedMotion()) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    const setBar = gsap.quickSetter(bar, "width", "%");
    const setPm = gsap.quickSetter(pm, "textContent");
    const cardEls = Array.from(
      cards.querySelectorAll<HTMLDivElement>("[data-problem-card]")
    );
    const setCards = cardEls.map((cardEl, i) => {
      const setOpacity = gsap.quickSetter(cardEl, "opacity");
      return (p: number) =>
        setOpacity(0.35 + Math.min(1, p * 2 + i * 0.1) * 0.65);
    });

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top top",
        end: "+=120%",
        pin: !isMobile,
        scrub: 0.6,
        onUpdate: (self) => {
          progress.current = self.progress;
          setBar(Math.max(8, self.progress * 100));
          setPm(String(Math.round(5 + self.progress * 245)));
          setCards.forEach((fn) => fn(self.progress));
        },
      });
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="problem"
      ref={sectionRef}
      className="relative flex min-h-screen items-center overflow-hidden"
    >
      <div className="section-pad mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-2">
        <SectionReveal>
          <SectionHeader
            number="01"
            eyebrow={
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Invisible Threats
              </>
            }
            title="Environmental data is either too expensive, too complex, or too late."
            description="Commercial stations cost $800–$3,000 per unit. They report what already happened. PERN changes the paradigm: low-cost ESP32 nodes, predictive ML, and an Environmental Risk Index anyone can understand."
          />
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-slate-500">
              <span>Clean</span>
              <span>Contaminated</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                ref={barRef}
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"
                style={{ width: "8%" }}
              />
            </div>
          </div>

          <div ref={cardsRef} className="grid gap-3 sm:grid-cols-2">
            {problemLabels.map((label) => (
              <GlassCard
                key={label}
                data-problem-card
                className="p-4 text-sm text-slate-300"
                style={{ opacity: 0.35 }}
              >
                {label}
              </GlassCard>
            ))}
          </div>
        </SectionReveal>

        <div className="relative h-[360px] sm:h-[440px]">
          <div className="absolute inset-0 rounded-[1.5rem] bg-gradient-to-b from-teal-500/5 to-transparent" />
          <GlassOrbScene progress={progress.current} progressRef={progress} />
          <div className="pointer-events-none absolute left-4 top-4">
            <span className="glass rounded-full px-3 py-1 text-xs text-emerald-300">
              Pristine
            </span>
          </div>
          <div className="pointer-events-none absolute right-4 top-4">
            <span className="glass rounded-full px-3 py-1 text-xs text-red-300">
              PM2.5 + Gas
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1 text-xs text-slate-300 backdrop-blur-sm">
            <Wind className="h-3.5 w-3.5 text-amber-400" />
            PM2.5
            <span ref={pmRef} className="font-mono font-semibold text-red-400">
              5
            </span>
            µg/m³
          </div>
        </div>
      </div>
    </section>
  );
}
