import { memo, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

const MAX_LINES = 120;
const LINE_THRESHOLD = 2.8;

function Particles({
  count,
  speed = 1,
  linesRef,
}: {
  count: number;
  speed?: number;
  linesRef: React.MutableRefObject<THREE.BufferGeometry | null>;
}) {
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

    // Update connection lines
    const lineGeo = linesRef.current;
    if (lineGeo) {
      const linePos = lineGeo.attributes.position.array as Float32Array;
      const lineCol = lineGeo.attributes.color.array as Float32Array;
      let lineIdx = 0;
      const step = Math.max(1, Math.floor(count / 100));
      for (let i = 0; i < count && lineIdx < MAX_LINES; i += step) {
        for (let j = i + step; j < count && lineIdx < MAX_LINES; j += step) {
          const dx = pos[i * 3] - pos[j * 3];
          const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < LINE_THRESHOLD) {
            const alpha = 1 - dist / LINE_THRESHOLD;
            linePos[lineIdx * 6] = pos[i * 3];
            linePos[lineIdx * 6 + 1] = pos[i * 3 + 1];
            linePos[lineIdx * 6 + 2] = pos[i * 3 + 2];
            linePos[lineIdx * 6 + 3] = pos[j * 3];
            linePos[lineIdx * 6 + 4] = pos[j * 3 + 1];
            linePos[lineIdx * 6 + 5] = pos[j * 3 + 2];
            lineCol[lineIdx * 6] = 0;
            lineCol[lineIdx * 6 + 1] = 0.83 * alpha;
            lineCol[lineIdx * 6 + 2] = 0.67 * alpha;
            lineCol[lineIdx * 6 + 3] = 0;
            lineCol[lineIdx * 6 + 4] = 0.83 * alpha;
            lineCol[lineIdx * 6 + 5] = 0.67 * alpha;
            lineIdx++;
          }
        }
      }
      // Clear remaining lines
      for (let i = lineIdx; i < MAX_LINES; i++) {
        linePos[i * 6] = 0;
        linePos[i * 6 + 1] = 0;
        linePos[i * 6 + 2] = 0;
        linePos[i * 6 + 3] = 0;
        linePos[i * 6 + 4] = 0;
        linePos[i * 6 + 5] = 0;
        lineCol[i * 6] = 0;
        lineCol[i * 6 + 1] = 0;
        lineCol[i * 6 + 2] = 0;
        lineCol[i * 6 + 3] = 0;
        lineCol[i * 6 + 4] = 0;
        lineCol[i * 6 + 5] = 0;
      }
      lineGeo.attributes.position.needsUpdate = true;
      lineGeo.attributes.color.needsUpdate = true;
    }
  });

  return (
    <>
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
      <ConnectionLines linesRef={linesRef} />
    </>
  );
}

function ConnectionLines({
  linesRef,
}: {
  linesRef: React.MutableRefObject<THREE.BufferGeometry | null>;
}) {
  const linePositions = useMemo(() => new Float32Array(MAX_LINES * 6), []);
  const lineColors = useMemo(() => new Float32Array(MAX_LINES * 6), []);

  return (
    <lineSegments>
      <bufferGeometry ref={(g) => { linesRef.current = g; }}>
        <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        <bufferAttribute attach="attributes-color" args={[lineColors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
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
  const linesRef = useRef<THREE.BufferGeometry | null>(null);

  return (
    <div ref={ref} className="absolute inset-0 -z-10">
      {warm && (
        <Canvas
          frameloop={reducedMotion || !inView ? "never" : "always"}
          dpr={[1, 1.1]}
          camera={{ position: [0, 0, 6], fov: 50 }}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        >
          <Particles count={count} speed={denser ? 1.6 : 1} linesRef={linesRef} />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
