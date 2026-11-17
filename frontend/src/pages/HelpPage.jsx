import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuSearch, LuChevronDown, LuLayoutDashboard, LuWaves, LuCloudRain, LuSettings,
  LuPhoneCall, LuMapPin, LuX,
} from 'react-icons/lu';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { isResident } from '../lib/roles';

// Help Center: quick start links, what the alert levels and rainfall
// categories mean, and a searchable FAQ. English only for now; the alert level
// names and descriptions come from lib/i18n.js so they follow the language
// picker. Staff questions only show to signed-in staff.

const LEVELS = [
  { key: 'NORMAL',   color: '#22c55e', range: 'Below 25%' },
  { key: 'ADVISORY', color: '#eab308', range: '25% to 49%' },
  { key: 'WARNING',  color: '#f97316', range: '50% to 74%' },
  { key: 'CRITICAL', color: '#ef4444', range: '75% and above' },
];

// Same PAGASA hourly categories used on the Rainfall page.
const RAIN_CATEGORIES = [
  { label: 'Light',      color: '#22c55e', range: 'Below 2.5 mm/hr' },
  { label: 'Moderate',   color: '#eab308', range: '2.5 to 7.5 mm/hr' },
  { label: 'Heavy',      color: '#f97316', range: '7.5 to 15 mm/hr' },
  { label: 'Intense',    color: '#ef4444', range: '15 to 30 mm/hr' },
  { label: 'Torrential', color: '#7c3aed', range: 'Above 30 mm/hr' },
];

const QUICK_START = [
  { to: '/dashboard',         icon: LuLayoutDashboard, title: 'Check the status',   text: 'See the current alert level, flood chance and forecast.' },
  { to: '/know-your-hazards', icon: LuWaves,           title: 'Know your risk',     text: 'Find evacuation routes and what to do if flooding starts.' },
  { to: '/rainfall',          icon: LuCloudRain,       title: 'Check the rainfall', text: 'See how much rain fell in the last 24 hours or 7 days.' },
  { to: '/settings',          icon: LuSettings,        title: 'Change settings',    text: 'Pick a language, text size, theme and forecast model.' },
];

const FAQS = [
  {
    group: 'General',
    items: [
      {
        q: 'What is AGOS?',
        a: 'AGOS is a flood early warning and forecasting system for Barangay Triangulo, Naga City. It is a project of students of Naga College Foundation, College of Computer Studies. Forecasts are model-based and can be wrong, so in an emergency always follow the Barangay and the city disaster risk reduction office.',
      },
      {
        q: 'Do I need an account to use AGOS?',
        a: 'No. The Dashboard, Rainfall, Know Your Risk and Alert Log pages are open to everyone. Signing in is only for barangay staff who use tools such as alert dispatch and resident records.',
      },
      {
        q: 'There is flooding right now. What should I do?',
        a: 'Stay away from floodwater and move to higher ground if the water is rising. For emergencies, call 911. Follow announcements from the Barangay, and visit the Barangay Triangulo office in Naga City if you need help. AGOS is an information tool, not an emergency service.',
      },
    ],
  },
  {
    group: 'Forecasts and data',
    items: [
      {
        q: 'How is the flood chance worked out?',
        a: 'A trained machine-learning model (GRU, LSTM or CNN) uses recent rainfall, humidity, wind and weather forecast data to estimate how likely flooding is. The alert level comes from that chance: Normal below 25%, Advisory from 25%, Warning from 50% and Critical from 75%. It shows how likely a flood is, not how deep it will get.',
      },
      {
        q: 'What are the GRU, LSTM and CNN choices?',
        a: 'They are three different trained models that use the same data. You can switch between them with the Model buttons at the top of the page, or in Settings, to compare their results. Every page follows the model you pick.',
      },
      {
        q: 'How often does the data update?',
        a: 'The flood prediction refreshes about every 30 seconds while the page is open, and the dashboard rainfall chart refreshes every minute.',
      },
      {
        q: 'Where does the data come from?',
        a: 'Weather and rainfall data come from PAGASA and Open-Meteo. The maps use OpenStreetMap.',
      },
      {
        q: 'Why are the bars in the rainfall chart so small, or why does the scale look zoomed in?',
        a: 'The chart scale adjusts to recent rainfall so light rain is still visible. When it is zoomed in, a note under the chart says so, and the Moderate and Heavy lines only appear once they fit on the scale. Use the bar colors and the categories on this page to judge how serious the rain is.',
      },
      {
        q: 'What does "No reading" mean on the rainfall chart?',
        a: 'No data was recorded for that hour. It does not mean there was no rain, and it is not counted as 0 mm/hr.',
      },
      {
        q: 'What does the "Data may be stale" warning mean?',
        a: 'The last update was more than 5 minutes ago. Check your internet connection and refresh the page. If it keeps showing, the forecast server may be waking up or temporarily down.',
      },
      {
        q: 'The page takes a while to load. Is something wrong?',
        a: 'Sometimes the forecast server needs a moment to wake up, especially after it has been idle. The loading screen will tell you if it is taking longer than usual. Wait a few seconds, and refresh if nothing appears after a minute or two.',
      },
    ],
  },
  {
    group: 'Using the app',
    items: [
      {
        q: 'How do I find the nearest evacuation route?',
        a: 'Open Know Your Risk from the menu. It has the evacuation map and a guide for what to do if flooding starts, including a survival kit checklist you can tick off.',
      },
      {
        q: 'How do I change the language, text size or theme?',
        a: 'Open Settings. Appearance & language lets you choose English, Filipino or Bikol and switch between dark and light mode. The Accessibility section has larger text, high contrast, reduced motion and more.',
      },
      {
        q: 'How do I read the alert history?',
        a: 'Open Alert Log from the menu to see past alerts and when they were sent.',
      },
    ],
  },
  {
    group: 'For barangay staff',
    staffOnly: true,
    items: [
      {
        q: 'How do I sign in?',
        a: 'Use the Staff sign in button in the top bar. Staff accounts are created by an administrator, so ask an admin if you do not have one.',
      },
      {
        q: 'How are alerts sent to residents?',
        a: 'Alerts are dispatched automatically when the alert level changes. Staff can also queue an evacuation alert from the Dashboard. Delivery status is shown in the Staff tab of the Dashboard.',
      },
      {
        q: 'How do I add or look up a resident?',
        a: 'Use Add Resident to register someone and Residents to search the registry. Both are in the Staff tools part of the menu.',
      },
      {
        q: 'Why can I not see ML Analytics or Staff accounts?',
        a: 'Those pages are for administrators only.',
      },
    ],
  },
];

