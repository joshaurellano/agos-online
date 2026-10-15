import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { supabase } from '../lib/supabaseClient';
import { invokeFunction } from '../lib/functions';
import { checkPassword, generatePassword } from '../lib/credentials';
import { RESIDENT_ROLE_ID } from '../lib/roles';
import { useAuth } from '../hooks/useAuth';
import { ErrorBanner } from '../components/ui';
import { logger } from '../lib/logger';

// Staff logins (admins only). Reading uses the normal database rules; every
// change goes through the manage-user function, which re-checks that the
// caller is an active admin and keeps at least one admin active.

const swalTheme = { background: '#0d1f3c', color: '#e2eaf5' };

// ── Reset password dialog (native <dialog>: focus trap, Esc to close) ──────

function ResetDialog({ person, onClose }) {
  const ref = useRef(null);
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => { if (el?.open) el.close(); };
  }, []);

  const valid = checkPassword(password).ok;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    const result = await invokeFunction('manage-user', { action: 'reset_password', user_id: person.id, password });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setSaved(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the password and copy it.');
    }
  };

  return (
    <dialog ref={ref} className="registry-dialog" aria-labelledby="reset-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={submit} noValidate>
        <h2 id="reset-title" className="registry-dialog-title">Reset password</h2>
        <p className="settings-desc" style={{ marginBottom: 12 }}>{person.name} ({person.username})</p>

        <label htmlFor="reset-password" className="registry-field-label">
          {saved ? 'New password' : 'Temporary password'}
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input id="reset-password" className="settings-input registry-field" style={{ marginBottom: 0 }}
            value={password} readOnly={saved} spellCheck={false} autoComplete="off"
            onChange={(e) => setPassword(e.target.value)} aria-invalid={!valid} />
          <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        {saved ? (
          <div role="status" className="registry-hint">Password updated. Give it to {person.name} now; it is not shown again.</div>
        ) : (
          <div className="registry-hint">
            8+ characters, letters and numbers.{' '}
            <button type="button" className="btn-link" onClick={() => setPassword(generatePassword())}>Generate new</button>
          </div>
        )}

        <div role="alert" className="registry-error">{error}</div>

        <div className="registry-dialog-actions">
          {saved ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
                {busy ? 'Saving…' : 'Reset password'}
              </button>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetting, setResetting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [canDisable, setCanDisable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const columns = 'id, name, username, phone, role_id, created_at, roles(role_desc)';
    let { data, error: loadError } = await supabase
      .from('profiles').select(`${columns}, is_active`).neq('role_id', RESIDENT_ROLE_ID).order('name');
    if (loadError?.code === '42703') {
      // is_active not created yet: the latest migration has not been applied
      setCanDisable(false);
      ({ data, error: loadError } = await supabase
        .from('profiles').select(columns).neq('role_id', RESIDENT_ROLE_ID).order('name'));
    }
    const { data: roleRows } = await supabase.from('roles').select('role_id, role_desc').order('role_id');

    if (loadError) {
      logger.error('Staff load failed:', loadError.message);
      setError('Could not load staff accounts.');
    } else {
      setError('');
      setPeople(data ?? []);
    }
    setRoles((roleRows ?? []).filter((r) => r.role_id !== RESIDENT_ROLE_ID));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (person, body, successText) => {
    setBusyId(person.id);
    setNotice('');
    const result = await invokeFunction('manage-user', { user_id: person.id, ...body });
    setBusyId(null);
    if (!result.ok) {
      Swal.fire({ ...swalTheme, icon: 'error', title: 'Could not update', text: result.message, confirmButtonColor: '#0ea5e9' });
      await load(); // put any optimistic select back to the stored value
      return false;
    }
    setNotice(successText);
    await load();
    return true;
  };

  const changeRole = (person, roleId) =>
    act(person, { action: 'set_role', role_id: Number(roleId) }, `${person.name}'s role updated.`);

  const toggleActive = async (person) => {
    const disabling = person.is_active !== false;
    if (disabling) {
      const confirm = await Swal.fire({
        ...swalTheme, icon: 'warning', title: `Disable ${person.name}?`,
        text: 'They will not be able to sign in or send alerts.',
        showCancelButton: true, confirmButtonText: 'Disable',
        confirmButtonColor: '#ef4444', cancelButtonColor: '#334155',
      });
      if (!confirm.isConfirmed) return;
    }
    await act(person, { action: 'set_active', active: !disabling },
      disabling ? `${person.name} disabled.` : `${person.name} enabled.`);
  };

  return (
    <div className="fade-in">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!canDisable && <ErrorBanner>Disabling accounts needs the latest database update.</ErrorBanner>}

      <div className="registry-toolbar">
        <span className="registry-count">{people.length} {people.length === 1 ? 'account' : 'accounts'}</span>
        <Link to="/register" className="btn btn-primary registry-add">Add staff</Link>
      </div>

      <div role="status" aria-live="polite" className="visually-hidden">{notice}</div>
      {notice && <div className="registry-notice">{notice}</div>}

      {loading && people.length === 0 ? (
        <div className="registry-empty">Loading…</div>
      ) : people.length === 0 ? (
        <div className="registry-empty">No staff accounts.</div>
      ) : (
        <div className="registry-table-wrap card">
          <table className="registry-table">
            <caption className="visually-hidden">Staff accounts</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Username</th>
                <th scope="col">Role</th>
                <th scope="col">Mobile</th>
                {canDisable && <th scope="col">Status</th>}
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const self = p.id === user?.id;
                const active = p.is_active !== false;
                const busy = busyId === p.id;
                return (
                  <tr key={p.id} style={active ? undefined : { opacity: 0.7 }}>
                    <td className="registry-name">
                      {p.name}{self && <span className="registry-sub" style={{ display: 'inline', marginLeft: 8 }}>You</span>}
                    </td>
                    <td>{p.username}</td>
                    <td>
                      {self ? p.roles?.role_desc : (
                        <>
                          <label htmlFor={`role-${p.id}`} className="visually-hidden">Role for {p.name}</label>
                          <select id={`role-${p.id}`} className="settings-input" style={{ minWidth: 0 }}
                            value={p.role_id} disabled={busy}
                            onChange={(e) => changeRole(p, e.target.value)}>
                            {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_desc}</option>)}
                          </select>
                        </>
                      )}
                    </td>
                    <td className="numeric">{p.phone}</td>
                    {canDisable && (
                      <td><span className={`status-pill ${active ? 'status-on' : 'status-off'}`}>{active ? 'Active' : 'Disabled'}</span></td>
                    )}
                    <td className="registry-actions">
                      <button type="button" className="btn btn-ghost registry-btn" disabled={busy}
                        onClick={() => setResetting(p)} aria-label={`Reset password for ${p.name}`}>
                        Reset password
                      </button>
                      {canDisable && !self && (
                        <button type="button" disabled={busy}
                          className={`btn btn-ghost registry-btn${active ? ' registry-btn-danger' : ''}`}
                          onClick={() => toggleActive(p)} aria-label={`${active ? 'Disable' : 'Enable'} ${p.name}`}>
                          {active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resetting && <ResetDialog person={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
