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

  // "Fog"/"Icy fog"/haze -- a visibility condition, not a cloud-cover one,
  // so it gets its own thinner, faster-moving veil instead of reusing the
  // cumulus clouds. Same no-precipitation, no-double-stacking rule as
  // isOvercast above.
  const isFog = tier === 'none' && /(fog|haze)/.test(c);

  return { tier, strength: Math.min(strength, 1), isStorm: tier === 'storm', isOvercast, isFog };
}

const MAX_DROPS = 260;
const MAX_CLOUDS = 5;
const MAX_FOG_BANDS = 4;

// ─── Cloud sprite ───────────────────────────────────────────────────────────
// A real cumulus silhouette (overlapping puffs, not a soft gradient blob),
// pre-rendered once to an offscreen canvas and reused for every cloud
// instance -- shape is drawn a single time; per-frame work is just a cheap
// drawImage() at each cloud's current x/y.
const CLOUD_PUFFS = [
  { dx: -0.62, dy: 0.16, r: 0.30 },
  { dx: -0.34, dy: -0.06, r: 0.40 },
  { dx: -0.02, dy: -0.18, r: 0.46 },
  { dx: 0.30, dy: -0.08, r: 0.42 },
  { dx: 0.58, dy: 0.10, r: 0.32 },
  { dx: 0.82, dy: 0.22, r: 0.22 },
  { dx: -0.86, dy: 0.24, r: 0.20 },
];

function buildCloudSprite() {
  const W = 480, H = 300;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const octx = off.getContext('2d');
  const cx = W / 2;
  const cy = H * 0.6;
  const scale = W * 0.42;

  // Silhouette: flat white first (the shading pass below only reads alpha,
  // so the base tone doesn't matter beyond giving every puff full opacity).
  octx.fillStyle = '#ffffff';
  CLOUD_PUFFS.forEach(p => {
    octx.beginPath();
    octx.arc(cx + p.dx * scale, cy + p.dy * scale, p.r * scale, 0, Math.PI * 2);
    octx.fill();
  });
  // Rounded base so the puffs read as one cloud rather than a row of circles.
  octx.beginPath();
  octx.ellipse(cx, cy + scale * 0.2, scale * 1.05, scale * 0.34, 0, 0, Math.PI * 2);
  octx.fill();

  // Volume shading, masked to the silhouette via 'source-atop' so it never
  // spills past the cloud's own edge: pale/bright top, gray-blue underside
  // -- the classic top-lit cumulus read, and also doubles as the "shadow"
  // half so the sprite works whether it's meant as sky-cloud or cast-shadow.
  octx.globalCompositeOperation = 'source-atop';
  const shade = octx.createLinearGradient(0, cy - scale * 0.6, 0, cy + scale * 0.55);
  shade.addColorStop(0, 'rgba(255,255,255,0.98)');
  shade.addColorStop(0.45, 'rgba(226,232,240,0.95)');
  shade.addColorStop(1, 'rgba(96,107,125,0.92)');
  octx.fillStyle = shade;
  octx.fillRect(0, 0, W, H);
  octx.globalCompositeOperation = 'source-over';

  return off;
}

/**
 * Animated weather layer that sits on top of a maplibre 3D map or a Leaflet
 * 2D map. Purely a visual overlay -- pointer-events are disabled so map
 * panning/zooming/rotating still works underneath it. Draws rain streaks
 * (+ lightning for storms) when there's active precipitation, drifting
 * cumulus-shaped clouds for a plain "Overcast" sky, and renders nothing
 * otherwise, so it's safe to always mount alongside the map. `zIndex` lets
 * callers lift it above a Leaflet map's own internal panes (200-700), which
 * sit in the same stacking context; the maplibre 3D map doesn't need this.
 */
