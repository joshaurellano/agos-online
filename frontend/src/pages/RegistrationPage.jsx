import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';

import { FaEyeSlash, FaEye, FaUser, FaPhone, FaAt, FaLock, FaUserShield, FaHome, FaCheckCircle, FaExclamationTriangle, FaArrowLeft } from 'react-icons/fa';

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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap');

  .reg-root {
    min-height: 100vh;
    background: #050d1a;
    display: flex;
    justify-content: center;
    padding: 56px 24px 64px;
    position: relative;
    overflow-x: hidden;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  /* Contour-line motif -- echoes a topographic/flood-extent map rather than
     a generic grid, tying the auth chrome back to the subject matter. */
  .reg-contours {
    position: absolute;
    inset: 0;
    opacity: 0.5;
    background-image:
      repeating-radial-gradient(circle at 12% 18%, transparent 0, transparent 34px, rgba(56,189,248,0.05) 35px, rgba(56,189,248,0.05) 36px),
      repeating-radial-gradient(circle at 88% 82%, transparent 0, transparent 46px, rgba(14,165,233,0.045) 47px, rgba(14,165,233,0.045) 48px);
    pointer-events: none;
  }

  .reg-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    pointer-events: none;
  }
  .reg-orb-1 {
    width: 520px; height: 520px;
    background: radial-gradient(circle, rgba(0,160,255,0.11) 0%, transparent 70%);
    top: -180px; right: -140px;
    animation: reg-orb-float 9s ease-in-out infinite;
  }
  .reg-orb-2 {
    width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%);
    bottom: -120px; left: -100px;
    animation: reg-orb-float 11s ease-in-out infinite reverse;
  }
  @keyframes reg-orb-float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-22px); }
  }

  .reg-wrapper {
    width: 100%;
    max-width: 480px;
    position: relative;
    z-index: 1;
    animation: reg-fade-up 0.5s ease both;
  }
  @keyframes reg-fade-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .reg-back {
    display: inline-flex; align-items: center; gap: 6px;
    color: rgba(148,195,240,0.55); font-size: 0.78rem; font-weight: 600;
    text-decoration: none; margin-bottom: 22px; transition: color 0.2s ease;
  }
  .reg-back:hover { color: #38bdf8; }

  .reg-header { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }

  .reg-ring {
    width: 54px; height: 54px; flex-shrink: 0; position: relative;
  }
  .reg-ring svg { width: 100%; height: 100%; animation: reg-spin 14s linear infinite; }
  @keyframes reg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .reg-ring-inner {
    position: absolute; inset: 7px; border-radius: 50%;
    background: linear-gradient(135deg, #0284c7, #0ea5e9);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 1.05rem;
    box-shadow: 0 0 20px rgba(14,165,233,0.4), inset 0 1px 0 rgba(255,255,255,0.15);
  }

  .reg-title {
    font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
    font-size: 1.5rem; font-weight: 800; line-height: 1.15;
    margin-bottom: 3px;
    background: linear-gradient(135deg, #e0f2fe 0%, #38bdf8 60%, #0ea5e9 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  .reg-subtitle { font-size: 0.82rem; color: rgba(148,195,240,0.55); letter-spacing: 0.01em; }

  .reg-card {
    background: rgba(8, 22, 42, 0.78);
    border: 1px solid rgba(0, 160, 255, 0.15);
    border-radius: 20px;
    padding: 32px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.03) inset, 0 32px 64px rgba(0,0,0,0.4);
    position: relative;
    overflow: hidden;
  }
  .reg-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(14,165,233,0.5), transparent);
  }

  .reg-section {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.66rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(120, 175, 220, 0.65);
    margin: 26px 0 16px; padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 130, 210, 0.18);
  }
  .reg-section:first-child { margin-top: 0; }

  .reg-field { margin-bottom: 18px; }

  .reg-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.7rem; font-weight: 600; color: rgba(140, 185, 225, 0.75);
    text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;
  }

  .reg-input-wrap { position: relative; display: flex; align-items: center; }
  .reg-input-icon { position: absolute; left: 14px; color: rgba(100, 160, 220, 0.4); display: flex; pointer-events: none; }

  .reg-input, .reg-select {
    width: 100%;
    padding: 12px 16px 12px 40px;
    background: rgba(0, 30, 60, 0.6);
    border: 1px solid rgba(0, 120, 200, 0.2);
    border-radius: 10px;
    color: #e0f2fe;
    font-family: 'Inter', sans-serif;
    font-size: 0.92rem;
    outline: none;
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    box-sizing: border-box;
  }
  .reg-select { cursor: pointer; }
  .reg-input::placeholder { color: rgba(100, 160, 220, 0.32); }
  .reg-input:focus, .reg-select:focus {
    border-color: rgba(14, 165, 233, 0.5);
    background: rgba(0, 40, 80, 0.7);
    box-shadow: 0 0 0 3px rgba(14,165,233,0.08);
  }
  .reg-input-pw { padding-right: 46px; }
  .reg-input-valid { border-color: rgba(34,197,94,0.55) !important; }
  .reg-input-invalid { border-color: rgba(239,68,68,0.5) !important; }

  .reg-eye-btn {
    position: absolute; right: 14px; background: none; border: none; cursor: pointer;
    color: rgba(100, 160, 220, 0.5); padding: 0; display: flex; transition: color 0.2s;
  }
  .reg-eye-btn:hover { color: rgba(14, 165, 233, 0.9); }

  .reg-hint { font-size: 0.71rem; color: rgba(120, 165, 205, 0.55); margin-top: 6px; display: block; }
  .reg-hint.warn { color: #f0ad4e; }

  .reg-network-badge {
    margin-top: 9px; padding: 8px 11px; border-radius: 8px;
    font-size: 0.72rem; line-height: 1.4; display: flex; align-items: flex-start; gap: 7px;
  }

  .reg-strength-track { height: 4px; border-radius: 2px; background: rgba(0, 40, 80, 0.6); overflow: hidden; margin-top: 9px; }
  .reg-strength-fill { height: 100%; border-radius: 2px; transition: width 0.25s ease, background 0.25s ease; }
  .reg-strength-row { display: flex; justify-content: space-between; margin-top: 5px; }

  .reg-match { font-size: 0.72rem; margin-top: 7px; display: flex; align-items: center; gap: 5px; }

  .reg-checkbox-row { display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
  .reg-checkbox-row input[type="checkbox"] { margin-top: 3px; width: 15px; height: 15px; accent-color: #0ea5e9; cursor: pointer; flex-shrink: 0; }
  .reg-checkbox-row span { font-size: 0.78rem; color: rgba(180, 210, 235, 0.75); line-height: 1.45; }

  .reg-error {
    background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 10px; padding: 10px 14px; margin: 4px 0 18px;
    color: #fca5a5; font-size: 0.83rem; display: flex; align-items: center; gap: 8px;
  }

  .reg-btn {
    width: 100%; padding: 14px; margin-top: 4px;
    background: linear-gradient(135deg, #0284c7, #0ea5e9);
    border: none; border-radius: 10px; color: #fff;
    font-family: 'Inter', sans-serif; font-size: 0.94rem; font-weight: 700; letter-spacing: 0.03em;
    cursor: pointer; transition: all 0.2s ease;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    box-shadow: 0 4px 24px rgba(14,165,233,0.25);
  }
  .reg-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(14,165,233,0.35); }
  .reg-btn:active:not(:disabled) { transform: translateY(0); }
  .reg-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  .reg-footer { text-align: center; margin-top: 20px; font-size: 0.78rem; color: rgba(148,195,240,0.5); }
  .reg-footer a { color: #38bdf8; font-weight: 600; text-decoration: none; }
  .reg-footer a:hover { text-decoration: underline; }

  .reg-success-icon {
    width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 18px;
    background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.35);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.7rem; color: #22c55e;
  }
`;

export default function RegisterPage() {
  const { createUser, error, clearError, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isResidentMode = location.pathname === '/add-resident';
  const isAdmin = user.roles?.role_desc === 'Admin';

  const [localError, setLocalError] = useState('');
  const [roles, setRoles] = useState([]);

  // Residents only ever need a name + phone -- no auth account (they never
  // log in), so this mode uses its own small piece of state instead of
  // riding along in `form` with fields it doesn't need.
  const [residentForm, setResidentForm] = useState({ name: '', phone: '' });
  const [smsAck, setSmsAck] = useState(false);

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
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleResidentPhoneChange = (e) => {
    clearError();
    setLocalError('');
    setSmsAck(false); // re-confirm if they edit the number after acknowledging
    setResidentForm({ ...residentForm, phone: e.target.value });
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

    setSuccess(true);
    setResidentForm({ name: '', phone: '' });
    setSmsAck(false);
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

  return (
    <>
      <style>{styles}</style>
      <div className="reg-root">
        <div className="reg-contours" />
        <div className="reg-orb reg-orb-1" />
        <div className="reg-orb reg-orb-2" />

        <div className="reg-wrapper">

          {isResidentMode && (
            <Link to="/dashboard" className="reg-back">
              <FaArrowLeft size={11} /> Back to dashboard
            </Link>
          )}

          <div className="reg-header">
            <div className="reg-ring">
              <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="27" cy="27" r="25.5" stroke="url(#regRingGrad)" strokeWidth="1.5" strokeDasharray="5 4" />
                <defs>
                  <linearGradient id="regRingGrad" x1="0" y1="0" x2="54" y2="54" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#0284c7" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="reg-ring-inner">
                {isResidentMode ? <FaHome /> : <FaUserShield />}
              </div>
            </div>
            <div>
              <h1 className="reg-title">{isResidentMode ? 'Add Resident' : 'Create Account'}</h1>
              <p className="reg-subtitle">
                {isResidentMode ? 'Register a resident of Barangay Triangulo for flood alerts' : 'AGOS staff & admin account'}
              </p>
            </div>
          </div>

          <div className="reg-card">

            {success ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div className="reg-success-icon"><FaCheckCircle /></div>
                <p style={{ color: '#e0f2fe', fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>
                  {isResidentMode ? 'Resident registered!' : 'Account created!'}
                </p>
                <p style={{ color: 'rgba(148,195,240,0.6)', fontSize: '0.85rem' }}>
                  {isResidentMode ? (
                    <>
                      <Link to="/add-resident" onClick={() => setSuccess(false)} style={{ color: '#38bdf8' }}>Register another</Link>
                      {' '}or{' '}
                      <Link to="/dashboard" style={{ color: '#38bdf8' }}>go to dashboard</Link>.
                    </>
                  ) : (
                    'Account created.'
                  )}
                </p>
              </div>

            ) : isResidentMode ? (

              /* ── Resident mode: name + phone only, no account ─────────── */
              <form onSubmit={handleResidentSubmit}>

                <div className="reg-section"><FaUser size={10} /> Resident information</div>

                <div className="reg-field">
                  <label className="reg-label"><FaUser size={11} /> Full name</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaUser size={13} /></span>
                    <input
                      className="reg-input"
                      name="name" type="text" value={residentForm.name}
                      onChange={e => setResidentForm({ ...residentForm, name: e.target.value })}
                      placeholder="e.g. Maria Santos"
                      required
                    />
                  </div>
                </div>

                <div className="reg-field">
                  <label className="reg-label"><FaPhone size={11} /> Phone number</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaPhone size={13} /></span>
                    <input
                      className={`reg-input ${residentForm.phone.length > 0 ? (residentPhoneValid ? 'reg-input-valid' : '') : ''}`}
                      name="phone" type="tel" value={residentForm.phone}
                      onChange={handleResidentPhoneChange} placeholder="e.g. 09123456789"
                      required pattern="^09\d{9}$" maxLength={11}
                    />
                  </div>
                  <span className={`reg-hint ${residentForm.phone.length > 0 && !residentPhoneValid ? 'warn' : ''}`}>
                    {residentForm.phone.length > 0 && !residentPhoneValid
                      ? 'Format: 09 followed by 9 digits (11 digits total)'
                      : '11-digit PH mobile number, starts with 09'}
                  </span>

                  {residentPhoneValid && residentNetwork && (
                    <div
                      className="reg-network-badge"
                      style={{
                        background: `${NETWORK_INFO[residentNetwork.network].color}18`,
                        border: `1px solid ${NETWORK_INFO[residentNetwork.network].color}40`,
                        color: NETWORK_INFO[residentNetwork.network].color,
                      }}
                    >
                      {residentNetwork.deliverable ? <FaCheckCircle size={11} style={{ marginTop: 2, flexShrink: 0 }} /> : <FaExclamationTriangle size={11} style={{ marginTop: 2, flexShrink: 0 }} />}
                      <span>
                        {residentNetwork.deliverable
                          ? `${NETWORK_INFO[residentNetwork.network].label} — SMS alerts should reach this number.`
                          : `Likely ${NETWORK_INFO[residentNetwork.network].label} — our SMS provider may not be able to deliver alerts to this number. This is a heuristic guess based on the number's prefix (number portability can make it wrong), not a guarantee either way.`}
                      </span>
                    </div>
                  )}
                </div>

                {needsSmsAck && (
                  <div className="reg-field">
                    <label className="reg-checkbox-row">
                      <input
                        type="checkbox" checked={smsAck}
                        onChange={e => setSmsAck(e.target.checked)}
                      />
                      <span>
                        I understand this number may not receive SMS alerts, and will let this resident know to install the AGOS app for push notifications instead.
                      </span>
                    </label>
                  </div>
                )}

                {(error || localError) && (
                  <div className="reg-error"><FaExclamationTriangle size={13} /> {error || localError}</div>
                )}

                <button type="submit" className="reg-btn"
                  disabled={loading || !residentPhoneValid || (needsSmsAck && !smsAck)}>
                  {loading
                    ? <><Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" /> Registering...</>
                    : <><FaHome size={13} /> Register resident</>}
                </button>
              </form>

            ) : (

              /* ── Staff/admin mode: full account with credentials ──────── */
              <form onSubmit={handleSubmit}>

                <div className="reg-section"><FaUser size={10} /> Personal information</div>

                <div className="reg-field">
                  <label className="reg-label"><FaUser size={11} /> Full name</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaUser size={13} /></span>
                    <input
                      className="reg-input"
                      name="name" type="text" value={form.name}
                      onChange={handleChange} placeholder="e.g. Maria Santos"
                      required
                    />
                  </div>
                </div>

                <div className="reg-field">
                  <label className="reg-label"><FaPhone size={11} /> Phone number</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaPhone size={13} /></span>
                    <input
                      className={`reg-input ${form.phone.length > 0 ? (phoneValid ? 'reg-input-valid' : '') : ''}`}
                      name="phone" type="tel" value={form.phone}
                      onChange={handleChange} placeholder="e.g. 09123456789"
                      required pattern="^09\d{9}$" maxLength={11}
                    />
                  </div>
                  <span className={`reg-hint ${form.phone.length > 0 && !phoneValid ? 'warn' : ''}`}>
                    {form.phone.length > 0 && !phoneValid
                      ? 'Format: 09 followed by 9 digits (11 digits total)'
                      : '11-digit PH mobile number, starts with 09'}
                  </span>
                </div>

                <div className="reg-section"><FaLock size={10} /> Account authentication</div>

                <div className="reg-field">
                  <label className="reg-label"><FaAt size={11} /> Username</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaAt size={13} /></span>
                    <input
                      className="reg-input"
                      name="username" type="text" value={form.username}
                      onChange={handleChange} placeholder="e.g. maria_santos"
                      required
                    />
                  </div>
                </div>

                <div className="reg-field">
                  <label className="reg-label"><FaLock size={11} /> Password</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaLock size={13} /></span>
                    <input
                      className="reg-input reg-input-pw"
                      name="password" type={showPassword ? 'text' : 'password'} value={form.password}
                      onChange={handleChange} placeholder="••••••••"
                      required
                    />
                    <button type="button" className="reg-eye-btn" onClick={() => setShowPassword(p => !p)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <FaEye size={14} /> : <FaEyeSlash size={14} />}
                    </button>
                  </div>

                  {form.password.length > 0 && (
                    <>
                      <div className="reg-strength-track">
                        <div className="reg-strength-fill" style={{ width: `${strength.pct}%`, background: strength.color }} />
                      </div>
                      <div className="reg-strength-row">
                        <span style={{ fontSize: '0.68rem', color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                        <span style={{ fontSize: '0.68rem', color: 'rgba(120,165,205,0.55)' }}>Min. 8 characters, letters + numbers</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="reg-field">
                  <label className="reg-label"><FaLock size={11} /> Confirm password</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaLock size={13} /></span>
                    <input
                      className={`reg-input reg-input-pw ${form.confirmPassword.length > 0 ? (passwordsMatch ? 'reg-input-valid' : 'reg-input-invalid') : ''}`}
                      name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword}
                      onChange={handleChange} placeholder="••••••••"
                      required
                    />
                    <button type="button" className="reg-eye-btn" onClick={() => setShowConfirmPassword(p => !p)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                      {showConfirmPassword ? <FaEye size={14} /> : <FaEyeSlash size={14} />}
                    </button>
                  </div>
                  {form.confirmPassword.length > 0 && (
                    <div className="reg-match" style={{ color: passwordsMatch ? '#22c55e' : '#f87171' }}>
                      {passwordsMatch ? <><FaCheckCircle size={10} /> Passwords match</> : 'Passwords do not match'}
                    </div>
                  )}
                </div>

                <div className="reg-section"><FaUserShield size={10} /> Role &amp; access</div>

                <div className="reg-field">
                  <label className="reg-label"><FaUserShield size={11} /> Role</label>
                  <div className="reg-input-wrap">
                    <span className="reg-input-icon"><FaUserShield size={13} /></span>
                    <select
                      className="reg-select reg-input"
                      name="role_id" value={form.role_id}
                      onChange={handleChange} required
                    >
                      <option value="">Select a role...</option>
                      {roles.filter(r => r.role_id !== 7).map(r => (
                        <option key={r.role_id} value={r.role_id}>{r.role_desc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {(error || localError) && (
                  <div className="reg-error"><FaExclamationTriangle size={13} /> {error || localError}</div>
                )}

                <button type="submit" className="reg-btn" disabled={loading}>
                  {loading
                    ? <><Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" /> Creating account...</>
                    : <><FaCheckCircle size={13} /> Register</>}
                </button>

              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
