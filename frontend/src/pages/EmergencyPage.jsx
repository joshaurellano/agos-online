import { useMemo, useState } from 'react';
import { LuPhoneCall, LuCopy, LuCheck, LuMapPin } from 'react-icons/lu';
import { CONTACTS, GROUPS, COLLECTED, SOURCES, OFFICIAL_LIST } from '../lib/emergencyContacts';

// Emergency directory: the number to call first, then a filterable list.
// Data lives in lib/emergencyContacts.js. Styles are in gov-theme.css.

const telHref = (n) => `tel:${n.replace(/[^\d+]/g, '')}`;

function NumberRow({ number, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked; the call link still works */ }
  };
  return (
    <div className="em-number">
      <a className="em-number-link" href={telHref(number)} aria-label={`Call ${label} at ${number}`}>
        <LuPhoneCall size={16} aria-hidden="true" /> {number}
      </a>
      <button type="button" className="em-copy" onClick={copy} aria-label={`Copy ${number}`}>
        {copied ? <LuCheck size={16} aria-hidden="true" /> : <LuCopy size={16} aria-hidden="true" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}

export default function EmergencyPage() {
  const [group, setGroup] = useState('all');
  const list = useMemo(
    () => CONTACTS.filter((c) => group === 'all' || c.group === group),
    [group],
  );

  return (
    <div className="em-page">
      <div className="station-bar">
        <div>
          <div className="hero-eyebrow">Naga City</div>
          <h1 className="hero-title">Emergency numbers</h1>
        </div>
      </div>

      <section className="em-urgent" aria-label="Call first">
        <div>
          <h2>In an emergency, call 911</h2>
          <p>For city dispatch you can also reach COMCEN at (054) 472 3000 or 0908 525 3000.</p>
        </div>
        <a className="btn em-911" href="tel:911"><LuPhoneCall size={18} aria-hidden="true" /> Call 911</a>
      </section>

      <div className="em-filters" role="group" aria-label="Filter by type">
        {[{ key: 'all', label: 'All' }, ...GROUPS].map((g) => (
          <button
            key={g.key} type="button"
            className={`em-chip${group === g.key ? ' active' : ''}`}
            aria-pressed={group === g.key}
            onClick={() => setGroup(g.key)}
          >{g.label}</button>
        ))}
      </div>

      <div className="em-grid">
        {list.map((c) => (
          <article className="card em-card" key={`${c.group}-${c.name}`}>
            <h2 className="em-name">
              {c.group === 'barangay' ? `Barangay ${c.name}` : c.name}
              {c.own && <span className="em-tag">Your barangay</span>}
            </h2>
            {c.person && <p className="em-person">Punong Barangay {c.person}</p>}
            {c.address && <p className="em-address"><LuMapPin size={14} aria-hidden="true" /> {c.address}</p>}
            {c.note && <p className="em-note">{c.note}</p>}
            {c.numbers.map((n) => <NumberRow key={n} number={n} label={c.name} />)}
          </article>
        ))}
      </div>

      <p className="em-source">
        Looking for another barangay or office? See the <a href={OFFICIAL_LIST.href} target="_blank" rel="noreferrer">{OFFICIAL_LIST.label}</a> or the MyNaga app.
      </p>

      <p className="em-source">
        Numbers collected {COLLECTED} from {SOURCES.map((s, i) => (
          <span key={s.label}>{i > 0 && ' and '}{s.href ? <a href={s.href} target="_blank" rel="noreferrer">{s.label}</a> : s.label}</span>
        ))}. Numbers can change. AGOS cannot guarantee they are current, so confirm with the office if a call does not connect.
      </p>
    </div>
  );
}
