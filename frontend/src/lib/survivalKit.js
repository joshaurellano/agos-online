import { useCallback, useEffect, useState } from 'react';

// Survival kit data and storage. The kit lives only in this browser.
// `grab` marks what to take first if you have about two minutes.
// `when` ties an item to a household need; items without it always show.

export const KIT_ITEMS = [
  { id: 'docs',     grab: true },
  { id: 'meds',     grab: true },
  { id: 'phone',    grab: true },
  { id: 'water',    grab: true },
  { id: 'contacts', grab: true },
  { id: 'baby',     grab: true, when: 'infant' },
  { id: 'care',     grab: true, when: 'care' },
  { id: 'senior',   grab: false, when: 'senior' },
  { id: 'pet',      grab: false, when: 'pet' },
  { id: 'food' }, { id: 'light' }, { id: 'firstaid' }, { id: 'hygiene' },
  { id: 'cash' }, { id: 'warm' }, { id: 'rain' },
];

export const WATER_LITERS_PER_PERSON_DAY = 4;
export const WATER_DAYS = 3;
export const REFRESH_DAYS = 180;

const KEY = 'agos-survival-kit-v2';
const OLD_KEY = 'agos-survival-kit'; // v1 stored just an array of checked ids
const EVENT = 'agos-kit-change';

const DEFAULT = {
  checked: [],
  household: { people: 1, infant: false, senior: false, care: false, pet: false },
  lastChecked: null,
  members: [], // optional [{ name, phone }] for the printed family plan
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return {
        checked: Array.isArray(v.checked) ? v.checked : [],
        household: { ...DEFAULT.household, ...(v.household || {}) },
        lastChecked: typeof v.lastChecked === 'string' ? v.lastChecked : null,
        members: Array.isArray(v.members) ? v.members : [],
      };
    }
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (Array.isArray(old)) return { ...DEFAULT, checked: old };
  } catch { /* unreadable storage: start fresh */ }
  return { ...DEFAULT, household: { ...DEFAULT.household } };
}

export function applicableItems(household) {
  return KIT_ITEMS.filter((i) => !i.when || household[i.when]);
}

export function useKit() {
  const [state, setState] = useState(load);

  useEffect(() => {
    const sync = () => setState(load());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      setTimeout(() => window.dispatchEvent(new Event(EVENT)), 0);
      return next;
    });
  }, []);

  const items = applicableItems(state.household);
  const checked = state.checked.filter((id) => items.some((i) => i.id === id));
  const daysSinceChecked = state.lastChecked
    ? Math.floor((Date.now() - new Date(state.lastChecked).getTime()) / 86400000)
    : null;

  return { state, update, items, checked, total: items.length, daysSinceChecked };
}