const STYLES = `
.help-page { max-width: 980px; margin: 0 auto; }
.help-hero { margin-bottom: 18px; }
.help-hero h2 { font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; margin: 0 0 4px; color: var(--text-primary); }
.help-hero p { margin: 0 0 14px; color: var(--text-secondary); font-size: 0.92rem; }

.help-search { position: relative; max-width: 520px; }
.help-search > svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.help-search input {
  width: 100%; padding: 11px 38px 11px 40px; font-size: 0.92rem; font-family: var(--font-body);
  color: var(--text-primary); background: var(--blue-card); border: 1px solid var(--blue-border);
  border-radius: var(--radius-sm);
}
.help-search input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.help-search-clear {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: inline-flex;
  align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 50%;
  background: transparent; color: var(--text-muted); cursor: pointer;
}
.help-search-clear:hover { color: var(--text-primary); background: var(--blue-mid); }

.help-quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 18px; }
.help-quick-link {
  display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; text-decoration: none;
  background: var(--blue-card); border: 1px solid var(--blue-border); border-radius: var(--radius);
  color: var(--text-secondary); font-size: 0.85rem; line-height: 1.45;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.help-quick-link:hover { transform: translateY(-2px); border-color: var(--accent); }
.help-quick-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.help-quick-link strong { display: flex; align-items: center; gap: 8px; color: var(--text-primary); font-size: 0.95rem; }
.help-quick-link svg { color: var(--accent); flex-shrink: 0; }

.help-two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; align-items: start; }
@media (max-width: 860px) { .help-two { grid-template-columns: 1fr; } }

.help-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.help-legend li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; }
.help-legend li + li { border-top: 1px solid var(--blue-border); }
.help-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.help-legend-main { flex: 1; min-width: 0; }
.help-legend-name { font-weight: 700; color: var(--text-primary); font-size: 0.92rem; }
.help-legend-name span { font-weight: 500; color: var(--text-muted); font-size: 0.8rem; margin-left: 6px; }
.help-legend-desc { margin: 2px 0 0; color: var(--text-secondary); font-size: 0.84rem; line-height: 1.5; }
.help-legend-range { color: var(--text-muted); font-size: 0.8rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
.help-note { margin: 12px 0 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; }

.help-group-title {
  margin: 20px 2px 8px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-muted);
}
.help-faq {
  background: var(--blue-card); border: 1px solid var(--blue-border); border-radius: var(--radius);
  margin-bottom: 8px; overflow: hidden;
}
.help-faq summary {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer;
  padding: 14px 16px; list-style: none; font-weight: 600; font-size: 0.92rem; color: var(--text-primary);
}
.help-faq summary::-webkit-details-marker { display: none; }
.help-faq summary:hover { background: var(--blue-mid); }
.help-faq summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.help-faq summary svg { flex-shrink: 0; color: var(--text-muted); transition: transform 0.2s ease; }
.help-faq[open] summary svg { transform: rotate(180deg); }
.help-faq-answer { padding: 0 16px 16px; color: var(--text-secondary); font-size: 0.88rem; line-height: 1.65; }
.help-faq-answer p { margin: 0; }

.help-empty { text-align: center; padding: 32px 16px; color: var(--text-secondary); }
.help-contact { display: flex; flex-wrap: wrap; gap: 14px 28px; margin-top: 4px; }
.help-contact > div { display: flex; align-items: flex-start; gap: 10px; color: var(--text-secondary); font-size: 0.88rem; line-height: 1.5; }
.help-contact svg { color: var(--accent); margin-top: 2px; flex-shrink: 0; }
.help-contact strong { color: var(--text-primary); }

@media (prefers-reduced-motion: reduce) {
  .help-quick-link, .help-faq summary svg { transition: none; }
  .help-quick-link:hover { transform: none; }
}
`;

