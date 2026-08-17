import { useRef } from "react";
import { useInView } from "framer-motion";
import { useCountUp } from "../../hooks/useCountUp";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

const R = 28;
const C = 2 * Math.PI * R;

export function AnimatedGauge({
  value,
  color,
  size = 72,
}: {
  value: number;
  color: string;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const n = useCountUp(value, inView && !prefersReducedMotion());
  const offset = C - (n / 100) * C;

  return (
    <div ref={ref} className="shrink-0">
      <svg width={size} height={size} viewBox="0 0 72 72">
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          className="gauge-ring"
          transform="rotate(-90 36 36)"
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
        <text
          x="36"
          y="40"
          textAnchor="middle"
          fill="#F8FAFC"
          fontSize="12"
          fontWeight="600"
          fontFamily="JetBrains Mono, monospace"
        >
          {n}
        </text>
      </svg>
    </div>
  );
}
