import { useEffect, useState } from 'react';
import agosLogo from '../assets/agos-logo.png';

// Rotating status lines so a long wait feels like progress, not a freeze.
const DEFAULT_MESSAGES = [
  'Running the flood model',
  'Preparing your dashboard',
];

// Shown while a lazy page, the sign-in check, or the first data fetch is
// loading. `fullscreen` covers the whole viewport; otherwise it fills the
// content area. Pass `messages={[]}` for a plain spinner with no caption.
export default function PageLoader({ fullscreen = false, messages = DEFAULT_MESSAGES, slowHint = true }) {
  const [index, setIndex] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (messages.length < 2) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), 2200);
    return () => clearInterval(id);
  }, [messages.length]);

  // The model server can take a while to wake up, so say so instead of
  // leaving people wondering whether the page is stuck.
  useEffect(() => {
    if (!slowHint) return undefined;
    const id = setTimeout(() => setSlow(true), 9000);
    return () => clearTimeout(id);
  }, [slowHint]);

  const message = messages[index] ?? '';

  return (
    <div className={`page-loader${fullscreen ? ' page-loader-full' : ''}`} role="status" aria-live="polite">
      <div className="agos-loader" aria-hidden="true">
        <span className="agos-loader-ripple" />
        <span className="agos-loader-ripple agos-loader-ripple-2" />
        <span className="agos-loader-ripple agos-loader-ripple-3" />
        <svg className="agos-loader-ring" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="agos-loader-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <circle className="agos-loader-track" cx="50" cy="50" r="44" />
          <circle className="agos-loader-arc" cx="50" cy="50" r="44" />
        </svg>
        <svg className="agos-loader-ring agos-loader-ring-inner" viewBox="0 0 100 100">
          <circle className="agos-loader-arc agos-loader-arc-inner" cx="50" cy="50" r="35" />
        </svg>
        <img className="agos-loader-logo" src={agosLogo} alt="" draggable="false" />
      </div>

      {message && <p className="agos-loader-text" key={index}>{message}<span className="agos-loader-dots" /></p>}
      {slow && <p className="agos-loader-hint">Still working. The forecast server may be waking up.</p>}
      <span className="visually-hidden">Loading</span>
    </div>
  );
}
