import { useEffect } from 'react';

import { LuDoorOpen, LuMountain, LuTriangleAlert, LuWaves, LuZap, LuPhoneCall, LuCheck, LuRotateCcw, LuBackpack, LuPrinter, LuMinus, LuPlus, LuTriangleAlert as LuWarn } from 'react-icons/lu';

import { useLanguage } from '../hooks/useLanguage';

import FloodStepArt from './FloodStepArt';
import SurvivalKitArt from './SurvivalKitArt';

import { useKit, WATER_LITERS_PER_PERSON_DAY, WATER_DAYS, REFRESH_DAYS } from '../lib/survivalKit';

import { EVACUATION_CENTERS } from '../data/triangulo';

import { CONTACTS } from '../lib/emergencyContacts';



// "If flooding starts" + "Survival kit" for the Know Your Zone page.

// Wording lives in lib/i18n.js (flood.*) so it follows the language picker.

// The kit is saved only in this browser (see lib/survivalKit.js). It reacts to

// the alert level, adjusts to the household, and prints as a one-page plan.



const DURING = [

  { id: 'early',    icon: LuDoorOpen,      tone: 'do' },

  { id: 'higher',   icon: LuMountain,      tone: 'do' },

  { id: 'wade',     icon: LuTriangleAlert, tone: 'avoid' },

  { id: 'current',  icon: LuWaves,         tone: 'avoid' },

  { id: 'power',    icon: LuZap,           tone: 'do' },

  { id: 'informed', icon: LuPhoneCall,     tone: 'do' },

];



export default function FloodGuide({ alertKey = 'NORMAL' }) {

const { t, lang } = useLanguage();

const { state, update, items, checked, total, daysSinceChecked } = useKit();

const { household } = state;



  // Deep link from the Dashboard nudge: /know-your-hazards#survival-kit

  useEffect(() => {

    if (window.location.hash !== '#survival-kit') return undefined;

const id = setTimeout(() => document.getElementById('survival-kit')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);

    return () => clearTimeout(id);

  }, []);



const urgent = alertKey === 'WARNING' || alertKey === 'CRITICAL';

const heads = urgent || alertKey === 'ADVISORY';

const pct = total ? Math.round((checked.length / total) * 100) : 0;

const toggle = (id) => update({ checked: checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id] });

const setHousehold = (patch) => update({ household: { ...household, ...patch } });

const setMember = (n, patch) => {

const next = Array.from({ length: Math.max(state.members.length, n + 1) }, (_, i) => state.members[i] || { name: '', phone: '' });

    next[n] = { ...next[n], ...patch };

    update({ members: next });

  };



const waterLiters = household.people * WATER_LITERS_PER_PERSON_DAY * WATER_DAYS;

const label = (id) => (id === 'water'

    ? t('flood.waterTotal').replace('{liters}', waterLiters).replace('{days}', WATER_DAYS)

    : t(`flood.kit.${id}`));



const dateFmt = (iso) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-PH' : 'fil-PH', { dateStyle: 'medium' });

const stale = daysSinceChecked !== null && daysSinceChecked >= REFRESH_DAYS;



const renderItem = ({ id, grab }) => {

const on = checked.includes(id);

    return (

      <li key={id}>

        <label className={`kyz-kit-item${on ? ' is-on' : ''}`}>

          <input type="checkbox" checked={on} onChange={() => toggle(id)} />

          <span className="kyz-kit-box" aria-hidden="true">{on && <LuCheck size={14} />}</span>
          <SurvivalKitArt id={id} />
          <span className="kyz-kit-text">

            <span className="kyz-kit-name">

              {label(id)}

              {grab && !urgent && <em className="kyz-grab-tag">{t('flood.grabTag')}</em>}

            </span>

            <span className="kyz-kit-why">{t(`flood.why.${id}`)}</span>

          </span>

        </label>

      </li>

    );

  };



const grabItems = items.filter((i) => i.grab);

const otherItems = items.filter((i) => !i.grab);

const ownCaptain = CONTACTS.find((c) => c.own);

