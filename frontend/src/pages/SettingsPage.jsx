import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { useModelSelection } from '../hooks/useModelSelection';
import { useDataSource } from '../hooks/useDataSource';
import { useAccessibility, TEXT_SCALES } from '../hooks/useAccessibility';
import { supabase } from '../lib/supabaseClient';
import { isAdmin } from '../lib/roles';

// ── Small building blocks ──────────────────────────────────────────────────

function Section({ id, title, intro, children }) {
  return (
    <section className="card settings-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="card-title" style={{ marginBottom: intro ? 4 : 12 }}>{title}</h2>
      {intro && <p className="settings-desc" style={{ margin: '14px 0 4px' }}>{intro}</p>}
      {children}
    </section>
  );
}

// On/off switch. Reuses the .theme-toggle look; it is a real <button
// role="switch"> so keyboard and screen readers get the correct semantics,
// and the visible label is wired to it with htmlFor.
function Toggle({ id, checked, onChange, label, description }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <label htmlFor={id} className="settings-label">{label}</label>
        {description && <div id={`${id}-desc`} className="settings-desc">{description}</div>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="theme-toggle"
        onClick={() => onChange(!checked)}
      >
        <span className="theme-toggle-knob" aria-hidden="true" />
      </button>
    </div>
  );
}

