const CARDINALS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function degToCardinal(deg) {
  if (deg == null || Number.isNaN(deg)) return null;
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return CARDINALS_16[idx];
}

/**
 * Rotating arrow icon for wind direction. `deg` is Open-Meteo's
 * wind_direction_10m -- meteorological convention, i.e. the direction the
 * wind is blowing FROM, measured clockwise from true north. A wind vane
 * points into the wind (toward where it's coming from), which is the more
 * common "weather app" read, so the arrow is drawn pointing along `deg`
 * with no offset. Renders nothing if direction is unknown, so it's safe to
 * always mount even before live weather data has loaded.
 */
export default function WindDirectionArrow({ deg, size = 16, color = '#e2eaf5' }) {
  if (deg == null || Number.isNaN(deg)) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: 'inline-block', verticalAlign: 'middle', transform: `rotate(${deg}deg)`, transition: 'transform 0.6s ease' }}
    >
      <path
        d="M12 2 L12 20 M12 2 L6.5 9.5 M12 2 L17.5 9.5"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
