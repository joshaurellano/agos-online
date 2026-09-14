import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Wraps a map (Leaflet or MapLibre) so it can be expanded to a large
// overlay and collapsed back to its normal in-page size, via a small
// toggle button pinned to the bottom-right corner.
//
// This component only resizes the *box* the map lives in -- it doesn't
// touch the map library itself:
//   - Leaflet maps auto-invalidate their size on the window 'resize'
//     event (MapContainer's `trackResize` defaults to true), so firing
//     one after the CSS transition settles keeps tiles aligned.
//   - MapLibre-based components (FloodMap3D, EvacuationMap3D) watch
//     their own container with a ResizeObserver and call map.resize()
//     whenever it changes size, so they pick this up automatically.
//
// The expanded state is rendered through a portal straight into
// document.body rather than in place. `position: fixed` is normally
// relative to the viewport, but any ancestor with a `transform` (or
// filter/perspective) creates its own containing block instead -- e.g.
// the light theme's `.card:hover { transform: translateY(-2px) }`, which
// is active exactly when the cursor is over the card to click the expand
// button. Without the portal, the "expanded" frame would get sized
// against that small card instead of the screen, ending up smaller
// rather than bigger.
export default function ExpandableMapFrame({ children, height = 480 }) {
  const [expanded, setExpanded] = useState(false);

  // Escape key collapses back to normal size; lock page scroll while
  // the map is covering most of the screen.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  // Nudge Leaflet's built-in resize handling once the frame has finished
  // resizing (matches the transition duration below).
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
    return () => clearTimeout(id);
  }, [expanded]);

  const toggleButton = (
    <button
      onClick={() => setExpanded(v => !v)}
      title={expanded ? 'Exit fullscreen' : 'Expand map'}
      aria-label={expanded ? 'Exit fullscreen' : 'Expand map'}
      style={{
        position: 'absolute', bottom: 12, right: 12, zIndex: 650,
        width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
        background: 'rgba(13, 31, 60, 0.82)', backdropFilter: 'blur(6px)',
        border: '1px solid rgba(56,189,248,0.3)', color: '#e2eaf5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {expanded ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3H3v6M15 21h6v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      )}
    </button>
  );

  if (expanded) {
    return (
      <>
        {/* Spacer keeps the card from collapsing while the real content
            is portaled elsewhere. */}
        <div style={{ width: '100%', height }} />
        {createPortal(
          <div
            style={{
              position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, zIndex: 900,
              overflow: 'hidden',
            }}
          >
            {children}
            {toggleButton}
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {children}
      {toggleButton}
    </div>
  );
}