const comcen = CONTACTS.find((c) => c.group === 'comcen');



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

              <FloodStepArt id={id} />

              <div className="kyz-step-row">

                <span className="kyz-step-icon" aria-hidden="true"><Icon size={20} /></span>

                <div>

                  <strong>{t(`flood.during.${id}.title`)}</strong>

                  <p>{t(`flood.during.${id}.text`)}</p>

                </div>

              </div>

            </li>

          ))}

        </ul>

      </section>



      <section className="kyz-guide" id="survival-kit" aria-labelledby="kyz-kit-title">

        <div className="kyz-guide-head">

          <h3 id="kyz-kit-title"><LuBackpack size={18} aria-hidden="true" /> {t('flood.kitTitle')}</h3>

          <span className="kyz-kit-count">

            {t('flood.packed').replace('{n}', checked.length).replace('{total}', total)}

          </span>

        </div>



        {heads && (

          <p className="kyz-kit-alert" role="status">

            <LuWarn size={16} aria-hidden="true" /> {t('flood.packNow').replace('{level}', t(`alertLevel.${alertKey}.name`))}

          </p>

        )}



        <div className="kyz-kit-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('flood.kitTitle')}>

          <span style={{ width: `${pct}%` }} />

        </div>



        <fieldset className="kyz-household">

          <legend>{t('flood.kitIntro')}</legend>

          <div className="kyz-people">

            <span id="kyz-people-label">{t('flood.people')}</span>

            <div className="kyz-stepper" role="group" aria-labelledby="kyz-people-label">

              <button type="button" onClick={() => setHousehold({ people: Math.max(1, household.people - 1) })} aria-label="-1" disabled={household.people <= 1}><LuMinus size={16} aria-hidden="true" /></button>

              <output aria-live="polite">{household.people}</output>

              <button type="button" onClick={() => setHousehold({ people: Math.min(20, household.people + 1) })} aria-label="+1" disabled={household.people >= 20}><LuPlus size={16} aria-hidden="true" /></button>

            </div>

          </div>

          <div className="kyz-needs">

            {['infant', 'senior', 'care', 'pet'].map((k) => (

              <label key={k} className={`kyz-need${household[k] ? ' is-on' : ''}`}>

                <input type="checkbox" checked={household[k]} onChange={(e) => setHousehold({ [k]: e.target.checked })} />

                <span>{t(`flood.needs.${k}`)}</span>

              </label>

            ))}

          </div>

        </fieldset>



        <details className="kyz-members">

          <summary>{t('flood.membersTitle')}</summary>

          <p className="kyz-members-note">{t('flood.membersNote')}</p>

          {Array.from({ length: household.people }, (_, n) => (

            <div className="kyz-member" key={n}>

              <span className="kyz-member-n">{t('flood.memberLabel').replace('{n}', n + 1)}</span>

              <input

                type="text" autoComplete="off" maxLength={60} value={state.members[n]?.name ?? ''}

                aria-label={`${t('flood.memberLabel').replace('{n}', n + 1)}: ${t('flood.plan.name')}`}

                placeholder={t('flood.plan.name')} onChange={(e) => setMember(n, { name: e.target.value })}

              />

              <input

                type="tel" inputMode="tel" autoComplete="off" maxLength={30} value={state.members[n]?.phone ?? ''}

                aria-label={`${t('flood.memberLabel').replace('{n}', n + 1)}: ${t('flood.plan.phone')}`}

                placeholder={t('flood.plan.phone')} onChange={(e) => setMember(n, { phone: e.target.value })}

              />

            </div>

          ))}

          {state.members.some((m) => m?.name || m?.phone) && (

            <button type="button" className="yp-link yp-link-quiet" onClick={() => update({ members: [] })}>

              <LuRotateCcw size={13} aria-hidden="true" /> {t('flood.clearMembers')}

            </button>

          )}

        </details>



        {urgent ? (

          <>

            <h4 className="kyz-kit-sub">{t('flood.grabTitle')}</h4>

            <ul className="kyz-kit">{grabItems.map(renderItem)}</ul>

            <h4 className="kyz-kit-sub">{t('flood.ifTime')}</h4>

            <ul className="kyz-kit">{otherItems.map(renderItem)}</ul>

          </>

        ) : (

          <ul className="kyz-kit">{items.map(renderItem)}</ul>

        )}



        {stale && <p className="kyz-kit-alert kyz-kit-refresh" role="status"><LuWarn size={16} aria-hidden="true" /> {t('flood.refresh')}</p>}



        <div className="kyz-kit-actions">

          <button type="button" className="btn btn-primary" onClick={() => update({ lastChecked: new Date().toISOString() })}>

            <LuCheck size={16} aria-hidden="true" /> {t('flood.markChecked')}

          </button>

          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>

            <LuPrinter size={16} aria-hidden="true" /> {t('flood.print')}

          </button>

          {checked.length > 0 && (

            <button type="button" className="yp-link yp-link-quiet kyz-kit-reset" onClick={() => update({ checked: [] })}>

              <LuRotateCcw size={13} aria-hidden="true" /> {t('flood.reset')}

            </button>

          )}

        </div>

        <p className="kyz-kit-last">

          {state.lastChecked ? t('flood.lastChecked').replace('{date}', dateFmt(state.lastChecked)) : t('flood.neverChecked')}

        </p>

      </section>



      {/* One-page plan. Hidden on screen, shown only when printing. */}

      <div className="kit-print" aria-hidden="true">

        <h1>{t('flood.plan.title')}</h1>

        <p className="kit-print-sub">{t('flood.plan.sub')}</p>



        <h2>{t('flood.plan.members')} ({household.people})</h2>

        <table className="kit-print-table">

          <thead><tr><th>{t('flood.plan.name')}</th><th>{t('flood.plan.phone')}</th></tr></thead>

          <tbody>{Array.from({ length: Math.max(household.people, 3) }, (_, n) => <tr key={n}><td>{state.members[n]?.name}</td><td>{state.members[n]?.phone}</td></tr>)}</tbody>

        </table>



        <h2>{t('flood.plan.meeting')}</h2>

        <p className="kit-print-hint">{t('flood.plan.meetingHint')}</p>

        <div className="kit-print-line" /><div className="kit-print-line" />



        <h2>{t('flood.plan.centers')}</h2>

        <ul>{EVACUATION_CENTERS.map((c) => <li key={c.id}><strong>{c.name}</strong>, {c.address.trim()}</li>)}</ul>



        <h2>{t('flood.plan.numbers')}</h2>

        <ul>

          <li><strong>911</strong></li>

          {comcen && <li><strong>COMCEN</strong>: {comcen.numbers.join(' · ')}</li>}

          {ownCaptain && <li><strong>Barangay {ownCaptain.name}</strong>: {ownCaptain.numbers.join(' · ')}</li>}

        </ul>



        <h2>{t('flood.plan.kit')}</h2>

        <ul className="kit-print-kit">

          {items.map((i) => <li key={i.id}>{checked.includes(i.id) ? '☑' : '☐'} {label(i.id)}</li>)}

        </ul>

        <p className="kit-print-foot">{t('flood.plan.footer')}</p>

      </div>

    </>

  );

}
