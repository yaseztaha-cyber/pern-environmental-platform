import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

export function WarmFrame() {
  const advance = useThree((s) => s.advance);

  useEffect(() => {
    const raf = requestAnimationFrame(() => advance(performance.now()));
    return () => cancelAnimationFrame(raf);
  }, [advance]);

  return null;
}
