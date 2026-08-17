import { memo, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { externalSources } from "../../data/content";
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
  const g = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.7)");
  g.addColorStop(0.55, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function Globe() {
  const ref = useRef<THREE.Group>(null);
  const drag = useRef({ down: false, x: 0, rotY: 0, target: 0 });
  const reducedMotion = usePrefersReducedMotion();
  const glowTex = useMemo(makeGlowTexture, []);

  const nodePositions = useMemo(
    () =>
      externalSources.map((src, i) => {
        const a = (i / externalSources.length) * Math.PI * 2;
        const y = Math.sin(i * 1.7) * 0.6;
        const r = 1.75;
        return { pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), color: i % 2 ? "#0EA5E9" : "#00D4AA" };
      }),
    []
  );

  const arcs = useMemo(() => {
    const list: { geo: THREE.BufferGeometry; color: string }[] = [];
    for (let i = 0; i < nodePositions.length; i++) {
      const a = nodePositions[i].pos;
      const b = nodePositions[(i + 1) % nodePositions.length].pos;
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(2.2);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(32);
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
      list.push({ geo, color: i % 2 === 0 ? "#00D4AA" : "#0EA5E9" });
    }
    return list;
  }, [nodePositions]);

  const pingRings = useRef<(THREE.Mesh | null)[]>([]);
  const pingMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const pingQuats = useMemo(
    () =>
      nodePositions.map((n) =>
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          n.pos.clone().normalize()
        )
      ),
    [nodePositions]
  );

  useFrame((state, dt) => {
    if (!ref.current) return;
    if (!drag.current.down && !reducedMotion) drag.current.target += dt * 0.12;
    drag.current.rotY = THREE.MathUtils.lerp(drag.current.rotY, drag.current.target, 0.08);
    ref.current.rotation.y = drag.current.rotY;
    ref.current.rotation.x = 0.3 + state.pointer.y * 0.04;

    const t = state.clock.elapsedTime;
    for (let i = 0; i < nodePositions.length; i++) {
      const ring = pingRings.current[i];
      const mat = pingMats.current[i];
      if (!ring || !mat) continue;
      const cycle = (t * 0.35 + i * 0.8) % 1;
      ring.scale.setScalar(0.04 + cycle * 0.35);
      mat.opacity = 0.45 * (1 - cycle) * (1 - cycle);
    }
  });

  return (
    <group
      ref={ref}
      onPointerDown={(e) => {
        drag.current.down = true;
        drag.current.x = e.clientX;
      }}
      onPointerUp={() => { drag.current.down = false; }}
      onPointerLeave={() => { drag.current.down = false; }}
      onPointerMove={(e) => {
        if (!drag.current.down) return;
        const dx = e.clientX - drag.current.x;
        drag.current.x = e.clientX;
        drag.current.target += dx * 0.01;
      }}
    >
      <Sphere args={[1.6, 48, 48]}>
        <meshStandardMaterial
          color="#0B3B4A"
          roughness={0.55}
          metalness={0.35}
          emissive="#06252e"
          emissiveIntensity={0.4}
        />
      </Sphere>
      <Sphere args={[1.62, 32, 32]}>
        <meshBasicMaterial color="#00D4AA" wireframe transparent opacity={0.12} />
      </Sphere>

      {/* Atmosphere halo */}
      <mesh scale={1.32}>
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshBasicMaterial
          color="#00D4AA"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Source nodes with glow + ping rings */}
      {nodePositions.map((n, i) => (
        <group key={i}>
          <mesh position={n.pos}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial
              color={n.color}
              emissive={n.color}
              emissiveIntensity={1.8}
              toneMapped={false}
            />
          </mesh>
          <sprite position={n.pos} scale={[0.38, 0.38, 1]}>
            <spriteMaterial
              map={glowTex}
              color={n.color}
              transparent
              opacity={0.7}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
          <mesh
            ref={(m) => { pingRings.current[i] = m; }}
            position={n.pos}
            quaternion={pingQuats[i]}
          >
            <torusGeometry args={[0.08, 0.004, 6, 32]} />
            <meshBasicMaterial
              ref={(m) => { pingMats.current[i] = m; }}
              color={n.color}
              transparent
              opacity={0.45}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      {/* Arc connections */}
      {arcs.map((a, i) => (
        <line key={i}>
          <primitive object={a.geo} attach="geometry" />
          <lineDashedMaterial
            color={a.color}
            transparent
            opacity={0.35}
            dashSize={0.06}
            gapSize={0.1}
            depthWrite={false}
          />
        </line>
      ))}

      {/* Equator ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.72, 1.74, 128]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export const MiniGlobe = memo(function MiniGlobe() {
  const ref = useDomRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "400px", 2400);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div ref={ref} className="h-[300px] w-full cursor-grab active:cursor-grabbing sm:h-[400px]">
      {warm && (
        <Canvas
          frameloop={reducedMotion || !inView ? "never" : "always"}
          dpr={[1, 1.25]}
          camera={{ position: [0, 0, 5], fov: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.45} />
          <directionalLight position={[4, 3, 2]} intensity={1.1} />
          <pointLight position={[-3, -2, -2]} color="#0EA5E9" intensity={0.8} />
          <Globe />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
