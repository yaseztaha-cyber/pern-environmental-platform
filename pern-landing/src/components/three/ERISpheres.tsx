import { memo, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

function makeGlowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.8)");
  g.addColorStop(0.5, "rgba(255,255,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

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

function OrbitRing({ color, radius, tilt }: { color: string; radius: number; tilt: [number, number, number] }) {
  const ref = useRef<THREE.Line>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.z = state.clock.elapsedTime * 0.15;
  });
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    return pts;
  }, [radius]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [points]);
  return (
    <line ref={ref as never} geometry={geo} rotation={tilt}>
      <lineBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} />
    </line>
  );
}

function SphereGroup({
  position,
  color,
  chaos,
  glowTex,
}: {
  position: [number, number, number];
  color: string;
  chaos: number;
  glowTex: THREE.CanvasTexture | null;
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
        {glowTex && (
          <sprite scale={[0.9, 0.9, 1]}>
            <spriteMaterial
              map={glowTex}
              color={color}
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        )}
        <OrbitRing color={color} radius={1.3} tilt={[1.2, chaos * 0.5, 0]} />
        <OrbitRing color={color} radius={1.6} tilt={[0.8, 0.3 + chaos * 0.3, 0.5]} />
        <ParticleHalo color={color} chaos={chaos} />
        <pointLight color={color} intensity={1.4} distance={4} />
      </group>
    </Float>
  );
}

function ConnectingArcs({ positions }: { positions: [number, number, number][] }) {
  const linesRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!linesRef.current) return;
    const t = state.clock.elapsedTime;
    linesRef.current.children.forEach((child, i) => {
      const mat = (child as THREE.Line).material as THREE.LineBasicMaterial;
      mat.opacity = 0.08 + Math.sin(t * 0.5 + i * 1.2) * 0.06;
    });
  });

  const arcs = useMemo(() => {
    const result: { points: Float32Array; color: string }[] = [];
    const colors = ["#00D4AA", "#F59E0B", "#0EA5E9"];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const [x1, y1, z1] = positions[i];
        const [x2, y2, z2] = positions[j];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2 + 1.2;
        const mz = (z1 + z2) / 2;
        const pts: number[] = [];
        for (let k = 0; k <= 40; k++) {
          const t = k / 40;
          const u = 1 - t;
          pts.push(
            u * u * x1 + 2 * u * t * mx + t * t * x2,
            u * u * y1 + 2 * u * t * my + t * t * y2,
            u * u * z1 + 2 * u * t * mz + t * t * z2
          );
        }
        result.push({
          points: new Float32Array(pts),
          color: colors[(i + j) % colors.length],
        });
      }
    }
    return result;
  }, [positions]);

  return (
    <group ref={linesRef}>
      {arcs.map((arc, i) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(arc.points, 3));
        return (
          <line key={i} geometry={g}>
            <lineBasicMaterial
              color={arc.color}
              transparent
              opacity={0.1}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
        );
      })}
    </group>
  );
}

export const ERISpheres = memo(function ERISpheres() {
  const ref = useDomRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "400px", 2000);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const reducedMotion = usePrefersReducedMotion();
  const glowTex = useMemo(makeGlowTexture, []);

  const spherePositions: [number, number, number][] = useMemo(
    () => [
      isMobile ? [-2.2, 0, 0] : [-2.8, 0, 0],
      [0, 0.15, 0],
      isMobile ? [2.2, 0, 0] : [2.8, 0, 0],
    ],
    [isMobile]
  );

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
            position={spherePositions[0]}
            color="#10B981"
            chaos={0.2}
            glowTex={glowTex}
          />
          <SphereGroup position={spherePositions[1]} color="#F59E0B" chaos={0.7} glowTex={glowTex} />
          <SphereGroup
            position={spherePositions[2]}
            color="#EF4444"
            chaos={1.4}
            glowTex={glowTex}
          />
          <ConnectingArcs positions={spherePositions} />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
