// Post-flood Immediate Needs Assessment, following DILG MC 2025-035,
// Annex D (Sample Barangay Immediate Needs Assessment Form).
//
// The form screen and the PDF are both built from SECTIONS, so a question
// added or reworded here shows up in both.
//
// Field types:
//   text, textarea, date, time  plain answers
//   count                       whole number, 0 or more
//   yesno                       Yes / No, plus a "specify" box. `ask` says
//                               which answer opens the box ('yes' or 'no').

export const FORM_TITLE = 'Barangay Immediate Needs Assessment';
export const FORM_SOURCE = 'Based on DILG MC No. 2025-035, Annex D';

export const SECTIONS = [
  {
    key: 'general', title: 'General information',
    fields: [
      { key: 'disaster_type',  label: 'Type of disaster', type: 'text', placeholder: 'Flood' },
      { key: 'disaster_date',  label: 'Date of disaster', type: 'date' },
      { key: 'disaster_time',  label: 'Time of disaster', type: 'time' },
      { key: 'areas_affected', label: 'Areas affected (streets, sitios, puroks)', type: 'textarea', wide: true },
    ],
  },
  {
    key: 'population', title: 'Affected population',
    fields: [
      { key: 'total_population',     label: 'Total population',        type: 'count' },
      { key: 'families_affected',    label: 'Families affected',       type: 'count' },
      { key: 'individuals_affected', label: 'Individuals affected',    type: 'count' },
      { key: 'injured',              label: 'Injured',                 type: 'count' },
      { key: 'missing',              label: 'Missing',                 type: 'count' },
      { key: 'deaths',               label: 'Deaths',                  type: 'count' },
    ],
  },
  {
    key: 'health', title: 'Health and medical needs',
    fields: [
      { key: 'medical_needs',    label: 'Are there immediate medical needs?',           type: 'yesno', ask: 'yes' },
      { key: 'medical_supplies', label: 'Is there a need for medical supplies?',        type: 'yesno', ask: 'yes' },
      { key: 'psychosocial',     label: 'Is there a need for psychological support?',   type: 'yesno', ask: 'yes' },
    ],
  },
  {
    key: 'shelter', title: 'Shelter needs',
    fields: [
      { key: 'houses_destroyed', label: 'Houses totally destroyed',            type: 'count' },
      { key: 'houses_damaged',   label: 'Houses partially destroyed',          type: 'count' },
      { key: 'families_shelter', label: 'Families needing temporary shelter',  type: 'count' },
      { key: 'evac_centers',     label: 'Available evacuation centers',        type: 'textarea', wide: true },
    ],
  },
  {
    key: 'food_water', title: 'Food and water needs',
    fields: [
      { key: 'food_enough',  label: 'Is there enough food for affected families?', type: 'yesno', ask: 'no', askLabel: 'Immediate food needs' },
      { key: 'water_enough', label: 'Is there enough drinking water?',             type: 'yesno', ask: 'no', askLabel: 'Immediate water needs' },
    ],
  },
  {
    key: 'sanitation', title: 'Sanitation and hygiene needs',
    fields: [
      { key: 'sanitation_working', label: 'Are toilets and drainage working?',               type: 'yesno', ask: 'no', askLabel: 'Issues' },
      { key: 'hygiene_supplies',   label: 'Is there a need for hygiene supplies?',           type: 'yesno', ask: 'yes' },
      { key: 'waterborne_risk',    label: 'Is there a risk of waterborne diseases?',         type: 'yesno', ask: 'yes' },
    ],
  },
  {
    key: 'protection', title: 'Protection and security',
    fields: [
      { key: 'vulnerable', label: 'Do children, elderly or persons with disabilities need special attention?', type: 'yesno', ask: 'yes' },
      { key: 'security',   label: 'Are there safety or security concerns (looting, violence)?',               type: 'yesno', ask: 'yes' },
    ],
  },
  {
    key: 'livelihood', title: 'Livelihood needs',
    fields: [
      { key: 'livelihood_hit',    label: 'Were livelihoods affected (lost income, damaged equipment)?', type: 'yesno', ask: 'yes', askLabel: 'Affected sectors' },
      { key: 'livelihood_assist', label: 'Is immediate livelihood assistance needed?',                  type: 'yesno', ask: 'yes' },
    ],
  },
  {
    key: 'other', title: 'Other immediate needs',
    fields: [
      { key: 'other_needs', label: 'Other immediate needs not listed above', type: 'textarea', wide: true },
    ],
  },
  {
    key: 'recommendations', title: 'Recommendations',
    fields: [
      { key: 'actions_needed',     label: 'Actions needed',                type: 'textarea', wide: true },
      { key: 'resources_required', label: 'Additional resources required', type: 'textarea', wide: true },
    ],
  },
];

