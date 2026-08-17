import { memo, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

function Particles({ count, speed = 1 }: { count: number; speed?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors, dirs } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const dirs = new Float32Array(count);
    const c1 = new THREE.Color("#00D4AA");
    const c2 = new THREE.Color("#0EA5E9");
    const c3 = new THREE.Color("#F59E0B");
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      dirs[i] = i % 2 === 0 ? 1 : -1;
    }
    return { positions, colors, dirs };
  }, [count]);

  useFrame((state, dt) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3 + 1] += dt * speed * (0.2 + (i % 5) * 0.05) * dirs[i];
      pos[i3] += Math.sin(t * 0.5 + i) * 0.0015;
      pos[i3 + 2] += Math.cos(t * 0.4 + i) * 0.0015;
      if (pos[i3 + 1] > 5) pos[i3 + 1] = -5;
      else if (pos[i3 + 1] < -5) pos[i3 + 1] = 5;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
    ref.current.rotation.y = t * 0.03 * speed;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.028}
        vertexColors
        transparent
        opacity={0.7}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export const ParticleField = memo(function ParticleField({
  denser = false,
}: {
  denser?: boolean;
}) {
  const ref = useDomRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "400px", 2800);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const reducedMotion = usePrefersReducedMotion();
  const count = isMobile ? 250 : denser ? 1400 : 900;

  return (
    <div ref={ref} className="absolute inset-0 -z-10">
      {warm && (
        <Canvas
          frameloop={reducedMotion || !inView ? "never" : "always"}
          dpr={[1, 1.1]}
          camera={{ position: [0, 0, 6], fov: 50 }}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        >
          <Particles count={count} speed={denser ? 1.6 : 1} />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
