import { useCallback, useEffect, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { LuPlus, LuDownload, LuArrowLeft, LuTrash2, LuX } from 'react-icons/lu';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { ErrorBanner } from '../components/ui';
import { logger } from '../lib/logger';
import { friendlyError } from '../lib/errors';
import {
  SECTIONS, FORM_TITLE, emptyAssessment, rowToForm, formToRow, validate,
} from '../lib/needsAssessment';
import { downloadAssessmentPdf } from '../lib/assessmentPdf';
import './NeedsAssessmentPage.css';

// Post-flood Immediate Needs Assessment (DILG MC 2025-035, Annex D).
// Officials fill it in after an event, save it as a draft or final, and
// download it as a PDF. Access is enforced by RLS (see the
// needs_assessments migration); this page only hides what they cannot use.

const swalTheme = { background: '#0d1f3c', color: '#e2eaf5' };

const dateLabel = (key) => {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
};

function Field({ id, label, error, wide, children }) {
  return (
    <div className={wide ? 'na-wide' : undefined}>
      <label htmlFor={id} className="na-label">{label}</label>
      {children}
      {error && <div id={`${id}-err`} role="alert" className="na-error">{error}</div>}
    </div>
  );
}

export default function NeedsAssessmentPage() {
  const { user } = useAuth();
  const [view, setView] = useState('list');           // 'list' | 'form'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const topRef = useRef(null);

  const loadList = useCallback(async () => {
    const { data, error } = await supabase
      .from('needs_assessments')
      .select('*')
      .order('assessed_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      logger.error('needs_assessments fetch error:', error.message);
      setListError(friendlyError(error, 'Could not load assessments. Try again.'));
    } else {
      setListError('');
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const openForm = (nextForm, id) => {
    setForm(nextForm);
    setEditingId(id);
    setErrors({});
    setFormError('');
    setSavedNote('');
    setDirty(false);
    setView('form');
    window.scrollTo({ top: 0 });
  };

  const goBack = async () => {
    if (dirty) {
      const result = await Swal.fire({
        ...swalTheme, icon: 'warning', title: 'Discard changes?',
        text: 'Your changes have not been saved.',
        showCancelButton: true, confirmButtonText: 'Discard',
        confirmButtonColor: '#ef4444', cancelButtonColor: '#334155',
      });
      if (!result.isConfirmed) return;
    }
    setDirty(false);
    setView('list');
    loadList();
  };

  // ── Form edits ──────────────────────────────────────────────────────
  const touch = () => { setDirty(true); setSavedNote(''); };
  const setTop = (key) => (e) => { touch(); setForm((f) => ({ ...f, [key]: e.target.value })); };
  const setData = (key, value) => { touch(); setForm((f) => ({ ...f, data: { ...f.data, [key]: value } })); };
  const setMember = (i, value) => {
    touch();
    setForm((f) => ({ ...f, team_members: f.team_members.map((m, j) => (j === i ? value : m)) }));
  };
  const addMember = () => { touch(); setForm((f) => ({ ...f, team_members: [...f.team_members, ''] })); };
  const removeMember = (i) => {
    touch();
    setForm((f) => ({
      ...f,
      team_members: f.team_members.length > 1 ? f.team_members.filter((_, j) => j !== i) : [''],
    }));
  };

  const showErrors = (found) => {
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      setFormError('Fix the highlighted fields.');
      const el = document.getElementById(`na-${first}`);
      if (el?.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el?.focus) el.focus({ preventScroll: true });
    }
  };

  // ── Save ────────────────────────────────────────────────────────────
  const save = async (status) => {
    if (saving) return;
    const found = validate(form, { final: status === 'final' });
    if (Object.keys(found).length) { showErrors(found); return; }
    setErrors({});
    setFormError('');
    setSaving(true);

    const payload = formToRow({ ...form, status });
    let result;
    try {
      result = editingId
        ? await supabase.from('needs_assessments').update(payload).eq('id', editingId).select().single()
        : await supabase.from('needs_assessments')
          .insert({ ...payload, created_by_name: user?.name ?? null }).select().single();
    } catch (err) {
      result = { error: err };
    }
    setSaving(false);

    if (result.error) {
      logger.error('needs_assessments save error:', result.error.message);
      setFormError(friendlyError(result.error, 'Could not save. Try again.'));
      return;
    }
    setEditingId(result.data.id);
    setForm((f) => ({ ...f, status }));
    setDirty(false);
    setSavedNote(status === 'final' ? 'Saved as final.' : 'Draft saved.');
    loadList();
  };

  // ── PDF ─────────────────────────────────────────────────────────────
  const exportForm = async () => {
    const found = validate(form);
    if (Object.keys(found).length) { showErrors(found); return; }
    setExporting(true);
    setFormError('');
    try {
      await downloadAssessmentPdf(formToRow(form));
    } catch (err) {
      logger.error('PDF export failed:', err?.message);
      setFormError('Could not make the PDF. Try again.');
    }
    setExporting(false);
  };

  const exportRow = async (row) => {
    setBusyId(row.id);
    try {
      await downloadAssessmentPdf(row);
    } catch (err) {
      logger.error('PDF export failed:', err?.message);
      Swal.fire({ ...swalTheme, icon: 'error', title: 'No PDF', text: 'Could not make the PDF. Try again.', confirmButtonColor: '#0ea5e9' });
    }
    setBusyId(null);
  };

  // ── Delete ──────────────────────────────────────────────────────────
  const removeRow = async (row) => {
    const result = await Swal.fire({
      ...swalTheme, icon: 'warning',
      title: 'Delete this assessment?',
      text: `${dateLabel(row.assessed_on)} · ${row.barangay}`,
      showCancelButton: true, confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444', cancelButtonColor: '#334155',
    });
    if (!result.isConfirmed) return;
    setBusyId(row.id);
    // RLS filters silently, so ask for the deleted rows back.
    const { data, error } = await supabase.from('needs_assessments').delete().eq('id', row.id).select();
    setBusyId(null);
    if (error || !data?.length) {
      if (error) logger.error('needs_assessments delete error:', error.message);
      Swal.fire({
        ...swalTheme, icon: 'error', title: 'Not deleted',
        text: error ? friendlyError(error, 'Try again.') : 'Only admins can delete a final assessment.',
        confirmButtonColor: '#0ea5e9',
      });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  // ── Field renderers ─────────────────────────────────────────────────
  const renderField = (f) => {
    const id = `na-${f.key}`;
    const err = errors[f.key];
    const value = form.data[f.key];
    const describe = err ? `${id}-err` : undefined;

    if (f.type === 'yesno') {
      return (
        <div key={f.key} className="na-wide" id={id} tabIndex={-1}>
          <div className="na-label" id={`${id}-q`}>{f.label}</div>
          <div className="na-yesno" role="group" aria-labelledby={`${id}-q`}>
            {['yes', 'no'].map((v) => (
              <button
                key={v} type="button" className="na-choice"
                aria-pressed={value.v === v}
                onClick={() => setData(f.key, { ...value, v: value.v === v ? null : v })}
              >
                {v === 'yes' ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
          {value.v === f.ask && (
            <div className="na-note">
              <label htmlFor={`${id}-note`} className="visually-hidden">{f.askLabel ?? 'Specify'}</label>
              <textarea
                id={`${id}-note`} className="settings-input na-input" rows={2}
                placeholder={f.askLabel ?? 'Specify'} value={value.note}
                onChange={(e) => setData(f.key, { ...value, note: e.target.value })}
              />
            </div>
          )}
          {err && <div role="alert" className="na-error">{err}</div>}
        </div>
      );
    }

    let input;
    if (f.type === 'textarea') {
      input = (
        <textarea
          id={id} className="settings-input na-input" rows={3} value={value}
          aria-invalid={!!err} aria-describedby={describe}
          onChange={(e) => setData(f.key, e.target.value)}
        />
      );
    } else if (f.type === 'count') {
      input = (
        <input
          id={id} type="text" inputMode="numeric" className="settings-input na-input" value={value}
          aria-invalid={!!err} aria-describedby={describe}
          onChange={(e) => setData(f.key, e.target.value.replace(/\D/g, '').slice(0, 9))}
        />
      );
    } else {
      input = (
        <input
          id={id} type={f.type} className="settings-input na-input" value={value}
          placeholder={f.placeholder} aria-invalid={!!err} aria-describedby={describe}
          onChange={(e) => setData(f.key, e.target.value)}
        />
      );
    }
    return <Field key={f.key} id={id} label={f.label} error={err} wide={f.wide}>{input}</Field>;
  };

  // ── List view ───────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="fade-in na-wrap">
        {listError && <ErrorBanner>{listError}</ErrorBanner>}

        <div className="registry-toolbar">
          <span className="registry-count">
            {rows.length} {rows.length === 1 ? 'assessment' : 'assessments'}
          </span>
          <button type="button" className="btn btn-primary registry-add" onClick={() => openForm(emptyAssessment(user), null)}>
            <LuPlus size={16} aria-hidden="true" /> New assessment
          </button>
        </div>

        {loading ? (
          <div className="registry-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="registry-empty">
            {listError ? 'No assessments to show.' : 'No assessments yet. Start one after a flood.'}
          </div>
        ) : (
          <div className="registry-table-wrap card">
            <table className="registry-table">
              <caption className="visually-hidden">Needs assessments</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Disaster</th>
                  <th scope="col">Families affected</th>
                  <th scope="col">Status</th>
                  <th scope="col">Prepared by</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="registry-name">{dateLabel(r.assessed_on)}</div>
                      <div className="registry-sub">{r.barangay}</div>
                    </td>
                    <td>{r.data?.disaster_type || '—'}</td>
                    <td>{r.data?.families_affected ?? '—'}</td>
                    <td><span className={`na-status is-${r.status}`}>{r.status === 'final' ? 'Final' : 'Draft'}</span></td>
                    <td>{r.prepared_by_name || r.created_by_name || '—'}</td>
                    <td>
                      <div className="na-row-actions">
                        <button type="button" className="na-link" onClick={() => openForm(rowToForm(r), r.id)}>Open</button>
                        <button type="button" className="na-link" disabled={busyId === r.id} onClick={() => exportRow(r)}>
                          <LuDownload size={14} aria-hidden="true" /> PDF
                        </button>
                        <button
                          type="button" className="na-link is-danger" disabled={busyId === r.id}
                          onClick={() => removeRow(r)} aria-label={`Delete assessment of ${dateLabel(r.assessed_on)}`}
                        >
                          <LuTrash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Form view ───────────────────────────────────────────────────────
  return (
    <div className="fade-in na-wrap" ref={topRef}>
      <div className="registry-toolbar">
        <button type="button" className="btn btn-ghost" onClick={goBack}>
          <LuArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <span className={`na-status is-${form.status}`}>{form.status === 'final' ? 'Final' : 'Draft'}</span>
      </div>

      {formError && <ErrorBanner>{formError}</ErrorBanner>}

      <section className="card na-section" aria-labelledby="na-h-header">
        <h2 className="na-section-title" id="na-h-header">{FORM_TITLE}</h2>
        <div className="na-grid">
          <Field id="na-barangay" label="Barangay" error={errors.barangay}>
            <input id="na-barangay" type="text" className="settings-input na-input" value={form.barangay}
              aria-invalid={!!errors.barangay} aria-describedby={errors.barangay ? 'na-barangay-err' : undefined}
              onChange={setTop('barangay')} />
          </Field>
          <div />
          <Field id="na-assessed_on" label="Date of assessment" error={errors.assessed_on}>
            <input id="na-assessed_on" type="date" className="settings-input na-input" value={form.assessed_on}
              aria-invalid={!!errors.assessed_on} aria-describedby={errors.assessed_on ? 'na-assessed_on-err' : undefined}
              onChange={setTop('assessed_on')} />
          </Field>
          <Field id="na-assessed_time" label="Time of assessment">
            <input id="na-assessed_time" type="time" className="settings-input na-input" value={form.assessed_time}
              onChange={setTop('assessed_time')} />
          </Field>
          <div className="na-wide" id="na-team_members" tabIndex={-1}>
            <div className="na-label" id="na-team-label">Team members</div>
            <div className="na-team" role="group" aria-labelledby="na-team-label">
              {form.team_members.map((m, i) => (
                <div className="na-team-row" key={i}>
                  <input
                    type="text" className="settings-input na-input" value={m}
                    aria-label={`Team member ${i + 1}`} onChange={(e) => setMember(i, e.target.value)}
                  />
                  <button type="button" className="na-link" onClick={() => removeMember(i)} aria-label={`Remove team member ${i + 1}`}>
                    <LuX size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div>
                <button type="button" className="na-link" onClick={addMember}>
                  <LuPlus size={14} aria-hidden="true" /> Add member
                </button>
              </div>
            </div>
            {errors.team_members && <div role="alert" className="na-error">{errors.team_members}</div>}
          </div>
        </div>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.key} className="card na-section" aria-labelledby={`na-h-${section.key}`}>
          <h2 className="na-section-title" id={`na-h-${section.key}`}>{section.title}</h2>
          <div className="na-grid">{section.fields.map(renderField)}</div>
        </section>
      ))}

      <section className="card na-section" aria-labelledby="na-h-prepared">
        <h2 className="na-section-title" id="na-h-prepared">Prepared by</h2>
        <div className="na-grid">
          <Field id="na-prepared_by_name" label="Name" error={errors.prepared_by_name}>
            <input id="na-prepared_by_name" type="text" className="settings-input na-input" value={form.prepared_by_name}
              aria-invalid={!!errors.prepared_by_name} aria-describedby={errors.prepared_by_name ? 'na-prepared_by_name-err' : undefined}
              onChange={setTop('prepared_by_name')} />
          </Field>
          <Field id="na-prepared_by_position" label="Position">
            <input id="na-prepared_by_position" type="text" className="settings-input na-input" value={form.prepared_by_position}
              onChange={setTop('prepared_by_position')} />
          </Field>
          <Field id="na-prepared_on" label="Date">
            <input id="na-prepared_on" type="date" className="settings-input na-input" value={form.prepared_on}
              onChange={setTop('prepared_on')} />
          </Field>
        </div>
      </section>

      <div className="na-bar">
        <div className="na-bar-group">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => save('draft')}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save('final')}>
            Save as final
          </button>
          {savedNote && <span role="status" className="na-saved">{savedNote}</span>}
        </div>
        <button type="button" className="btn btn-ghost" disabled={exporting} onClick={exportForm}>
          <LuDownload size={16} aria-hidden="true" /> {exporting ? 'Making PDF…' : 'Download PDF'}
        </button>
      </div>
    </div>
  );
}
