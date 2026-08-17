import { Globe2, Shield, ExternalLink } from "lucide-react";
import { MiniGlobe } from "../three/MiniGlobe";
import { complianceFrameworks, externalSources } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";

export function GlobalData() {
  return (
    <section id="global" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <SectionReveal>
            <SectionHeader
              number="08"
              eyebrow={
                <>
                  <Globe2 className="h-3.5 w-3.5 text-pern-secondary" />
                  Beyond Your Sensors
                </>
              }
              title="Global Data Fabric"
              description="PERN fuses local IoT streams with planetary open data — satellite fire detections, community air networks, and atmospheric composition models — so your risk score is never blind outside the node radius."
            />

            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              {externalSources.map((src) => (
                <a
                  key={src.name}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="hover"
                  className="group"
                >
                  <GlassCard
                    className="card-lift flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-200 hover:border-pern-primary/30"
                  >
                    <span className="flex items-center">
                      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-pern-primary" />
                      {src.name}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-500 transition group-hover:text-pern-primary" />
                  </GlassCard>
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Shield className="h-4 w-4 text-pern-primary" />
              Compliance Frameworks
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {complianceFrameworks.map((f) => (
                <span
                  key={f}
                  className="glass rounded-full px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  {f}
                </span>
              ))}
            </div>
          </SectionReveal>

          <SectionReveal delay={0.1}>
            <GlassCard glow className="overflow-hidden p-2">
              <MiniGlobe />
            </GlassCard>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
