import { Gauge } from "lucide-react";
import { ERISpheres } from "../three/ERISpheres";
import { eriValidation } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";

export function ERI() {
  return (
    <section id="eri" className="section-pad relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,212,170,0.06),transparent_55%)]" />
      <div className="relative mx-auto max-w-7xl">
        <SectionReveal className="mx-auto mb-8 max-w-3xl text-center">
          <SectionHeader
            align="center"
            number="07"
            eyebrow={
              <>
                <Gauge className="h-3.5 w-3.5 text-pern-primary" />
                One Number. Total Clarity.
              </>
            }
            title="The Environmental Risk Index"
            description="Six parameters. One score. Zero confusion. PERN fuses PM2.5, gas concentration, TDS, pH, temperature, and humidity into a single, color-coded index validated against WHO standards."
          />
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <ERISpheres />
          <div className="mx-auto mt-2 grid max-w-3xl grid-cols-3 gap-3 text-center text-xs sm:text-sm">
            <div>
              <div className="font-semibold text-emerald-400">Safe</div>
              <div className="text-slate-500">Clean particle flow</div>
            </div>
            <div>
              <div className="font-semibold text-amber-400">Warning</div>
              <div className="text-slate-500">Turbulent flow</div>
            </div>
            <div>
              <div className="font-semibold text-red-400">Critical</div>
              <div className="text-slate-500">Chaotic storm</div>
            </div>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.15} className="mt-10">
          <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
            {eriValidation.map((v) => (
              <GlassCard key={v} glow className="card-lift p-4 text-center text-sm text-slate-300">
                {v}
              </GlassCard>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
