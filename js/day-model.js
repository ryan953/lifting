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
 * Returns reqId -> the entry that satisfies it, so the UI can name it.
 */
export function autoSatisfied(day) {
  const template = catalog.dayType(day.dayType);
  const met = new Map();
  if (!template) return met;

  for (const requirementId of template.checklist) {
    for (const block of day.blocks) {
      const hit = block.exercises.find((entry) => {
        const exercise = catalog.get(entry.exerciseId);
        return exercise && catalog.matchesRequirement(exercise, requirementId);
      });
      if (hit) {
        met.set(requirementId, hit);
        break;
      }
    }
  }
  return met;
}

export function isChecked(day, requirementId, satisfied = autoSatisfied(day)) {
  // An explicit tick wins; otherwise the day's contents speak for themselves.
  return day.checklist[requirementId]?.done ?? satisfied.has(requirementId);
}
