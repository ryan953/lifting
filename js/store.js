/**
 * Persistence. IndexedDB is the system of record; the whole dataset is small
 * (tens of days) so it is also held in memory, which lets every view render
 * synchronously and lets "last time" lookups scan history without awaiting.
 *
 * Writes go to memory first, then to IndexedDB, then notify subscribers.
 */

const DB_NAME = 'lifting-proto';
const DB_VERSION = 2;
const STORES = ['days', 'favorites', 'supersets', 'meta', 'custom'];

let db = null;

const cache = {
  days: new Map(), // key -> day
  favorites: new Set(), // exercise id
  supersets: new Map(), // id -> saved superset
  custom: new Map(), // id -> user-defined exercise
  profile: null, // mocked account, see profile.js
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

// --------------------------------------------------------------- remote mirror

/**
 * When signed in, every local write is mirrored to Firestore and every remote
 * change is applied back into this cache (see cloud.js). IndexedDB stays the
 * local copy either way, so the app is identical offline and signed out.
 *
 * The adapter is a plain object of optional `put`/`remove` callbacks; a null
 * adapter is the local-only mode.
 */
let remote = null;

export function attachRemote(adapter) {
  remote = adapter;
}

export function detachRemote() {
  remote = null;
}

export const hasRemote = () => remote !== null;

function push(collection, action, payload) {
  if (!remote) return;
  Promise.resolve(remote[action]?.(collection, payload)).catch((error) =>
    console.warn(`Could not sync ${action} on ${collection}:`, error)
  );
}

/**
 * Apply a change that arrived from the server. Writes to the local mirror but
 * must not echo back out, or two devices would ping-pong forever.
 */
export function applyRemote(collection, records, { removedIds = [] } = {}) {
  const target = {
    days: cache.days,
    supersets: cache.supersets,
    custom: cache.custom,
  }[collection];

  if (collection === 'favorites') {
    for (const record of records) cache.favorites.add(record.id);
    for (const id of removedIds) cache.favorites.delete(id);
  } else if (target) {
    for (const record of records) target.set(record.key ?? record.id, record);
    for (const id of removedIds) target.delete(id);
  } else if (collection === 'profile') {
    cache.profile = records[0] ?? null;
  }

  // Keep the offline mirror in step, without going back through push().
  const storeName = collection === 'profile' ? 'meta' : collection;
  if (db && records.length) {
    tx(storeName, 'readwrite', (s) => {
      for (const record of records) {
        s.put(collection === 'favorites' ? { id: record.id, at: Date.now() } : record);
      }
    }).catch(() => {});
  }
  if (db && removedIds.length) {
    tx(storeName, 'readwrite', (s) => {
      for (const id of removedIds) s.delete(id);
    }).catch(() => {});
  }

  notify();
}

// ------------------------------------------------------------------ IndexedDB

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('days'))
        database.createObjectStore('days', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('favorites'))
        database.createObjectStore('favorites', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('supersets'))
        database.createObjectStore('supersets', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('meta'))
        database.createObjectStore('meta', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('custom'))
        database.createObjectStore('custom', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(store, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    // Read `request.result` only once the transaction commits; a get() that
    // found nothing must resolve as undefined, not as the request itself.
    transaction.oncomplete = () =>
      resolve(request instanceof IDBRequest ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
  });
}

