/** Aggregates over the log, shared by the heatmap and the profile screen. */

import * as store from './store.js';
import * as model from './day-model.js';
import * as history from './history.js';

export const DAY_MS = 86400000;

export const iso = (date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const parseISO = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Step by calendar days, never by milliseconds.
 *
 * A day is not reliably 86_400_000ms: across a daylight-saving change it is 23
 * or 25 hours. Walking a range by DAY_MS therefore drifts an hour at every
 * transition, and once it does, local midnight lands on the neighbouring date —
 * which silently shifts every later day onto the wrong weekday. Rebuilding the
 * date from its components lets the platform apply the offset itself.
 */
export const addDays = (date, count) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);

/** Whole calendar days from `from` to `to`, DST included. */
export const daysBetween = (from, to) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

/**
 * date -> { sets, sessions, rest, keys }. A rest day is deliberately distinct
 * from a day with no entry at all: one is a decision, the other is a gap.
 */
export function indexByDate() {
  const byDate = new Map();

  for (const day of store.allDays()) {
    const record = byDate.get(day.date) ?? { sets: 0, sessions: 0, rest: false, keys: [] };
    record.sessions++;
    record.sets += model.loggedSetCount(day);
    record.keys.push(day.key);
    if (day.dayType === 'rest-day') record.rest = true;
    byDate.set(day.date, record);
  }

  return byDate;
}

/**
 * Streaks over the `days` window ending at `end`. Rest days neither extend nor
 * break a streak — they are planned. An unlogged final day counts as a day in
 * progress rather than a miss.
 */
export function streaks(byDate, days, end = parseISO(history.todayISO())) {
  let current = 0;
  let longest = 0;
  let run = 0;
  let trained = 0;
  let sets = 0;

  for (let offset = days - 1; offset >= 0; offset--) {
    const record = byDate.get(iso(addDays(end, -offset)));
    if (record && !record.rest) {
      run++;
      trained++;
      sets += record.sets;
      longest = Math.max(longest, run);
    } else if (!record?.rest) {
      run = 0;
    }
  }

  for (let offset = 0; offset < days; offset++) {
    const record = byDate.get(iso(addDays(end, -offset)));
    if (record && !record.rest) current++;
    else if (record?.rest || offset === 0) continue;
    else break;
  }

  return { current, longest, trained, sets };
}

/** Lifetime totals for the profile screen. */
export function totals() {
  const days = store.allDays();
  return {
    sessions: days.filter((day) => day.dayType !== 'rest-day').length,
    sets: days.reduce((sum, day) => sum + model.loggedSetCount(day), 0),
    favorites: store.favoriteIds().length,
    supersets: store.allSupersets().length,
    since: days.length ? days[days.length - 1].date : null,
  };
}
