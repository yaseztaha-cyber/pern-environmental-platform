import { memo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { physicalSensors, sparklineData } from "../../data/content";
import { Sparkline } from "../ui/Sparkline";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

const categoryColor: Record<string, string> = {
  water: "#0EA5E9",
  air: "#00D4AA",
  soil: "#F59E0B",
  light: "#A78BFA",
};

const RING_R = 3.2;
const COUNT = physicalSensors.length;

function ringAngle(i: number) {
  return (i / COUNT) * Math.PI * 2;
}

function CardHtml({
  sensor,
  index,
  color,
  diff,
}: {
  sensor: (typeof physicalSensors)[number];
  index: number;
  color: string;
  diff: number;
}) {
  const showDetail = diff > 0.55;
  return (
    <div
      style={{
        width: 176,
        padding: "13px 16px 15px",
        borderRadius: 20,
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.045) 45%, rgba(2,6,23,0.22))",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: `0 22px 60px -22px rgba(2,6,23,0.75), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 40px ${color}26`,
        color: "#F8FAFC",
        fontFamily: "Inter, sans-serif",
        position: "relative",
        overflow: "hidden",
        opacity: 0.06 + Math.pow(diff, 1.7) * 0.94,
        transform: `scale(${0.66 + diff * 0.5})`,
        transformOrigin: "center center",
        transition: "opacity 0.6s ease, transform 0.6s ease",
        willChange: "opacity, transform",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 14,
          right: 14,
          height: 2,
          borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${color}bb, transparent)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          borderRadius: 20,
          background: `radial-gradient(120% 90% at 18% 0%, ${color}14, transparent 55%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: "#E2E8F0",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              background: color,
              boxShadow: `0 0 10px ${color}`,
            }}
          />
          {sensor.category}
        </span>
        <span
          style={{
            fontSize: 9,
            color: "rgba(226,232,240,0.55)",
            fontFamily: "JetBrains Mono, monospace",
            letterSpacing: "0.1em",
          }}
        >
          {String(index + 1).padStart(2, "0")}
          <span style={{ color: "rgba(226,232,240,0.3)" }}>/14</span>
        </span>
      </div>
      <div
        style={{
          position: "relative",
          fontSize: 16,
          fontWeight: 700,
          marginTop: 5,
          letterSpacing: "-0.01em",
        }}
      >
        {sensor.name}
      </div>
      <div
        style={{
          position: "relative",
          fontSize: 11,
          color: "rgba(203,213,225,0.75)",
          marginTop: 2,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {sensor.unit} · Safe {sensor.range}
      </div>
      {showDetail && (
        <div style={{ position: "relative", marginTop: 9, height: 38 }}>
          <Sparkline data={sparklineData(index + 3)} color={color} height={38} />
        </div>
      )}
    </div>
  );
}

function OrbitRing() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[3.12, 3.22, 128]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function CenterCore() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(t * 1.4) * 0.2);
    if (mat.current) mat.current.opacity = 0.5 + Math.sin(t * 1.4) * 0.2;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0]}>
      <icosahedronGeometry args={[0.18, 1]} />
      <meshBasicMaterial
        ref={mat}
        color="#00D4AA"
        transparent
        opacity={0.5}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function Spokes() {
  const linesRef = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(COUNT * 6), 3)
    );
    return g;
  }, []);

  useFrame(() => {
    if (!linesRef.current) return;
    const arr = linesRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const a = ringAngle(i);
      const i6 = i * 6;
      arr[i6] = 0;
      arr[i6 + 1] = 0;
      arr[i6 + 2] = 0;
      arr[i6 + 3] = Math.cos(a) * RING_R;
      arr[i6 + 4] = 0.18;
      arr[i6 + 5] = Math.sin(a) * RING_R;
    }
    linesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <lineSegments ref={linesRef} geometry={geo}>
      <lineBasicMaterial
        color="#00D4AA"
        transparent
        opacity={0.12}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

function AmbientParticles() {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => {
    const count = 120;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c1 = new THREE.Color("#00D4AA");
    const c2 = new THREE.Color("#0EA5E9");
    const c3 = new THREE.Color("#F59E0B");
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      const c = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, []);

  useFrame((state, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.02;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 120; i++) {
      pos[i * 3 + 1] += Math.sin(state.clock.elapsedTime * 0.3 + i) * 0.0008;
      if (pos[i * 3 + 1] > 2) pos[i * 3 + 1] = -2;
      else if (pos[i * 3 + 1] < -2) pos[i * 3 + 1] = 2;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        vertexColors
        transparent
        opacity={0.5}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Carousel({ auto }: { auto: boolean }) {
  const group = useRef<THREE.Group>(null);
  const drag = useRef({ active: false, startX: 0, rot: 0, current: 0 });
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  const reducedMotion = usePrefersReducedMotion();

  useFrame((state, dt) => {
    if (!group.current) return;
    if (drag.current.active) {
      group.current.rotation.y = drag.current.current;
    } else {
      if (auto && !reducedMotion) drag.current.current += dt * 0.16;
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        drag.current.current,
        0.08
      );
    }
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      state.pointer.y * 0.04,
      0.04
    );

    const rot = group.current.rotation.y;
    let best = frontRef.current;
    let bestZ = -Infinity;
    for (let i = 0; i < COUNT; i++) {
      const z = Math.sin(ringAngle(i) + rot) * RING_R;
      if (z > bestZ) {
        bestZ = z;
        best = i;
      }
    }
    if (best !== frontRef.current) {
      frontRef.current = best;
      setFront(best);
    }
  });

  const frontAngle = ringAngle(front);

  return (
    <group
      ref={group}
      onPointerDown={(e) => {
        drag.current.active = true;
        drag.current.startX = e.clientX;
        drag.current.rot = drag.current.current;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerUp={() => {
        drag.current.active = false;
      }}
      onPointerCancel={() => {
        drag.current.active = false;
      }}
      onPointerMove={(e) => {
        if (!drag.current.active) return;
        const dx = e.clientX - drag.current.startX;
        drag.current.current = drag.current.rot + dx * 0.006;
      }}
    >
      {physicalSensors.map((sensor, i) => {
        const a = ringAngle(i);
        let da = a - frontAngle;
        da = ((da + Math.PI) % (Math.PI * 2)) - Math.PI;
        const diff = (Math.cos(da) + 1) / 2;
        const color = categoryColor[sensor.category];
        return (
          <Html
            key={sensor.name}
            center
            distanceFactor={7}
            zIndexRange={[10, 0]}
            style={{ pointerEvents: "none" }}
            position={[Math.cos(a) * RING_R, 0.18, Math.sin(a) * RING_R]}
          >
            <CardHtml sensor={sensor} index={i} color={color} diff={diff} />
          </Html>
        );
      })}
    </group>
  );
}

export const SensorCarousel3D = memo(function SensorCarousel3D() {
  const ref = useDomRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "500px", 1200);
  const isMobile = useMediaQuery("(max-width: 767px)");

  if (isMobile) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {physicalSensors.map((sensor, i) => {
          const color = categoryColor[sensor.category];
          return (
            <div
              key={sensor.name}
              className="glass relative overflow-hidden rounded-3xl p-4 transition hover:-translate-y-0.5"
              style={{ borderColor: `${color}44` }}
            >
              <div
                className="absolute inset-x-0 top-0 h-0.5"
                style={{
                  background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                }}
              />
              <div className="flex items-center justify-between">
                <span className="eyebrow text-[10px]" style={{ color }}>
                  {sensor.category}
                </span>
                <span className="eyebrow text-[10px] text-slate-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="mt-1.5 text-base font-semibold text-white">
                {sensor.name}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                {sensor.unit} · Safe {sensor.range}
              </div>
              <div className="mt-3 h-10">
                <Sparkline data={sparklineData(i + 3)} color={color} height={40} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={ref} className="h-[520px] w-full cursor-grab active:cursor-grabbing">
      {warm && (
        <Canvas
          frameloop={inView ? "always" : "never"}
          dpr={[1, 1.25]}
          camera={{ position: [0, 2, 7.6], fov: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.4} />
          <pointLight position={[4, 5, 4]} intensity={1} color="#ffffff" />
          <OrbitRing />
          <CenterCore />
          <Spokes />
          <Carousel auto />
          <AmbientParticles />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
