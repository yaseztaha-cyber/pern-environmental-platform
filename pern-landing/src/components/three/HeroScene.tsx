import { memo, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { useRef as useDomRef } from "react";
import { sensorNodes } from "../../data/content";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSceneGate } from "../../hooks/useSceneGate";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { WarmFrame } from "./WarmFrame";

function latLonToVec3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat * 90) * (Math.PI / 180);
  const theta = (lon * 180 + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
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
  g.addColorStop(0.2, "rgba(255,255,255,0.6)");
  g.addColorStop(0.55, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const FLOW_PACKETS = 6;

function CameraRig() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    state.camera.position.x = Math.sin(t * 0.11) * 0.18;
    state.camera.position.y = Math.cos(t * 0.13) * 0.12;
    state.camera.position.z = 6.5 + Math.sin(t * 0.07) * 0.22;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

function Starfield() {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => {
    const count = 240;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const white = new THREE.Color("#94A3B8");
    const cyan = new THREE.Color("#7DD3FC");
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const r = 7.5 + Math.random() * 4.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);
      const c = i % 5 === 0 ? cyan : white;
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }
    return { positions, colors };
  }, []);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function PingRings({
  nodes,
}: {
  nodes: { pos: THREE.Vector3; phase: number }[];
}) {
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
      const cycle = (t * 0.45 + nodes[i].phase) % 1;
      const s = 0.06 + cycle * 0.5;
      ring.scale.setScalar(s);
      const f = 1 - cycle;
      mat.opacity = 0.55 * f * f;
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
          <torusGeometry args={[0.1, 0.006, 6, 40]} />
          <meshBasicMaterial
            ref={(mat) => {
              mats.current[i] = mat;
            }}
            color={i % 2 === 0 ? "#00D4AA" : "#22D3EE"}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

function WireGlobe() {
  const group = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.08;
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      mouse.current.y * 0.15,
      0.04
    );
    group.current.rotation.z = THREE.MathUtils.lerp(
      group.current.rotation.z,
      mouse.current.x * 0.08,
      0.04
    );
  });

  const nodes = useMemo(
    () =>
      sensorNodes.map((n, i) => ({
        ...n,
        pos: latLonToVec3(n.lat * 60 + 20, n.lon * 40 + 30, 1.55),
        phase: i * 1.3,
      })),
    []
  );

  const { arcGeometries, curves } = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const curves: THREE.QuadraticBezierCurve3[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i].pos;
      const b = nodes[(i + 1) % nodes.length].pos;
      const mid = a
        .clone()
        .add(b)
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(2.1);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(40);
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
      geos.push(geo);
      curves.push(curve);
    }
    return { arcGeometries: geos, curves };
  }, [nodes]);

  return (
    <group ref={group} position={[0, 0.1, 0]} scale={1.15}>
      <Sphere args={[1.4, 32, 32]}>
        <meshBasicMaterial
          color="#00D4AA"
          wireframe
          transparent
          opacity={0.18}
        />
      </Sphere>
      <Sphere args={[1.42, 24, 24]}>
        <meshBasicMaterial
          color="#0EA5E9"
          wireframe
          transparent
          opacity={0.06}
        />
      </Sphere>

      <CoreDot />
      <ScanRing />
      <GlowSprite />

      {nodes.map((n, i) => (
        <SensorNode key={n.name} position={n.pos} phase={i * 1.7} />
      ))}
      <PingRings nodes={nodes} />

      {arcGeometries.map((geo, i) => (
        <line key={i}>
          <primitive object={geo} attach="geometry" />
          <lineDashedMaterial
            color={i % 2 === 0 ? "#00D4AA" : "#0EA5E9"}
            transparent
            opacity={0.5}
            dashSize={0.09}
            gapSize={0.13}
            depthWrite={false}
          />
        </line>
      ))}
      {curves.map((curve, i) => (
        <FlowArc
          key={`flow-${i}`}
          curve={curve}
          color={i % 2 === 0 ? "#00D4AA" : "#0EA5E9"}
          phase={i * 0.18}
        />
      ))}
    </group>
  );
}

