import { motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useRef, useState } from "react";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });
  const [pct, setPct] = useState(0);
  const lastPct = useRef(-1);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const rounded = Math.round(v * 100);
    if (rounded !== lastPct.current) {
      lastPct.current = rounded;
      setPct(rounded);
    }
  });

  return (
    <>
      <motion.div
        className="fixed left-0 top-0 z-[70] h-[3px] w-full origin-left bg-gradient-to-r from-pern-primary via-[#22d3ee] to-pern-primary"
        style={{ scaleX, boxShadow: "0 0 12px rgba(0,212,170,0.6)" }}
      />
      <div className="eyebrow pointer-events-none fixed right-3 top-3 z-[70] hidden text-[9px] text-teal-300/50 md:block">
        {String(pct).padStart(2, "0")}%
      </div>
    </>
  );
}
