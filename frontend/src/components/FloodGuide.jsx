import { useState } from 'react';
import { LuDoorOpen, LuMountain, LuTriangleAlert, LuWaves, LuZap, LuPhoneCall, LuCheck, LuRotateCcw, LuBackpack } from 'react-icons/lu';
import { useLanguage } from '../hooks/useLanguage';

// "If flooding starts" + "Survival kit" for the Know Your Zone page.
// Wording lives in lib/i18n.js (flood.*) so it follows the language picker.
// The kit checklist is saved only in this browser.

const DURING = [
  { id: 'early',    icon: LuDoorOpen,      tone: 'do' },
  { id: 'higher',   icon: LuMountain,      tone: 'do' },
  { id: 'wade',     icon: LuTriangleAlert, tone: 'avoid' },
  { id: 'current',  icon: LuWaves,         tone: 'avoid' },
  { id: 'power',    icon: LuZap,           tone: 'do' },
  { id: 'informed', icon: LuPhoneCall,     tone: 'do' },
];

const KIT = ['water', 'food', 'light', 'firstaid', 'meds', 'hygiene', 'docs', 'phone', 'contacts', 'cash', 'warm', 'rain'];
const KIT_KEY = 'agos-survival-kit';

const loadChecked = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KIT_KEY));
    return Array.isArray(v) ? v.filter((id) => KIT.includes(id)) : [];
  } catch { return []; }
};

export default function FloodGuide({ alertKey = 'NORMAL' }) {
  const { t } = useLanguage();
  const [checked, setChecked] = useState(loadChecked);

  const persist = (next) => {
    setChecked(next);
    try { localStorage.setItem(KIT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const toggle = (id) => persist(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);

  const urgent = alertKey === 'WARNING' || alertKey === 'CRITICAL';
  const pct = Math.round((checked.length / KIT.length) * 100);

  return (
    <>
      <section className="kyz-guide" aria-labelledby="kyz-during-title">
        <div className="kyz-guide-head">
          <h3 id="kyz-during-title">{t('flood.duringTitle')}</h3>
          {urgent && (
            <span className="kyz-urgent" role="status">
              {t('flood.urgent').replace('{level}', t(`alertLevel.${alertKey}.name`))}
            </span>
          )}
        </div>
        <ul className="kyz-steps">
          {DURING.map(({ id, icon: Icon, tone }) => (
            <li key={id} className={`kyz-step kyz-step-${tone}`}>
              <span className="kyz-step-icon" aria-hidden="true"><Icon size={20} /></span>
              <div>
                <strong>{t(`flood.during.${id}.title`)}</strong>
                <p>{t(`flood.during.${id}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="kyz-guide" aria-labelledby="kyz-kit-title">
        <div className="kyz-guide-head">
          <h3 id="kyz-kit-title"><LuBackpack size={18} aria-hidden="true" /> {t('flood.kitTitle')}</h3>
          <span className="kyz-kit-count">
            {t('flood.packed').replace('{n}', checked.length).replace('{total}', KIT.length)}
          </span>
        </div>
        <div className="kyz-kit-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('flood.kitTitle')}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <ul className="kyz-kit">
          {KIT.map((id) => {
            const on = checked.includes(id);
            return (
              <li key={id}>
                <label className={`kyz-kit-item${on ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                  <span className="kyz-kit-box" aria-hidden="true">{on && <LuCheck size={14} />}</span>
                  <span>{t(`flood.kit.${id}`)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {checked.length > 0 && (
          <button type="button" className="yp-link yp-link-quiet kyz-kit-reset" onClick={() => persist([])}>
            <LuRotateCcw size={13} aria-hidden="true" /> {t('flood.reset')}
          </button>
        )}
      </section>
    </>
  );
}