export const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

export const todayKey = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export function emptyAssessment(user) {
  const data = {};
  ALL_FIELDS.forEach((f) => {
    data[f.key] = f.type === 'yesno' ? { v: null, note: '' } : '';
  });
  data.disaster_type = 'Flood';
  return {
    barangay: 'Triangulo',
    assessed_on: todayKey(),
    assessed_time: '',
    team_members: [user?.name ?? ''],
    status: 'draft',
    prepared_by_name: user?.name ?? '',
    prepared_by_position: user?.roles?.role_desc ?? '',
    prepared_on: todayKey(),
    data,
  };
}

// Database row -> form state (numbers become strings for the inputs).
export function rowToForm(row) {
  const base = emptyAssessment(null);
  const data = { ...base.data };
  ALL_FIELDS.forEach((f) => {
    const saved = row.data?.[f.key];
    if (f.type === 'yesno') data[f.key] = { v: saved?.v ?? null, note: saved?.note ?? '' };
    else if (saved != null) data[f.key] = String(saved);
  });
  return {
    barangay: row.barangay ?? 'Triangulo',
    assessed_on: row.assessed_on ?? todayKey(),
    assessed_time: row.assessed_time ? row.assessed_time.slice(0, 5) : '',
    team_members: row.team_members?.length ? row.team_members : [''],
    status: row.status ?? 'draft',
    prepared_by_name: row.prepared_by_name ?? '',
    prepared_by_position: row.prepared_by_position ?? '',
    prepared_on: row.prepared_on ?? todayKey(),
    data,
  };
}

// Form state -> database payload.
export function formToRow(form) {
  const data = {};
  ALL_FIELDS.forEach((f) => {
    const val = form.data[f.key];
    if (f.type === 'yesno') {
      data[f.key] = { v: val.v, note: val.v === f.ask ? val.note.trim() : '' };
    } else if (f.type === 'count') {
      data[f.key] = val === '' ? null : Number(val);
    } else {
      data[f.key] = typeof val === 'string' ? val.trim() : val;
    }
  });
  return {
    barangay: form.barangay.trim(),
    assessed_on: form.assessed_on,
    assessed_time: form.assessed_time || null,
    team_members: form.team_members.map((m) => m.trim()).filter(Boolean),
    status: form.status,
    prepared_by_name: form.prepared_by_name.trim() || null,
    prepared_by_position: form.prepared_by_position.trim() || null,
    prepared_on: form.prepared_on || null,
    data,
  };
}

// Returns { fieldKey: 'message' }. Messages are short on purpose.
// A draft only needs the basics; marking it final needs more.
export function validate(form, { final = false } = {}) {
  const errors = {};
  if (!form.barangay.trim()) errors.barangay = 'Enter the barangay.';
  if (!form.assessed_on) errors.assessed_on = 'Pick a date.';
  else if (form.assessed_on > todayKey()) errors.assessed_on = 'The date cannot be in the future.';

  ALL_FIELDS.forEach((f) => {
    if (f.type !== 'count') return;
    const val = form.data[f.key];
    if (val !== '' && !/^\d{1,9}$/.test(val)) errors[f.key] = 'Use a whole number, 0 or more.';
  });

  if (final) {
    if (!form.data.disaster_type.trim()) errors.disaster_type = 'Enter the type of disaster.';
    if (!form.data.areas_affected.trim()) errors.areas_affected = 'List the areas affected.';
    if (!form.team_members.some((m) => m.trim())) errors.team_members = 'Add at least one team member.';
    if (!form.prepared_by_name.trim()) errors.prepared_by_name = 'Enter who prepared this.';
    ALL_FIELDS.forEach((f) => {
      if (f.type === 'yesno' && form.data[f.key].v === null) errors[f.key] = 'Pick Yes or No.';
    });
  }
  return errors;
}
