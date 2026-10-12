import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';

import { FaEyeSlash, FaEye, FaUser, FaPhone, FaAt, FaLock, FaUserShield, FaHome, FaCheckCircle, FaExclamationTriangle, FaArrowLeft, FaUserPlus } from 'react-icons/fa';

import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { detectPhoneNetwork, NETWORK_INFO } from '../lib/phoneNetwork';

// Simple heuristic strength meter -- purely a UX nudge, does not change or
// loosen the actual validation rule (still 8+ chars, enforced in handleSubmit).
function getPasswordStrength(pw) {
  if (!pw) return { label: '', pct: 0, color: 'rgba(100,160,220,0.3)' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Weak', pct: 30, color: '#ef4444' };
  if (score === 2) return { label: 'Fair', pct: 58, color: '#eab308' };
  if (score === 3) return { label: 'Good', pct: 80, color: '#38bdf8' };
  return { label: 'Strong', pct: 100, color: '#22c55e' };
}

const styles = `
  .reg-page { width: 100%; }

  .reg-back {
    display: inline-flex; align-items: center; gap: 7px; margin-bottom: 8px;
    color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-decoration: none;
    padding: 6px 10px 6px 0; transition: color .2s ease;
  }
  .reg-back:hover { color: var(--accent); }

  .reg-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .reg-header-icon {
    width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
    display: grid; place-items: center; font-size: 1.1rem;
    color: var(--accent); background: rgba(56,189,248,0.13);
  }
  .reg-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 800; line-height: 1.2; color: var(--text-primary); margin: 0; }
  .reg-subtitle { font-size: 0.88rem; color: var(--text-secondary); margin: 2px 0 0; }

  .reg-card { padding: 22px 24px; }
  .reg-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 24px; }
  .reg-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 1000px) { .reg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .reg-grid .reg-field { min-width: 0; }

  .reg-section {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-display); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent);
    margin: 30px 0 16px; padding-bottom: 9px; border-bottom: 1px solid var(--blue-border);
  }
  .reg-section:first-child { margin-top: 0; }

  .reg-field { margin-bottom: 14px; }
  .reg-label { display: block; font-size: 0.84rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }

  .reg-input-wrap { position: relative; display: flex; align-items: center; }
  .reg-input-icon { position: absolute; left: 14px; color: var(--text-muted); display: flex; pointer-events: none; }

  .reg-input, .reg-select {
    width: 100%; min-height: 42px; padding: 9px 14px 9px 40px;
    background: var(--blue-mid); border: 1px solid var(--blue-border); border-radius: 10px;
    color: var(--text-primary); font-family: var(--font-body); font-size: 0.95rem;
    transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
  }
  .reg-select { cursor: pointer; }
  .reg-input::placeholder { color: var(--text-muted); opacity: .75; }
  .reg-input:hover, .reg-select:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--blue-border)); }
  .reg-input:focus, .reg-select:focus {
    outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .reg-input-pw { padding-right: 48px; }
  .reg-input-valid { border-color: var(--green) !important; }
  .reg-input-invalid { border-color: var(--red) !important; }

  .reg-eye-btn {
    position: absolute; right: 4px; width: 40px; height: 40px; border-radius: 8px;
    display: grid; place-items: center; background: none; border: none; cursor: pointer;
    color: var(--text-muted); transition: color .2s, background .2s;
  }
  .reg-eye-btn:hover { color: var(--accent); background: rgba(56,189,248,0.1); }

  .reg-hint { font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px; display: block; line-height: 1.45; }
  .reg-hint.warn { color: var(--orange); }

  .reg-network-badge {
    margin-top: 10px; padding: 10px 12px; border-radius: 10px;
    font-size: 0.8rem; line-height: 1.45; display: flex; align-items: flex-start; gap: 8px;
  }

  .reg-strength-track { height: 5px; border-radius: 3px; background: var(--blue-border); overflow: hidden; margin-top: 10px; }
  .reg-strength-fill { height: 100%; border-radius: 3px; transition: width .25s ease, background .25s ease; }
  .reg-strength-row { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
  .reg-match { font-size: 0.8rem; margin-top: 7px; display: flex; align-items: center; gap: 6px; font-weight: 600; }

  .reg-check {
    display: flex; align-items: flex-start; gap: 12px; cursor: pointer;
    padding: 14px; border: 1px solid var(--blue-border); border-radius: 10px; background: var(--blue-mid);
    transition: border-color .2s, background .2s;
  }
  .reg-check:hover { border-color: var(--accent); }
  .reg-check:has(input:checked) { border-color: var(--accent); background: rgba(56,189,248,0.08); }
  .reg-check input[type="checkbox"] { margin-top: 2px; width: 18px; height: 18px; accent-color: var(--accent2); cursor: pointer; flex-shrink: 0; }
  .reg-check span { font-size: 0.86rem; color: var(--text-primary); line-height: 1.5; }

  .reg-error {
    background: color-mix(in srgb, var(--red) 10%, transparent); border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
    border-left: 4px solid var(--red); border-radius: 10px; padding: 11px 14px; margin: 4px 0 16px;
    color: var(--text-primary); font-size: 0.88rem; display: flex; align-items: flex-start; gap: 9px; line-height: 1.45;
  }
  .reg-error svg { color: var(--red); margin-top: 3px; flex-shrink: 0; }

  .reg-todo { font-size: 0.8rem; color: var(--text-secondary); margin: 14px 0 0; padding: 12px 14px; border-radius: 10px; background: var(--blue-mid); border: 1px dashed var(--blue-border); }
  .reg-todo strong { color: var(--text-primary); }
  .reg-todo ul { margin: 6px 0 0; padding-left: 18px; }

  .reg-actions { display: flex; gap: 10px; margin-top: 8px; }
  .reg-actions.end { justify-content: flex-end; align-items: center; gap: 16px; }
  .reg-todo-inline { margin-right: auto; font-size: 0.82rem; color: var(--text-secondary); }
  .reg-actions.end .reg-btn { flex: 0 0 auto; min-width: 220px; }
  .reg-btn {
    flex: 1; min-height: 48px; padding: 12px 18px;
    background: var(--accent2); border: none; border-radius: 10px; color: #fff;
    font-family: var(--font-body); font-size: 0.96rem; font-weight: 700;
    cursor: pointer; transition: filter .2s ease, transform .15s ease, opacity .2s;
    display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none;
  }
  .reg-btn:hover:not(:disabled) { filter: brightness(1.12); }
  .reg-btn:active:not(:disabled) { transform: scale(0.98); }
  .reg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .reg-btn.secondary { background: var(--blue-mid); color: var(--text-primary); border: 1px solid var(--blue-border); }

  .reg-success { text-align: center; padding: 18px 4px 6px; }
  .reg-success-icon {
    width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 16px;
    background: color-mix(in srgb, var(--green) 14%, transparent); border: 1px solid color-mix(in srgb, var(--green) 40%, transparent);
    display: grid; place-items: center; font-size: 1.8rem; color: var(--green);
  }
  .reg-success h2 { font-family: var(--font-display); font-size: 1.2rem; font-weight: 800; margin: 0 0 6px; color: var(--text-primary); }
  .reg-success p { font-size: 0.92rem; color: var(--text-secondary); margin: 0; }
  .reg-success .reg-actions { margin-top: 22px; }

  @media (max-width: 700px) {
    .reg-grid, .reg-grid.two { grid-template-columns: 1fr; }
    .reg-card { padding: 18px 16px; }
    .reg-actions { flex-direction: column-reverse; }
    .reg-actions.end { flex-direction: column-reverse; align-items: stretch; gap: 10px; }
    .reg-todo-inline { margin-right: 0; }
    .reg-actions.end .reg-btn { width: 100%; }
  }
`;

function Section({ icon, children }) {
  return <div className="reg-section">{icon} {children}</div>;
}

function PasswordToggle({ shown, onToggle }) {
  return (
    <button type="button" className="reg-eye-btn" onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}>
      {shown ? <FaEye size={15} /> : <FaEyeSlash size={15} />}
    </button>
  );
}

