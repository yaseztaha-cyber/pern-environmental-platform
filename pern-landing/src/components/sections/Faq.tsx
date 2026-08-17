import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, Plus } from "lucide-react";
import { faqs } from "../../data/content";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { cn } from "../../utils/cn";

function FaqItem({
  faq,
  open,
  onToggle,
  index,
}: {
  faq: { q: string; a: string };
  open: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <div className="glass overflow-hidden rounded-2xl transition-colors hover:border-white/15">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`faq-panel-${index}`}
        id={`faq-button-${index}`}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
        data-cursor="hover"
      >
        <span className="text-sm font-medium text-white sm:text-base">
          {faq.q}
        </span>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-transform duration-300",
            open && "rotate-45 border-pern-primary/40 text-pern-primary"
          )}
        >
          <Plus className="h-4 w-4" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`faq-panel-${index}`}
            role="region"
            aria-labelledby={`faq-button-${index}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm leading-relaxed text-slate-400 sm:px-6">
              {faq.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-3xl">
        <SectionReveal className="mb-12 text-center">
          <SectionHeader
            align="center"
            number="14"
            eyebrow={
              <>
                <HelpCircle className="h-3.5 w-3.5 text-pern-primary" />
                Answers
              </>
            }
            title="Frequently Asked Questions"
            description="Everything you need to know before deploying your first PERN node."
          />
        </SectionReveal>

        <SectionReveal>
          <div className="flex flex-col gap-3">
            {faqs.map((faq, i) => (
              <FaqItem
                key={faq.q}
                faq={faq}
                index={i}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
