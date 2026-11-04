// Six hourly columns: chance of rain (column height and number) and temperature.
//
// One hue on purpose. Chance of rain is not a flood alert level, so it does not
// borrow the green / yellow / red of the alert scale. A red "100%" next to a
// calm NORMAL banner reads as a contradiction; a darker blue column does not.
export default function NextHoursStrip({ hours }) {
  return (
    <div className="hours-grid">
      {hours.map((h) => {
        const pop = Math.round(h.rain_probability_pct ?? 0);
        const time = new Date(h.time).toLocaleTimeString('en-PH', { hour: 'numeric', hour12: true, timeZone: 'Asia/Manila' });
        const temp = h.temperature_c != null ? `${Math.round(h.temperature_c)}°` : '—';
        return (
          <div key={h.time} className="hour-cell" role="group" aria-label={`${time}: ${pop}% chance of rain, ${temp}`}>
            <div className="hour-pop">{pop}%</div>
            <div className="hour-bar" aria-hidden="true">
              <span style={{ height: pop === 0 ? 0 : `${Math.max(pop, 4)}%`, opacity: 0.45 + pop * 0.0055 }} />
            </div>
            <div className="hour-time">{time}</div>
            <div className="hour-temp">{temp}</div>
          </div>
        );
      })}
    </div>
  );
}