// Pick-one control built on native radio inputs inside a radiogroup, so
// arrow-key navigation and screen-reader grouping come for free.
function Segmented({ name, legend, description, value, options, onChange }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div id={`${name}-label`} className="settings-label">{legend}</div>
        {description && <div id={`${name}-desc`} className="settings-desc">{description}</div>}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        aria-describedby={description ? `${name}-desc` : undefined}
        className="settings-segmented"
      >
        {options.map((o) => (
          <label key={o.value} className={`settings-seg${value === o.value ? ' active' : ''}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="visually-hidden"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, languages } = useLanguage();

  return (
    <Section id="appearance" title="Appearance & language">
      <Segmented
        name="theme"
        legend="Theme"
        description="Dark suits a dim room; light is easier to read in bright daylight."
        value={theme}
        onChange={setTheme}
        options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
      />
      <div className="settings-row">
        <div className="settings-row-text">
          <label htmlFor="settings-language" className="settings-label">Language</label>
          <div className="settings-desc">
            Alert wording, evacuation guidance and main navigation are translated. Other pages are still English.
          </div>
        </div>
        <select
          id="settings-language"
          className="settings-input"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>
    </Section>
  );
}

function AccessibilitySection() {
  const { settings, updateSetting, resetSettings, isDefault } = useAccessibility();
  const set = (key) => (value) => updateSetting(key, value);

  return (
    <Section
      id="accessibility"
      title="Accessibility"
      intro="Changes apply immediately and are remembered on this device. Where your device already asks for reduced motion or higher contrast, those start switched on."
    >
      <Segmented
        name="text-size"
        legend="Text size"
        description="Scales text across the app."
        value={settings.textScale}
        onChange={(v) => updateSetting('textScale', v)}
        options={TEXT_SCALES.map((s) => ({ value: s.value, label: s.label }))}
      />
      <Toggle
        id="a11y-contrast"
        label="High contrast"
        description="Stronger text and border colors, thicker card outlines."
        checked={settings.highContrast}
        onChange={set('highContrast')}
      />
      <Toggle
        id="a11y-motion"
        label="Reduce motion"
        description="Turns off animations, transitions and the animated rain effect on the map."
        checked={settings.reduceMotion}
        onChange={set('reduceMotion')}
      />
      <Toggle
        id="a11y-font"
        label="Easy-to-read font"
        description="Uses Atkinson Hyperlegible, a typeface designed for low vision and dyslexia."
        checked={settings.readableFont}
        onChange={set('readableFont')}
      />
      <Toggle
        id="a11y-spacing"
        label="Extra text spacing"
        description="More space between lines, words and letters."
        checked={settings.textSpacing}
        onChange={set('textSpacing')}
      />
      <Toggle
        id="a11y-underline"
        label="Underline links"
        description="Links are always underlined, not just distinguished by color."
        checked={settings.underlineLinks}
        onChange={set('underlineLinks')}
      />
      <Toggle
        id="a11y-focus"
        label="Strong keyboard focus"
        description="A thick, bright outline around whatever is selected when you use Tab."
        checked={settings.strongFocus}
        onChange={set('strongFocus')}
      />
      <Toggle
        id="a11y-targets"
        label="Larger tap targets"
        description="Makes buttons, links and form fields at least 44 px tall. Helpful on touch screens."
        checked={settings.largeTargets}
        onChange={set('largeTargets')}
      />
      <Toggle
        id="a11y-announce"
        label="Announce alert changes to screen readers"
        description="Reads out the new alert level and what to do when it changes. Critical alerts interrupt immediately."
        checked={settings.announceAlerts}
        onChange={set('announceAlerts')}
      />
      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-ghost" onClick={resetSettings} disabled={isDefault}>
          Reset accessibility settings
        </button>
      </div>
    </Section>
  );
}

function ForecastSection() {
  const { user } = useAuth();
  const { modelKey, setModelKey, options } = useModelSelection();
  const { isMock } = useDataSource();

  return (
    <Section id="forecast" title="Forecast & data">
      <Segmented
        name="model"
        legend="Prediction model"
        description="Which trained algorithm powers the predictions and forecasts on every page."
        value={modelKey}
        onChange={setModelKey}
        options={options.map((o) => ({ value: o.key, label: o.label }))}
      />
      {isAdmin(user) && (
        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-label">Data source</div>
            <div className="settings-desc">
              Currently using <strong>{isMock ? 'mock' : 'live'}</strong> data. Switch it from the top bar.
              {isMock && ' While mock data is on, level changes are dispatched through the real alert pipeline.'}
            </div>
          </div>
          <span
            className="badge"
            style={{ background: isMock ? '#eab308' : '#22c55e', color: '#0d1f3c' }}
          >
            {isMock ? 'Mock data' : 'Live data'}
          </span>
        </div>
      )}
    </Section>
  );
}

function AccountSection() {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'error' | 'success', text }

  if (!user) {
    return (
      <Section id="account" title="Account">
        <p className="settings-desc">
          You are viewing AGOS as the public. <Link to="/login">Sign in</Link> to manage your account.
        </p>
      </Section>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setStatus(null);
    if (password.length < 8) {
      setStatus({ type: 'error', text: 'Use at least 8 characters.' });
      return;
    }
    if (password !== confirm) {
      setStatus({ type: 'error', text: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setStatus({ type: 'error', text: error.message || 'Could not change the password.' });
      return;
    }
    setPassword('');
    setConfirm('');
    setStatus({ type: 'success', text: 'Password updated.' });
  };

  return (
    <Section id="account" title="Account">
      <dl className="settings-account">
        <div><dt>Name</dt><dd>{user.name}</dd></div>
        <div><dt>Role</dt><dd>{user.roles?.role_desc ?? '—'}</dd></div>
      </dl>

      <form onSubmit={submit} style={{ marginTop: 16, maxWidth: 380 }} noValidate>
        <h3 className="settings-label" style={{ marginBottom: 10 }}>Change password</h3>

        <label htmlFor="settings-new-password" className="settings-desc" style={{ display: 'block', marginBottom: 4 }}>
          New password
        </label>
        <input
          id="settings-new-password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          className="settings-input"
          style={{ width: '100%', marginBottom: 10 }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="settings-pw-hint"
        />
        <div id="settings-pw-hint" className="settings-desc" style={{ marginTop: -4, marginBottom: 10 }}>
          At least 8 characters.
        </div>

        <label htmlFor="settings-confirm-password" className="settings-desc" style={{ display: 'block', marginBottom: 4 }}>
          Confirm new password
        </label>
        <input
          id="settings-confirm-password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          className="settings-input"
          style={{ width: '100%', marginBottom: 10 }}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <label className="settings-desc" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>

        <button type="submit" className="btn btn-primary" disabled={busy || !password || !confirm}>
          {busy ? 'Updating…' : 'Update password'}
        </button>

        <div
          role={status?.type === 'error' ? 'alert' : 'status'}
          style={{
            marginTop: 10, fontSize: '0.82rem', minHeight: '1.2em',
            color: status?.type === 'error' ? 'var(--red)' : 'var(--green)',
          }}
        >
          {status?.text}
        </div>
      </form>
    </Section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="fade-in settings-page">
      <p className="settings-desc" style={{ marginBottom: 16, maxWidth: 640 }}>
        Display, accessibility and account preferences. Display and accessibility choices are saved on this
        device only, so they won't follow you to another phone or computer.
      </p>
      <div className="settings-grid">
        <AppearanceSection />
        <AccessibilitySection />
        <ForecastSection />
        <AccountSection />
      </div>
    </div>
  );
}