export default function RainOverlay({ rainfallMm, condition, windSignal = 0, zIndex = 2 }) {
  const canvasRef = useRef(null);
  const liveRef = useRef({ tier: 'none', strength: 0, isStorm: false, isOvercast: false, isFog: false, windSignal: 0 });

  const { tier, strength, isStorm, isOvercast, isFog } = resolveIntensity(rainfallMm, condition);
  liveRef.current = { tier, strength, isStorm, isOvercast, isFog, windSignal: windSignal || 0 };

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
    let fogBands = [];
    const cloudSprite = buildCloudSprite();
    const spriteAspect = cloudSprite.height / cloudSprite.width;
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

    // Slow-drifting cloud instances -- each just references the shared
    // sprite at its own position/scale/opacity/speed. Spawned across the
    // full height and recycled once they drift past the right edge.
    function spawnCloud(startX) {
      return {
        x: startX ?? Math.random() * (width + 600) - 300,
        y: Math.random() * height * 0.85,
        w: 220 + Math.random() * 220,
        speed: 0.14 + Math.random() * 0.22,
        opacity: 0.45 + Math.random() * 0.3,
      };
    }

    // Thin, faster-moving fog bands -- a horizontal soft-edged smear rather
    // than a cloud silhouette, since fog reads as reduced visibility, not
    // cloud cover. Lower opacity and quicker drift than the cumulus clouds
    // above so the two conditions don't look like the same effect.
    function spawnFogBand(startX) {
      return {
        x: startX ?? Math.random() * (width + 400) - 200,
        y: Math.random() * height,
        w: 260 + Math.random() * 220,
        h: 36 + Math.random() * 46,
        speed: 0.22 + Math.random() * 0.28,
        opacity: 0.07 + Math.random() * 0.06,
      };
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    function frame() {
      const { strength: s, isStorm: storm, isOvercast: overcast, isFog: fog } = liveRef.current;
      ctx.clearRect(0, 0, width, height);

      if (overcast) {
        // Faint flat wash first, so the map reads as "under cloud cover"
        // even in the gaps between individual clouds.
        ctx.fillStyle = 'rgba(85, 95, 110, 0.08)';
        ctx.fillRect(0, 0, width, height);

        while (clouds.length < MAX_CLOUDS) clouds.push(spawnCloud());
        for (const cl of clouds) {
          const w = cl.w;
          const h = w * spriteAspect;
          ctx.globalAlpha = cl.opacity;
          ctx.drawImage(cloudSprite, cl.x - w / 2, cl.y - h / 2, w, h);
          ctx.globalAlpha = 1;
          cl.x += cl.speed;
          if (cl.x - cl.w / 2 > width) Object.assign(cl, spawnCloud(-cl.w));
        }
      } else if (clouds.length) {
        clouds.length = 0;
      }

      if (fog) {
        // Gently pulsing pale wash -- reads as "reduced visibility" rather
        // than "cloud cover", so it stays thinner than the overcast wash
        // and never spawns anything shaped like a cloud.
        const pulse = 0.09 + Math.sin(performance.now() / 1600) * 0.025;
        ctx.fillStyle = `rgba(210, 214, 218, ${pulse.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);

        while (fogBands.length < MAX_FOG_BANDS) fogBands.push(spawnFogBand());
        for (const band of fogBands) {
          const grad = ctx.createLinearGradient(band.x - band.w / 2, 0, band.x + band.w / 2, 0);
          grad.addColorStop(0, 'rgba(225, 228, 232, 0)');
          grad.addColorStop(0.5, `rgba(225, 228, 232, ${band.opacity})`);
          grad.addColorStop(1, 'rgba(225, 228, 232, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(band.x - band.w / 2, band.y, band.w, band.h);
          band.x += band.speed;
          if (band.x - band.w / 2 > width) Object.assign(band, spawnFogBand(-band.w));
        }
      } else if (fogBands.length) {
        fogBands.length = 0;
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
        pointerEvents: 'none', zIndex,
      }}
    />
  );
}
