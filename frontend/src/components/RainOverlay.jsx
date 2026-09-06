import { useEffect, useRef } from 'react';

// ─── Backend signal -> visual intensity ────────────────────────────────────
// `condition` (e.g. "Heavy Rain", "Thunderstorm", "Cloudy") is the primary
// signal when present -- it's the more semantically direct source of what's
// actually happening in the sky. `rainfallMm` (mm/hr) is used both as a
// fallback (same tiering as the Rainfall Intensity badges elsewhere in the
// app: >10 Heavy, >2 Moderate, else Light) and to continuously scale the
// animation strength within whatever tier we land on, so 2.1mm/hr and
// 9.9mm/hr -- both "Moderate" -- don't render identically.
function resolveIntensity(rainfallMm, condition) {
  const mm = Math.max(rainfallMm ?? 0, 0);
  const c = (condition || '').toLowerCase();

  let tier = null;
  if (c) {
    // Matched against the backend's actual WMO_LABELS strings
    // (app/utils/alerts.py) -- "Violent showers" needs "violent" called
    // out explicitly or it falls through to the light/"shower" bucket.
    if (/(thunder|storm|squall)/.test(c)) tier = 'storm';
    else if (/(heavy|violent)/.test(c)) tier = 'heavy';
    else if (/moderate/.test(c)) tier = 'moderate';
    else if (/(light|drizzle|shower)/.test(c)) tier = 'light';
    else if (/(clear|sunny|cloud|fair|fog|haze|partly|overcast)/.test(c)) tier = 'none';
  }
  if (tier === null) {
    tier = mm > 10 ? 'heavy' : mm > 2 ? 'moderate' : mm > 0 ? 'light' : 'none';
  }

  const TIER_FLOOR = { none: 0, light: 0.18, moderate: 0.42, heavy: 0.7, storm: 0.85 };
  const mmStrength = Math.min(mm / 30, 1);
  const strength = tier === 'none' ? 0 : Math.max(TIER_FLOOR[tier], mmStrength);

  // "Overcast" is its own signal, separate from the rain tier above -- it's
  // not precipitation, so it never adds raindrops, but a flat gray sky
  // still deserves *some* visual read on the map instead of looking
  // identical to "Clear". Only fires when there's no active rain tier, so a
  // thunderstorm (which is also technically overcast) keeps showing rain
  // streaks + lightning instead of stacking a second effect on top.
  const isOvercast = tier === 'none' && /overcast/.test(c);

  return { tier, strength: Math.min(strength, 1), isStorm: tier === 'storm', isOvercast };
}

const MAX_DROPS = 260;
const MAX_CLOUDS = 6;

/**
 * Animated weather layer that sits on top of a maplibre 3D map. Purely a
 * visual overlay -- pointer-events are disabled so map panning/zooming/
 * rotating still works underneath it. Draws rain streaks (+ lightning for
 * storms) when there's active precipitation, slow drifting cloud-shadow
 * patches for a plain "Overcast" sky, and renders nothing otherwise, so
 * it's safe to always mount alongside the map.
 */
