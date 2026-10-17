import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LuChevronDown, LuShieldCheck } from 'react-icons/lu';

// ─────────────────────────────────────────────────────────────────────────
// EDIT THESE before launch. Anything still in [square brackets] is a
// placeholder that the barangay / school data protection officer must fill
// in. Set IS_DRAFT to false once the notice has been reviewed.
// ─────────────────────────────────────────────────────────────────────────
const IS_DRAFT = false;
const LAST_UPDATED = 'October 16, 2026';
const CONTROLLER = '[Barangay Triangulo, Naga City — confirm legal name]';
const RETENTION_RESIDENTS = '[how long, e.g. until the resident asks to be removed]';
const RETENTION_REPORTS = '[how long reports and photos are kept]';

const DATA_ROWS = [
  {
    who: 'Residents on the alert list',
    what: 'Full name, mobile number, mobile network, a record that you agreed to get alerts, and which staff member registered you.',
    why: 'To send you flood alerts by SMS.',
  },
  {
    who: 'Barangay staff and administrators',
    what: 'Full name, mobile number, username, role, and sign-in record.',
    why: 'To let authorized people sign in to AGOS.',
  },
  {
    who: 'People who send a flood report',
    what: 'Your name, a description, an optional photo, and the location you pin on the map.',
    why: 'So staff can check the report and show verified ones on the flood map.',
  },
  {
    who: 'Anyone using the website',
    what: 'Basic page-view statistics from our hosting provider. Your device location is used only if you allow it, and stays in your browser.',
    why: 'To keep the website working and show the nearest evacuation center.',
  },
];

