import { useEffect, useState, type RefObject } from "react";
import { useInView } from "framer-motion";

export function useSceneGate(
  ref: RefObject<HTMLElement | null>,
  margin = "100px",
  warmDelay = 2000
) {
  const inView = useInView(
    ref,
    { margin } as Parameters<typeof useInView>[1]
  );
  const [entered, setEntered] = useState(false);
  const [warm, setWarm] = useState(false);

  useEffect(() => {
    if (inView) setEntered(true);
  }, [inView]);

  useEffect(() => {
    const t = window.setTimeout(() => setWarm(true), warmDelay);
    return () => window.clearTimeout(t);
  }, [warmDelay]);

  return { inView, entered, warm };
}
