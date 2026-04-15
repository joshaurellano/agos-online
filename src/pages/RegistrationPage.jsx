import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';

export default function RegisterPage() {
  const { register, error } = useAuth();
  const navigate = useNavigate();

  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ name: '', username: '', password: '', role_id: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch roles for dropdown
  useEffect(() => {
    supabase.from('roles').select('*').then(({ data }) => {
      if (data) setRoles(data);
    });
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await register(form);
    setLoading(false);
    if (ok) setSuccess(true);
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px',
    background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)', fontSize: '0.95rem',
    outline: 'none', transition: 'border-color 0.2s',
  };

  const labelStyle = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: '6px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 0 40px rgba(14,165,233,0.3)', fontSize: '2rem',
          }}>🌊</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
            AGOS
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Flood Early Warning System
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>
            Barangay Triangulo, Naga City
          </p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '24px', color: 'var(--text-primary)' }}>
            Create Account
          </h2>

          {success ? (
            // Success state
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✅</div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem' }}>Account created!</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
                You can now{' '}
                <Link to="/login" style={{ color: 'var(--accent)' }}>sign in</Link>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Full Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Full Name</label>
                <input
                  name="name" type="text" value={form.name}
                  onChange={handleChange} placeholder="e.g. Maria Santos"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              {/* Username */}
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Username</label>
                <input
                  name="username" type="text" value={form.username}
                  onChange={handleChange} placeholder="e.g. bgy_secretary"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Password</label>
                <input
                  name="password" type="password" value={form.password}
                  onChange={handleChange} placeholder="••••••••"
                  required style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              </div>

              {/* Role */}
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Role</label>
                <select
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
                </select>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px', color: '#fca5a5', fontSize: '0.85rem' }}>
                  ⚠️ {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '1rem' }}
                disabled={loading}>
                {loading ? '⟳ Creating account...' : '✅ Register'}
              </button>

              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
              </p>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          AGOS v1.0 — Capstone Prototype · Data from PAGASA / DOST-ASTI
        </p>
      </div>
    </div>
  );
}