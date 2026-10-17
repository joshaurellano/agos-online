import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuShieldCheck, LuClipboardList, LuBellRing, LuUsers, LuUserCheck, LuLock, LuHistory } from 'react-icons/lu';

// Data privacy notice shown right before a registration is saved. One dialog,
// two wordings:
//   resident  staff reads this to the resident, then confirms their consent
//   staff     admin confirms the new staff member knows how data is handled
// Uses the native <dialog> (focus trap, Esc to close), like the other dialogs.

const COPY = {
  resident: {
    title: 'Data privacy and consent',
    lead: 'Read this to the resident before saving.',
    items: [
      { icon: LuClipboardList, label: 'What we keep',    text: 'Name and mobile number.' },
      { icon: LuBellRing,      label: 'Why',             text: 'To send flood alerts by SMS.' },
      { icon: LuUsers,         label: 'Who can see it',  text: 'Barangay staff and our SMS provider. It is not sold.' },
      { icon: LuUserCheck,     label: 'Their rights',    text: 'They can see, correct, or remove their number at the barangay office at any time.' },
    ],
    check: 'The resident is present, was identified, heard this notice, and signed the consent form for AGOS SMS alerts.',
    confirm: 'Agree and save',
  },
  staff: {
    title: 'Data privacy and security',
    lead: 'The new staff member must know this before using AGOS.',
    items: [
      { icon: LuClipboardList, label: 'What we keep',     text: 'Name, mobile number, username, and role.' },
      { icon: LuUsers,         label: 'Resident data',    text: 'Use it only for flood alerts and barangay work. Do not share it outside AGOS.' },
      { icon: LuLock,          label: 'Account security', text: 'Keep the password private and sign out on shared devices.' },
      { icon: LuHistory,       label: 'Records',          text: 'Changes to resident records are saved in an audit log.' },
    ],
    check: 'The staff member has read this and agrees.',
    confirm: 'Agree and create account',
  },
};

const STYLES = `
.consent-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.consent-head-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 40px; height: 40px; border-radius: 12px; font-size: 1.3rem;
  background: var(--blue-mid); border: 1px solid var(--blue-border); color: var(--accent);
}
.consent-head .registry-dialog-title { margin: 0; }
.consent-lead { margin: 0 0 14px; font-size: 0.88rem; color: var(--text-secondary); }
.consent-list { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.consent-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--blue-mid); border: 1px solid var(--blue-border); }
.consent-item svg { flex-shrink: 0; margin-top: 2px; font-size: 1.1rem; color: var(--accent); }
.consent-item strong { display: block; font-size: 0.85rem; color: var(--text-primary); }
.consent-item span { font-size: 0.88rem; color: var(--text-secondary); line-height: 1.45; }
.consent-link { display: inline-block; margin-bottom: 14px; font-size: 0.85rem; font-weight: 600; color: var(--accent); }
.consent-dialog { width: min(520px, 94vw); max-height: 92vh; overflow-y: auto; }
`;

export default function PrivacyConsentModal({ open, variant = 'resident', busy = false, onConfirm, onCancel }) {
  const ref = useRef(null);
  const [agreed, setAgreed] = useState(false);
  const copy = COPY[variant] ?? COPY.resident;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) { setAgreed(false); el.showModal(); }
    if (!open && el.open) el.close();
  }, [open]);

  const cancel = () => { if (!busy) onCancel(); };

  return (
    <dialog
      ref={ref}
      className="registry-dialog consent-dialog"
      aria-labelledby="consent-title"
      onCancel={(e) => { e.preventDefault(); cancel(); }}
      onClick={(e) => { if (e.target === ref.current) cancel(); }}
    >
      <style>{STYLES}</style>
      <div className="consent-head">
        <span className="consent-head-icon" aria-hidden="true"><LuShieldCheck /></span>
        <h2 id="consent-title" className="registry-dialog-title">{copy.title}</h2>
      </div>
      <p className="consent-lead">{copy.lead}</p>

      <ul className="consent-list">
        {copy.items.map(({ icon: ItemIcon, label, text }) => (
          <li key={label} className="consent-item">
            <ItemIcon aria-hidden="true" />
            <div><strong>{label}</strong><span>{text}</span></div>
          </li>
        ))}
      </ul>

      <Link to="/privacy" target="_blank" rel="noopener" className="consent-link">Read the full privacy notice</Link>

      <label className="registry-check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{copy.check}</span>
      </label>

      <div className="registry-dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!agreed || busy}>
          {busy ? 'Saving…' : copy.confirm}
        </button>
      </div>
    </dialog>
  );
}
