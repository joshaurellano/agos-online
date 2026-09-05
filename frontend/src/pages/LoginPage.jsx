import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { FaEyeSlash, FaEye, FaUser, FaLock } from "react-icons/fa";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap');

  .agos-root {
    min-height: 100vh;
    background: #050d1a;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    position: relative;
    overflow: hidden;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  /* Animated water grid lines */
  .agos-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(0, 180, 255, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 180, 255, 0.04) 1px, transparent 1px);
    background-size: 48px 48px;
    animation: gridDrift 20s linear infinite;
  }

  @keyframes gridDrift {
    0% { transform: translateY(0); }
    100% { transform: translateY(48px); }
  }

  /* Glowing orbs */
  .agos-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
  }
  .agos-orb-1 {
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(0,160,255,0.12) 0%, transparent 70%);
    top: -150px; left: -100px;
    animation: orbFloat 8s ease-in-out infinite;
  }
  .agos-orb-2 {
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(0,80,200,0.1) 0%, transparent 70%);
    bottom: -100px; right: -80px;
    animation: orbFloat 10s ease-in-out infinite reverse;
  }
  .agos-orb-3 {
    width: 200px; height: 200px;
    background: radial-gradient(circle, rgba(0,220,255,0.08) 0%, transparent 70%);
    top: 40%; left: 50%;
    animation: orbFloat 6s ease-in-out infinite;
  }

  @keyframes orbFloat {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-20px); }
  }

  /* Main content wrapper */
  .agos-wrapper {
    width: 100%;
    max-width: 440px;
    position: relative;
    z-index: 1;
    animation: fadeUp 0.6s ease both;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Header section */
  .agos-header {
    text-align: center;
    margin-bottom: 36px;
  }

  .agos-logo-ring {
    width: 80px; height: 80px;
    margin: 0 auto 20px;
    position: relative;
  }

  .agos-logo-ring svg {
    width: 100%; height: 100%;
    animation: spinSlow 12s linear infinite;
  }

  @keyframes spinSlow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .agos-logo-inner {
    position: absolute;
    inset: 10px;
    background: linear-gradient(135deg, #0284c7, #0ea5e9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    box-shadow: 0 0 24px rgba(14,165,233,0.4), inset 0 1px 0 rgba(255,255,255,0.15);
  }

  .agos-title {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 3rem;
    font-weight: 800;
    color: #fff;
    letter-spacing: 0.1em;
    line-height: 1;
    margin-bottom: 6px;
    background: linear-gradient(135deg, #e0f2fe 0%, #38bdf8 50%, #0ea5e9 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .agos-subtitle {
    font-size: 0.85rem;
    font-weight: 300;
    color: rgba(148,195,240,0.7);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .agos-location {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: rgba(148,195,240,0.45);
    margin-top: 6px;
  }

  .agos-location::before {
    content: '';
    display: inline-block;
    width: 5px; height: 5px;
    background: #0ea5e9;
    border-radius: 50%;
    box-shadow: 0 0 6px #0ea5e9;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.7); }
  }

  /* Card */
  .agos-card {
    background: rgba(8, 22, 42, 0.8);
    border: 1px solid rgba(0, 160, 255, 0.15);
    border-radius: 20px;
    padding: 36px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.03) inset,
      0 32px 64px rgba(0,0,0,0.4);
    position: relative;
    overflow: hidden;
  }

  .agos-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(14,165,233,0.5), transparent);
  }

  .agos-card-title {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: rgba(186, 225, 255, 0.9);
    margin-bottom: 28px;
    letter-spacing: 0.03em;
  }

  /* Field label */
  .agos-label {
    display: block;
    font-size: 0.7rem;
    font-weight: 500;
    color: rgba(100, 170, 220, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
  }

  .agos-field {
    margin-bottom: 20px;
  }

  /* Input with icon */
  .agos-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .agos-input-icon {
    position: absolute;
    left: 14px;
    color: rgba(100, 160, 220, 0.4);
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .agos-input {
    width: 100%;
    padding: 13px 16px 13px 40px;
    background: rgba(0, 30, 60, 0.6);
    border: 1px solid rgba(0, 120, 200, 0.2);
    border-radius: 10px;
    color: #e0f2fe;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.95rem;
    outline: none;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  .agos-input::placeholder {
    color: rgba(100, 160, 220, 0.3);
  }

  .agos-input:focus {
    border-color: rgba(14, 165, 233, 0.5);
    background: rgba(0, 40, 80, 0.7);
    box-shadow: 0 0 0 3px rgba(14,165,233,0.08), 0 0 20px rgba(14,165,233,0.05);
  }

  .agos-input-pw {
    padding-right: 48px;
    border-radius: 10px;
  }

  .agos-eye-btn {
    position: absolute;
    right: 14px;
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(100, 160, 220, 0.5);
    padding: 0;
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }

  .agos-eye-btn:hover {
    color: rgba(14, 165, 233, 0.9);
  }

  /* Error */
  .agos-error {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 20px;
    color: #fca5a5;
    font-size: 0.83rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Submit button */
  .agos-btn {
    width: 100%;
    padding: 14px;
    background: linear-gradient(135deg, #0284c7, #0ea5e9);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 4px 24px rgba(14,165,233,0.25);
    position: relative;
    overflow: hidden;
  }

  .agos-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
    border-radius: inherit;
  }

  .agos-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 32px rgba(14,165,233,0.35);
  }

  .agos-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .agos-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Footer */
  .agos-footer {
    text-align: center;
    margin-top: 24px;
    font-size: 0.72rem;
    color: rgba(100, 150, 200, 0.35);
    letter-spacing: 0.03em;
  }

  .agos-divider {
    display: inline-block;
    margin: 0 8px;
    opacity: 0.5;
  }
`;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, error, clearError, user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await login(username, password);
    setLoading(false);
  };

  useEffect(() => { clearError(); }, []);

  useEffect(() => {
    if (!authLoading && user) navigate('/dashboard');
  }, [user, authLoading]);

  return (
    <>
      <style>{styles}</style>
      <div className="agos-root">
        <div className="agos-grid" />
        <div className="agos-orb agos-orb-1" />
        <div className="agos-orb agos-orb-2" />
        <div className="agos-orb agos-orb-3" />

        <div className="agos-wrapper">
          {/* Header */}
          <div className="agos-header">
            <div className="agos-logo-ring">
              <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="40" r="38" stroke="url(#ringGrad)" strokeWidth="1.5" strokeDasharray="6 4" />
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8"/>
                    <stop offset="50%" stopColor="#0284c7" stopOpacity="0.2"/>
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8"/>
                  </linearGradient>
                </defs>
              </svg>
              <div className="agos-logo-inner">🌊</div>
            </div>

            <h1 className="agos-title">AGOS</h1>
            <p className="agos-subtitle">Flood Early Warning System</p>
            <span className="agos-location">Barangay Triangulo, Naga City</span>
          </div>

          {/* Card */}
          <div className="agos-card">
            <p className="agos-card-title">Sign In to Dashboard</p>

            <form onSubmit={handleSubmit}>
              <div className="agos-field">
                <div className="agos-input-wrap">
                  <span className="agos-input-icon"><FaUser size={13} /></span>
                  <input
                    className="agos-input"
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="agos-field">
                <div className="agos-input-wrap">
                  <span className="agos-input-icon"><FaLock size={13} /></span>
                  <input
                    className="agos-input agos-input-pw"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="agos-eye-btn"
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FaEye size={15} /> : <FaEyeSlash size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="agos-error">
                  <span>⚠️</span> {error}
                </div>
              )}

              <button type="submit" className="agos-btn" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner as="span" animation="grow" size="sm" role="status" aria-hidden="true" />
                    Authenticating...
                  </>
                ) : (
                  <>🔐 Sign In</>
                )}
              </button>
            </form>
          </div>

          <p className="agos-footer">
            AGOS v1.0 <span className="agos-divider">·</span> Capstone Prototype
            <span className="agos-divider">·</span> Data from PAGASA / DOST-ASTI
          </p>
        </div>
      </div>
    </>
  );
}