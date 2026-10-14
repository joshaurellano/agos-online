import { useEffect, useRef } from 'react';
import { useAccessibility } from '../hooks/useAccessibility';

// Speed (km/h) -> streak colour. Calm air is a faint cyan; strong wind turns
// amber then red, so the layer reads at a glance like a weather-agency wind map.
const SPEED_COLORS = [
  { max: 10, rgb: '186, 230, 253' },
  { max: 25, rgb: '56, 189, 248' },
  { max: 40, rgb: '251, 191, 36' },
  { max: Infinity, rgb: '248, 113, 113' },
];

function colorFor(kph) {
  return (SPEED_COLORS.find(c => kph < c.max) ?? SPEED_COLORS[SPEED_COLORS.length - 1]).rgb;
}

/**
 * Animated wind-flow streaks drawn over the map.
 *
 * The data is a single barangay-wide reading (one speed + one direction from
 * Open-Meteo), not a spatial wind grid, so the field is uniform: every streak
 * moves the same way at roughly the same speed, with a little per-particle
 * variation and gentle wobble so it looks like flowing air instead of a
 * conveyor belt. It shows *which way and how hard* the wind blows over
 * Triangulo -- it does not claim wind differs between streets.
 *
 * `directionDeg` is meteorological (the direction the wind comes FROM,
 * clockwise from north), so streaks travel toward directionDeg + 180. The
 * flow is also rotated against the map's bearing so "north" stays true when
 * the 3D view is turned.
 */
function WindFlowCanvas({ speedKph, gustKph, directionDeg, mapRef, zIndex = 3 }) {
  const canvasRef = useRef(null);
  const liveRef = useRef({ speedKph: 0, gustKph: 0, directionDeg: null });
  liveRef.current = { speedKph: speedKph ?? 0, gustKph: gustKph ?? 0, directionDeg };

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let particles = [];
    let raf = 0;
    let t = 0;

    const spawn = (p, anywhere = true) => {
      p.x = Math.random() * width;
      p.y = Math.random() * height;
      p.px = p.x;
      p.py = p.y;
      p.life = 0;
      p.maxLife = 70 + Math.random() * 110;
      p.k = 0.7 + Math.random() * 0.6; // per-particle speed variation
      p.phase = Math.random() * Math.PI * 2;
      return p;
    };

    const resize = () => {
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(700, Math.max(80, Math.round((width * height) / 2600)));
      particles = Array.from({ length: count }, () => spawn({}));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    function frame() {
      const { speedKph: spd, gustKph: gust, directionDeg: from } = liveRef.current;
      t += 1;

      // Calm / unknown direction: clear and idle (cheap) instead of animating.
      if (from == null || spd < 0.5) {
        ctx.clearRect(0, 0, width, height);
        raf = requestAnimationFrame(frame);
        return;
      }

      // Fade the previous frame to leave trails.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      const bearing = mapRef?.current?.getBearing?.() ?? 0;
      const toRad = ((from + 180 - bearing) * Math.PI) / 180;
      const dx = Math.sin(toRad);
      const dy = -Math.cos(toRad);

      // Gusts pulse the flow a little when the forecast reports them.
      const gustBoost = gust > spd ? 1 + 0.25 * Math.sin(t / 38) * Math.min((gust - spd) / Math.max(spd, 1), 1) : 1;
      const step = Math.min(spd * 0.075, 7) * gustBoost; // px per frame, capped
      const rgb = colorFor(spd);
      const alpha = Math.min(0.35 + spd / 60, 0.9);

      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (const p of particles) {
        p.px = p.x;
        p.py = p.y;
        const wobble = Math.sin(p.phase + t / 45 + p.x * 0.008) * 0.35;
        const cos = Math.cos(wobble);
        const sin = Math.sin(wobble);
        const vx = (dx * cos - dy * sin) * step * p.k;
        const vy = (dx * sin + dy * cos) * step * p.k;
        p.x += vx;
        p.y += vy;
        p.life += 1;

        if (p.life > p.maxLife || p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
          spawn(p);
          continue;
        }
        // Fade in and out over the particle's life.
        const edge = Math.min(p.life / 12, (p.maxLife - p.life) / 20, 1);
        ctx.strokeStyle = `rgba(${rgb}, ${(alpha * edge).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // The loop reads speed/direction live from liveRef each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex,
      }}
    />
  );
}

// Canvas animation is JS-driven, so the CSS reduce-motion rule can't reach
// it -- skip it entirely when the person has asked for less motion.
export default function WindFlowOverlay(props) {
  const { reduceMotion } = useAccessibility();
  return reduceMotion ? null : <WindFlowCanvas {...props} />;
}
