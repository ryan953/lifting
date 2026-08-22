/** One workout day: activation, main lift, accessories, gaps, notes. */

import { el, frag, toast } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import * as history from '../history.js';
import * as model from '../day-model.js';
import { pickExercises } from '../sheet.js';

export function render(day, { rerender }) {
  const template = catalog.dayType(day.dayType);
  const save = () => {
    store.putDay(day);
    rerender();
  };
  // Typing in a set cell must not blow away the field being typed into.
  const saveQuietly = () => store.putDay(day);

  // Each requirement is shown on the section that covers it rather than in a
  // checklist of its own, so the requirement, the exercise chosen for it and
  // its sets read as one unit.
  const satisfied = model.autoSatisfied(day);

  return frag(
    el('h1', {}, template?.title ?? day.dayType),
    el('p', { class: 'muted', style: 'margin-top:0' }, history.prettyDate(day.date)),

    renderActivation(day, template, save),
    ...catalog
      .prog()
      .slots.map((slot) => renderSlot(day, slot, satisfied, save, saveQuietly)),
    renderUnmet(day, satisfied, save),
    renderNotes(day, saveQuietly)
  );
}

// ------------------------------------------------------------------ sections

function renderActivation(day, template, save) {
  if (!template?.activation?.length) return null;

  return frag(
    el('h2', {}, 'Activation'),
    el(
      'div',
      { class: 'checklist' },
      template.activation.map((name) => {
        const done = Boolean(day.activation[name]);
        return el(
          'div',
          { class: `check-item${done ? ' done' : ''}` },
          checkbox(done, () => {
            day.activation[name] = !done;
            save();
          }),
          el('div', { class: 'check-label' }, name)
        );
      })
    )
  );
}

/**
 * Requirements the day still owes, listed after the slots with the same
 * dropdown the checklist used to carry. Only gaps appear here — anything the
 * day already covers is named on the section covering it.
 */
function renderUnmet(day, satisfied, save) {
  const unmet = model.unmetRequirements(day, satisfied);
  if (!unmet.length) return null;

  return frag(
    el('h2', {}, 'Still needed'),
    el(
      'div',
      { class: 'checklist' },
      unmet.map((requirementId) => {
        const requirement = catalog.requirement(requirementId);
        return el(
          'div',
          { class: 'check-item' },
          checkbox(false, () => {
            // Done at the gym but not worth logging sets for.
            day.checklist[requirementId] = { done: true };
            save();
          }),
          el('div', { class: 'check-label' }, requirement?.label ?? requirementId),
          renderPicker(day, requirementId, save)
        );
      })
    )
  );
}

/** The dropdown that turns a requirement gap into a logged exercise. */
function renderPicker(day, requirementId, save) {
  const { preferred, rest } = catalog.requirementCandidates(requirementId);

  const select = el(
    'select',
    { 'aria-label': `Choose an exercise for ${catalog.requirement(requirementId)?.label}` },
    el('option', { value: '' }, 'Choose…'),
    preferred.length
      ? el(
          'optgroup',
          { label: 'Suggested' },
          preferred.map((exercise) => el('option', { value: exercise.id }, exercise.name))
        )
      : null,
    rest.length
      ? el(
          'optgroup',
          { label: `All matching (${rest.length})` },
          rest.map((exercise) => el('option', { value: exercise.id }, exercise.name))
        )
      : null
  );

  const add = () => {
    if (!select.value) return;
    const slot = model.nextOpenSlot(day);
    model.addBlock(day, [select.value], slot);
    toast(`Added ${catalog.name(select.value)} to ${slot}`);
    save();
  };

  return el(
    'div',
    { class: 'check-pick' },
    select,
    el('button', { class: 'btn sm', onclick: add }, 'Add')
  );
}

function renderSlot(day, slot, satisfied, save, saveQuietly) {
  const blocks = model.blocksInSlot(day, slot);
  const template = catalog.dayType(day.dayType);

  if (template?.group === 'rest') return null;

  // Main Lift is always offered. Of the accessory slots, show the ones in use
  // plus the first empty one — so there is exactly one place to add next.
  if (!blocks.length && slot !== 'Main Lift' && slot !== model.nextOpenSlot(day)) {
    return null;
  }

  const addHere = async () => {
    const ids = await pickExercises({ title: `Add to ${slot}` });
    if (!ids?.length) return;
    model.addBlock(day, ids, slot);
    toast(ids.length > 1 ? 'Superset added' : `Added ${catalog.name(ids[0])}`);
    save();
  };

  const byBlock = model.requirementsByBlock(day, satisfied);

  return frag(
    ...blocks.map((block) => renderBlock(day, block, byBlock.get(block.id), save, saveQuietly)),
    el('button', { class: 'btn ghost wide slot-add', onclick: addHere }, `+ Add to ${slot}`)
  );
}

/**
 * One position in the day, self-contained: where it falls in the order, what
 * the template expects there, what is filling it, what that trains, what it
 * did last time, and its sets.
 */
