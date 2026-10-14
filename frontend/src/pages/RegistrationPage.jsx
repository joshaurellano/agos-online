import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import { detectPhoneNetwork, NETWORK_INFO } from '../lib/phoneNetwork';
import { RESIDENT_ROLE_ID } from '../lib/roles';
import { checkPassword, isValidUsername, isValidPhone, generatePassword } from '../lib/credentials';

// One page, two modes (same layout, same controls):
//   /register      admin creates a staff login
//   /add-resident  staff registers a resident for SMS alerts (no login)

const EMPTY_STAFF = { name: '', phone: '', username: '', password: '', confirm: '', role_id: '' };

function Field({ id, label, hint, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} className="registry-field-label">{label}</label>
      {children}
      {error
        ? <div id={`${id}-msg`} className="registry-error" style={{ marginBottom: 0 }}>{error}</div>
        : hint && <div id={`${id}-msg`} className="registry-hint" style={{ marginBottom: 0 }}>{hint}</div>}
    </div>
  );
}

function Success({ title, detail, again, back }) {
  return (
    <div role="status" style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', marginBottom: 6 }}>{title}</div>
      {detail && <div className="settings-desc" style={{ marginBottom: 16 }}>{detail}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={again.onClick}>{again.label}</button>
        <Link to={back.to} className="btn btn-ghost" style={{ textDecoration: 'none' }}>{back.label}</Link>
      </div>
    </div>
  );
}

// ── Staff account ────────────────────────────────────────────────────────

function StaffForm() {
  const { createUser, error, clearError } = useAuth();
  const [form, setForm] = useState(EMPTY_STAFF);
  const [touched, setTouched] = useState({});
  const [roles, setRoles] = useState([]);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    clearError();
    supabase.from('roles').select('role_id, role_desc').order('role_id').then(({ data, error: err }) => {
      if (err) logger.error('Roles load failed:', err.message);
      else setRoles((data ?? []).filter((r) => r.role_id !== RESIDENT_ROLE_ID));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (name) => (e) => {
    clearError();
    let value = e.target.value;
    if (name === 'phone') value = value.replace(/\D/g, '').slice(0, 11);
    if (name === 'username') value = value.toLowerCase().replace(/\s/g, '');
    setForm((f) => ({ ...f, [name]: value }));
  };
  const blur = (name) => () => setTouched((t) => ({ ...t, [name]: true }));

  const pw = useMemo(() => checkPassword(form.password), [form.password]);
  const errors = {
    name:     form.name.trim() ? '' : 'Enter a name.',
    phone:    isValidPhone(form.phone) ? '' : 'Use 11 digits starting with 09.',
    username: isValidUsername(form.username) ? '' : '3–30 characters: letters, numbers, . _ -',
    password: pw.ok ? '' : 'Use 8+ characters with letters and numbers.',
    confirm:  form.confirm === form.password ? '' : 'Passwords do not match.',
    role_id:  form.role_id ? '' : 'Choose a role.',
  };
  const valid = Object.values(errors).every((m) => !m);
  const show = (name) => (touched[name] ? errors[name] : '');

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, phone: true, username: true, password: true, confirm: true, role_id: true });
    if (!valid || busy) return;
    setBusy(true);
    const ok = await createUser({
      name: form.name.trim(),
      phone: form.phone,
      username: form.username,
      password: form.password,
      role_id: Number(form.role_id),
    });
    setBusy(false);
    if (ok) {
      setCreated({ name: form.name.trim(), username: form.username });
      setForm(EMPTY_STAFF);
      setTouched({});
      setShowPw(false);
    }
  };

  if (created) {
    return (
      <Success
        title="Account created"
        detail={`${created.name} can sign in with the username “${created.username}”.`}
        again={{ label: 'Add another', onClick: () => setCreated(null) }}
        back={{ label: 'Staff accounts', to: '/staff' }}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field id="staff-name" label="Full name" error={show('name')}>
        <input id="staff-name" className="settings-input registry-field" value={form.name}
          onChange={set('name')} onBlur={blur('name')} autoComplete="off"
          aria-invalid={!!show('name')} aria-describedby="staff-name-msg" placeholder="Maria Santos" />
      </Field>

      <Field id="staff-phone" label="Mobile number" hint="09XXXXXXXXX" error={show('phone')}>
        <input id="staff-phone" className="settings-input registry-field" type="tel" inputMode="numeric"
          value={form.phone} onChange={set('phone')} onBlur={blur('phone')} autoComplete="off"
          aria-invalid={!!show('phone')} aria-describedby="staff-phone-msg" placeholder="09123456789" />
      </Field>

      <Field id="staff-role" label="Role" error={show('role_id')}>
        <select id="staff-role" className="settings-input registry-field" value={form.role_id}
          onChange={set('role_id')} onBlur={blur('role_id')}
          aria-invalid={!!show('role_id')} aria-describedby="staff-role-msg">
          <option value="">Select a role</option>
          {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_desc}</option>)}
        </select>
      </Field>

      <Field id="staff-username" label="Username" hint="Used to sign in." error={show('username')}>
        <input id="staff-username" className="settings-input registry-field" value={form.username}
          onChange={set('username')} onBlur={blur('username')} autoComplete="off" autoCapitalize="none"
          spellCheck={false} aria-invalid={!!show('username')} aria-describedby="staff-username-msg"
          placeholder="maria.santos" />
      </Field>

      <Field id="staff-password" label="Password"
        hint={form.password ? `${pw.label} · 8+ characters, letters and numbers` : '8+ characters, letters and numbers'}
        error={show('password')}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="staff-password" className="settings-input registry-field" style={{ marginBottom: 0 }}
            type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
            onBlur={blur('password')} autoComplete="new-password"
            aria-invalid={!!show('password')} aria-describedby="staff-password-msg" />
          <button type="button" className="btn btn-ghost" onClick={() => setShowPw((v) => !v)}
            aria-pressed={showPw}>{showPw ? 'Hide' : 'Show'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => {
            const p = generatePassword();
            setForm((f) => ({ ...f, password: p, confirm: p }));
            setShowPw(true);
          }}>Generate</button>
        </div>
      </Field>

      <Field id="staff-confirm" label="Confirm password" error={show('confirm')}>
        <input id="staff-confirm" className="settings-input registry-field"
          type={showPw ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')}
          onBlur={blur('confirm')} autoComplete="new-password"
          aria-invalid={!!show('confirm')} aria-describedby="staff-confirm-msg" />
      </Field>

      <div role="alert" className="registry-error">{error}</div>

      <div className="registry-dialog-actions" style={{ marginTop: 8 }}>
        <Link to="/staff" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Cancel</Link>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </form>
  );
}

