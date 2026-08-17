import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { securityFeatures } from "../../data/content";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";

export function Security() {
  return (
    <section id="security" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <SectionReveal className="mb-12 text-center">
          <SectionHeader
            align="center"
            number="12"
            eyebrow={
              <>
                <Shield className="h-3.5 w-3.5 text-pern-primary" />
                Fortress-Grade by Default
              </>
            }
            title="Security & Trust"
            description="Every layer of PERN is hardened — from OIDC identity to parameterized SQL and audited administrative actions."
          />
        </SectionReveal>

        <SectionReveal>
          <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-3">
            {securityFeatures.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ scale: 0.85, y: 20 }}
                whileInView={{ scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 220 }}
                whileHover={{ y: -6, scale: 1.04 }}
                className="glass glass-glow group relative flex h-[140px] w-[140px] flex-col items-center justify-center rounded-[1.75rem] p-4 text-center sm:h-[150px] sm:w-[150px]"
                style={{
                  clipPath:
                    "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
                }}
              >
                <div className="text-xs font-semibold text-white sm:text-sm">
                  {f.title}
                </div>
                <div className="mt-1 text-[10px] leading-snug text-slate-400 sm:text-xs">
                  {f.description}
                </div>
              </motion.div>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
