import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Menu, X } from "lucide-react";
import { cn } from "../../utils/cn";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { scrollToId } from "../../utils/scroll";
import { Button } from "./Button";

const links = [
  { href: "#problem", label: "Problem" },
  { href: "#architecture", label: "Architecture" },
  { href: "#sensors", label: "Sensors" },
  { href: "#ai", label: "AI" },
  { href: "#platform", label: "Platform" },
  { href: "#dashboard", label: "Dashboard" },
  { href: "#eri", label: "ERI" },
  { href: "#live-network", label: "Live Network" },
  { href: "#pricing", label: "Pricing" },
];

function useLenisScroll() {
  return (id: string) => scrollToId(id, -80);
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const scrollTo = useLenisScroll();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const ids = links.map((l) => l.href.slice(1));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(`#${entry.target.id}`);
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    scrollTo(id);
  };

  return (
    <motion.header
      initial={reducedMotion ? undefined : { y: -40, opacity: 0 }}
      animate={reducedMotion ? undefined : { y: 0, opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6"
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between rounded-full px-4 py-2.5 transition-all duration-500 sm:px-6",
          "relative",
          scrolled
            ? "glass-strong shadow-[0_10px_40px_-20px_rgba(0,0,0,0.8)]"
            : "bg-transparent"
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-8 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-pern-primary/50 to-transparent transition-opacity duration-500",
            scrolled ? "opacity-100" : "opacity-0"
          )}
        />
        <a href="#hero" onClick={(e) => { e.preventDefault(); go("hero"); }} className="flex items-center gap-2.5" data-cursor="hover">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pern-primary/15 text-pern-primary ring-1 ring-pern-primary/30">
            <Activity className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            PERN
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => { e.preventDefault(); go(l.href.slice(1)); }}
              data-cursor="hover"
              className={cn(
                "relative rounded-full px-3 py-1.5 text-sm transition",
                active === l.href
                  ? "bg-pern-primary/10 text-pern-primary shadow-[inset_0_0_0_1px_rgba(0,212,170,0.25)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              {active === l.href && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-pern-primary shadow-[0_0_6px_rgba(0,212,170,0.9)]" />
              )}
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <Button
            variant="secondary"
            size="md"
            onClick={() => go("cta")}
          >
            Request Pilot
          </Button>
        </div>

        <button
          ref={menuBtnRef}
          className="glass flex h-11 w-11 items-center justify-center rounded-full lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          data-cursor="hover"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="glass-strong mx-auto mt-2 max-w-7xl rounded-3xl p-4 lg:hidden"
        >
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={(e) => { e.preventDefault(); go(l.href.slice(1)); }}
                className="rounded-2xl px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <Button
              className="mt-2 w-full"
              onClick={() => go("cta")}
            >
              Request Pilot
            </Button>
          </div>
        </div>
      )}
    </motion.header>
  );
}