// ── Resident (SMS alerts only, no login) ─────────────────────────────────

function ResidentForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [smsAck, setSmsAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const phoneOk = isValidPhone(form.phone);
  const network = phoneOk ? detectPhoneNetwork(form.phone) : null;
  const needsAck = !!network && !network.deliverable;
  const canSubmit = !busy && form.name.trim() && phoneOk && consent && (!needsAck || smsAck);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const { error: insertError } = await supabase.from('residents').insert({
      name: form.name.trim(),
      phone: form.phone,
      network: network?.network ?? 'unknown',
      sms_deliverable: network?.deliverable ?? false,
      added_by: user?.id ?? null,
      consent_given: true,
    });
    setBusy(false);
    if (insertError) {
      logger.error('Resident insert failed:', insertError.message);
      // phone has a unique constraint -- the usual cause of a failed insert
      setError(insertError.code === '23505' ? 'This number is already registered.' : 'Could not save. Try again.');
      return;
    }
    setDone(true);
    setForm({ name: '', phone: '' });
    setConsent(false);
    setSmsAck(false);
  };

  if (done) {
    return (
      <Success
        title="Resident added"
        again={{ label: 'Add another', onClick: () => setDone(false) }}
        back={{ label: 'Residents', to: '/residents' }}
      />
    );
  }

  const info = network ? NETWORK_INFO[network.network] : null;

  return (
    <form onSubmit={submit} noValidate>
      <Field id="res-name" label="Full name">
        <input id="res-name" className="settings-input registry-field" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          autoComplete="off" placeholder="Maria Santos" />
      </Field>

      <Field id="res-phone" label="Mobile number"
        hint={info ? `${info.label}${network.deliverable ? '' : ' · SMS may not reach this number'}` : '09XXXXXXXXX'}
        error={form.phone && !phoneOk ? 'Use 11 digits starting with 09.' : ''}>
        <input id="res-phone" className="settings-input registry-field" type="tel" inputMode="numeric"
          value={form.phone}
          onChange={(e) => { setSmsAck(false); setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })); }}
          autoComplete="off" aria-describedby="res-phone-msg" placeholder="09123456789" />
      </Field>

      <label className="registry-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Resident is present, identified, and signed the consent form for AGOS SMS alerts.</span>
      </label>

      {needsAck && (
        <label className="registry-check">
          <input type="checkbox" checked={smsAck} onChange={(e) => setSmsAck(e.target.checked)} />
          <span>I will tell this resident to install the AGOS app for push alerts.</span>
        </label>
      )}

      <div role="alert" className="registry-error">{error}</div>

      <div className="registry-dialog-actions" style={{ marginTop: 8 }}>
        <Link to="/residents" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Cancel</Link>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {busy ? 'Saving…' : 'Add resident'}
        </button>
      </div>
    </form>
  );
}

export default function RegistrationPage() {
  const { pathname } = useLocation();
  const residentMode = pathname === '/add-resident';
  return (
    <div className="fade-in" style={{ maxWidth: 520, margin: '0 auto' }}>
      <section className="card" aria-labelledby="reg-title">
        <h2 id="reg-title" className="registry-dialog-title">
          {residentMode ? 'Add resident' : 'New staff account'}
        </h2>
        {residentMode ? <ResidentForm /> : <StaffForm />}
      </section>
    </div>
  );
}