function FlowArc({
  curve,
  color,
  phase,
}: {
  curve: THREE.QuadraticBezierCurve3;
  color: string;
  phase: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => new Float32Array(FLOW_PACKETS * 3), []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    const v = new THREE.Vector3();
    for (let i = 0; i < FLOW_PACKETS; i++) {
      const p = (t * 0.12 + phase + i / FLOW_PACKETS) % 1;
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
        size={0.065}
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function SensorNode({
  position,
  phase,
}: {
  position: THREE.Vector3;
  phase: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (mesh.current) {
      mesh.current.scale.setScalar(1 + 0.32 * Math.sin(t * 2.4 + phase));
    }
    if (light.current) {
      light.current.intensity = 0.28 + 0.24 * Math.sin(t * 2.4 + phase);
    }
  });

  return (
    <Float speed={2} floatIntensity={0.4} rotationIntensity={0.2}>
      <mesh ref={mesh} position={position}>
        <icosahedronGeometry args={[0.06, 0]} />
        <meshStandardMaterial
          color="#00D4AA"
          emissive="#00D4AA"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={light} position={position} color="#00D4AA" intensity={0.4} distance={1.5} />
    </Float>
  );
}

function CoreDot() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.scale.setScalar(1 + Math.sin(t * 1.4) * 0.25);
  });
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[0.045, 1]} />
      <meshBasicMaterial
        color="#FFFFFF"
        toneMapped={false}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function ScanRing() {
  const a = useRef<THREE.Group>(null);
  const b = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (a.current) {
      a.current.rotation.y += dt * 0.4;
      const m = a.current.children[0] as THREE.Mesh;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(t * 1.3) * 0.14;
    }
    if (b.current) b.current.rotation.y -= dt * 0.24;
  });
  return (
    <group>
      <group ref={a} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[2.05, 0.009, 8, 220]} />
          <meshBasicMaterial
            color="#00D4AA"
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
      <group ref={b} rotation={[Math.PI / 2, 0.55, 0.2]}>
        <mesh>
          <torusGeometry args={[2.24, 0.005, 8, 220]} />
          <meshBasicMaterial
            color="#0EA5E9"
            transparent
            opacity={0.18}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function GlowSprite() {
  const sprite = useRef<THREE.Sprite>(null);
  const mat = useRef<THREE.SpriteMaterial>(null);
  const glowTex = useMemo(makeGlowTexture, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (mat.current) mat.current.opacity = 0.3 + Math.sin(t * 0.9) * 0.08;
    if (sprite.current) sprite.current.scale.setScalar(4.3 + Math.sin(t * 0.9) * 0.35);
  });
  return (
    <sprite ref={sprite} scale={[4.3, 4.3, 1]}>
      <spriteMaterial
        ref={mat}
        map={glowTex}
        color="#22D3EE"
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  );
}

