import { motion } from "framer-motion";
import { Check, Sparkles, Wallet } from "lucide-react";
import { pricingTiers } from "../../data/content";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { Button } from "../ui/Button";
import { scrollToId } from "../../utils/scroll";
import { cn } from "../../utils/cn";

export function Pricing() {
  return (
    <section id="pricing" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-6xl">
        <SectionReveal className="mb-14 text-center">
          <SectionHeader
            align="center"
            number="15"
            eyebrow={
              <>
                <Wallet className="h-3.5 w-3.5 text-pern-primary" />
                Simple, Honest Pricing
              </>
            }
            title="Pick Your Scale"
            description="Start with a pilot. Grow to a district. Scale to an enterprise. Every tier includes the full sensor pipeline and AI forecasting."
          />
        </SectionReveal>

        <div className="grid gap-5 md:grid-cols-3">
          {pricingTiers.map((tier, i) => (
            <SectionReveal key={tier.name} delay={i * 0.08} className="h-full">
              <motion.div
                whileHover={{ y: -8 }}
                transition={{ type: "spring", stiffness: 220, damping: 20 }}
                className={cn(
                  "card-lift relative flex h-full flex-col rounded-[1.75rem] p-6 sm:p-7",
                  tier.highlight
                    ? "conic-border glass-strong text-white shadow-[0_0_60px_-20px_rgba(0,212,170,0.5)]"
                    : "glass"
                )}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-pern-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-950">
                    <Sparkles className="h-3 w-3" />
                    Recommended
                  </span>
                )}

                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-display text-4xl font-bold text-white",
                      tier.highlight && "text-gradient"
                    )}
                  >
                    {tier.price}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {tier.cadence}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {tier.description}
                </p>

                <ul className="mt-6 flex flex-col gap-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={cn(
                          "mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full",
                          tier.highlight
                            ? "bg-pern-primary/20 text-pern-primary"
                            : "bg-white/5 text-slate-400"
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="text-slate-300">{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-7">
                  <Button
                    variant={tier.highlight ? "primary" : "secondary"}
                    className="w-full"
                    onClick={() => scrollToId("cta")}
                  >
                    {tier.highlight ? "Start a Pilot" : "Request Pricing"}
                  </Button>
                </div>
              </motion.div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
