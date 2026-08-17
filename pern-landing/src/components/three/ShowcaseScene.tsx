import { memo, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

const SATELLITES = 12;
const SWIRL_COUNT = 560;

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
  g.addColorStop(0.25, "rgba(255,255,255,0.7)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function Starfield() {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const white = new THREE.Color("#94A3B8");
    const cyan = new THREE.Color("#7DD3FC");
    for (let i = 0; i < count; i++) {
      const r = 7 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = i % 5 === 0 ? cyan : white;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, []);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.015;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        vertexColors
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function CoreScene({ progressRef }: { progressRef?: { current: number } }) {
  const group = useRef<THREE.Group>(null);
  const swirl = useRef<THREE.Points>(null);
  const core = useRef<THREE.Sprite>(null);
  const satellites = useRef<(THREE.Mesh | null)[]>([]);
  const glowTex = useMemo(makeGlowTexture, []);

  const dashed = useMemo(() => {
    const count = 96;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= count; i++) {
      const a = (i / count) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75));
    }
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
    const line = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({
        color: "#22D3EE",
        transparent: true,
        opacity: 0.4,
        dashSize: 0.12,
        gapSize: 0.16,
        depthWrite: false,
      })
    );
    line.rotation.set(Math.PI / 2, 0, 0);
    return line;
  }, []);

  const dashed2 = useMemo(() => {
    const count = 72;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= count; i++) {
      const a = (i / count) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0));
    }
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
    const line = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({
        color: "#A78BFA",
        transparent: true,
        opacity: 0.3,
        dashSize: 0.1,
        gapSize: 0.14,
        depthWrite: false,
      })
    );
    line.rotation.set(0, 0, 1.1);
    return line;
  }, []);

  const spokesLine = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(SATELLITES * 6), 3)
    );
    const line = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: "#22D3EE",
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    line.frustumCulled = false;
    return line;
  }, []);

  const swirlData = useMemo(() => {
    const positions = new Float32Array(SWIRL_COUNT * 3);
    const colors = new Float32Array(SWIRL_COUNT * 3);
    const cA = new THREE.Color("#00D4AA");
    const cB = new THREE.Color("#0EA5E9");
    const cC = new THREE.Color("#A78BFA");
    for (let i = 0; i < SWIRL_COUNT; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 2.7 + Math.random() * 0.7;
      const lift = (Math.random() - 0.5) * 0.9;
      positions[i * 3] = Math.cos(ang) * r;
      positions[i * 3 + 1] = lift;
      positions[i * 3 + 2] = Math.sin(ang) * r;
      const c = i % 3 === 0 ? cA : i % 3 === 1 ? cB : cC;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const p = progressRef?.current ?? 0;
    if (group.current) {
      group.current.rotation.y += dt * (0.22 + p * 0.35);
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        1.05 + state.pointer.y * 0.12,
        0.04
      );
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        state.pointer.x * 0.08,
        0.04
      );
      group.current.scale.setScalar(1 + p * 0.12 + Math.sin(t * 0.5) * 0.03);
    }

    dashed2.rotation.z += dt * 0.05;

    const orbit = t * 0.6 + p * 0.4;
    for (let i = 0; i < SATELLITES; i++) {
      const m = satellites.current[i];
      if (!m) continue;
      const a = orbit + (i / SATELLITES) * Math.PI * 2;
      m.position.set(
        Math.cos(a) * 2.2,
        Math.sin(a * 2) * 0.12,
        Math.sin(a) * 2.2
      );
    }

    {
      const arr = spokesLine.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < SATELLITES; i++) {
        const m = satellites.current[i];
        if (!m) continue;
        const i6 = i * 6;
        arr[i6] = 0;
        arr[i6 + 1] = 0;
        arr[i6 + 2] = 0;
        arr[i6 + 3] = m.position.x;
        arr[i6 + 4] = m.position.y;
        arr[i6 + 5] = m.position.z;
      }
      spokesLine.geometry.attributes.position.needsUpdate = true;
    }

    if (swirl.current) {
      swirl.current.rotation.y -= dt * 0.16;
      const pos = swirl.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < SWIRL_COUNT; i++) {
        const i3 = i * 3;
        const ang = Math.atan2(pos[i3 + 2], pos[i3]) + dt * 0.06;
        const r = Math.hypot(pos[i3], pos[i3 + 2]);
        pos[i3] = Math.cos(ang) * r;
        pos[i3 + 2] = Math.sin(ang) * r;
        pos[i3 + 1] += Math.sin(t * 0.6 + i * 0.1) * 0.0006;
        if (pos[i3 + 1] > 0.5) pos[i3 + 1] = -0.5;
        else if (pos[i3 + 1] < -0.5) pos[i3 + 1] = 0.5;
      }
      swirl.current.geometry.attributes.position.needsUpdate = true;
    }

    if (core.current) {
      core.current.scale.setScalar(0.6 + Math.sin(t * 1.1) * 0.12);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <Starfield />
      <group ref={group}>
        <mesh scale={1.55}>
          <sphereGeometry args={[1.0, 32, 32]} />
          <meshBasicMaterial
            color="#00D4AA"
            transparent
            opacity={0.06}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.2, 0.035, 12, 160]} />
          <meshBasicMaterial color="#00D4AA" transparent opacity={0.3} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0.45]}>
          <torusGeometry args={[2.5, 0.018, 8, 128]} />
          <meshBasicMaterial color="#0EA5E9" transparent opacity={0.22} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, -0.3]}>
          <torusGeometry args={[1.95, 0.014, 8, 96]} />
          <meshBasicMaterial color="#A78BFA" transparent opacity={0.18} />
        </mesh>
        <mesh rotation={[-0.5, 0, 0.8]}>
          <torusGeometry args={[2.8, 0.008, 8, 140]} />
          <meshBasicMaterial
            color="#F59E0B"
            transparent
            opacity={0.14}
            depthWrite={false}
          />
        </mesh>

        <primitive object={dashed} />
        <primitive object={dashed2} />
        <primitive object={spokesLine} />

        {Array.from({ length: SATELLITES }, (_, i) => (
          <mesh
            key={i}
            ref={(m) => {
              satellites.current[i] = m;
            }}
          >
            <sphereGeometry args={[i % 3 === 0 ? 0.09 : 0.06, 10, 10]} />
            <meshBasicMaterial
              color={i % 2 === 0 ? "#00D4AA" : "#0EA5E9"}
              toneMapped={false}
              transparent
              opacity={0.9}
            />
            <sprite scale={[0.7, 0.7, 1]}>
              <spriteMaterial
                map={glowTex}
                color={i % 2 === 0 ? "#00D4AA" : "#0EA5E9"}
                transparent
                opacity={0.6}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </mesh>
        ))}

        <points ref={swirl}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[swirlData.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[swirlData.colors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.03}
            vertexColors
            transparent
            opacity={0.7}
            sizeAttenuation
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        <sprite ref={core} scale={[0.8, 0.8, 1]}>
          <spriteMaterial
            map={glowTex}
            color="#00D4AA"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>

        <mesh>
          <icosahedronGeometry args={[0.12, 1]} />
          <meshBasicMaterial
            color="#00D4AA"
            wireframe
            transparent
            opacity={0.25}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}

export const ShowcaseScene = memo(function ShowcaseScene({
  progressRef,
}: {
  progressRef?: { current: number };
}) {
  const ref = useDomRef<HTMLDivElement>(null);
  const { inView, warm } = useSceneGate(ref, "500px", 1000);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div ref={ref} className="absolute inset-0">
      {warm && (
        <Canvas
          frameloop={reducedMotion || !inView ? "never" : "always"}
          dpr={[1, isMobile ? 1 : 1.25]}
          camera={{ position: [0, 0, 6.2], fov: 42 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <CoreScene progressRef={progressRef} />
          <WarmFrame />
        </Canvas>
      )}
    </div>
  );
});