export default function RainOverlay({ rainfallMm, condition, windSignal = 0 }) {
  const canvasRef = useRef(null);
  const liveRef = useRef({ tier: 'none', strength: 0, isStorm: false, isOvercast: false, windSignal: 0 });

  const { tier, strength, isStorm, isOvercast } = resolveIntensity(rainfallMm, condition);
  liveRef.current = { tier, strength, isStorm, isOvercast, windSignal: windSignal || 0 };

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let drops = [];
    let clouds = [];
    let lightningAlpha = 0;
    let lightningCooldown = 0;
    let raf;

    function resize() {
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnDrop() {
      const s = liveRef.current.strength;
      return {
        x: Math.random() * (width + 200) - 100,
        y: Math.random() * -height,
        len: 10 + s * 22 + Math.random() * 8,
        speed: 6 + s * 14 + Math.random() * 4,
        drift: liveRef.current.windSignal * 0.5 + (Math.random() - 0.5) * 0.6,
        opacity: 0.15 + Math.random() * 0.25 + s * 0.2,
      };
    }

    // Soft, slow-drifting gray patches -- read as cloud-shadows passing
    // over the map rather than rain. Spawned across the full height (not
    // just up top) and recycled once they drift past the right edge.
    function spawnCloud(startX) {
      return {
        x: startX ?? Math.random() * (width + 500) - 250,
        y: Math.random() * height,
        rx: 160 + Math.random() * 200,
        ry: 60 + Math.random() * 70,
        speed: 0.15 + Math.random() * 0.25,
        opacity: 0.16 + Math.random() * 0.14,
      };
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    function frame() {
      const { strength: s, isStorm: storm, isOvercast: overcast } = liveRef.current;
      ctx.clearRect(0, 0, width, height);

      if (overcast) {
        // Flat wash first, so the map reads as "dimmed under cloud cover"
        // immediately -- the drifting blobs on top are the moving detail,
        // not the only signal that overcast mode is active.
        ctx.fillStyle = 'rgba(85, 95, 110, 0.14)';
        ctx.fillRect(0, 0, width, height);

        while (clouds.length < MAX_CLOUDS) clouds.push(spawnCloud());
        for (const cl of clouds) {
          const grad = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, Math.max(cl.rx, cl.ry));
          grad.addColorStop(0, `rgba(70, 80, 95, ${cl.opacity})`);
          grad.addColorStop(0.6, `rgba(70, 80, 95, ${cl.opacity * 0.5})`);
          grad.addColorStop(1, 'rgba(70, 80, 95, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(cl.x, cl.y, cl.rx, cl.ry, 0, 0, Math.PI * 2);
          ctx.fill();
          cl.x += cl.speed;
          if (cl.x - cl.rx > width) Object.assign(cl, spawnCloud(-cl.rx - 100));
        }
      } else if (clouds.length) {
        clouds.length = 0;
      }

      const targetCount = Math.round(MAX_DROPS * s);
      while (drops.length < targetCount) drops.push(spawnDrop());
      if (drops.length > targetCount) drops.length = targetCount;

      if (s > 0) {
        // Faint overall haze that thickens with intensity, so heavy/storm
        // rain reads as "socked in" rather than just "more streaks". Uses a
        // mid-tone (neither near-white nor near-black) so it stays visible
        // whether the basemap underneath is light (Positron/daytime) or
        // dark (satellite/night) -- a light haze color used to disappear
        // into light basemaps entirely.
        ctx.fillStyle = `rgba(120, 140, 160, ${(0.02 + s * 0.06).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);

        ctx.lineWidth = 1.1;
        for (const d of drops) {
          ctx.globalAlpha = d.opacity;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.drift * 4, d.y + d.len);
          // Double-stroke each drop: a dark line for contrast against light
          // basemaps, plus a light line for contrast against dark basemaps.
          // Together they read clearly regardless of what's underneath --
          // the previous single light-blue stroke under mix-blend-mode:
          // 'screen' lightened everything and vanished on light basemaps.
          ctx.strokeStyle = 'rgba(40, 55, 75, 0.55)';
          ctx.stroke();
          ctx.save();
          ctx.translate(-0.6, -0.6);
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.drift * 4, d.y + d.len);
          ctx.strokeStyle = 'rgba(210, 228, 245, 0.7)';
          ctx.stroke();
          ctx.restore();
          d.x += d.drift;
          d.y += d.speed;
          if (d.y > height) Object.assign(d, spawnDrop(), { y: -10 });
        }
        ctx.globalAlpha = 1;
      }

      // Occasional lightning flash for storm-tier conditions only.
      if (storm) {
        lightningCooldown -= 1;
        if (lightningCooldown <= 0 && Math.random() < 0.01) {
          lightningAlpha = 0.5 + Math.random() * 0.3;
          lightningCooldown = 90 + Math.random() * 120;
        }
      }
      if (lightningAlpha > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${lightningAlpha})`;
        ctx.fillRect(0, 0, width, height);
        lightningAlpha *= 0.85;
      } else {
        lightningAlpha = 0;
      }

      raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // Intentionally empty -- the loop reads intensity live from liveRef
    // every frame, so it doesn't need to restart when props change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 2,
      }}
    />
  );
}
