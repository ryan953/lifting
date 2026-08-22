/** Derived reads over the logged days: what did I do last time, and when. */

import * as store from './store.js';

const hasData = (set) => (set.reps ?? '') !== '' || (set.weight ?? '') !== '';

/** "15 × 10, 10 × 12.5" — the Obsidian tracker's shorthand for a set list. */
export function formatSets(sets) {
  const parts = sets
    .filter(hasData)
    .map((set) => [set.reps, set.weight].filter((v) => (v ?? '') !== '').join(' × '));
  return parts.length ? parts.join(', ') : 'none';
}

/** Every logged appearance of an exercise, newest first. */
export function performances(exerciseId) {
  const out = [];
  for (const day of store.allDays()) {
    for (const block of day.blocks) {
      for (const entry of block.exercises) {
        if (entry.exerciseId !== exerciseId) continue;
        if (!entry.sets.some(hasData)) continue;
        out.push({ day, block, sets: entry.sets, label: entry.label });
      }
    }
  }
  return out;
}

/**
 * The most recent time this exercise was logged before `currentDay`. Passing
 * the day being edited matters: when you open an old session, "last time"
 * should mean the session before *it*, not the newest one in the log.
 */
export function lastPerformance(exerciseId, currentDay = null) {
  for (const performance of performances(exerciseId)) {
    if (!currentDay) return performance;
    if (performance.day.key === currentDay.key) continue;
    if (performance.day.date > currentDay.date) continue;
    return performance;
  }
  return null;
}

/** Exercise ids I have actually trained, most recently used first. */
export function performedIds() {
  const seen = new Map();
  for (const day of store.allDays()) {
    for (const block of day.blocks) {
      for (const entry of block.exercises) {
        const record = seen.get(entry.exerciseId);
        if (record) record.count++;
        else seen.set(entry.exerciseId, { id: entry.exerciseId, date: day.date, count: 1 });
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Superset pairings that appear in the log, so the picker can offer them back
 *  even if they were never explicitly saved. */
export function performedSupersets() {
  const seen = new Map();
  for (const day of store.allDays()) {
    for (const block of day.blocks) {
      if (block.kind !== 'superset' || block.exercises.length < 2) continue;
      const ids = block.exercises.map((e) => e.exerciseId);
      const id = store.supersetId(ids);
      if (!seen.has(id)) seen.set(id, { id, exerciseIds: ids, date: day.date });
    }
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Wed Aug 19" — parsed as local time so the weekday never slips a day. */
export function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${WEEKDAYS[date.getDay()]} ${month} ${d}`;
}
