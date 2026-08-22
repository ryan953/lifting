/** Browse the exercise database: search, filter, favorite. */

import { el, frag, clear } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import * as history from '../history.js';

const MUSCLES = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'lats',
  'middle back',
  'lower back',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'abdominals',
];

// Kept across rerenders so starring an exercise never drops your search.
const state = {
  query: '',
  scope: 'all',
  muscles: new Set(),
};

export function render() {
  const listNode = el('div', { class: 'list' });
  const countNode = el('div', { class: 'count' });

  const searchInput = el('input', {
    type: 'search',
    value: state.query,
    placeholder: 'Search exercises…',
    'aria-label': 'Search exercises',
    oninput: (event) => {
      state.query = event.target.value;
      paint();
    },
  });

  const scopes = [
    ['all', 'All'],
    ['favorites', '★ Favorites'],
    ['recent', 'Done before'],
    ['supersets', 'Supersets'],
  ];

  const segmented = el(
    'div',
    { class: 'segmented', role: 'tablist' },
    scopes.map(([id, label]) =>
      el(
        'button',
        {
          role: 'tab',
          dataset: { scope: id },
          'aria-selected': String(id === state.scope),
          onclick: () => {
            state.scope = id;
            for (const button of segmented.children)
              button.setAttribute('aria-selected', String(button.dataset.scope === id));
            paint();
          },
        },
        label
      )
    )
  );

  const chips = el(
    'div',
    { class: 'chips' },
    MUSCLES.map((muscle) =>
      el(
        'button',
        {
          class: 'chip',
          'aria-pressed': String(state.muscles.has(muscle)),
          onclick: (event) => {
            if (state.muscles.has(muscle)) state.muscles.delete(muscle);
            else state.muscles.add(muscle);
            event.currentTarget.setAttribute('aria-pressed', String(state.muscles.has(muscle)));
            paint();
          },
        },
        muscle
      )
    )
  );

  function paint() {
    if (state.scope === 'supersets') {
      paintSupersets();
      return;
    }

    let pool = catalog.all();
    if (state.scope === 'favorites') {
      pool = store.favoriteIds().map(catalog.get).filter(Boolean);
    } else if (state.scope === 'recent') {
      pool = history.performedIds().map((record) => catalog.get(record.id)).filter(Boolean);
    }

    if (state.muscles.size) {
      pool = pool.filter((exercise) => exercise.primary.some((m) => state.muscles.has(m)));
    }

    const results = state.query ? catalog.search(state.query, pool) : pool;
    const shown = results.slice(0, 150);

    clear(countNode).append(
      `${results.length} exercise${results.length === 1 ? '' : 's'}` +
        (shown.length < results.length ? ` · showing first ${shown.length}` : '')
    );

    clear(listNode).append(
      shown.length
        ? frag(...shown.map(exerciseRow))
        : el(
            'div',
            { class: 'empty' },
            state.scope === 'favorites'
              ? 'No favorites yet — tap a ☆ to add one.'
              : 'Nothing matches.'
          )
    );
  }

  function paintSupersets() {
    const saved = store.allSupersets();
    const logged = history
      .performedSupersets()
      .filter((record) => !saved.some((existing) => existing.id === record.id));
    const rows = [...saved, ...logged];

    clear(countNode).append(rows.length ? `${rows.length} pairing${rows.length === 1 ? '' : 's'}` : '');
    clear(listNode).append(
      rows.length
        ? frag(...rows.map(supersetRow))
        : el(
            'div',
            { class: 'empty' },
            'No supersets yet. Add two exercises together on a workout day and the pairing is remembered here.'
          )
    );
  }

  function supersetRow(record) {
    const star = el(
      'button',
      {
        class: `iconbtn star${record.favorite ? ' on' : ''}`,
        'aria-label': 'Favorite this superset',
        onclick: () => {
          store.saveSuperset(record.exerciseIds);
          store.toggleSupersetFavorite(record.id);
          paintSupersets();
        },
      },
      record.favorite ? '★' : '☆'
    );

    return el(
      'div',
      { class: 'list-row' },
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'title' }, record.exerciseIds.map(catalog.name).join('  +  ')),
        el('div', { class: 'sub' }, record.favorite ? 'Saved' : `Logged ${record.date ?? ''}`)
      ),
      star
    );
  }

  paint();

  return frag(
    el('h1', {}, 'Exercises'),
    el('div', { class: 'searchbar' }, searchInput, segmented, chips),
    countNode,
    listNode
  );
}

function exerciseRow(exercise) {
  const star = el(
    'button',
    {
      class: `iconbtn star${store.isFavorite(exercise.id) ? ' on' : ''}`,
      'aria-label': `Favorite ${exercise.name}`,
      onclick: (event) => {
        event.preventDefault();
        const on = store.toggleFavorite(exercise.id);
        event.currentTarget.classList.toggle('on', on);
        event.currentTarget.textContent = on ? '★' : '☆';
      },
    },
    store.isFavorite(exercise.id) ? '★' : '☆'
  );

  return el(
    'div',
    { class: 'list-row' },
    el(
      'a',
      {
        class: 'body',
        href: `#/exercise/${encodeURIComponent(exercise.id)}`,
        style: 'color:inherit;text-decoration:none',
      },
      el('div', { class: 'title' }, exercise.name),
      el('div', { class: 'sub' }, catalog.subtitle(exercise))
    ),
    star
  );
}
