import { useEffect, useState } from "react";
import { useMotionValue, useSpring, useMotionValueEvent } from "framer-motion";

export function useCountUp(target: number, enabled = true, duration = 1.6) {
  const [display, setDisplay] = useState(0);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    stiffness: 60,
    damping: 18,
    duration: duration * 1000,
  });

  useMotionValueEvent(spring, "change", (v) => {
    setDisplay(Math.round(v));
  });

  useEffect(() => {
    if (enabled) {
      motionValue.set(target);
    } else {
      motionValue.set(0);
      setDisplay(0);
    }
  }, [enabled, target, motionValue]);

  return display;
}
