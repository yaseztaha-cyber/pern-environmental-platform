import { memo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

function ParticleHalo({ color, chaos }: { color: string; chaos: number }) {
  const ref = useRef<THREE.Points>(null);
  const count = 120;
  const base = useRef<Float32Array | null>(null);
  const phaseS = useRef<Float32Array | null>(null);
  const phaseC = useRef<Float32Array | null>(null);
  if (!base.current || !phaseS.current || !phaseC.current) {
    base.current = new Float32Array(count * 3);
    phaseS.current = new Float32Array(count);
    phaseC.current = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 0.95 + Math.random() * 0.55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      base.current[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      base.current[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      base.current[i * 3 + 2] = r * Math.cos(phi);
      phaseS.current[i] = Math.sin(i * 0.5);
      phaseC.current[i] = Math.cos(i * 0.5);
    }
  }

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    const b = base.current!;
    const ps = phaseS.current!;
    const pc = phaseC.current!;
    const sT = Math.sin(t);
    const cT = Math.cos(t);
    const sX = Math.sin(t * (1.2 + chaos));
    const cX = Math.cos(t * (1.2 + chaos));
    const sB = Math.sin(t * 0.8);
    const cB = Math.cos(t * 0.8);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const j = chaos * 0.1 * (sX * pc[i] + cX * ps[i]);
      pos[i3] = b[i3] + j;
      pos[i3 + 1] = b[i3 + 1] + j * (cT * pc[i] - sT * ps[i]);
      pos[i3 + 2] = b[i3 + 2] + j * (sB * pc[i] + cB * ps[i]);
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
    ref.current.rotation.y = t * (0.12 + chaos * 0.2);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[base.current.slice(), 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.03}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

function SphereGroup({
  position,
  color,
  chaos,
}: {
  position: [number, number, number];
  color: string;
  chaos: number;
}) {
  const inner = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!inner.current) return;
    const t = state.clock.elapsedTime;
    inner.current.scale.setScalar(
      1 + Math.sin(t * (1 + chaos) + chaos * 3) * 0.045
    );
  });

  return (
    <Float speed={1 + chaos} floatIntensity={0.25 + chaos * 0.2}>
      <group ref={inner} position={position}>
        <Sphere args={[0.85, 32, 32]}>
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.32}
            roughness={0.3}
            metalness={0.1}
            emissive={color}
            emissiveIntensity={0.45}
          />
        </Sphere>
        <Sphere args={[0.32, 16, 16]}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </Sphere>
        <ParticleHalo color={color} chaos={chaos} />
        <pointLight color={color} intensity={1.4} distance={4} />
      </group>
    </Float>
  );
}

export const ERISpheres = memo(function ERISpheres() {
  const ref = useDomRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "400px", 2000);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div ref={ref} className="h-[300px] w-full sm:h-[420px]">
      {warm && (
        <Canvas
          frameloop={reducedMotion || !inView ? "never" : "always"}
          dpr={[1, 1.25]}
          camera={{
            position: [0, 0.4, isMobile ? 9 : 7],
            fov: 40,
          }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.35} />
          <SphereGroup
            position={isMobile ? [-2.2, 0, 0] : [-2.8, 0, 0]}
            color="#10B981"
            chaos={0.2}
          />
          <SphereGroup position={[0, 0.15, 0]} color="#F59E0B" chaos={0.7} />
          <SphereGroup
            position={isMobile ? [2.2, 0, 0] : [2.8, 0, 0]}
            color="#EF4444"
            chaos={1.4}
          />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
