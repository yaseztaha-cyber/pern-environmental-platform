import { useState } from "react";
import { FileText, Mail, MessageCircle, Building2, ArrowRight } from "lucide-react";
import { ParticleField } from "../three/ParticleField";
import { Button } from "../ui/Button";
import { SectionReveal } from "../ui/SectionReveal";
import { PilotModal } from "../ui/PilotModal";
import { contactEmail, contactPhone, waLink } from "../../data/content";
import { usePlatformAvailable, platformHref } from "../../utils/platform";

const links = [
  {
    label: "Documentation",
    icon: FileText,
    href: `${platformHref}#/knowledge-hub`,
  },
  {
    label: "Contact",
    icon: Mail,
    href: `mailto:${contactEmail}`,
  },
  {
    label: "WhatsApp",
    icon: MessageCircle,
    href: waLink(contactPhone),
  },
  {
    label: "Ministry Inquiry",
    icon: Building2,
    href: `mailto:${contactEmail}?subject=${encodeURIComponent("Ministry Inquiry — PERN")}`,
  },
];

export function CTAFooter() {
  const platform = usePlatformAvailable();
  const [pilotOpen, setPilotOpen] = useState(false);

  return (
    <section
      id="cta"
      className="relative flex min-h-[90vh] items-center overflow-hidden py-24"
    >
      <ParticleField denser />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-pern-bg via-transparent to-pern-bg" />
      <PilotModal open={pilotOpen} onClose={() => setPilotOpen(false)} />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 text-center">
        <SectionReveal>
          <div className="mb-6 flex items-center justify-center gap-3">
            <span className="eyebrow text-[11px] text-pern-primary/80">15</span>
            <span className="pill inline-flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-pern-primary shadow-[0_0_8px_rgba(0,212,170,0.8)]" />
              Ready When You Are
            </span>
          </div>
          <h2 className="heading-lg mb-10 text-balance text-white">
            The future of environmental monitoring is{" "}
            <span className="text-gradient">predictive</span>, distributed, and
            affordable.
          </h2>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <Button size="xl" href={platform.resolve()} className="shine animate-pulse-glow">
              Enter the Platform
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setPilotOpen(true)}
            >
              Request a Pilot Deployment
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-5">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                data-cursor="hover"
                className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-slate-300 transition hover:border-teal-400/30 hover:text-white"
              >
                <l.icon className="h-4 w-4 text-pern-primary" />
                {l.label}
              </a>
            ))}
          </div>

          <div className="mt-16 flex flex-col items-center gap-2 border-t border-white/5 pt-8 text-xs text-slate-500 sm:flex-row sm:justify-between">
            <span>
              PERN — Predictive Environmental Risk Network · Nile Delta · © 2026
            </span>
            <span className="flex gap-4">
              <a href="#hero" data-cursor="hover" className="transition hover:text-white">
                Back to top
              </a>
              <span className="text-slate-600">·</span>
              <a
                href={`mailto:${contactEmail}?subject=${encodeURIComponent("Privacy / Terms — PERN")}`}
                data-cursor="hover"
                className="transition hover:text-white"
              >
                Privacy & Terms
              </a>
            </span>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
