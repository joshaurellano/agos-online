import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Form, Button, Spinner, InputGroup } from 'react-bootstrap';

import { FaEyeSlash } from "react-icons/fa";
import { FaEye } from "react-icons/fa";

import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';

export default function RegisterPage() {
  const { register, error, clearError, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isResidentMode = location.pathname === '/add-resident';
  const isAdmin = user.roles?.role_desc === 'Admin';

  const [localError, setLocalError] = useState('');
  const [roles, setRoles] = useState([]);
  const [residentRoleId, setResidentRoleId] = useState('');
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
    supabase.from('roles').select('*').then(({ data }) => {
      if (data) {
        setRoles(data);
        const resident = data.find(r => r.role_id === 7);
        if (resident) {
          console.log(true)
          if (isResidentMode) {
            setForm(f => ({ ...f, role_id: 7 }));
          }
        }
      }
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

  const handleSubmit = async (e) => {
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

    const ok = await register(payload);

    setLoading(false);

    if (ok) {
      setForm({
        name: '',
        username: '',
        password: '',
        confirmPassword: '',
        phone: '',
        role_id: isResidentMode ? 7 : '',
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
    display: 'block', fontSize: '0.8rem', fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: '6px',
    letterSpacing: '0.05em',
  };

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

      <div className="fade-in" style={{ width: '100%', maxWidth: '420px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '24px', color: 'var(--text-primary)' }}>
          {isResidentMode ? 'Add Resident' : 'Create Account'}
        </h1>

        <div className="card" style={{ padding: '32px' }}>

          {success ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✅</div>
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
          ) : (
            <Form onSubmit={handleSubmit}>

              {isResidentMode && (
                <div style={{
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.2)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  marginBottom: '20px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}>
                  🏘️ Registering as <strong style={{ color: 'var(--accent)' }}>Resident</strong>
                </div>
              )}

              {/* Full Name */}
              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}>Full Name</Form.Label>
                <Form.Control
                  name="name" type="text" value={form.name}
                  onChange={handleChange} placeholder="e.g. Maria Santos"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              {/* Phone */}
              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}>Phone Number</Form.Label>
                <Form.Control
                  name="phone" type="tel" value={form.phone}
                  onChange={handleChange} placeholder="e.g. 09123456789"
                  required pattern="^09\d{9}$" maxLength={11}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              {/* Username */}
              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}>Username</Form.Label>
                <Form.Control
                  name="username" type="text" value={form.username}
                  onChange={handleChange} placeholder="e.g. maria_santos"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}>Password</Form.Label>
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
                <Form.Text style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'block', marginTop: '6px' }}>
                  Your password must be at least 8 characters long and contain letters and numbers
                </Form.Text>
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '16px' }}>
                <Form.Label style={labelStyle}>Confirm Password</Form.Label>
                <InputGroup>
                  <Form.Control
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={handleChange} placeholder="••••••••"
                    required
                    style={{ ...inputStyle, borderRight: 'none', borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
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
              </div>

              {/* Role — admin-only route only */}
              {!isResidentMode && (
                <div style={{ marginBottom: '24px' }}>
                  <Form.Label style={labelStyle}>Role</Form.Label>
                  <Form.Select
                    name="role_id" value={form.role_id}
                    onChange={handleChange} required
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                  >
                    <option value="">Select a role...</option>
                    {roles.map(r => (
                      <option key={r.role_id} value={r.role_id}>{r.role_desc}</option>
                    ))}
                  </Form.Select>
                </div>
              )}

              {(error || localError) && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px', color: '#fca5a5', fontSize: '0.85rem' }}>
                  ⚠️ {error || localError}
                </div>
              )}

              <Button type="submit" className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '1rem', marginTop: isResidentMode ? '8px' : 0 }}
                disabled={loading}>
                {loading
                  ? <><Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" /> Loading ...</>
                  : isResidentMode ? '🏘️ Register Resident' : '✅ Register'}
              </Button>

            </Form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          AGOS v1.0 — Capstone Prototype · Data from PAGASA / DOST-ASTI
        </p>
      </div>
    </div>
  );
}
