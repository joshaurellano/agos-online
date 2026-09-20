import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { supabase } from '../lib/supabaseClient';
import { detectPhoneNetwork, normalizePhPhone, NETWORK_INFO } from '../lib/phoneNetwork';
import { ErrorBanner } from '../components/ui';
import { logger } from '../lib/logger';

// Residents who receive SMS alerts. Access is enforced by RLS in the
// database (see the resident_registry migration), not by this page, and
// every add / edit / removal is written to audit_log.

const PAGE_SIZE = 1000;     // PostgREST's default row cap per request
const ROWS_PER_VIEW = 50;

async function fetchAllResidents() {
  let all = [];
  for (let from = 0; from < 50000; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('residents')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data ?? []);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const swalTheme = { background: '#0d1f3c', color: '#e2eaf5' };

// ── Edit dialog (native <dialog>: focus trap, Esc to close, aria-modal) ────

function EditDialog({ resident, onClose, onSaved }) {
  const ref = useRef(null);
  const [name, setName] = useState(resident.name ?? '');
  const [phone, setPhone] = useState(resident.phone ?? '');
  const [consent, setConsent] = useState(false);
  const [presentConfirmed, setPresentConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => { if (el?.open) el.close(); };
  }, []);

  const normalized = normalizePhPhone(phone);
  const phoneChanged = normalized !== null && normalized !== resident.phone;
  const network = normalized ? detectPhoneNetwork(normalized) : null;
  const canSave =
    !saving && name.trim() !== '' && normalized !== null && (!phoneChanged || presentConfirmed);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    const { data, error: updateError } = await supabase
      .from('residents')
      .update({
        name: name.trim(),
        phone: normalized,
        network: network.network,
        sms_deliverable: network.deliverable,
        consent_given: resident.consent_given || consent,
      })
      .eq('id', resident.id)
      .select()
      .single();
    setSaving(false);

    if (updateError) {
      logger.error('Resident update failed:', updateError.message);
      setError(
        updateError.code === '23505'
          ? 'That number is already registered.'
          : updateError.message
      );
      return;
    }
    onSaved(data);
  };

  return (
    <dialog
      ref={ref}
      className="registry-dialog"
      aria-labelledby="edit-resident-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <form onSubmit={submit} noValidate>
        <h2 id="edit-resident-title" className="registry-dialog-title">Edit resident</h2>

        <label htmlFor="edit-resident-name" className="registry-field-label">Name</label>
        <input
          id="edit-resident-name" className="settings-input registry-field"
          value={name} onChange={(e) => setName(e.target.value)} autoComplete="off"
        />

        <label htmlFor="edit-resident-phone" className="registry-field-label">Mobile number</label>
        <input
          id="edit-resident-phone" className="settings-input registry-field" type="tel" inputMode="tel"
          value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off"
          aria-invalid={phone !== '' && normalized === null}
          aria-describedby="edit-resident-phone-hint"
        />
        <div id="edit-resident-phone-hint" className="registry-hint">
          {phone !== '' && normalized === null
            ? 'Enter a valid number, e.g. 09171234567'
            : network
              ? `${NETWORK_INFO[network.network].label}${network.deliverable ? '' : ' · SMS may not reach'}`
              : '09XXXXXXXXX'}
        </div>

        {phoneChanged && (
          <label className="registry-check">
            <input type="checkbox" checked={presentConfirmed} onChange={(e) => setPresentConfirmed(e.target.checked)} />
            <span>Resident confirmed the new number in person</span>
          </label>
        )}

        {resident.consent_given ? (
          <div className="registry-hint">Consent recorded {fmtDate(resident.consent_at)}</div>
        ) : (
          <label className="registry-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Consent form signed</span>
          </label>
        )}

        <div role="alert" className="registry-error">{error}</div>

        <div className="registry-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ResidentRegistryPage() {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(ROWS_PER_VIEW);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResidents(await fetchAllResidents());
      setError('');
    } catch (err) {
      logger.error('Could not load residents:', err.message);
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return residents;
    const digits = q.replace(/[\s\-()+]/g, '');
    return residents.filter(
      (r) => (r.name ?? '').toLowerCase().includes(q) || (digits && (r.phone ?? '').includes(digits))
    );
  }, [residents, query]);

  const replaceRow = (row) => setResidents((prev) => prev.map((r) => (r.id === row.id ? row : r)));

  const removeResident = async (r) => {
    const result = await Swal.fire({
      ...swalTheme,
      title: `Remove ${r.name}?`,
      text: 'They will stop receiving SMS alerts.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#334155',
    });
    if (!result.isConfirmed) return;

    // RLS filters silently, so ask for the deleted rows back to be sure
    // something was actually removed.
    const { data, error: deleteError } = await supabase
      .from('residents').delete().eq('id', r.id).select();
    if (deleteError || !data?.length) {
      Swal.fire({
        ...swalTheme, icon: 'error', title: 'Could not remove',
        text: deleteError?.message ?? 'You may not have permission to remove residents.',
        confirmButtonColor: '#0ea5e9',
      });
      return;
    }
    setResidents((prev) => prev.filter((x) => x.id !== r.id));
    setNotice(`${r.name} removed.`);
  };

  return (
    <div className="fade-in">
      {error && <ErrorBanner>Could not load residents: {error}</ErrorBanner>}

      <div className="registry-toolbar">
        <div className="registry-search">
          <label htmlFor="registry-search" className="visually-hidden">Search residents</label>
          <input
            id="registry-search" type="search" className="settings-input" placeholder="Search"
            value={query} onChange={(e) => { setQuery(e.target.value); setVisible(ROWS_PER_VIEW); }}
          />
          <span className="registry-count">
            {query.trim() ? `${filtered.length} of ${residents.length}` : residents.length}{' '}
            {residents.length === 1 && !query.trim() ? 'resident' : 'residents'}
          </span>
        </div>
        <Link to="/add-resident" className="btn btn-primary registry-add">Add resident</Link>
      </div>

      <div role="status" aria-live="polite" className="visually-hidden">{notice}</div>
      {notice && <div className="registry-notice">{notice}</div>}

      {loading && residents.length === 0 ? (
        <div className="registry-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="registry-empty">{residents.length === 0 ? 'No residents yet.' : 'No matches.'}</div>
      ) : (
        <>
          <div className="registry-table-wrap card">
            <table className="registry-table">
              <caption className="visually-hidden">Residents</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Mobile number</th>
                  <th scope="col">Network</th>
                  <th scope="col">Consent</th>
                  <th scope="col">Added</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, visible).map((r) => {
                  const info = NETWORK_INFO[r.network] ?? NETWORK_INFO.unknown;
                  return (
                    <tr key={r.id}>
                      <td className="registry-name">{r.name}</td>
                      <td className="numeric">{r.phone}</td>
                      <td>
                        <span style={{ color: info.color, fontWeight: 600 }}>{info.label}</span>
                        {!r.sms_deliverable && <div className="registry-sub">SMS may not reach</div>}
                      </td>
                      <td>{r.consent_given ? fmtDate(r.consent_at) : <span className="registry-warn">Not recorded</span>}</td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td className="registry-actions">
                        <button type="button" className="btn btn-ghost registry-btn" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>Edit</button>
                        <button type="button" className="btn btn-ghost registry-btn registry-btn-danger" onClick={() => removeResident(r)} aria-label={`Remove ${r.name}`}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible < filtered.length && (
            <div className="registry-more">
              <button type="button" className="btn btn-ghost registry-btn" onClick={() => setVisible((v) => v + ROWS_PER_VIEW)}>
                Show more
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditDialog
          resident={editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => { replaceRow(row); setEditing(null); setNotice(`${row.name} updated.`); }}
        />
      )}
    </div>
  );
}
