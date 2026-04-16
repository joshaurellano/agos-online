import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Spinner, Form, InputGroup } from 'react-bootstrap';

import { useAuth } from '../hooks/useAuth';

import { FaEyeSlash } from "react-icons/fa";
import { FaEye } from "react-icons/fa";

export default function LoginPage() {

  const navigate = useNavigate();

  const { login, error, clearError, user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      await login(username, password);
      setLoading(false);
      
    };

  useEffect(() => {
      clearError();
    }, []);

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard');
    }
  }, [user, authLoading]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--blue-deep)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background wave effect */}
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
            margin: '0 auto 16px',
            boxShadow: '0 0 40px rgba(14,165,233,0.3)',
            fontSize: '2rem',
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

        {/* Login card */}
        <div className="card" style={{ padding: '32px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '24px', color: 'var(--text-primary)' }}>
            Sign In to Dashboard
          </h2>

          <Form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <Form.Label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Username
              </Form.Label>
              
              <Form.Control
                placeholder="e.g. bgy_secretary"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                
                required
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)', fontSize: '0.95rem',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
              />  
               
            </div>

            <div style={{ marginBottom: '24px' }}>
              <Form.Label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Password
              </Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPassword ? "text":"password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    padding: '12px 14px',
                    background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
                    borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)', 
                    fontFamily: 'var(--font-body)', fontSize: '0.95rem',
                    outline: 'none', transition: 'border-color 0.2s',
                    borderRight:'none',
                    color: 'var(--text-primary)'
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--blue-border)'}
                />
              <InputGroup.Text style={{
                background: 'var(--blue-mid)',
                border: '1px solid var(--blue-border)',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                borderLeft:'none'
              }}> 
                {
                  showPassword ? <FaEye onClick={() => setShowPassword(prev => !prev)} /> :  <FaEyeSlash onClick={() => setShowPassword(prev => !prev)}/> } 
              </InputGroup.Text>
              </InputGroup>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px', color: '#fca5a5', fontSize: '0.85rem' }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '1rem' }}
              disabled={loading}
            >
              {loading ? <>
                <Spinner as="span"
                  animation="grow"
                  size="sm"
                  role="status"
                  aria-hidden="true" /> Loading...
              </> : '🔐 Sign In'}
            </button>
          </Form>

          
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          AGOS v1.0 — Capstone Prototype · Data from PAGASA / DOST-ASTI
        </p>
      </div>
    </div>
  );
}
