import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GraduationCap, Mail, MessageCircle } from "lucide-react";
import { team, teamOwner, waLink } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { cn } from "../../utils/cn";

gsap.registerPlugin(ScrollTrigger);

export function Team() {
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (isMobile || prefersReducedMotion()) return;
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const cards = track.querySelectorAll(".team-card");
    const ctx = gsap.context(() => {
      const total = track.scrollWidth - window.innerWidth + 80;
      gsap.to(track, {
        x: () => -Math.max(0, total),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${Math.max(total, 400)}`,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            cards.forEach((card, i) => {
              const p = self.progress;
              const offset = (i / cards.length - p) * 40;
              gsap.set(card, { rotateY: offset });
            });
          },
        },
      });
    }, section);

    return () => ctx.revert();
  }, [isMobile]);

  const people = team.map((m) => ({
    name: m.name,
    role: m.role,
    email: m.email,
    phone: m.phone,
    photo: m.photo,
  }));

  return (
    <section id="team" ref={sectionRef} className="relative overflow-hidden">
      <div className={cn("section-pad", !isMobile && "min-h-screen")}>
        <SectionReveal className="mx-auto mb-10 max-w-7xl">
          <SectionHeader
            number="13"
            eyebrow={
              <>
                <GraduationCap className="h-3.5 w-3.5 text-pern-primary" />
                STEM Gharbiya · Grade 11 · 2026
              </>
            }
            title="The Team"
          />
        </SectionReveal>

        <div
          ref={trackRef}
          className={cn(
            "flex gap-5 px-5 sm:px-10",
            isMobile ? "flex-col" : "w-max"
          )}
        >
          {people.map((p) => (
            <GlassCard
              key={p.name}
              glow
              className={cn(
                "team-card preserve-3d flex flex-col items-start p-6",
                isMobile ? "w-full" : "h-[420px] w-[360px] shrink-0"
              )}
            >
              <span className="mb-6 flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-teal-400/20 to-sky-500/10 ring-2 ring-white/15 shadow-lg shadow-teal-900/20">
                <img
                  src={p.photo}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </span>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-pern-primary">
                {p.role}
              </div>
              <h3 className="text-lg font-semibold leading-snug text-white">
                {p.name}
              </h3>

              <div className="mt-auto flex items-center justify-end gap-2 pt-6">
                <a
                  href={`mailto:${p.email}`}
                  data-cursor="hover"
                  aria-label={`Email ${p.name}`}
                  title={p.email}
                  className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-300 transition hover:border-teal-400/30 hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5 text-pern-primary" />
                  {p.email}
                </a>
                <a
                  href={waLink(p.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  aria-label={`WhatsApp ${p.name}`}
                  title={`WhatsApp +2${p.phone.replace(/^0+/, "")}`}
                  className="glass inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:border-teal-400/30 hover:text-pern-primary"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              </div>
            </GlassCard>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-7xl px-5 text-center text-xs text-slate-500 sm:px-10 sm:text-sm">
          Created & Owned by {teamOwner} · STEM Gharbiya · All Rights Reserved ©
          2026
        </p>
      </div>
    </section>
  );
}