function readAll(store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ------------------------------------------------------------------ lifecycle

export const dayKey = (date, dayType) => `${date}__${dayType}`;

export async function init() {
  db = await open();

  const seeded = await tx('meta', 'readonly', (s) => s.get('seeded'));
  if (!seeded) await seed();

  const [days, favorites, supersets, custom] = await Promise.all(
    ['days', 'favorites', 'supersets', 'custom'].map(readAll)
  );
  for (const day of days) cache.days.set(day.key, day);
  for (const favorite of favorites) cache.favorites.add(favorite.id);
  for (const set of supersets) cache.supersets.set(set.id, set);
  for (const exercise of custom) cache.custom.set(exercise.id, exercise);

  cache.profile = (await tx('meta', 'readonly', (s) => s.get('profile')))?.value ?? null;

  await seedCustomExercises();
}

/**
 * Ship a few ready-made custom exercises (the interval machines) without
 * clobbering the user's own edits.
 *
 * Guarded by a version rather than the first-run flag so a later release can
 * add or revise them, and gated so that deleting a starter doesn't resurrect
 * it on the next load — only a bumped version brings new ones in.
 *
 * A bump also refreshes starters that are still untouched, which is how a
 * change to the shipped definition reaches a browser that already has them.
 * Records keep a `seededAt` marker for exactly this; saveCustom strips it, so
 * the moment you edit one it stops being ours to overwrite.
 */
async function seedCustomExercises() {
  let seed;
  try {
    const response = await fetch('./data/custom-seed.json');
    if (!response.ok) return;
    seed = await response.json();
  } catch {
    return; // offline or missing — nothing to add
  }

  const seen = (await tx('meta', 'readonly', (s) => s.get('customSeedVersion')))?.value ?? 0;
  if (seen >= seed.version) return;

  // Version 1 shipped before the `seededAt` marker existed, so anything stored
  // under it is still ours to refresh.
  const MARKER_SINCE = 2;
  const stillOurs = (existing) => Boolean(existing.seededAt) || seen < MARKER_SINCE;

  const transaction = db.transaction(['custom', 'meta'], 'readwrite');
  const store = transaction.objectStore('custom');
  for (const exercise of seed.exercises) {
    const existing = cache.custom.get(exercise.id);
    // Present and edited by the user — leave it alone.
    if (existing && !stillOurs(existing)) continue;

    const record = { ...exercise, seededAt: seed.version };
    cache.custom.set(record.id, record);
    store.put(record);
  }
  transaction.objectStore('meta').put({ key: 'customSeedVersion', value: seed.version });

  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

/** First run: load the history exported from the Obsidian vault. */
async function seed() {
  let days = [];
  try {
    const response = await fetch('./data/seed-log.json');
    if (response.ok) days = await response.json();
  } catch {
    days = []; // offline or missing seed — start empty rather than failing to boot
  }

  const transaction = db.transaction(['days', 'meta'], 'readwrite');
  const store = transaction.objectStore('days');
  for (const day of days) {
    store.put({ ...day, key: dayKey(day.date, day.dayType) });
  }
  transaction.objectStore('meta').put({ key: 'seeded', value: new Date().toISOString() });

  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Wipe everything and re-seed. Exposed as "Reset demo data" on the Log screen. */
export async function reset() {
  const transaction = db.transaction(STORES, 'readwrite');
  for (const name of STORES) transaction.objectStore(name).clear();
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  cache.days.clear();
  cache.favorites.clear();
  cache.supersets.clear();

  await seed();
  for (const day of await readAll('days')) cache.days.set(day.key, day);
  notify();
}

// ----------------------------------------------------------- custom exercises

/** Ids are namespaced so a custom entry can never collide with a dataset id. */
export const CUSTOM_PREFIX = 'custom:';

export const isCustomId = (id) => String(id).startsWith(CUSTOM_PREFIX);

export function allCustom() {
  return [...cache.custom.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function saveCustom(exercise) {
  const record = {
    ...exercise,
    id: exercise.id ?? `${CUSTOM_PREFIX}${crypto.randomUUID()}`,
    custom: true,
  };
  // Once you've edited it, it's yours: a later seed version must not overwrite.
  delete record.seededAt;
  cache.custom.set(record.id, record);
  tx('custom', 'readwrite', (s) => s.put(record));
  push('custom', 'put', record);
  notify();
  return record;
}

export function deleteCustom(id) {
  cache.custom.delete(id);
  tx('custom', 'readwrite', (s) => s.delete(id));
  push('custom', 'remove', id);
  notify();
}

// -------------------------------------------------------------------- profile

/**
 * The mocked account. There is no server and no auth: this is a local record
 * so the signup/login/profile screens have something to show. Passwords are
 * never part of it — the fields on those screens are for layout only.
 */
export function getProfile() {
  return cache.profile;
}

export function saveProfile(profile) {
  cache.profile = profile;
  tx('meta', 'readwrite', (s) => s.put({ key: 'profile', value: profile }));
  notify();
  return profile;
}

export function signOut() {
  cache.profile = null;
  tx('meta', 'readwrite', (s) => s.delete('profile'));
  notify();
}

// ----------------------------------------------------------------------- days

/** Newest first; two sessions on one date are ordered by type for stability. */
export function allDays() {
  return [...cache.days.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.dayType.localeCompare(b.dayType)
  );
}

export function getDay(key) {
  return cache.days.get(key) ?? null;
}

export function putDay(day) {
  const record = { ...day, updatedAt: Date.now() };
  cache.days.set(record.key, record);
  tx('days', 'readwrite', (s) => s.put(record));
  push('days', 'put', record);
  notify();
  return record;
}

export function deleteDay(key) {
  cache.days.delete(key);
  tx('days', 'readwrite', (s) => s.delete(key));
  push('days', 'remove', key);
  notify();
}

// ------------------------------------------------------------------ favorites

export function isFavorite(exerciseId) {
  return cache.favorites.has(exerciseId);
}

export function favoriteIds() {
  return [...cache.favorites];
}

export function toggleFavorite(exerciseId) {
  const on = !cache.favorites.has(exerciseId);
  if (on) {
    cache.favorites.add(exerciseId);
    tx('favorites', 'readwrite', (s) => s.put({ id: exerciseId, at: Date.now() }));
    push('favorites', 'put', { id: exerciseId, at: Date.now() });
  } else {
    cache.favorites.delete(exerciseId);
    tx('favorites', 'readwrite', (s) => s.delete(exerciseId));
    push('favorites', 'remove', exerciseId);
  }
  notify();
  return on;
}

// ------------------------------------------------------------------ supersets

export function allSupersets() {
  return [...cache.supersets.values()].sort((a, b) => b.usedAt - a.usedAt);
}

export function getSuperset(id) {
  return cache.supersets.get(id) ?? null;
}

/** Saved pairings are keyed by their member ids, so re-saving the same pair
 *  updates the existing entry instead of piling up duplicates. */
export function supersetId(exerciseIds) {
  return [...exerciseIds].sort().join('+');
}

// Local calendar date. Inlined rather than imported from history.js, which
// depends on this module.
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function saveSuperset(exerciseIds, { favorite = false } = {}) {
  const id = supersetId(exerciseIds);
  const existing = cache.supersets.get(id);
  const record = {
    id,
    exerciseIds: [...exerciseIds],
    favorite: existing?.favorite || favorite,
    usedAt: Date.now(),
    date: todayISO(),
  };
  cache.supersets.set(id, record);
  tx('supersets', 'readwrite', (s) => s.put(record));
  push('supersets', 'put', record);
  notify();
  return record;
}

export function toggleSupersetFavorite(id) {
  const record = cache.supersets.get(id);
  if (!record) return false;
  const next = { ...record, favorite: !record.favorite };
  cache.supersets.set(id, next);
  tx('supersets', 'readwrite', (s) => s.put(next));
  push('supersets', 'put', next);
  notify();
  return next.favorite;
}

export function deleteSuperset(id) {
  cache.supersets.delete(id);
  tx('supersets', 'readwrite', (s) => s.delete(id));
  push('supersets', 'remove', id);
  notify();
}