export default function HelpPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const staffView = !!user && !isResident(user);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    return FAQS
      .filter((g) => !g.staffOnly || staffView)
      .map((g) => ({
        ...g,
        items: q ? g.items.filter((i) => `${i.q} ${i.a}`.toLowerCase().includes(q)) : g.items,
      }))
      .filter((g) => g.items.length > 0);
  }, [q, staffView]);

  const resultCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="help-page fade-in">
      <style>{STYLES}</style>

      <div className="help-hero">
        <h2>How can we help?</h2>
        <p>Find out how AGOS works, what the alerts mean, and what to do when flooding is possible.</p>
        <div className="help-search" role="search">
          <LuSearch size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help, e.g. rainfall, alert, evacuation"
            aria-label="Search help"
          />
          {query && (
            <button type="button" className="help-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <LuX size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!q && (
        <>
          <nav className="help-quick" aria-label="Quick start">
            {QUICK_START.map(({ to, icon: Icon, title, text }) => (
              <Link key={to} to={to} className="help-quick-link">
                <strong><Icon size={18} aria-hidden="true" /> {title}</strong>
                {text}
              </Link>
            ))}
          </nav>

          <div className="help-two">
            <section className="card" aria-labelledby="help-levels-title">
              <h2 id="help-levels-title" className="card-title">What the alert levels mean</h2>
              <ul className="help-legend">
                {LEVELS.map((lvl) => (
                  <li key={lvl.key}>
                    <span className="help-dot" style={{ background: lvl.color }} aria-hidden="true" />
                    <div className="help-legend-main">
                      <div className="help-legend-name">
                        {t(`alertLevel.${lvl.key}.name`)}
                        <span>{t(`alertLevel.${lvl.key}.stance`)}</span>
                      </div>
                      <p className="help-legend-desc">{t(`alertLevel.${lvl.key}.desc`)}</p>
                    </div>
                    <span className="help-legend-range">{lvl.range}</span>
                  </li>
                ))}
              </ul>
              <p className="help-note">
                The percentage is the chance of flooding from the forecast model. The level shows how
                likely a flood is, not how deep the water will get.
              </p>
            </section>

            <section className="card" aria-labelledby="help-rain-title">
              <h2 id="help-rain-title" className="card-title">Rainfall categories</h2>
              <ul className="help-legend">
                {RAIN_CATEGORIES.map((c) => (
                  <li key={c.label}>
                    <span className="help-dot" style={{ background: c.color }} aria-hidden="true" />
                    <div className="help-legend-main">
                      <div className="help-legend-name">{c.label}</div>
                    </div>
                    <span className="help-legend-range">{c.range}</span>
                  </li>
                ))}
              </ul>
              <p className="help-note">
                These are the PAGASA hourly rain intensity categories. Rainfall charts use the same colors.
              </p>
            </section>
          </div>
        </>
      )}

      <div role="status" aria-live="polite" className="visually-hidden">
        {q ? `${resultCount} ${resultCount === 1 ? 'result' : 'results'} found` : ''}
      </div>

      {groups.map((g) => (
        <section key={g.group} aria-label={g.group}>
          <h2 className="help-group-title">{g.group}</h2>
          {g.items.map((item) => (
            <details key={item.q} className="help-faq" open={q ? true : undefined}>
              <summary>
                {item.q}
                <LuChevronDown size={18} aria-hidden="true" />
              </summary>
              <div className="help-faq-answer"><p>{item.a}</p></div>
            </details>
          ))}
        </section>
      ))}

      {q && resultCount === 0 && (
        <div className="card help-empty">
          <strong>No help topics match "{query.trim()}".</strong>
          <p style={{ margin: '6px 0 0' }}>Try a different word, or ask the barangay office directly.</p>
        </div>
      )}

      <section className="card" aria-labelledby="help-contact-title" style={{ marginTop: 20 }}>
        <h2 id="help-contact-title" className="card-title">Still need help?</h2>
        <div className="help-contact">
          <div>
            <LuMapPin size={18} aria-hidden="true" />
            <span><strong>Barangay Triangulo office</strong><br />Visit the office in Naga City.</span>
          </div>
          <div>
            <LuPhoneCall size={18} aria-hidden="true" />
            <span><strong>Emergency</strong><br />Call 911 for emergencies.</span>
          </div>
        </div>
        <p className="help-note">
          Read how AGOS handles your information in the <Link to="/privacy">Privacy notice</Link>.
        </p>
      </section>
    </div>
  );
}
