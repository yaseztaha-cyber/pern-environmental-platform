import { memo, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

const CLEAN = new THREE.Color("#2DD4BF");
const MID = new THREE.Color("#F59E0B");
const BAD = new THREE.Color("#DC2626");

function isSmallScreen() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

function makeGlowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.6, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function OrbitRing({
  radius,
  color,
  speed = 0.15,
  tiltX = Math.PI / 2,
  tiltY = 0,
}: {
  radius: number;
  color: string;
  speed?: number;
  tiltX?: number;
  tiltY?: number;
}) {
  const ref = useRef<THREE.Line>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.z = state.clock.elapsedTime * speed;
  });
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [radius]);
  return (
    <line ref={ref as never} geometry={geo} rotation={[tiltX, tiltY, 0]}>
      <lineBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} />
    </line>
  );
}

function PulseRing({ baseRadius, color }: { baseRadius: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const cycle = (t * 0.4) % 1;
    const r = baseRadius + cycle * 1.5;
    ref.current.scale.setScalar(r);
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (1 - cycle) * 0.18;
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.97, 1.0, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function GlassOrb({
  progress,
  progressRef,
}: {
  progress: number;
  progressRef?: { current: number };
}) {
  const orb = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  const wire = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);
  const core = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const smog = useRef<THREE.Group>(null);
  const rim = useRef<THREE.Mesh>(null);
  const tmp = useRef(new THREE.Color());

  const glowTex = useMemo(makeGlowTexture, []);

  const count = useMemo(() => (isSmallScreen() ? 360 : 640), []);

  const particleData = useMemo(() => {
    const radii = new Float32Array(count);
    const thetas = new Float32Array(count);
    const phis = new Float32Array(count);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 0.3 + Math.pow(Math.random(), 1 / 3) * 1.05;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      radii[i] = r;
      thetas[i] = th;
      phis[i] = ph;
      speeds[i] = 0.12 + Math.random() * 0.5;
      phases[i] = Math.random() * Math.PI * 2;
      positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
      positions[i * 3 + 1] = r * Math.cos(ph);
      positions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    return { radii, thetas, phis, speeds, phases, positions };
  }, [count]);

  const smogConfig = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        theta: (i / 3) * Math.PI * 2 + 0.6,
        tilt: -0.6 + i * 0.6,
        radius: 1.7 + (i % 2) * 0.45,
        scale: 1.1 + (i % 2) * 0.5,
        speed: 0.05 + i * 0.02,
      })),
    []
  );

  useFrame((state, delta) => {
    const p = progressRef?.current ?? progress;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    const mat = tmp.current;
    mat.copy(CLEAN).lerp(MID, Math.min(1, p * 2));
    mat.lerp(BAD, Math.max(0, (p - 0.5) * 2));

    if (orb.current) {
      const g = orb.current;
      g.rotation.y = t * 0.1;
      g.rotation.x = 0.12 + state.pointer.y * 0.16;
      g.rotation.z = state.pointer.x * 0.1;
      g.position.y = Math.sin(t * 0.5) * 0.05;
    }

    if (points.current) {
      const { radii, thetas, phis, speeds, phases, positions } = particleData;
      for (let i = 0; i < count; i++) {
        const r =
          radii[i] * (1 + 0.12 * Math.sin(t * 0.7 + phases[i])) * (1 + 0.55 * p);
        const az = thetas[i] + t * speeds[i] * (1 + p * 1.5);
        const el = phis[i] + 0.16 * Math.sin(t * 0.45 + phases[i]);
        const sr = Math.sin(el);
        positions[i * 3] = r * sr * Math.cos(az);
        positions[i * 3 + 1] = r * Math.cos(el) * 0.92;
        positions[i * 3 + 2] = r * sr * Math.sin(az);
      }
      const attr = (
        points.current.geometry as THREE.BufferGeometry
      ).attributes.position;
      attr.needsUpdate = true;
      const pm = points.current.material as THREE.PointsMaterial;
      pm.color.copy(mat);
      pm.size = 0.085 + p * 0.03;
      pm.opacity = 0.55 + p * 0.35;
    }

    if (shell.current) {
      const sm = shell.current.material as THREE.MeshPhysicalMaterial;
      sm.opacity = 0.16 - p * 0.05;
      sm.color.copy(CLEAN).lerp(BAD, p * 0.5);
    }
    if (wire.current) {
      const wm = wire.current.material as THREE.MeshBasicMaterial;
      wm.opacity = 0.05 + p * 0.1;
      wm.color.copy(mat);
    }

    // Fresnel rim
    if (rim.current) {
      const rm = rim.current.material as THREE.MeshBasicMaterial;
      rm.opacity = 0.12 + p * 0.15;
      rm.color.copy(mat).multiplyScalar(1.4);
    }

    if (core.current) {
      core.current.material.color.copy(mat);
      core.current.material.opacity = 0.55 + p * 0.4;
      core.current.scale.setScalar(1.15 + p * 0.55);
    }

    if (halo.current) {
      halo.current.material.color.copy(mat).multiplyScalar(0.85);
      halo.current.material.opacity = 0.22 + p * 0.4;
      halo.current.scale.setScalar(3.1 + p * 1.5);
      halo.current.material.rotation += dt * 0.04;
    }

    if (smog.current) {
      const kids = smog.current.children;
      for (let i = 0; i < kids.length && i < smogConfig.length; i++) {
        const sp = kids[i] as THREE.Sprite;
        const cfg = smogConfig[i];
        const a = t * cfg.speed;
        sp.position.set(
          Math.cos(cfg.theta + a) * cfg.radius,
          Math.sin(a * 0.7) * 0.4 + cfg.tilt,
          Math.sin(cfg.theta + a) * cfg.radius
        );
        const sm = sp.material as THREE.SpriteMaterial;
        sm.opacity = p * (0.28 + i * 0.08);
        sm.color.copy(BAD).lerp(MID, 0.5 + Math.sin(a) * 0.2);
        sp.scale.setScalar(cfg.scale * (0.85 + p * 0.9));
      }
    }
  });

  return (
    <group ref={orb}>
      <mesh ref={shell}>
        <sphereGeometry args={[1.42, 48, 48]} />
        <meshPhysicalMaterial
          color="#BFE8FF"
          transparent
          opacity={0.16}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
      <mesh ref={wire}>
        <sphereGeometry args={[1.428, 24, 18]} />
        <meshBasicMaterial
          wireframe
          color="#2DD4BF"
          transparent
          opacity={0.06}
          depthWrite={false}
        />
      </mesh>

      {/* Fresnel rim sphere */}
      <mesh ref={rim}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial
          color="#2DD4BF"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Orbit rings */}
      <OrbitRing radius={1.8} color="#2DD4BF" tiltX={1.3} tiltY={0.2} />
      <OrbitRing radius={2.1} color="#0EA5E9" speed={-0.1} tiltX={0.9} tiltY={0.5} />
      <OrbitRing radius={2.4} color="#A78BFA" speed={0.08} tiltX={1.5} tiltY={-0.3} />

      {/* Pulse rings */}
      <PulseRing baseRadius={1.5} color="#2DD4BF" />
      <PulseRing baseRadius={1.5} color="#0EA5E9" />

      <sprite ref={halo}>
        <spriteMaterial
          map={glowTex}
          color="#2DD4BF"
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particleData.positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          map={glowTex}
          color="#2DD4BF"
          size={0.085}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
      <sprite ref={core}>
        <spriteMaterial
          map={glowTex}
          color="#2DD4BF"
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <group ref={smog}>
        {smogConfig.map((_, i) => (
          <sprite key={i}>
            <spriteMaterial
              map={glowTex}
              color="#DC2626"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
}

export const GlassOrbScene = memo(function GlassOrbScene({
  progress,
  progressRef,
}: {
  progress: number;
  progressRef?: { current: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "400px", 1600);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div ref={ref} className="relative h-full min-h-[280px] w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div
          className="h-56 w-56 rounded-full sm:h-72 sm:w-72"
          style={{
            background:
              "radial-gradient(circle at 34% 30%, rgba(45,212,191,0.4), rgba(6,78,59,0.28) 46%, rgba(2,6,23,0) 72%)",
            boxShadow:
              "0 0 80px 10px rgba(45,212,191,0.12), inset 0 0 40px rgba(45,212,191,0.08)",
          }}
        />
      </div>

      {warm && (
        <Canvas
          frameloop={reducedMotion || !inView ? "never" : "always"}
          dpr={[1, 1.25]}
          camera={{ position: [0, 0.4, 5.2], fov: 42 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 4, 5]} intensity={1.3} />
          <pointLight position={[-3, -2, 2]} intensity={1.0} color="#00D4AA" />
          <pointLight position={[3, -1, -2]} intensity={0.9} color="#DC2626" />
          <GlassOrb progress={progress} progressRef={progressRef} />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