function renderBlock(day, block, requirements, save, saveQuietly) {
  const isSuperset = block.kind === 'superset';

  const expectation = (requirements ?? [])
    .map((id) => catalog.requirement(id)?.label ?? id)
    .join(' · ');

  const change = async () => {
    const ids = await pickExercises({
      title: `Change ${block.slot}`,
      requirementId: requirements?.[0] ?? null,
    });
    if (!ids?.length) return;
    if (
      model.blockHasData(block) &&
      !confirm('This position already has sets logged. Replacing the exercise clears them. Continue?')
    ) {
      return;
    }
    model.replaceBlockExercises(day, block.id, ids);
    toast(`Now ${ids.map(catalog.name).join(' + ')}`);
    save();
  };

  return el(
    'div',
    { class: `card${isSuperset ? ' superset' : ''}` },
    el(
      'div',
      { class: 'position' },
      // Colon rides with the slot name so the flex gap can't split it off.
      expectation ? `${block.slot}:` : block.slot,
      expectation ? el('span', { class: 'expectation' }, expectation) : null,
      isSuperset ? el('span', { class: 'superset-tag' }, 'Superset') : null
    ),
    ...block.exercises.map((entry, index) =>
      renderEntry(day, block, entry, index, isSuperset, saveQuietly)
    ),
    el(
      'div',
      { class: 'row-actions' },
      el(
        'button',
        {
          class: 'btn sm',
          onclick: () => {
            model.addSet(day, block.id);
            save();
          },
        },
        '+ Set'
      ),
      el(
        'button',
        {
          class: 'btn sm',
          onclick: () => {
            model.removeSet(day, block.id);
            save();
          },
        },
        '− Set'
      ),
      el('span', { style: 'flex:1' }),
      el('button', { class: 'btn sm', onclick: change }, 'Change'),
      el(
        'button',
        {
          class: 'btn sm',
          onclick: () => {
            model.removeBlock(day, block.id);
            save();
          },
        },
        'Remove'
      )
    )
  );
}

function renderEntry(day, block, entry, index, isSuperset, saveQuietly) {
  const exercise = catalog.get(entry.exerciseId);
  const last = history.lastPerformance(entry.exerciseId, day);
  const favorite = store.isFavorite(entry.exerciseId);

  const star = el(
    'button',
    {
      class: `iconbtn star${favorite ? ' on' : ''}`,
      'aria-label': favorite ? 'Unfavorite' : 'Favorite',
      onclick: (event) => {
        const on = store.toggleFavorite(entry.exerciseId);
        event.currentTarget.classList.toggle('on', on);
        event.currentTarget.textContent = on ? '★' : '☆';
      },
    },
    favorite ? '★' : '☆'
  );

  return el(
    'div',
    { class: 'leg' },
    el(
      'div',
      { class: 'block-head' },
      el(
        'div',
        {},
        isSuperset ? el('span', { class: 'leg-marker' }, String.fromCharCode(65 + index)) : null,
        el(
          'a',
          { class: 'exercise-link', href: `#/exercise/${encodeURIComponent(entry.exerciseId)}` },
          entry.label
        ),
        // What this pick actually trains, so the expectation can be judged.
        exercise ? el('span', { class: 'muscles' }, catalog.muscleLine(exercise)) : null
      ),
      star
    ),
    el(
      'p',
      { class: 'lasttime' },
      last
        ? `Last time (${last.day.date}): ${history.formatSets(last.sets)}`
        : 'Last time: none'
    ),
    exercise ? null : el('p', { class: 'faint' }, 'Not in the exercise database.'),
    renderSetTable(entry, saveQuietly)
  );
}

function renderSetTable(entry, saveQuietly) {
  const cell = (setIndex, field, placeholder) =>
    el('td', {}, [
      el('input', {
        // Free text, not numeric: real entries include "10/limb", "Blue box 18\"".
        type: 'text',
        value: entry.sets[setIndex][field] ?? '',
        placeholder,
        'aria-label': `Set ${setIndex + 1} ${field}`,
        oninput: (event) => {
          entry.sets[setIndex][field] = event.target.value;
          saveQuietly();
        },
      }),
    ]);

  return el(
    'table',
    { class: 'sets' },
    el(
      'thead',
      {},
      el('tr', {}, el('th', {}, 'Set'), el('th', {}, 'Reps'), el('th', {}, 'Weight'))
    ),
    el(
      'tbody',
      {},
      entry.sets.map((_, index) =>
        el(
          'tr',
          {},
          el('td', { class: 'n' }, String(index + 1)),
          cell(index, 'reps', '—'),
          cell(index, 'weight', '—')
        )
      )
    )
  );
}

function renderNotes(day, saveQuietly) {
  const area = el('textarea', {
    rows: 4,
    placeholder: 'Recovery, modifications, wins…',
    style:
      'width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-input);color:var(--text);font:inherit;font-size:16px',
    oninput: (event) => {
      day.notes = event.target.value;
      saveQuietly();
    },
  });
  area.value = day.notes ?? '';

  return frag(el('h2', {}, 'Notes'), area);
}

// ------------------------------------------------------------------ controls

function checkbox(checked, onToggle) {
  return el(
    'button',
    {
      class: 'check-box',
      role: 'checkbox',
      'aria-checked': String(checked),
      onclick: onToggle,
    },
    '✓'
  );
}
