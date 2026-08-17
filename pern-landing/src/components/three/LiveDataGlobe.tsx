import { memo, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { liveNetworkNodes } from "../../data/content";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

const R = 1.9;

const bandColor: Record<string, string> = {
  safe: "#00D4AA",
  warning: "#F59E0B",
  critical: "#DC2626",
};

const PACKET_COUNT = 5;

function latLonToVec3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
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
  g.addColorStop(0.2, "rgba(255,255,255,0.7)");
  g.addColorStop(0.55, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function NodeReadout({
  name,
  pm25,
  color,
  diff,
}: {
  name: string;
  pm25: number;
  color: string;
  diff: number;
}) {
  return (
    <div
      style={{
        width: 92,
        padding: "8px 11px 9px",
        borderRadius: 14,
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05) 50%, rgba(2,6,23,0.3))",
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: `0 14px 40px -16px rgba(2,6,23,0.8), 0 0 28px ${color}30`,
        color: "#F8FAFC",
        fontFamily: "Inter, sans-serif",
        opacity: 0.1 + diff * 0.9,
        transform: `scale(${0.72 + diff * 0.42})`,
        transformOrigin: "center center",
        transition: "opacity 0.6s ease, transform 0.6s ease",
        pointerEvents: "none",
        textAlign: "center",
        userSelect: "none",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#E2E8F0",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          marginTop: 1,
          letterSpacing: "-0.01em",
        }}
      >
        {pm25}
        <span
          style={{
            fontSize: 9,
            color: "rgba(203,213,225,0.6)",
            fontFamily: "JetBrains Mono, monospace",
            marginLeft: 3,
          }}
        >
          µg/m³
        </span>
      </div>
      <div
        style={{
          width: 22,
          height: 2,
          margin: "4px auto 0",
          borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
}

function PingRings({ nodes }: { nodes: { pos: THREE.Vector3; phase: number }[] }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const quats = useMemo(
    () =>
      nodes.map((n) =>
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          n.pos.clone().normalize()
        )
      ),
    [nodes]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < nodes.length; i++) {
      const ring = rings.current[i];
      const mat = mats.current[i];
      if (!ring || !mat) continue;
      const cycle = (t * 0.4 + nodes[i].phase) % 1;
      ring.scale.setScalar(0.05 + cycle * 0.45);
      const f = 1 - cycle;
      mat.opacity = 0.5 * f * f;
    }
  });

  return (
    <>
      {nodes.map((n, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m;
          }}
          position={n.pos}
          quaternion={quats[i]}
        >
          <torusGeometry args={[0.09, 0.005, 6, 36]} />
          <meshBasicMaterial
            ref={(mat) => {
              mats.current[i] = mat;
            }}
            color={bandColor[liveNetworkNodes[i % liveNetworkNodes.length].band]}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

function FlowPackets({
  curve,
  color,
  phase,
}: {
  curve: THREE.QuadraticBezierCurve3;
  color: string;
  phase: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => new Float32Array(PACKET_COUNT * 3), []);
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PACKET_COUNT; i++) {
      const p = (t * 0.14 + phase + i / PACKET_COUNT) % 1;
      curve.getPoint(p, v);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.06}
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Globe({ dragEnabled }: { dragEnabled: boolean }) {
  const group = useRef<THREE.Group>(null);
  const drag = useRef({ down: false, x: 0, rotY: 0, target: 0 });
  const reducedMotion = usePrefersReducedMotion();

  const nodes = useMemo(
    () =>
      liveNetworkNodes.map((n, i) => ({
        ...n,
        pos: latLonToVec3(n.lat, n.lon, R + 0.06),
        phase: i * 1.3,
      })),
    []
  );

  const arcs = useMemo(() => {
    const list: { curve: THREE.QuadraticBezierCurve3; color: string; phase: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i].pos;
      const b = nodes[(i + 1) % nodes.length].pos;
      if (a.distanceTo(b) > R * 2.2) continue;
      const mid = a
        .clone()
        .add(b)
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(R * 1.55);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const color = i % 2 === 0 ? "#00D4AA" : "#0EA5E9";
      list.push({ curve, color, phase: i * 0.17 });
    }
    return list;
  }, [nodes]);

  useFrame((state, dt) => {
    if (!group.current) return;
    if (dragEnabled && !drag.current.down && !reducedMotion)
      drag.current.target += dt * 0.07;
    drag.current.rotY = THREE.MathUtils.lerp(
      drag.current.rotY,
      drag.current.target,
      0.08
    );
    group.current.rotation.y = drag.current.rotY;
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      0.24 + state.pointer.y * 0.06,
      0.04
    );
  });

  const glowTex = useMemo(makeGlowTexture, []);
  const starTex = useMemo(makeGlowTexture, []);

  const starPositions = useMemo(() => {
    const count = 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  return (
    <>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={starTex}
          color="#7DD3FC"
          size={0.03}
          transparent
          opacity={0.4}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <group
        ref={group}
        onPointerDown={(e) => {
          if (!dragEnabled) return;
          drag.current.down = true;
          drag.current.x = e.clientX;
        }}
        onPointerUp={() => {
          drag.current.down = false;
        }}
        onPointerLeave={() => {
          drag.current.down = false;
        }}
        onPointerMove={(e) => {
          if (!dragEnabled || !drag.current.down) return;
          const dx = e.clientX - drag.current.x;
          drag.current.x = e.clientX;
          drag.current.target += dx * 0.008;
        }}
      >
        <Sphere args={[R, 48, 48]}>
          <meshStandardMaterial
            color="#0B3B4A"
            roughness={0.55}
            metalness={0.35}
            emissive="#06252e"
            emissiveIntensity={0.4}
          />
        </Sphere>
        <Sphere args={[R + 0.01, 36, 36]}>
          <meshBasicMaterial color="#00D4AA" wireframe transparent opacity={0.12} />
        </Sphere>
        <Sphere args={[R + 0.02, 24, 24]}>
          <meshBasicMaterial color="#0EA5E9" wireframe transparent opacity={0.05} />
        </Sphere>
        <mesh scale={R * 1.28}>
          <sphereGeometry args={[1, 40, 40]} />
          <meshBasicMaterial
            color="#00D4AA"
            transparent
            opacity={0.12}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {nodes.map((n, i) => {
          const color = bandColor[n.band];
          const front = Math.sin(nodes[0].phase) === Math.sin(nodes[0].phase); // keep stable
          const angle = Math.atan2(n.pos.x, n.pos.z) + (group.current?.rotation.y ?? 0);
          const show = Math.cos(angle) > -0.25;
          return (
            <group key={n.name}>
              <mesh position={n.pos}>
                <icosahedronGeometry args={[0.05, 0]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={2.2}
                  toneMapped={false}
                />
              </mesh>
              <sprite position={n.pos} scale={[0.34, 0.34, 1]}>
                <spriteMaterial
                  map={glowTex}
                  color={color}
                  transparent
                  opacity={0.7}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </sprite>
              <Html
                center
                distanceFactor={9}
                zIndexRange={[10, 0]}
                style={{ pointerEvents: "none" }}
                position={n.pos}
              >
                <NodeReadout
                  name={n.name}
                  pm25={n.pm25}
                  color={color}
                  diff={show ? 1 : 0.2}
                />
              </Html>
            </group>
          );
        })}

        <PingRings nodes={nodes} />

        {arcs.map((a, i) => {
          const pts = a.curve.getPoints(40);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute(
            "position",
            new THREE.BufferAttribute(
              new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z])),
              3
            )
          );
          const lineDistance = new Float32Array(pts.length);
          let dist = 0;
          for (let j = 0; j < pts.length; j++) {
            if (j > 0) dist += pts[j].distanceTo(pts[j - 1]);
            lineDistance[j] = dist;
          }
          geo.setAttribute("lineDistance", new THREE.BufferAttribute(lineDistance, 1));
          return (
            <group key={i}>
              <line>
                <primitive object={geo} attach="geometry" />
                <lineDashedMaterial
                  color={a.color}
                  transparent
                  opacity={0.45}
                  dashSize={0.07}
                  gapSize={0.12}
                  depthWrite={false}
                />
              </line>
              <FlowPackets curve={a.curve} color={a.color} phase={a.phase} />
            </group>
          );
        })}

        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[R + 0.28, R + 0.31, 128]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.1}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </>
  );
}

export const LiveDataGlobe = memo(function LiveDataGlobe() {
  const ref = useDomRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "500px", 1400);
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useMediaQuery("(max-width: 767px)");

  return (
    <div
      ref={ref}
      className="h-[360px] w-full cursor-grab active:cursor-grabbing sm:h-[520px]"
    >
      {warm && (
        <Canvas
          frameloop={reducedMotion || !inView ? "never" : "always"}
          dpr={[1, isMobile ? 1 : 1.25]}
          camera={{ position: [0, 0.6, 5.6], fov: 42 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.45} />
          <directionalLight position={[4, 3, 2]} intensity={1.1} />
          <pointLight position={[-3, -2, -2]} color="#0EA5E9" intensity={0.8} />
          <Globe dragEnabled={!isMobile} />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