const ITEMS = [
  {
    id: 'p-scope',
    title: 'Scope and commitment',
    body: () => (
      <>
        <p>
          This notice applies to AGOS, the flood early warning system of {CONTROLLER}, and to everyone whose
          personal information we collect through it.
        </p>
        <p>
          We handle your information under the Data Privacy Act of 2012 (Republic Act No. 10173).
        </p>
      </>
    ),
  },
  {
    id: 'p-what',
    title: 'Personal information we collect',
    body: () => (
      <div className="privacy-table-wrap">
        <table className="privacy-table">
          <thead>
            <tr><th scope="col">Who</th><th scope="col">What we keep</th><th scope="col">Why</th></tr>
          </thead>
          <tbody>
            {DATA_ROWS.map(r => (
              <tr key={r.who}>
                <th scope="row">{r.who}</th>
                <td data-label="What we keep">{r.what}</td>
                <td data-label="Why">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: 'p-use',
    title: 'How we use your information',
    body: () => (
      <>
        <ul>
          <li>Send flood alerts and warnings</li>
          <li>Verify who is signing in</li>
          <li>Check and map flood reports</li>
          <li>Keep the website secure and working</li>
          <li>Follow the law</li>
        </ul>
        <p>We do not sell your information or use it for advertising.</p>
      </>
    ),
  },
  {
    id: 'p-share',
    title: 'Who can see it',
    body: () => (
      <>
        <ul>
          <li>Barangay staff and administrators who need it to do their work.</li>
          <li>Our SMS provider, which gets your number and the alert text to deliver the message.</li>
          <li>Our hosting and database providers, who store the data for us.</li>
          <li>Verified flood reports, with the pinned location, show on the flood map.</li>
        </ul>
        <p>We share information with others only when the law requires it.</p>
      </>
    ),
  },
  {
    id: 'p-cookies',
    title: 'Cookies and browser storage',
    body: () => (
      <>
        <p>We do not use tracking or advertising cookies.</p>
        <ul>
          <li>
            Your browser stores your sign-in, theme, language, accessibility settings, and any place
            you pin on the map. These stay on your device.
          </li>
          <li>
            Maps, fonts, weather data, and the PAGASA bulletin come from outside services. They can see
            your IP address when the page loads.
          </li>
        </ul>
        <p>You can clear this data any time in your browser settings.</p>
      </>
    ),
  },
  {
    id: 'p-keep',
    title: 'How long we keep it',
    body: () => (
      <>
        <ul>
          <li>Alert list entries: {RETENTION_RESIDENTS}</li>
          <li>Flood reports and photos: {RETENTION_REPORTS}</li>
        </ul>
        <p>Changes to the resident list are saved in an audit log.</p>
      </>
    ),
  },
  {
    id: 'p-rights',
    title: 'Your privacy choices',
    body: () => (
      <>
        <p>You have the right to:</p>
        <ul>
          <li>be informed about how your data is used;</li>
          <li>see the data we hold about you;</li>
          <li>correct data that is wrong;</li>
          <li>object, or ask us to block or delete it;</li>
          <li>get a copy of your data;</li>
          <li>claim damages if your data was misused;</li>
          <li>file a complaint with the National Privacy Commission.</li>
        </ul>
        <p>
          Residents are added to the alert list in person, after they agree to get SMS alerts. You can
          take back that consent at any time and your number will be removed. We may ask a few questions to
          confirm it is really you.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'How to contact us',
    body: () => (
      <>
        <p>
          To ask a question, fix your details, or be removed from the alert list, visit the Barangay
          Triangulo office.
        </p>
        <p>
          If a data breach affects you, we will tell you and the National Privacy Commission as the law requires.
        </p>
      </>
    ),
  },
  {
    id: 'p-changes',
    title: 'Changes to this notice',
    body: () => <p>If we change this notice, the date at the top will change.</p>,
  },
];

const STYLES = `
/* ── Privacy notice page ────────────────────────────────────────────── */
.privacy-page { max-width: 760px; margin: 0 auto; line-height: 1.65; color: var(--text-secondary); }
.privacy-hero { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.privacy-hero-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 48px; height: 48px; border-radius: 14px; font-size: 1.5rem;
  background: var(--blue-mid); border: 1px solid var(--blue-border); color: var(--accent);
}
.privacy-title { font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin: 0; line-height: 1.2; }
.privacy-meta { font-size: 0.82rem; color: var(--text-muted); margin: 2px 0 0; }
.privacy-draft {
  padding: 12px 16px; margin-bottom: 18px; border-radius: 10px; font-size: 0.88rem;
  background: color-mix(in srgb, var(--orange) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--orange) 45%, transparent);
  color: var(--text-primary);
}
.privacy-acc-tools { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.privacy-acc-all {
  background: none; border: none; cursor: pointer; font: inherit; font-size: 0.82rem; font-weight: 700;
  color: var(--accent); padding: 4px 2px;
}
.privacy-acc-all:hover { text-decoration: underline; }

.privacy-acc { display: flex; flex-direction: column; gap: 10px; }
.privacy-acc-item {
  background: var(--blue-card); border: 1px solid var(--blue-border); border-radius: var(--radius);
  overflow: hidden; scroll-margin-top: 80px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.privacy-acc-item.open { border-color: var(--accent); box-shadow: var(--shadow); }
.privacy-acc-heading { margin: 0; }
.privacy-acc-btn {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 16px 18px; background: none; border: none; cursor: pointer; text-align: left;
  font-family: var(--font-display); font-size: 1.02rem; font-weight: 800; color: var(--text-primary);
}
.privacy-acc-btn:hover { background: var(--blue-mid); }
.privacy-acc-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.privacy-acc-chevron { flex-shrink: 0; font-size: 1.25rem; color: var(--accent); transition: transform 0.25s ease; }
.privacy-acc-item.open .privacy-acc-chevron { transform: rotate(180deg); }

.privacy-acc-panel {
  display: grid; grid-template-rows: 0fr; visibility: hidden;
  transition: grid-template-rows 0.28s ease, visibility 0s linear 0.28s;
}
.privacy-acc-item.open .privacy-acc-panel { grid-template-rows: 1fr; visibility: visible; transition-delay: 0s; }
.privacy-acc-clip { overflow: hidden; min-height: 0; }
.privacy-acc-body { padding: 2px 18px 18px; border-top: 1px solid var(--blue-border); padding-top: 14px; }
.privacy-acc-body p, .privacy-acc-body li { font-size: 0.93rem; }
.privacy-acc-body p { margin: 0 0 10px; }
.privacy-acc-body p:last-child { margin-bottom: 0; }
.privacy-acc-body ul { padding-left: 20px; margin: 0 0 10px; }
.privacy-acc-body li { margin-bottom: 4px; }

.privacy-contact { padding: 12px 16px; border-radius: 10px; background: var(--blue-mid); border: 1px solid var(--blue-border); color: var(--text-primary); }
.privacy-table-wrap { overflow-x: auto; border: 1px solid var(--blue-border); border-radius: 12px; }
.privacy-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; min-width: 560px; }
.privacy-table th, .privacy-table td { padding: 11px 14px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--blue-border); }
.privacy-table thead th { background: var(--blue-mid); color: var(--text-primary); font-size: 0.74rem; letter-spacing: .06em; text-transform: uppercase; }
.privacy-table tbody th { color: var(--text-primary); font-weight: 700; width: 24%; }
.privacy-table tr:last-child th, .privacy-table tr:last-child td { border-bottom: none; }
.privacy-page a { color: var(--accent); font-weight: 600; }
.privacy-back { margin-top: 22px; }

@media (prefers-reduced-motion: reduce) {
  .privacy-acc-panel, .privacy-acc-chevron, .privacy-acc-item { transition: none; }
}

@media (max-width: 700px) {
  .privacy-acc-btn { padding: 14px 14px; font-size: 0.98rem; }
  .privacy-acc-body { padding-left: 14px; padding-right: 14px; }
  .privacy-table { min-width: 0; }
  .privacy-table thead { display: none; }
  .privacy-table, .privacy-table tbody, .privacy-table tr, .privacy-table th, .privacy-table td { display: block; width: 100% !important; }
  .privacy-table tr { padding: 12px 14px; border-bottom: 1px solid var(--blue-border); }
  .privacy-table tr:last-child { border-bottom: none; }
  .privacy-table th, .privacy-table td { padding: 2px 0; border: none; }
  .privacy-table tbody th { font-size: 0.95rem; margin-bottom: 4px; }
  .privacy-table td::before { content: attr(data-label); display: block; font-size: 0.68rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); margin-top: 6px; }
}
`;

function AccordionItem({ item, open, onToggle }) {
  const panelId = `${item.id}-panel`;
  return (
    <div className={`privacy-acc-item${open ? ' open' : ''}`} id={item.id}>
      <h2 className="privacy-acc-heading">
        <button
          type="button"
          className="privacy-acc-btn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{item.title}</span>
          <LuChevronDown className="privacy-acc-chevron" aria-hidden="true" />
        </button>
      </h2>
      <div className="privacy-acc-panel" id={panelId} role="region" aria-labelledby={item.id}>
        <div className="privacy-acc-clip">
          <div className="privacy-acc-body">{item.body()}</div>
        </div>
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  const { hash } = useLocation();
  const [openIds, setOpenIds] = useState(() => new Set([ITEMS[0].id]));

  // Open the section named in the link, e.g. /privacy#contact
  useEffect(() => {
    const id = hash.replace('#', '');
    if (!ITEMS.some(i => i.id === id)) return;
    setOpenIds(prev => new Set(prev).add(id));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [hash]);

  const toggle = id => setOpenIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const allOpen = openIds.size === ITEMS.length;

  return (
    <div className="privacy-page fade-in">
      <style>{STYLES}</style>
      <header className="privacy-hero">
        <span className="privacy-hero-icon" aria-hidden="true"><LuShieldCheck /></span>
        <div>
          <h1 className="privacy-title">Privacy notice</h1>
          <p className="privacy-meta">Last updated {LAST_UPDATED}</p>
        </div>
      </header>

      {IS_DRAFT && (
        <div className="privacy-draft" role="note">
          <strong>Draft.</strong> Fill in the items in [square brackets] before launch.
        </div>
      )}

      <div className="privacy-acc-tools">
        <button
          type="button"
          className="privacy-acc-all"
          onClick={() => setOpenIds(allOpen ? new Set() : new Set(ITEMS.map(i => i.id)))}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="privacy-acc">
        {ITEMS.map(item => (
          <AccordionItem
            key={item.id}
            item={item}
            open={openIds.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </div>

      <p className="privacy-back"><Link to="/dashboard">← Back to dashboard</Link></p>
    </div>
  );
}