/**
 * Create or edit a custom exercise — anything the shipped database doesn't
 * cover, from a machine at your gym to a named interval circuit.
 *
 * Beyond the usual metadata, an exercise can rename its two set columns and
 * carry an interval template: a list of rows repeated for N rounds. Adding it
 * to a day then arrives pre-filled with the pattern rather than blank.
 */

import { el, frag, clear, toast } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';

const SELECTS = [
  ['equipment', 'Equipment'],
  ['category', 'Category'],
  ['mechanic', 'Mechanic'],
  ['force', 'Force'],
  ['level', 'Level'],
];

function textField(label, value, { placeholder = '', multiline = false } = {}) {
  const input = multiline
    ? el('textarea', { rows: 4, placeholder, class: 'field-input', style: 'padding:10px;min-height:auto' })
    : el('input', { type: 'text', placeholder, class: 'field-input' });
  input.value = value ?? '';
  return { input, node: el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), input) };
}

/** A free-choice select: the catalog's values plus whatever is already set. */
function selectField(label, key, value) {
  const options = catalog.values(key);
  if (value && !options.includes(value)) options.push(value);

  const select = el(
    'select',
    {},
    el('option', { value: '' }, '—'),
    options.map((option) => el('option', { value: option }, option))
  );
  select.value = value ?? '';
  return { select, node: el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), select) };
}

/** Muscle chips, toggled on and off. */
function muscleField(label, chosen) {
  const selected = new Set(chosen);
  const node = el(
    'div',
    { class: 'field' },
    el('span', { class: 'field-label' }, label),
    el(
      'div',
      { class: 'chips wrap' },
      catalog.values('muscle').map((muscle) =>
        el(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': String(selected.has(muscle)),
            onclick: (event) => {
              if (selected.has(muscle)) selected.delete(muscle);
              else selected.add(muscle);
              event.currentTarget.setAttribute('aria-pressed', String(selected.has(muscle)));
            },
          },
          muscle
        )
      )
    )
  );
  return { node, value: () => [...selected] };
}

/** The interval builder: rows of [column one, column two], times N rounds. */
function patternField(exercise, columnInputs) {
  const rows = (exercise?.template ?? []).map((row) => [...row]);
  const listNode = el('div', { class: 'pattern' });

  const roundsInput = el('input', {
    type: 'number',
    min: '1',
    class: 'field-input',
    style: 'max-width:110px',
  });
  roundsInput.value = String(exercise?.rounds ?? 1);

  function paint() {
    clear(listNode).append(
      ...rows.map((row, index) => {
        const first = el('input', { type: 'text', class: 'field-input', placeholder: columnInputs[0].value || 'Reps' });
        const second = el('input', { type: 'text', class: 'field-input', placeholder: columnInputs[1].value || 'Weight' });
        first.value = row[0] ?? '';
        second.value = row[1] ?? '';
        first.oninput = () => (rows[index][0] = first.value);
        second.oninput = () => (rows[index][1] = second.value);

        return el(
          'div',
          { class: 'pattern-row' },
          el('span', { class: 'pattern-n' }, String(index + 1)),
          first,
          second,
          el(
            'button',
            {
              type: 'button',
              class: 'iconbtn',
              'aria-label': `Remove row ${index + 1}`,
              onclick: () => {
                rows.splice(index, 1);
                paint();
              },
            },
            '✕'
          )
        );
      }),
      el(
        'button',
        {
          type: 'button',
          class: 'btn ghost wide sm',
          onclick: () => {
            rows.push(['', '']);
            paint();
          },
        },
        '+ Add phase'
      )
    );
  }

  paint();

  return {
    node: frag(
      el(
        'p',
        { class: 'faint', style: 'font-size:13px;margin:0' },
        'Optional. Give the phases of a circuit and how many times they repeat, and each new logging of this exercise starts pre-filled.'
      ),
      listNode,
      el(
        'label',
        { class: 'field' },
        el('span', { class: 'field-label' }, 'Rounds'),
        roundsInput
      )
    ),
    value: () => rows.filter((row) => row.some((cell) => cell.trim() !== '')),
    rounds: () => Math.max(1, Number(roundsInput.value) || 1),
  };
}

export function render(exerciseId, { rerender }) {
  const existing = exerciseId ? catalog.get(exerciseId) : null;
  const editing = Boolean(existing);

  if (exerciseId && !existing) {
    return frag(
      el('h1', {}, 'Unknown exercise'),
      el('a', { class: 'btn', href: '#/exercises' }, 'Back to exercises')
    );
  }

  const name = textField('Name', existing?.name, { placeholder: 'SkiErg Intervals' });
  const selects = SELECTS.map(([key, label]) => ({
    key,
    ...selectField(label, key, existing?.[key]),
  }));
  const primary = muscleField('Primary muscles', existing?.primary ?? []);
  const secondary = muscleField('Secondary muscles', existing?.secondary ?? []);
  const notes = textField('Notes', (existing?.instructions ?? []).join('\n'), {
    multiline: true,
    placeholder: 'One line per note.',
  });

  const [defaultFirst, defaultSecond] = catalog.columnsFor(existing);
  const columnOne = textField('First column', defaultFirst, { placeholder: 'Reps' });
  const columnTwo = textField('Second column', defaultSecond, { placeholder: 'Weight' });
  const pattern = patternField(existing, [columnOne.input, columnTwo.input]);

  const submit = (event) => {
    event.preventDefault();
    const trimmed = name.input.value.trim();
    if (!trimmed) {
      toast('Give the exercise a name');
      name.input.focus();
      return;
    }

    const saved = store.saveCustom({
      ...(existing ?? {}),
      id: existing?.id,
      name: trimmed,
      ...Object.fromEntries(selects.map(({ key, select }) => [key, select.value || null])),
      primary: primary.value(),
      secondary: secondary.value(),
      instructions: notes.input.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      columns: [
        columnOne.input.value.trim() || 'Reps',
        columnTwo.input.value.trim() || 'Weight',
      ],
      template: pattern.value(),
      rounds: pattern.rounds(),
      images: existing?.images ?? [],
    });

    catalog.reindex(store.allCustom());
    toast(editing ? 'Saved' : `Created ${saved.name}`);
    location.hash = `#/exercise/${encodeURIComponent(saved.id)}`;
    rerender();
  };

  const remove = () => {
    if (!confirm(`Delete ${existing.name}? Sessions that already logged it keep their sets.`)) return;
    store.deleteCustom(existing.id);
    catalog.reindex(store.allCustom());
    toast('Deleted');
    location.hash = '#/exercises';
    rerender();
  };

  return frag(
    el('h1', {}, editing ? `Edit ${existing.name}` : 'New exercise'),
    el(
      'form',
      { class: 'auth-form', style: 'margin-top:12px', onsubmit: submit },
      name.node,
      ...selects.map((entry) => entry.node),
      primary.node,
      secondary.node,
      notes.node,

      el('h2', {}, 'Set tracking'),
      el(
        'p',
        { class: 'faint', style: 'font-size:13px;margin:0' },
        'What the two columns of the set table record. Reps and Weight suit most lifts; a timed circuit is better served by Time and Phase.'
      ),
      columnOne.node,
      columnTwo.node,

      el('h2', {}, 'Interval pattern'),
      pattern.node,

      el('button', { class: 'btn primary wide', type: 'submit', style: 'margin-top:8px' }, editing ? 'Save changes' : 'Create exercise'),
      editing ? el('button', { class: 'btn wide', type: 'button', onclick: remove }, 'Delete exercise') : null
    )
  );
}
