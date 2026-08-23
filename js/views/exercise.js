/** One exercise from the database, plus everything I've logged against it. */

import { el, frag, toast } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import * as history from '../history.js';
import * as model from '../day-model.js';
import { openNewDaySheet } from '../new-day.js';

export function render(exerciseId, { rerender }) {
  const exercise = catalog.get(exerciseId);
  if (!exercise) {
    return frag(
      el('h1', {}, 'Unknown exercise'),
      el('p', { class: 'muted' }, exerciseId),
      el('a', { class: 'btn', href: '#/exercises' }, 'Back to exercises')
    );
  }

  const favorite = store.isFavorite(exercise.id);
  const star = el(
    'button',
    {
      class: `btn${favorite ? '' : ' ghost'}`,
      onclick: () => {
        store.toggleFavorite(exercise.id);
        rerender();
      },
    },
    favorite ? '★ Favorited' : '☆ Favorite'
  );

  return frag(
    el('h1', {}, exercise.name),
    el(
      'div',
      { class: 'row-actions', style: 'margin-bottom:14px;flex-wrap:wrap' },
      star,
      el('button', { class: 'btn', onclick: () => addToToday(exercise) }, '+ Add to session'),
      exercise.custom
        ? el('a', { class: 'btn', href: `#/edit-exercise/${encodeURIComponent(exercise.id)}` }, 'Edit')
        : null
    ),

    renderMeta(exercise),
    renderPattern(exercise),
    renderImages(exercise),

    exercise.instructions.length
      ? frag(
          el('h2', {}, 'Instructions'),
          el('ol', { class: 'steps' }, exercise.instructions.map((step) => el('li', {}, step)))
        )
      : null,

    renderHistory(exercise),
    renderSimilar(exercise)
  );
}

function renderMeta(exercise) {
  const rows = [
    ['Force', exercise.force],
    ['Level', exercise.level],
    ['Mechanic', exercise.mechanic],
    ['Equipment', exercise.equipment],
    ['Category', exercise.category],
    ['Primary', exercise.primary.join(', ')],
    ['Secondary', exercise.secondary.join(', ')],
  ].filter(([, value]) => value);

  return el(
    'dl',
    { class: 'meta-grid' },
    rows.flatMap(([label, value]) => [el('dt', {}, label), el('dd', {}, value)])
  );
}

/**
 * What one set of this exercise contains, and how many there are.
 *
 * `phases` describes the circuit inside a single set — the four 30-second
 * moves of a SkiErg set. `template` × `rounds` is what actually gets logged.
 * They are different questions, so a plain lift with neither shows nothing.
 */
function renderPattern(exercise) {
  const phases = exercise.phases ?? [];
  const template = exercise.template ?? [];
  if (!phases.length && !template.length) return null;

  const rounds = Math.max(1, exercise.rounds ?? 1);
  const sets = Math.max(template.length, 1) * rounds;
  const rows = phases.length ? phases : template;
  const [first, second] = phases.length ? ['Time', 'Move'] : catalog.columnsFor(exercise);

  return frag(
    el('h2', {}, 'Pattern'),
    el(
      'p',
      { class: 'muted', style: 'margin-top:0' },
      phases.length
        ? `${sets} sets. One set is ${phases.length} moves in sequence:`
        : `${sets} set${sets === 1 ? '' : 's'}.`
    ),
    el(
      'table',
      { class: 'sets' },
      el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, first), el('th', {}, second))),
      el(
        'tbody',
        {},
        rows.map((row, index) =>
          el(
            'tr',
            {},
            el('td', { class: 'n' }, String(index + 1)),
            el('td', { style: 'padding:8px' }, row[0] ?? ''),
            el('td', { style: 'padding:8px' }, row[1] ?? '')
          )
        )
      )
    )
  );
}

function renderImages(exercise) {
  if (!exercise.images.length) return null;
  return el(
    'div',
    { class: 'shots' },
    exercise.images.slice(0, 2).map((_, index) =>
      el('img', {
        src: catalog.imageUrl(exercise, index),
        alt: `${exercise.name}, position ${index + 1}`,
        loading: 'lazy',
        onerror: (event) => event.target.remove(),
      })
    )
  );
}

function renderHistory(exercise) {
  const performances = history.performances(exercise.id);
  if (!performances.length) {
    return frag(
      el('h2', {}, 'My history'),
      el('div', { class: 'empty' }, 'Never logged.')
    );
  }

  return frag(
    el('h2', {}, 'My history'),
    el(
      'div',
      { class: 'list' },
      performances.slice(0, 20).map((performance) =>
        el(
          'a',
          { class: 'list-row', href: `#/day/${encodeURIComponent(performance.day.key)}` },
          el(
            'div',
            { class: 'body' },
            el('div', { class: 'title' }, history.formatSets(performance.sets)),
            el(
              'div',
              { class: 'sub' },
              `${performance.day.date} · ${catalog.dayType(performance.day.dayType)?.title ?? ''} · ${performance.block.slot}`
            )
          )
        )
      )
    )
  );
}

function renderSimilar(exercise) {
  const others = catalog.similar(exercise);
  if (!others.length) return null;

  return frag(
    el('h2', {}, 'Similar / replacement'),
    el(
      'div',
      { class: 'list' },
      others.map((other) =>
        el(
          'a',
          { class: 'list-row', href: `#/exercise/${encodeURIComponent(other.id)}` },
          el(
            'div',
            { class: 'body' },
            el('div', { class: 'title' }, other.name),
            el('div', { class: 'sub' }, catalog.subtitle(other))
          )
        )
      )
    )
  );
}

/** Drop this exercise into today's session, starting one if needed. */
function addToToday(exercise) {
  const today = history.todayISO();
  const days = store.allDays().filter((day) => day.date === today);

  if (days.length !== 1) {
    toast(days.length ? 'Pick which session to add to.' : 'Start a session first.');
    openNewDaySheet(today);
    return;
  }

  const day = days[0];
  const slot = model.nextOpenSlot(day);
  model.addBlock(day, [exercise.id], slot);
  store.putDay(day);
  toast(`Added to ${slot}`);
  location.hash = `#/day/${encodeURIComponent(day.key)}`;
}