export default function RegisterPage() {
  const { createUser, error, clearError, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isResidentMode = location.pathname === '/add-resident';
  const isAdmin = user?.roles?.role_desc === 'Admin';

  const [localError, setLocalError] = useState('');
  const [roles, setRoles] = useState([]);

  // Residents only ever need a name + phone -- no auth account (they never
  // log in), so this mode uses its own small piece of state instead of
  // riding along in `form` with fields it doesn't need.
  const [residentForm, setResidentForm] = useState({ name: '', phone: '' });
  const [smsAck, setSmsAck] = useState(false);
  const [consent, setConsent] = useState(false);

  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    role_id: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdLabel, setCreatedLabel] = useState('');

  useEffect(() => {
    if (isResidentMode) return; // role dropdown only exists in staff/admin mode
    supabase.from('roles').select('*').then(({ data }) => {
      if (data) setRoles(data);
    });
  }, [isResidentMode]);

  useEffect(() => {
    clearError();
    setLocalError('');
  }, []);

  const handleChange = (e) => {
    clearError();
    setLocalError('');
    const { name, value } = e.target;
    // Phone numbers: digits only, so a stray space or dash never blocks the pattern check.
    setForm({ ...form, [name]: name === 'phone' ? value.replace(/\D/g, '') : value });
  };

  const handleResidentPhoneChange = (e) => {
    clearError();
    setLocalError('');
    setSmsAck(false); // re-confirm if they edit the number after acknowledging
    setResidentForm({ ...residentForm, phone: e.target.value.replace(/\D/g, '') });
  };

  const residentPhoneValid = /^09\d{9}$/.test(residentForm.phone);
  const residentNetwork = residentPhoneValid ? detectPhoneNetwork(residentForm.phone) : null;
  const needsSmsAck = residentPhoneValid && residentNetwork && !residentNetwork.deliverable;

  const handleResidentSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setLocalError('');

    if (!residentPhoneValid) {
      setLocalError('Enter a valid 11-digit PH mobile number (starts with 09).');
      return;
    }
    if (!consent) {
      setLocalError('Confirm that the resident agreed to receive SMS alerts before registering them.');
      return;
    }
    if (needsSmsAck && !smsAck) {
      setLocalError('Please confirm you understand this number may not receive SMS alerts before continuing.');
      return;
    }

    setLoading(true);

    const { error: insertError } = await supabase.from('residents').insert({
      name: residentForm.name,
      phone: residentForm.phone,
      network: residentNetwork?.network ?? 'unknown',
      sms_deliverable: residentNetwork?.deliverable ?? false,
      added_by: user?.id ?? null,
      consent_given: true,
    });

    setLoading(false);

    if (insertError) {
      // Unique constraint on phone -- most likely cause of a failed insert here.
      setLocalError(
        insertError.code === '23505'
          ? 'A resident with this phone number is already registered.'
          : insertError.message
      );
      return;
    }

    setCreatedLabel(residentForm.name);
    setSuccess(true);
    setResidentForm({ name: '', phone: '' });
    setSmsAck(false);
    setConsent(false);
  };

  const handleSubmit = async (e) => {
    if (isResidentMode) return handleResidentSubmit(e);

    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      clearError();
      setLocalError('Passwords do not match');
      return;
    }

    if (form.password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    const { confirmPassword, ...payload } = form;

    const ok = await createUser(payload);

    setLoading(false);

    if (ok) {
      setCreatedLabel(`${form.name} (@${form.username})`);
      setSuccess(true);

      setForm({
        name: '',
        username: '',
        password: '',
        confirmPassword: '',
        phone: '',
        role_id: '',
      });
    }
  };

  const phoneValid = /^09\d{9}$/.test(form.phone);
  const strength = getPasswordStrength(form.password);
  const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;

  // Tell the person exactly what is still missing instead of leaving the
  // submit button disabled with no explanation.
  const residentBlockers = [
    !residentForm.name.trim() && 'Enter the resident\u2019s full name',
    !residentPhoneValid && 'Enter a valid 11-digit mobile number',
    !consent && 'Confirm the resident\u2019s consent',
    needsSmsAck && !smsAck && 'Acknowledge the SMS delivery note',
  ].filter(Boolean);

  const errorText = error || localError;

  const heading = isResidentMode ? 'Add resident' : 'Create staff account';

  return (
    <>
      <style>{styles}</style>
      <div className="reg-page fade-in">

        <Link to="/dashboard" className="reg-back">
          <FaArrowLeft size={12} aria-hidden="true" /> Back to dashboard
        </Link>

        <div className="reg-header">
          <div className="reg-header-icon" aria-hidden="true"><FaUserPlus /></div>
          <h2 className="reg-title">{heading}</h2>
        </div>

        <div className="card reg-card">

          {success ? (
            <div className="reg-success" role="status">
              <div className="reg-success-icon" aria-hidden="true"><FaCheckCircle /></div>
              <h2>{isResidentMode ? 'Resident registered' : 'Account created'}</h2>
              <p>
                {createdLabel ? <><strong>{createdLabel}</strong> {isResidentMode ? 'will now receive flood alerts.' : 'can now sign in to AGOS.'}</> : 'All set.'}
              </p>
              <div className="reg-actions">
                <Link to="/dashboard" className="reg-btn secondary">Go to dashboard</Link>
                <button type="button" className="reg-btn" onClick={() => { setSuccess(false); setCreatedLabel(''); }}>
                  <FaUserPlus size={13} aria-hidden="true" /> {isResidentMode ? 'Register another' : 'Create another'}
                </button>
              </div>
            </div>

          ) : isResidentMode ? (

            <form onSubmit={handleResidentSubmit} noValidate>

              <div className="reg-grid two">
              <div className="reg-field">
                <label className="reg-label" htmlFor="res-name">Full name</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaUser size={14} /></span>
                  <input id="res-name" className="reg-input" name="name" type="text" autoComplete="off"
                    value={residentForm.name}
                    onChange={e => setResidentForm({ ...residentForm, name: e.target.value })}
                    placeholder="e.g. Maria Santos" required />
                </div>
              </div>
              <div className="reg-field">
                <label className="reg-label" htmlFor="res-phone">Mobile number</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaPhone size={14} /></span>
                  <input id="res-phone"
                    className={`reg-input ${residentForm.phone.length > 0 ? (residentPhoneValid ? 'reg-input-valid' : 'reg-input-invalid') : ''}`}
                    name="phone" type="tel" inputMode="numeric" autoComplete="off" value={residentForm.phone}
                    onChange={handleResidentPhoneChange} placeholder="09123456789"
                    required maxLength={11}
                    aria-invalid={residentForm.phone.length > 0 && !residentPhoneValid} />
                </div>
                {residentForm.phone.length > 0 && !residentPhoneValid && (
                  <span className="reg-hint warn">{11 - residentForm.phone.length} more digit{11 - residentForm.phone.length === 1 ? '' : 's'}, starting with 09</span>
                )}

                {residentPhoneValid && residentNetwork && (
                  <div className="reg-network-badge" role="status"
                    style={{
                      background: `${NETWORK_INFO[residentNetwork.network].color}18`,
                      border: `1px solid ${NETWORK_INFO[residentNetwork.network].color}55`,
                      color: 'var(--text-primary)',
                    }}>
                    {residentNetwork.deliverable
                      ? <FaCheckCircle size={13} style={{ marginTop: 3, flexShrink: 0, color: NETWORK_INFO[residentNetwork.network].color }} />
                      : <FaExclamationTriangle size={13} style={{ marginTop: 3, flexShrink: 0, color: NETWORK_INFO[residentNetwork.network].color }} />}
                    <span>
                      {residentNetwork.deliverable
                        ? `${NETWORK_INFO[residentNetwork.network].label} — SMS alerts should reach this number.`
                        : `Likely ${NETWORK_INFO[residentNetwork.network].label} — our SMS provider may not be able to deliver alerts to this number. This is a guess based on the number's prefix, so double-check with the resident.`}
                    </span>
                  </div>
                )}
              </div>
              </div>

              <div className="reg-field">
                <label className="reg-check">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                  <span>This resident is here in person, has been identified, and has agreed (consent form signed) to receive AGOS SMS alerts and to have this number stored.</span>
                </label>
              </div>

              {needsSmsAck && (
                <div className="reg-field">
                  <label className="reg-check">
                    <input type="checkbox" checked={smsAck} onChange={e => setSmsAck(e.target.checked)} />
                    <span>I understand this number may not receive SMS alerts, and will let this resident know to install the AGOS app for push notifications instead.</span>
                  </label>
                </div>
              )}

              {errorText && (
                <div className="reg-error" role="alert"><FaExclamationTriangle size={14} aria-hidden="true" /> <span>{errorText}</span></div>
              )}

              <div className="reg-actions end">
                {residentBlockers.length > 0 && !loading && (
                  <span className="reg-todo-inline">Still needed: {residentBlockers.join(' · ')}</span>
                )}
                <button type="submit" className="reg-btn" disabled={loading || residentBlockers.length > 0}>
                  {loading
                    ? <><Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" /> Registering…</>
                    : <><FaHome size={14} aria-hidden="true" /> Register resident</>}
                </button>
              </div>

            </form>

          ) : (

            <form onSubmit={handleSubmit} noValidate>

              <div className="reg-grid">
              <div className="reg-field">
                <label className="reg-label" htmlFor="reg-name">Full name</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaUser size={14} /></span>
                  <input id="reg-name" className="reg-input" name="name" type="text" autoComplete="off"
                    value={form.name} onChange={handleChange} placeholder="e.g. Maria Santos" required />
                </div>
              </div>
              <div className="reg-field">
                <label className="reg-label" htmlFor="reg-phone">Mobile number</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaPhone size={14} /></span>
                  <input id="reg-phone"
                    className={`reg-input ${form.phone.length > 0 ? (phoneValid ? 'reg-input-valid' : 'reg-input-invalid') : ''}`}
                    name="phone" type="tel" inputMode="numeric" autoComplete="off" value={form.phone}
                    onChange={handleChange} placeholder="09123456789" required maxLength={11}
                    aria-invalid={form.phone.length > 0 && !phoneValid} />
                </div>
                {form.phone.length > 0 && !phoneValid && (
                  <span className="reg-hint warn">{11 - form.phone.length} more digit{11 - form.phone.length === 1 ? '' : 's'}, starting with 09</span>
                )}
              </div>
              <div className="reg-field">
                <label className="reg-label" htmlFor="reg-username">Username</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaAt size={14} /></span>
                  <input id="reg-username" className="reg-input" name="username" type="text" autoComplete="off"
                    autoCapitalize="none" spellCheck={false} value={form.username} onChange={handleChange}
                    placeholder="e.g. maria_santos" required />
                </div>
              </div>
              <div className="reg-field">
                <label className="reg-label" htmlFor="reg-role">Role</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaUserShield size={14} /></span>
                  <select id="reg-role" className="reg-select reg-input" name="role_id" value={form.role_id}
                    onChange={handleChange} required>
                    <option value="">Select a role…</option>
                    {roles.filter(r => r.role_id !== 7).map(r => (
                      <option key={r.role_id} value={r.role_id}>{r.role_desc}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="reg-field">
                <label className="reg-label" htmlFor="reg-password">Password</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaLock size={14} /></span>
                  <input id="reg-password" className="reg-input reg-input-pw" name="password" autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'} value={form.password} onChange={handleChange}
                    placeholder="At least 8 characters" required />
                  <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(p => !p)} />
                </div>
                {form.password.length > 0 && (
                  <>
                    <div className="reg-strength-track" aria-hidden="true">
                      <div className="reg-strength-fill" style={{ width: `${strength.pct}%`, background: strength.color }} />
                    </div>
                    <div className="reg-strength-row">
                      <span style={{ fontSize: '0.78rem', color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="reg-field">
                <label className="reg-label" htmlFor="reg-confirm">Confirm password</label>
                <div className="reg-input-wrap">
                  <span className="reg-input-icon" aria-hidden="true"><FaLock size={14} /></span>
                  <input id="reg-confirm"
                    className={`reg-input reg-input-pw ${form.confirmPassword.length > 0 ? (passwordsMatch ? 'reg-input-valid' : 'reg-input-invalid') : ''}`}
                    name="confirmPassword" autoComplete="new-password"
                    type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword}
                    onChange={handleChange} placeholder="Re-enter the password" required />
                  <PasswordToggle shown={showConfirmPassword} onToggle={() => setShowConfirmPassword(p => !p)} />
                </div>
                {form.confirmPassword.length > 0 && (
                  <div className="reg-match" role="status" style={{ color: passwordsMatch ? 'var(--green)' : 'var(--red)' }}>
                    {passwordsMatch ? <><FaCheckCircle size={12} aria-hidden="true" /> Passwords match</> : 'Passwords do not match'}
                  </div>
                )}
              </div>
              </div>

              {errorText && (
                <div className="reg-error" role="alert"><FaExclamationTriangle size={14} aria-hidden="true" /> <span>{errorText}</span></div>
              )}

              <div className="reg-actions end">
                <button type="submit" className="reg-btn" disabled={loading}>
                  {loading
                    ? <><Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" /> Creating account…</>
                    : <><FaCheckCircle size={14} aria-hidden="true" /> Create account</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
