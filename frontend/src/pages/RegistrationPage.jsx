import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Form, Button, Spinner, InputGroup } from 'react-bootstrap';

import { FaEyeSlash, FaEye, FaUser, FaPhone, FaAt, FaLock, FaUserShield, FaHome, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { SectionLabel } from '../components/ui';
import { detectPhoneNetwork, NETWORK_INFO } from '../lib/phoneNetwork';

// Simple heuristic strength meter -- purely a UX nudge, does not change or
// loosen the actual validation rule (still 8+ chars, enforced in handleSubmit).
function getPasswordStrength(pw) {
  if (!pw) return { label: '', pct: 0, color: 'var(--blue-border)' };
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

  const inputStyle = {
    padding: '12px 14px',
    background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)', fontSize: '0.95rem',
    outline: 'none', transition: 'border-color 0.2s',
  };

  const labelStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: '0.8rem', fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: '6px',
    letterSpacing: '0.05em',
  };

  const phoneValid = /^09\d{9}$/.test(form.phone);
  const strength = getPasswordStrength(form.password);
  const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--blue-deep)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', position: 'relative', overflow: 'hidden',
    }}>

      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 50%, rgba(14,165,233,0.07) 0%, transparent 60%), radial-gradient(ellipse at 70% 20%, rgba(56,189,248,0.05) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div className="fade-in" style={{ width: '100%', maxWidth: '440px' }}>

        {/* ── Header with mode icon ─────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '24px' }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: isResidentMode ? 'rgba(56,189,248,0.12)' : 'rgba(14,165,233,0.12)',
            border: `1px solid ${isResidentMode ? 'rgba(56,189,248,0.3)' : 'rgba(14,165,233,0.3)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', color: 'var(--accent)',
          }}>
            {isResidentMode ? <FaHome /> : <FaUserShield />}
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {isResidentMode ? 'Add Resident' : 'Create Account'}
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {isResidentMode ? 'Register a resident for Barangay Triangulo': ''}
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: '32px' }}>

          {success ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.6rem', color: '#22c55e',
              }}>
                <FaCheckCircle />
              </div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem' }}>
                {isResidentMode ? 'Resident registered!' : 'Account created!'}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
                {isResidentMode ? (
                  <>
                    <Link to="/add-resident" onClick={() => setSuccess(false)} style={{ color: 'var(--accent)' }}>Register another</Link>
                    {' '}or{' '}
                    <Link to="/dashboard" style={{ color: 'var(--accent)' }}>Go to Dashboard</Link>.
                  </>
                ) : (
                  <>You can now <Link to="/login" style={{ color: 'var(--accent)' }}>sign in</Link>.</>
                )}
              </p>
            </div>
          ) : isResidentMode ? (

            /* ── Resident mode: name + phone only, no account ─────────── */
            <Form onSubmit={handleResidentSubmit}>

              <SectionLabel>👤 Resident Information</SectionLabel>

              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}><FaUser size={11} /> Full Name</Form.Label>
                <Form.Control
                  name="name" type="text" value={residentForm.name}
                  onChange={e => setResidentForm({ ...residentForm, name: e.target.value })}
                  placeholder="e.g. Maria Santos"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              <div style={{ marginBottom: needsSmsAck ? '14px' : '24px' }}>
                <Form.Label style={labelStyle}><FaPhone size={11} /> Phone Number</Form.Label>
                <InputGroup>
                  <Form.Control
                    name="phone" type="tel" value={residentForm.phone}
                    onChange={handleResidentPhoneChange} placeholder="e.g. 09123456789"
                    required pattern="^09\d{9}$" maxLength={11}
                    style={{
                      ...inputStyle,
                      borderColor: residentForm.phone.length > 0
                        ? (residentPhoneValid ? '#22c55e60' : 'var(--blue-border)')
                        : 'var(--blue-border)',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = residentForm.phone.length > 0 && residentPhoneValid ? '#22c55e60' : 'var(--blue-border)'}
                  />
                </InputGroup>
                <Form.Text style={{
                  color: residentForm.phone.length > 0 && !residentPhoneValid ? '#f0ad4e' : 'var(--text-muted)',
                  fontSize: '0.72rem', display: 'block', marginTop: '5px',
                }}>
                  {residentForm.phone.length > 0 && !residentPhoneValid
                    ? 'Format: 09 followed by 9 digits (11 digits total)'
                    : '11-digit PH mobile number, starts with 09'}
                </Form.Text>

                {residentPhoneValid && residentNetwork && (
                  <div style={{
                    marginTop: '8px', padding: '8px 10px', borderRadius: 6,
                    background: `${NETWORK_INFO[residentNetwork.network].color}18`,
                    border: `1px solid ${NETWORK_INFO[residentNetwork.network].color}40`,
                    fontSize: '0.72rem', color: NETWORK_INFO[residentNetwork.network].color,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {residentNetwork.deliverable ? <FaCheckCircle size={11} /> : <FaExclamationTriangle size={11} />}
                    {residentNetwork.deliverable
                      ? `${NETWORK_INFO[residentNetwork.network].label} — SMS alerts should reach this number.`
                      : `Likely ${NETWORK_INFO[residentNetwork.network].label} — our SMS provider may not be able to deliver alerts to this number. This is a heuristic guess based on the number's prefix (number portability can make it wrong), not a guarantee either way.`}
                  </div>
                )}
              </div>

              {needsSmsAck && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox" checked={smsAck}
                      onChange={e => setSmsAck(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      I understand this number may not receive SMS alerts, and will let this resident know to install the AGOS app for push notifications instead.
                    </span>
                  </label>
                </div>
              )}

              {(error || localError) && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px', color: '#fca5a5', fontSize: '0.85rem' }}>
                  ⚠️ {error || localError}
                </div>
              )}

              <Button type="submit" className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '1rem' }}
                disabled={loading || !residentPhoneValid || (needsSmsAck && !smsAck)}>
                {loading
                  ? <><Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" /> Loading ...</>
                  : '🏘️ Register Resident'}
              </Button>
            </Form>

          ) : (

            /* ── Staff/admin mode: full account with credentials ──────── */
            <Form onSubmit={handleSubmit}>

              {/* ── Personal Information ─────────────────────────────── */}
              <SectionLabel>👤 Personal Information</SectionLabel>

              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}><FaUser size={11} /> Full Name</Form.Label>
                <Form.Control
                  name="name" type="text" value={form.name}
                  onChange={handleChange} placeholder="e.g. Maria Santos"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <Form.Label style={labelStyle}><FaPhone size={11} /> Phone Number</Form.Label>
                <InputGroup>
                  <Form.Control
                    name="phone" type="tel" value={form.phone}
                    onChange={handleChange} placeholder="e.g. 09123456789"
                    required pattern="^09\d{9}$" maxLength={11}
                    style={{
                      ...inputStyle,
                      borderColor: form.phone.length > 0
                        ? (phoneValid ? '#22c55e60' : 'var(--blue-border)')
                        : 'var(--blue-border)',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = form.phone.length > 0 && phoneValid ? '#22c55e60' : 'var(--blue-border)'}
                  />
                </InputGroup>
                <Form.Text style={{
                  color: form.phone.length > 0 && !phoneValid ? '#f0ad4e' : 'var(--text-muted)',
                  fontSize: '0.72rem', display: 'block', marginTop: '5px',
                }}>
                  {form.phone.length > 0 && !phoneValid
                    ? 'Format: 09 followed by 9 digits (11 digits total)'
                    : '11-digit PH mobile number, starts with 09'}
                </Form.Text>
              </div>

              {/* ── Account Security ─────────────────────────────────── */}
              <SectionLabel>🔒 Account Authentication</SectionLabel>

              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}><FaAt size={11} /> Username</Form.Label>
                <Form.Control
                  name="username" type="text" value={form.username}
                  onChange={handleChange} placeholder="e.g. maria_santos"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}><FaLock size={11} /> Password</Form.Label>
                <InputGroup>
                  <Form.Control
                    name="password" type={showPassword ? "text" : "password"} value={form.password}
                    onChange={handleChange} placeholder="••••••••"
                    required
                    style={{ ...inputStyle, borderRight: 'none', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                  />
                  <InputGroup.Text style={{
                    background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
                    borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                    color: 'var(--text-secondary)', cursor: 'pointer', borderLeft: 'none',
                  }}>
                    {showPassword
                      ? <FaEye onClick={() => setShowPassword(p => !p)} />
                      : <FaEyeSlash onClick={() => setShowPassword(p => !p)} />}
                  </InputGroup.Text>
                </InputGroup>

                {form.password.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ height: 4, background: 'var(--blue-border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${strength.pct}%`, background: strength.color,
                        borderRadius: 2, transition: 'width 0.25s ease, background 0.25s ease',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.68rem', color: strength.color, fontWeight: 600 }}>
                        {strength.label}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Min. 8 characters, letters + numbers
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <Form.Label style={labelStyle}><FaLock size={11} /> Confirm Password</Form.Label>
                <InputGroup>
                  <Form.Control
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={handleChange} placeholder="••••••••"
                    required
                    style={{
                      ...inputStyle, borderRight: 'none', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                      borderColor: form.confirmPassword.length > 0
                        ? (passwordsMatch ? '#22c55e60' : '#ef444460')
                        : 'var(--blue-border)',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = form.confirmPassword.length > 0
                      ? (passwordsMatch ? '#22c55e60' : '#ef444460') : 'var(--blue-border)'}
                  />
                  <InputGroup.Text
                    onClick={() => setShowConfirmPassword(p => !p)}
                    style={{
                      background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      color: 'var(--text-secondary)', cursor: 'pointer', borderLeft: 'none',
                    }}
                  >
                    {showConfirmPassword ? <FaEye /> : <FaEyeSlash />}
                  </InputGroup.Text>
                </InputGroup>
                {form.confirmPassword.length > 0 && (
                  <div style={{
                    fontSize: '0.72rem', marginTop: '5px',
                    color: passwordsMatch ? '#22c55e' : '#f87171',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    {passwordsMatch ? <><FaCheckCircle size={10} /> Passwords match</> : 'Passwords do not match'}
                  </div>
                )}
              </div>

              {/* Role — staff/admin mode only */}
              <SectionLabel>🛡️ Role &amp; Access</SectionLabel>
              <div style={{ marginBottom: '24px' }}>
                <Form.Label style={labelStyle}><FaUserShield size={11} /> Role</Form.Label>
                <Form.Select
                  name="role_id" value={form.role_id}
                  onChange={handleChange} required
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                >
                  <option value="">Select a role...</option>
                  {roles.filter(r => r.role_id !== 7).map(r => (
                    <option key={r.role_id} value={r.role_id}>{r.role_desc}</option>
                  ))}
                </Form.Select>
              </div>

              {(error || localError) && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px', color: '#fca5a5', fontSize: '0.85rem' }}>
                  ⚠️ {error || localError}
                </div>
              )}

              <Button type="submit" className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '1rem' }}
                disabled={loading}>
                {loading
                  ? <><Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" /> Loading ...</>
                  : '✅ Register'}
              </Button>

              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Already have an account? <Link to="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
              </p>

            </Form>
          )}
        </div>
      </div>
    </div>
  );
}