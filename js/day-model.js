/** Building and mutating a workout day. Views call these and then persist. */

import * as catalog from './catalog.js';
import * as store from './store.js';

const uid = () => Math.random().toString(36).slice(2, 9);

const emptySet = () => ({ reps: '', weight: '' });

/** My shorthand name for an exercise, when the program has one. */
export function labelFor(exerciseId) {
  const alias = catalog
    .prog()
    .movements.find((movement) => movement.exerciseId === exerciseId);
  return alias?.name ?? catalog.name(exerciseId);
}

/** Set counts follow the program's framework: 5 for a main lift, 4 for an
 *  accessory, 3 for each leg of a superset — unless the movement overrides it. */
export function defaultSetCount(exerciseId, slot, isSuperset) {
  if (isSuperset) return 3;
  const alias = catalog
    .prog()
    .movements.find((movement) => movement.exerciseId === exerciseId);
  if (alias) return alias.defaultSets;
  return slot === 'Main Lift' ? 5 : 4;
}

function makeEntry(exerciseId, slot, isSuperset) {
  return {
    exerciseId,
    label: labelFor(exerciseId),
    sets: Array.from({ length: defaultSetCount(exerciseId, slot, isSuperset) }, emptySet),
    notes: '',
  };
}

export function makeBlock(exerciseIds, slot) {
  const isSuperset = exerciseIds.length > 1;
  return {
    id: uid(),
    slot,
    kind: isSuperset ? 'superset' : 'single',
    exercises: exerciseIds.map((id) => makeEntry(id, slot, isSuperset)),
  };
}

/** A fresh day, pre-filled with its template's movements. */
export function createDay(date, dayTypeId) {
  const template = catalog.dayType(dayTypeId);
  const blocks = (template?.movements ?? []).map((entry) => {
    const movement = catalog.movement(entry.name);
    const block = makeBlock([movement?.exerciseId].filter(Boolean), entry.slot);
    if (block.exercises[0]) block.exercises[0].label = entry.name;
    return block;
  });

  return {
    key: store.dayKey(date, dayTypeId),
    date,
    dayType: dayTypeId,
    activation: {},
    checklist: {},
    blocks: blocks.filter((block) => block.exercises.length),
    notes: '',
  };
}

// ------------------------------------------------------------------ summary

const label = (block) => block.exercises.map((entry) => entry.label).join(' + ');

/**
 * What a logged day actually contains — "Deadlifts + 4 accessory".
 *
 * Preferred over the template's name in listings: once movements get swapped
 * around, "Primary Pull" no longer says what was trained, but the main lift
 * and the accessory count still do. Falls back to the template name only when
 * the day is empty and there is nothing else to report.
 */
export function summarize(day) {
  const main = day.blocks.find((block) => block.slot === 'Main Lift');
  const accessories = day.blocks.filter((block) => block.slot !== 'Main Lift');

  if (main && accessories.length) return `${label(main)} + ${accessories.length} accessory`;
  if (main) return label(main);
  if (accessories.length) return `${accessories.length} accessory`;
  return catalog.dayType(day.dayType)?.title ?? day.dayType;
}

/** Accessory movement names, for the second line of a listing row. */
export function accessoryLabels(day) {
  return day.blocks.filter((block) => block.slot !== 'Main Lift').map(label);
}

export function loggedSetCount(day) {
  return day.blocks
    .flatMap((block) => block.exercises)
    .flatMap((entry) => entry.sets)
    .filter((set) => (set.reps ?? '') !== '' || (set.weight ?? '') !== '').length;
}

// ----------------------------------------------------------------- mutations

export function blocksInSlot(day, slot) {
  return day.blocks.filter((block) => block.slot === slot);
}

export function addBlock(day, exerciseIds, slot) {
  const block = makeBlock(exerciseIds, slot);
  day.blocks.push(block);
  if (exerciseIds.length > 1) store.saveSuperset(exerciseIds);
  return block;
}

export function removeBlock(day, blockId) {
  day.blocks = day.blocks.filter((block) => block.id !== blockId);
}

/**
 * Swap what occupies a position, keeping its slot. Sets are rebuilt from the
 * new movement's defaults rather than carried over — reps and weights belong
 * to the exercise that produced them.
 */
export function replaceBlockExercises(day, blockId, exerciseIds) {
  const block = day.blocks.find((candidate) => candidate.id === blockId);
  if (!block) return null;

  const isSuperset = exerciseIds.length > 1;
  block.kind = isSuperset ? 'superset' : 'single';
  block.exercises = exerciseIds.map((id) => makeEntry(id, block.slot, isSuperset));
  if (isSuperset) store.saveSuperset(exerciseIds);
  return block;
}

/**
 * A multi-leg block whose legs are all the same movement is a drop set, not a
 * superset — same lift, descending weight — so it's labelled accordingly.
 */
export function isDropSet(block) {
  return (
    block.exercises.length > 1 &&
    new Set(block.exercises.map((entry) => entry.exerciseId)).size === 1
  );
}

/** Has anything actually been written into this block's sets? */
export function blockHasData(block) {
  return block.exercises.some((entry) =>
    entry.sets.some((set) => (set.reps ?? '') !== '' || (set.weight ?? '') !== '')
  );
}

export function addSet(day, blockId) {
  const block = day.blocks.find((b) => b.id === blockId);
  for (const entry of block.exercises) entry.sets.push(emptySet());
}

export function removeSet(day, blockId) {
  const block = day.blocks.find((b) => b.id === blockId);
  for (const entry of block.exercises) {
    if (entry.sets.length > 1) entry.sets.pop();
  }
}

/**
 * Where a checklist pick lands: the first accessory slot with nothing in it,
 * falling back to the last slot once the day is full.
 */
export function nextOpenSlot(day) {
  const accessories = catalog.prog().slots.filter((slot) => slot !== 'Main Lift');
  return (
    accessories.find((slot) => blocksInSlot(day, slot).length === 0) ??
    accessories[accessories.length - 1]
  );
}

// ---------------------------------------------------------------- checklist

/**
 * A requirement counts as met when something in the day matches its filter.
 * Returns reqId -> { block, entry } for the first block that satisfies it, so
 * each requirement is claimed by exactly one section of the day.
 */
export function autoSatisfied(day) {
  const template = catalog.dayType(day.dayType);
  const met = new Map();
  if (!template) return met;

  for (const requirementId of template.checklist) {
    for (const block of day.blocks) {
      const entry = block.exercises.find((candidate) => {
        const exercise = catalog.get(candidate.exerciseId);
        return exercise && catalog.matchesRequirement(exercise, requirementId);
      });
      if (entry) {
        met.set(requirementId, { block, entry });
        break;
      }
    }
  }
  return met;
}

/** blockId -> the requirement ids that block covers. */
export function requirementsByBlock(day, satisfied = autoSatisfied(day)) {
  const byBlock = new Map();
  for (const [requirementId, hit] of satisfied) {
    const list = byBlock.get(hit.block.id) ?? [];
    list.push(requirementId);
    byBlock.set(hit.block.id, list);
  }
  return byBlock;
}

/** Requirements with nothing in the day covering them and no manual tick. */
export function unmetRequirements(day, satisfied = autoSatisfied(day)) {
  const template = catalog.dayType(day.dayType);
  return (template?.checklist ?? []).filter(
    (requirementId) => !satisfied.has(requirementId) && !day.checklist[requirementId]?.done
  );
}
