import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "../../utils/cn";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "header" | "footer";
  id?: string;
};

export function SectionReveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  id,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.from(el, {
        y: 60,
        opacity: 0,
        rotateX: 10,
        filter: "blur(6px)",
        duration: 0.9,
        delay,
        ease: "power3.out",
        clearProps: "filter",
        immediateRender: false,
        scrollTrigger: {
          trigger: el,
          start: "top 92%",
          once: true,
        },
      });
    }, el);

    return () => ctx.revert();
  }, [delay]);

  return (
    <Tag
      id={id}
      ref={ref as never}
      className={cn("origin-top", className)}
      style={{ perspective: 1000 }}
    >
      {children}
    </Tag>
  );
}
