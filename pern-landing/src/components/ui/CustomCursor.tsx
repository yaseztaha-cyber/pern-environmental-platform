import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export function CustomCursor() {
  const isFine = useMediaQuery("(pointer: fine)");
  const [hovering, setHovering] = useState(false);
  const [visible, setVisible] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 400, damping: 35, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 400, damping: 35, mass: 0.4 });
  const rx = useSpring(x, { stiffness: 90, damping: 20, mass: 0.6 });
  const ry = useSpring(y, { stiffness: 90, damping: 20, mass: 0.6 });

  useEffect(() => {
    if (!isFine) return;

    document.body.classList.add("custom-cursor-active");

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
    };

    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const interactive = t.closest(
        "a, button, [data-cursor='hover'], input, textarea, select, label"
      );
      setHovering(Boolean(interactive));
    };

    const leave = () => setVisible(false);

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseover", over);
    document.addEventListener("mouseleave", leave);

    return () => {
      document.body.classList.remove("custom-cursor-active");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseover", over);
      document.removeEventListener("mouseleave", leave);
    };
  }, [isFine, x, y]);

  if (!isFine) return null;

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[9998]"
        style={{ x: rx, y: ry, translateX: "-50%", translateY: "-50%" }}
      >
        <motion.div
          animate={{
            width: hovering ? 58 : 30,
            height: hovering ? 58 : 30,
            opacity: visible ? 0.9 : 0,
            borderWidth: hovering ? 1 : 1,
          }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="rounded-full border border-teal-300/25 shadow-[0_0_30px_rgba(0,212,170,0.18)]"
        />
      </motion.div>
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[9999] mix-blend-difference"
        style={{ x: sx, y: sy, translateX: "-50%", translateY: "-50%" }}
      >
        <motion.div
          animate={{
            width: hovering ? 44 : 10,
            height: hovering ? 44 : 10,
            opacity: visible ? 1 : 0,
            borderWidth: hovering ? 1 : 0,
            backgroundColor: hovering
              ? "rgba(0,212,170,0.08)"
              : "rgba(0,212,170,0.95)",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="rounded-full border border-teal-300/50 shadow-[0_0_20px_rgba(0,212,170,0.45)]"
        />
      </motion.div>
    </>
  );
}
