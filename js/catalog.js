/** The static exercise database and training program, loaded once at boot. */

/** Images live in the upstream dataset rather than this repo, which keeps the
 *  GitHub Pages deploy small. */
export const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

let exercises = [];
let byId = new Map();
let program = null;

export async function load() {
  const [catalogResponse, programResponse] = await Promise.all([
    fetch('./data/exercises.json'),
    fetch('./data/program.json'),
  ]);
  exercises = await catalogResponse.json();
  program = await programResponse.json();

  byId = new Map(exercises.map((e) => [e.id, e]));

  // The program refers to exercises by name; give each alias a resolved handle.
  for (const movement of program.movements) {
    movement.exercise = byId.get(movement.exerciseId) ?? null;
  }
  program.movementsByName = new Map(program.movements.map((m) => [m.name, m]));
  program.dayTypesById = new Map(program.dayTypes.map((d) => [d.id, d]));
}

export const all = () => exercises;
export const get = (id) => byId.get(id) ?? null;
export const name = (id) => byId.get(id)?.name ?? id;
export const prog = () => program;
export const dayType = (id) => program.dayTypesById.get(id) ?? null;
export const movement = (nameOrAlias) => program.movementsByName.get(nameOrAlias) ?? null;
export const requirement = (id) => program.requirements[id] ?? null;

export function imageUrl(exercise, index = 0) {
  const file = exercise?.images?.[index];
  return file ? IMAGE_BASE + file : null;
}

/** A one-line summary used under exercise names in lists. */
export function subtitle(exercise) {
  return [exercise.equipment, exercise.primary.join(', ')].filter(Boolean).join(' · ');
}

/** "chest | shoulders, triceps" — primary muscles, then secondary. */
export function muscleLine(exercise) {
  const primary = exercise.primary.join(', ');
  const secondary = exercise.secondary.join(', ');
  return secondary ? `${primary} | ${secondary}` : primary;
}

// ------------------------------------------------------------------ searching

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Rank by where the query lands: a name that starts with it beats one that
 * merely contains it, which beats an equipment/muscle-only hit.
 */
export function search(query, pool = exercises) {
  const q = normalize(query);
  if (!q) return pool;

  const terms = q.split(' ');
  const scored = [];

  for (const exercise of pool) {
    const haystackName = normalize(exercise.name);
    const haystackAll = `${haystackName} ${exercise.equipment ?? ''} ${exercise.primary.join(' ')} ${exercise.secondary.join(' ')}`;
    if (!terms.every((t) => haystackAll.includes(t))) continue;

    let score = 3;
    if (haystackName.includes(q)) score = 2;
    if (haystackName.startsWith(q)) score = 1;
    scored.push({ exercise, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.exercise.name.localeCompare(b.exercise.name))
    .map((s) => s.exercise);
}

/**
 * Does this exercise satisfy a checklist requirement?
 *
 * The `match` filter is a broad net over the database; `prefer` is a curated
 * short list. A preferred pick always counts, even when the net misses it —
 * Face Pulls are rear-delt activation regardless of how the dataset labels
 * their mechanic. Otherwise picking a suggestion would leave the box unticked.
 */
export function matchesRequirement(exercise, requirementId) {
  const requirement = program.requirements[requirementId];
  if (!requirement) return false;
  if (requirement.prefer.includes(exercise.id)) return true;

  const rule = requirement.match;
  if (!rule) return false;
  if (rule.force && exercise.force !== rule.force) return false;
  if (rule.mechanic && exercise.mechanic !== rule.mechanic) return false;
  if (rule.category && exercise.category !== rule.category) return false;
  if (rule.primary && !exercise.primary.some((m) => rule.primary.includes(m))) return false;
  if (rule.name && !new RegExp(rule.name, 'i').test(exercise.name)) return false;
  return true;
}

/** Candidates for a checklist dropdown: curated picks first, then the rest. */
export function requirementCandidates(requirementId) {
  const rule = program.requirements[requirementId];
  if (!rule) return [];

  const preferred = rule.prefer.map((id) => byId.get(id)).filter(Boolean);
  const preferredIds = new Set(preferred.map((e) => e.id));
  const rest = exercises
    .filter((e) => !preferredIds.has(e.id) && matchesRequirement(e, requirementId))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { preferred, rest };
}

/** Other exercises that train the same primary muscle — the detail page's
 *  "similar / replacement" list, mirroring the Obsidian notes. */
export function similar(exercise, limit = 8) {
  const primary = new Set(exercise.primary);
  return exercises
    .filter(
      (other) =>
        other.id !== exercise.id &&
        other.primary.some((m) => primary.has(m)) &&
        other.mechanic === exercise.mechanic
    )
    .sort((a, b) => {
      const sameKit = Number(b.equipment === exercise.equipment) - Number(a.equipment === exercise.equipment);
      return sameKit || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