function AtmosphereParticles({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors, speeds, dirs, phaseS, phaseC } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const dirs = new Float32Array(count);
    const phaseS = new Float32Array(count);
    const phaseC = new Float32Array(count);
    const palette = [
      new THREE.Color("#00D4AA"),
      new THREE.Color("#0EA5E9"),
      new THREE.Color("#F59E0B"),
    ];
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const r = 2.5 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = (Math.random() - 0.5) * 8;
      positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = palette[i % 3];
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
      speeds[i] = 0.15 + Math.random() * 0.35;
      dirs[i] = i % 2 === 0 ? 1 : -1;
      phaseS[i] = Math.sin(i);
      phaseC[i] = Math.cos(i);
    }
    return { positions, colors, speeds, dirs, phaseS, phaseC };
  }, [count]);

  useFrame((state, dt) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    const mx = state.pointer.x * 0.3;
    const my = state.pointer.y * 0.2;
    const sA = Math.sin(t * 0.4);
    const cA = Math.cos(t * 0.4);
    const sB = Math.sin(t * 0.3);
    const cB = Math.cos(t * 0.3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const pc = phaseC[i];
      const ps = phaseS[i];
      pos[i3 + 1] += speeds[i] * dt * 0.6 * dirs[i];
      pos[i3] += (sA * pc + cA * ps) * 0.002 + mx * 0.002;
      pos[i3 + 2] += (cB * pc - sB * ps) * 0.002 + my * 0.002;
      if (pos[i3 + 1] > 4.5) pos[i3 + 1] = -4.5;
      else if (pos[i3 + 1] < -4.5) pos[i3 + 1] = 4.5;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
    ref.current.rotation.y = t * 0.02;
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
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function AtmosphereHalo() {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (mat.current) mat.current.opacity = 0.16 + Math.sin(t * 0.6) * 0.05;
    if (mesh.current) mesh.current.scale.setScalar(1.55 + Math.sin(t * 0.6) * 0.04);
  });
  return (
    <mesh ref={mesh} scale={1.55}>
      <sphereGeometry args={[1.4, 32, 32]} />
      <meshBasicMaterial
        ref={mat}
        color="#00D4AA"
        transparent
        opacity={0.16}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function OrbitRing() {
  const group = useRef<THREE.Group>(null);
  const { positions, sizes } = useMemo(() => {
    const count = 110;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const a = (i / count) * Math.PI * 2;
      const r = 2.55 + Math.sin(i * 1.7) * 0.12;
      positions[i3] = Math.cos(a) * r;
      positions[i3 + 1] = Math.sin(i * 0.7) * 0.08;
      positions[i3 + 2] = Math.sin(a) * r;
      sizes[i] = i % 9 === 0 ? 1.6 : 1;
    }
    return { positions, sizes };
  }, []);

  useFrame((state, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.12;
    group.current.rotation.x =
      -0.5 + Math.sin(state.clock.elapsedTime * 0.2) * 0.06;
  });

  return (
    <group ref={group} rotation={[-0.5, 0, 0.2]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          color="#22D3EE"
          size={0.05}
          sizeAttenuation
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.55, 0.004, 8, 160]} />
        <meshBasicMaterial
          color="#0EA5E9"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SweepBeam() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.6;
    if (mat.current) mat.current.opacity = 0.08 + Math.sin(state.clock.elapsedTime * 1.2) * 0.03;
  });
  return (
    <group ref={ref} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
      <mesh>
        <coneGeometry args={[2.4, 0.08, 64, 1, true]} />
        <meshBasicMaterial
          ref={mat}
          color="#00D4AA"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SceneContent({ particleCount }: { particleCount: number }) {
  return (
    <>
      <CameraRig />
      <ambientLight intensity={0.35} />
      <pointLight position={[4, 3, 4]} intensity={1.2} color="#00D4AA" />
      <pointLight position={[-4, -2, -3]} intensity={0.6} color="#0EA5E9" />
      <Starfield />
      <AtmosphereHalo />
      <WireGlobe />
      <OrbitRing />
      <SweepBeam />
      <AtmosphereParticles count={particleCount} />
      <fog attach="fog" args={["#020617", 6, 16]} />
    </>
  );
}

export const HeroScene = memo(function HeroScene() {
  const containerRef = useDomRef<HTMLDivElement>(null);
  const { inView } = useSceneGate(containerRef, "600px");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const reducedMotion = usePrefersReducedMotion();
  const count = isMobile ? 300 : 900;

  return (
    <div ref={containerRef} className="absolute inset-0 z-0">
      <Canvas
        frameloop={reducedMotion || !inView ? "never" : "always"}
        dpr={[1, isMobile ? 1 : 1.2]}
        camera={{ position: [0, 0, 6.5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <SceneContent particleCount={count} />
        <WarmFrame />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-pern-bg/20 via-transparent to-pern-bg" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#020617_75%)]" />
    </div>
  );
});
