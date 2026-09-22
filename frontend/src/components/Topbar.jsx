import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { useDataSource } from '../hooks/useDataSource';
import { useModelSelection } from '../hooks/useModelSelection';
import { isAdmin } from '../lib/roles';
import { LuMenu } from 'react-icons/lu';

export default function Topbar({ title, onMenuClick, menuOpen, alertLevel }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, languages } = useLanguage();
  const { isMock, toggleDataSource } = useDataSource();
  const { modelKey, setModelKey, options: modelOptions } = useModelSelection();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const levelColors = { NORMAL: '#22c55e', ADVISORY: '#eab308', WARNING: '#f97316', CRITICAL: '#ef4444' };
  const levelColor = levelColors[alertLevel] || '#22c55e';

  const handleToggleDataSource = async () => {
    const switchingTo = isMock ? 'live' : 'mock';
    const result = await Swal.fire({
      title: switchingTo === 'mock' ? 'Switch to Mock Data?' : 'Switch to Live Data?',
      html: switchingTo === 'mock'
        ? '<p style="color:#8da4be">The dashboard will use the <strong style="color:#eab308">mock API server</strong> for predictions and forecasts.</p>'
        : '<p style="color:#8da4be">The dashboard will reconnect to the <strong style="color:#22c55e">live model server</strong> for real predictions and forecasts.</p>',
      icon: 'question',
      background: '#0d1f3c', color: '#e2eaf5',
      showCancelButton: true,
      confirmButtonText: 'Switch',
      confirmButtonColor: switchingTo === 'mock' ? '#eab308' : '#0ea5e9',
      cancelButtonColor: '#334155',
    });

    if (result.isConfirmed) {
      toggleDataSource();
      Swal.fire({
        title: switchingTo === 'mock' ? 'Mock Data Active' : 'Live Data Active',
        text: switchingTo === 'mock'
          ? 'AGOS is now displaying simulated data from the mock server.'
          : 'AGOS is now displaying real-time data from the live model server.',
        icon: 'success',
        background: '#0d1f3c', color: '#e2eaf5',
        confirmButtonColor: '#0ea5e9',
        timer: 4000, timerProgressBar: true,
      });
    }
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          onClick={onMenuClick}
          className="mobile-menu-btn"
          aria-label="Open navigation menu"
          aria-expanded={!!menuOpen}
          aria-controls="app-sidebar"
        >
          <LuMenu size={22} aria-hidden="true" />
        </button>
        <div className="topbar-titles">
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {title}
          </h1>
          <div className="topbar-sub">Barangay Triangulo, Naga City · Bicol Region</div>
        </div>
      </div>

      <div className="topbar-controls">

        {/* Algorithm switcher — GRU / LSTM / CNN. All three are trained on
            the same scaler/feature contract, so switching here just tells
            the backend which encoder-decoder to run; every page reading
            from useModelPrediction/useFloodForecast14Day updates to match. */}
        <div
          className="hide-mobile"
          title="Switch which trained algorithm powers predictions and forecasts"
          style={{
            display: 'flex', gap: 0, background: 'var(--blue-mid)',
            border: '1px solid var(--blue-border)', borderRadius: 6, overflow: 'hidden',
          }}
        >
          {modelOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setModelKey(opt.key)}
              title={opt.fullLabel}
              style={{
                padding: '7px 12px', fontSize: '0.72rem', fontWeight: 700,
                letterSpacing: '0.04em', cursor: 'pointer', border: 'none',
                background: modelKey === opt.key ? opt.color : 'transparent',
                color: modelKey === opt.key ? '#0d1f3c' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Dev-only, admin-only: Live / Mock data source toggle.
            import.meta.env.DEV is Vite's build-time flag — true in `npm run dev`
            and dev-mode builds, false in production builds, so this button
            (and the ability to flip to mock data) never ships to prod. */}
        {import.meta.env.DEV && isAdmin(user) && (
          <button
            className="btn"
            onClick={handleToggleDataSource}
            title={isMock
              ? 'Currently using MOCK data — click to switch to live data'
              : 'Currently using LIVE data — click to switch to mock data'}
            style={{
              background: isMock ? '#eab308' : '#22c55e',
              color: '#0d1f3c',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '8px 14px',
              border: 'none',
            }}
          >
            <span>{isMock ? 'MOCK' : 'LIVE'}<span className="hide-mobile"> DATA</span></span>
            <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>⇄</span>
          </button>
        )}

        {/* Language — alert wording and evacuation guidance are translated;
            covers Naga City's everyday languages so the highest-stakes
            text during an emergency isn't English-only. */}
        <select
          value={lang}
          onChange={e => setLang(e.target.value)}
          aria-label="Choose language"
          title="Choose language"
          style={{
            background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
            color: 'var(--text-secondary)', borderRadius: 6,
            fontSize: '0.76rem', fontWeight: 600, padding: '7px 8px', cursor: 'pointer',
          }}
        >
          {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>

        {/* Dark / Light toggle */}
        <button
          className="theme-toggle hide-mobile"
          role="switch"
          aria-checked={theme === 'dark'}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="theme-toggle-knob" aria-hidden="true" />
        </button>

        {/* Clock */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }} className="hide-mobile hide-tablet">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
            {time.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {time.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Sign-in — the app is fully browsable without an account (this
            is a public early-warning tool); logging in only unlocks
            staff/admin actions (dispatching alerts, moderating reports,
            registering accounts). Shown in place of nothing when signed
            out; once signed in, the account panel lives in the Sidebar
            instead of duplicating it up here. */}
        {!user && (
          <button
            className="btn hide-mobile"
            onClick={() => navigate('/login')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff',
              fontSize: '0.78rem', fontWeight: 700,
              padding: '8px 16px', border: 'none', borderRadius: 6,
              whiteSpace: 'nowrap',
            }}
          >
            Staff sign in
          </button>
        )}
      </div>

    </div>
  );
}
