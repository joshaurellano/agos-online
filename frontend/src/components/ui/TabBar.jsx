import { useEffect, useRef } from 'react';

// Underline tabs that stay stuck under the topbar, so switching sections
// never means scrolling back to the top first.
//
// Usage:
//   <TabBar idPrefix="dash" tabs={[{ key: 'map', label: 'Map' }]} active="map" onChange={setTab} />
// Each panel should use id={`${idPrefix}-panel-${key}`} and
// aria-labelledby={`${idPrefix}-tab-${key}`}.
export default function TabBar({ tabs, active, onChange, idPrefix = 'tab', label = 'Sections' }) {
  const barRef = useRef(null);

  // The topbar's height changes with screen size (its controls wrap on
  // phones), so measure it instead of hardcoding an offset.
  useEffect(() => {
    const topbar = document.querySelector('.topbar');
    const bar = barRef.current;
    if (!topbar || !bar) return undefined;
    const sync = () => bar.style.setProperty('--tabbar-top', `${topbar.offsetHeight}px`);
    sync();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(sync);
    ro.observe(topbar);
    return () => ro.disconnect();
  }, []);

  const onKeyDown = (e, index) => {
    const last = tabs.length - 1;
    let next = null;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].key);
    document.getElementById(`${idPrefix}-tab-${tabs[next].key}`)?.focus();
  };

  return (
    <div ref={barRef} className="tabbar" role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            id={`${idPrefix}-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={isActive ? 0 : -1}
            className={`tabbar-tab${isActive ? ' active' : ''}`}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
