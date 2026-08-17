import { useEffect, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { useLenis } from "./hooks/useLenis";
import { CustomCursor } from "./components/ui/CustomCursor";
import { Nav } from "./components/ui/Nav";
import { ScrollProgress } from "./components/ui/ScrollProgress";
import { Marquee } from "./components/ui/Marquee";
import { Hero } from "./components/sections/Hero";
import { Problem } from "./components/sections/Problem";
import { Architecture } from "./components/sections/Architecture";
import { Sensors } from "./components/sections/Sensors";
import { AI } from "./components/sections/AI";
import { Platform } from "./components/sections/Platform";
import { Dashboard } from "./components/sections/Dashboard";
import { ERI } from "./components/sections/ERI";
import { LiveNetwork } from "./components/sections/LiveNetwork";
import { GlobalData } from "./components/sections/GlobalData";
import { Hardware } from "./components/sections/Hardware";
import { Showcase } from "./components/sections/Showcase";
import { Security } from "./components/sections/Security";
import { Team } from "./components/sections/Team";
import { Faq } from "./components/sections/Faq";
import { Pricing } from "./components/sections/Pricing";
import { CTAFooter } from "./components/sections/CTAFooter";

export default function App() {
  useLenis();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), 350);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="noise-overlay relative min-h-screen bg-[radial-gradient(ellipse_at_top,#0B1120_0%,#020617_100%)] text-pern-text">
      <a
        href="#main"
        className="fixed left-4 top-4 z-[200] -translate-y-24 rounded-full bg-pern-primary px-4 py-2 text-sm font-semibold text-slate-950 transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <CustomCursor />
      <ScrollProgress />

      <div aria-hidden className="aurora-bg">
        <div className="aurora-blob aurora-blob-a" />
        <div className="aurora-blob aurora-blob-b" />
        <div className="aurora-blob aurora-blob-c" />
      </div>
      <div aria-hidden className="grid-overlay" />
      <div aria-hidden className="vignette" />

      <AnimatePresence>
        {booting && (
          <motion.div
            role="status"
            aria-label="Loading"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="flex flex-col items-center gap-3">
              <span className="eyebrow text-xs text-teal-300">
                PERN // Predictive Environmental Risk Network
              </span>
              <motion.span
                className="h-px w-40 overflow-hidden bg-white/10"
                initial={{ width: 0 }}
                animate={{ width: 160 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Nav />
      <main id="main" className="relative z-[2]">
        <Hero />
        <Marquee />
        <Problem />
        <Architecture />
        <Sensors />
        <AI />
        <Platform />
        <Dashboard />
        <ERI />
        <GlobalData />
        <LiveNetwork />
        <Hardware />
        <Showcase />
        <Security />
        <Team />
        <Faq />
        <Pricing />
        <CTAFooter />
      </main>
      </div>
    </MotionConfig>
  );
}
