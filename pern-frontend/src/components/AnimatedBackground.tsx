import { useEffect, useRef } from 'react';
import { useAnimationsEnabled } from '../hooks/useAnimationsEnabled';

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  vx: number;
  vy: number;
  hue: string;
  tw: number;
  twSpd: number;
}

interface NebulaPuff {
  x: number;
  y: number;
  r: number;
  hue: string;
  alpha: number;
  vx: number;
  vy: number;
  phase: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  len: number;
}

interface Planet {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
}

const STAR_COLORS = ['226, 232, 240', '165, 243, 252', '196, 181, 253', '148, 233, 254'];
const PUFFS = [
  { hue: '139, 92, 246', alpha: 0.05 },
  { hue: '20, 184, 166', alpha: 0.045 },
  { hue: '99, 102, 241', alpha: 0.045 },
  { hue: '34, 211, 238', alpha: 0.035 },
];

function buildStars(w: number, h: number): Star[] {
  const area = w * h;
  const count = Math.min(220, Math.max(90, Math.floor(area / 11000)));
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const z = 0.12 + Math.random() * 0.88;
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      z,
      r: 0.35 + z * 1.05,
      vx: (0.045 + z * 0.1) * (0.6 + Math.random() * 0.8),
      vy: (0.02 + z * 0.05) * (0.6 + Math.random() * 0.8),
      hue: STAR_COLORS[i % STAR_COLORS.length],
      tw: Math.random() * Math.PI * 2,
      twSpd: 0.005 + Math.random() * 0.02,
    });
  }
  return stars;
}

function buildPuffs(w: number, h: number): NebulaPuff[] {
  return PUFFS.slice(0, 3).map((p, i) => ({
    x: (0.15 + i * 0.22) * w + (Math.random() - 0.5) * w * 0.1,
    y: (0.15 + i * 0.17) * h + (Math.random() - 0.5) * h * 0.1,
    r: Math.min(w, h) * (0.22 + Math.random() * 0.18),
    hue: p.hue,
    alpha: p.alpha,
    vx: (Math.random() - 0.5) * 0.05,
    vy: (Math.random() - 0.5) * 0.04,
    phase: Math.random() * Math.PI * 2,
  }));
}

export default function AnimatedBackground() {
  const { animationsEnabled } = useAnimationsEnabled();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const enabledRef = useRef(animationsEnabled);
  enabledRef.current = animationsEnabled;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let puffs: NebulaPuff[] = [];
    let planet: Planet | null = null;
    let shots: ShootingStar[] = [];
    let nextShotAt = 0;
    let running = true;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = buildStars(width, height);
      puffs = buildPuffs(width, height);
      const r = Math.min(width, height) * 0.045;
      planet = {
        x: width * 0.82,
        y: height * 0.18,
        r,
        vx: 0.02,
        vy: 0.008,
        phase: 0,
      };
      shots = [];
      nextShotAt = performance.now() + 1200;
    };

    const wrap = (v: number, max: number) => {
      if (v < -20) return max + 20;
      if (v > max + 20) return -20;
      return v;
    };

    const drawNebulaPuff = (p: NebulaPuff, t: number) => {
      const breath = 1 + Math.sin(p.phase + t * 0.0002) * 0.08;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * breath);
      grad.addColorStop(0, `rgba(${p.hue}, ${p.alpha})`);
      grad.addColorStop(1, `rgba(${p.hue}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * breath, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawPlanet = (pl: Planet, t: number) => {
      const wob = Math.sin(t * 0.0003 + pl.phase) * pl.r * 0.25;
      const cx = pl.x;
      const cy = pl.y + wob * 0.35;
      const r = pl.r;
      // soft atmosphere halo
      const halo = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.4);
      halo.addColorStop(0, 'rgba(96, 165, 250, 0.10)');
      halo.addColorStop(1, 'rgba(96, 165, 250, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      // planet body
      const body = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      body.addColorStop(0, 'rgba(56, 130, 246, 0.55)');
      body.addColorStop(0.55, 'rgba(30, 64, 175, 0.42)');
      body.addColorStop(1, 'rgba(12, 26, 70, 0.5)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // ring (drawn as an ellipse arc behind + in front)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.35);
      ctx.scale(1, 0.34);
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
      ctx.lineWidth = r * 0.42;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const spawnShot = () => {
      const fromTop = Math.random() < 0.7;
      const speed = 2.6 + Math.random() * 3;
      shots.push({
        x: Math.random() * width,
        y: fromTop ? Math.random() * height * 0.35 : Math.random() * height,
        vx: speed * (Math.random() < 0.5 ? 1 : -1),
        vy: speed * 0.55 + Math.random() * 0.4,
        life: 0,
        maxLife: 46 + Math.random() * 30,
        len: 60 + Math.random() * 60,
      });
    };

    const drawShots = () => {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        if (s.life >= s.maxLife) {
          shots.splice(i, 1);
          continue;
        }
        const t = s.life / s.maxLife;
        const alpha = Math.sin(t * Math.PI) * 0.9;
        const spd = Math.hypot(s.vx, s.vy) || 1;
        const ux = -s.vx / spd;
        const uy = -s.vy / spd;
        const tx = s.x + ux * s.len;
        const ty = s.y + uy * s.len;
        const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
        grad.addColorStop(0, `rgba(226, 240, 255, ${alpha})`);
        grad.addColorStop(1, 'rgba(226, 240, 255, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of puffs) drawNebulaPuff(p, 0);
      for (const s of stars) {
        const alpha = s.z * 0.5 + 0.18;
        ctx.fillStyle = `rgba(${s.hue}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (planet) drawPlanet(planet, 0);
    };

    const draw = (now: number) => {
      if (!running) return;
      const dt = Math.min(now - last, 50);
      last = now;
      const t = now;
      ctx.clearRect(0, 0, width, height);

      // Nebula puffs drift + breathe
      for (const p of puffs) {
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.x = wrap(p.x, width);
        p.y = wrap(p.y, height);
        drawNebulaPuff(p, t);
      }

      // Planet drift
      if (planet) {
        planet.x += planet.vx * (dt / 16);
        planet.y += planet.vy * (dt / 16);
        planet.x = wrap(planet.x, width);
        planet.y = wrap(planet.y, height);
        drawPlanet(planet, t);
      }

      // Parallax starfield
      for (const s of stars) {
        s.x += s.vx * (dt / 16);
        s.y += s.vy * (dt / 16);
        s.tw += s.twSpd * (dt / 16);
        s.x = wrap(s.x, width);
        s.y = wrap(s.y, height);
        const twinkle = 0.5 + 0.5 * Math.sin(s.tw);
        const alpha = s.z * (0.22 + twinkle * 0.55);
        const r = s.r;
        if (s.z > 0.75 && twinkle > 0.55) {
          // brightest near stars get a soft halo
          ctx.fillStyle = `rgba(${s.hue}, ${alpha * 0.14})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${s.hue}, ${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shooting stars
      if (now >= nextShotAt && shots.length < 2) {
        spawnShot();
        nextShotAt = now + 1600 + Math.random() * 3800;
      }
      drawShots();

      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (enabledRef.current) {
        running = true;
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    last = performance.now();
    if (enabledRef.current) {
      running = true;
      raf = requestAnimationFrame(draw);
    } else {
      drawStatic();
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    // Re-render when the toggle flips.
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      if (enabledRef.current) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(draw);
      } else {
        running = false;
        drawStatic();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-animations'] });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="animated-background"
      aria-hidden="true"
    />
  );
}
