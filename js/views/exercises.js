/** Browse the exercise database: search, facet filters, favorite. */

import { el, frag, clear } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import * as history from '../history.js';

/**
 * Every filterable property. Values are read off the catalog rather than
 * hardcoded, so a rebuilt database can't leave the filters behind.
 *
 * `muscle` is deliberately one list covering both primary and secondary: you
 * usually want "anything that trains triceps", not "anything whose *primary*
 * is triceps". Results then say which role the muscle played.
 */
const FACETS = [
  { key: 'force', label: 'Force' },
  { key: 'mechanic', label: 'Mechanic' },
  { key: 'level', label: 'Level' },
  { key: 'category', label: 'Category' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'muscle', label: 'Muscles' },
];

// Kept across rerenders so starring an exercise never drops your search.
const state = {
  query: '',
  scope: 'all',
  filters: Object.fromEntries(FACETS.map((facet) => [facet.key, new Set()])),
  panelOpen: false,
};

const activeCount = () =>
  FACETS.reduce((total, facet) => total + state.filters[facet.key].size, 0);

function matchesFilters(exercise) {
  for (const facet of FACETS) {
    const chosen = state.filters[facet.key];
    if (!chosen.size) continue;

    if (facet.key === 'muscle') {
      const trained = [...exercise.primary, ...exercise.secondary];
      if (!trained.some((muscle) => chosen.has(muscle))) return false;
    } else if (!chosen.has(exercise[facet.key])) {
      return false;
    }
  }
  return true;
}

export function render() {
  const listNode = el('div', { class: 'list' });
  const countNode = el('div', { class: 'count' });
  const panelNode = el('div', { class: 'facets', hidden: !state.panelOpen });
  const toggleNode = el('button', { class: 'btn sm', onclick: togglePanel });

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
    ['mine', 'Mine'],
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

  // ------------------------------------------------------------ filter panel

  function togglePanel() {
    state.panelOpen = !state.panelOpen;
    panelNode.hidden = !state.panelOpen;
    paintToggle();
  }

  function paintToggle() {
    const count = activeCount();
    clear(toggleNode).append(
      `${state.panelOpen ? 'Hide' : 'Filter'}${count ? ` · ${count}` : ''}`
    );
  }

  function buildPanel() {
    clear(panelNode).append(
      ...FACETS.map((facet) =>
        el(
          'div',
          { class: 'facet' },
          el('div', { class: 'slot-label' }, facet.label),
          el(
            'div',
            { class: 'chips' },
            catalog.values(facet.key).map((value) =>
              el(
                'button',
                {
                  class: 'chip',
                  'aria-pressed': String(state.filters[facet.key].has(value)),
                  onclick: (event) => {
                    const chosen = state.filters[facet.key];
                    if (chosen.has(value)) chosen.delete(value);
                    else chosen.add(value);
                    event.currentTarget.setAttribute('aria-pressed', String(chosen.has(value)));
                    paintToggle();
                    paint();
                  },
                },
                value
              )
            )
          )
        )
      ),
      el(
        'button',
        {
          class: 'btn sm',
          style: 'margin-top:4px',
          onclick: () => {
            for (const facet of FACETS) state.filters[facet.key].clear();
            buildPanel();
            paintToggle();
            paint();
          },
        },
        'Clear filters'
      )
    );
  }

  // ------------------------------------------------------------------ lists

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
    } else if (state.scope === 'mine') {
      pool = pool.filter((exercise) => exercise.custom);
    }

    pool = pool.filter(matchesFilters);

    const results = state.query ? catalog.search(state.query, pool) : pool;
    const shown = results.slice(0, 150);
    const highlight = state.filters.muscle;

    clear(countNode).append(
      `${results.length} exercise${results.length === 1 ? '' : 's'}` +
        (shown.length < results.length ? ` · showing first ${shown.length}` : '')
    );

    clear(listNode).append(
      shown.length
        ? frag(...shown.map((exercise) => exerciseRow(exercise, highlight)))
        : el(
            'div',
            { class: 'empty' },
            state.scope === 'favorites'
              ? 'No favorites yet — tap a ☆ to add one.'
              : state.scope === 'mine'
                ? 'No exercises of your own yet — use + New exercise above.'
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

    // Same movement repeated is a drop set; name it as one rather than
    // printing "Dips + Dips".
    const unique = new Set(record.exerciseIds);
    const title =
      unique.size === 1
        ? `${catalog.name(record.exerciseIds[0])} ×${record.exerciseIds.length}`
        : record.exerciseIds.map(catalog.name).join('  +  ');
    const kind = unique.size === 1 ? 'Drop set' : 'Superset';

    return el(
      'div',
      { class: 'list-row' },
      el(
        'div',
        { class: 'body' },
        el('div', { class: 'title' }, title),
        el(
          'div',
          { class: 'sub' },
          [kind, record.favorite ? 'saved' : null, record.date ? `last used ${record.date}` : null]
            .filter(Boolean)
            .join(' · ')
        )
      ),
      star
    );
  }

  buildPanel();
  paintToggle();
  paint();

  return frag(
    el('h1', {}, 'Exercises'),
    el('a', { class: 'btn wide', href: '#/new-exercise' }, '+ New exercise'),
    el(
      'div',
      { class: 'searchbar' },
      searchInput,
      segmented,
      el(
        'div',
        { class: 'filter-bar' },
        toggleNode,
        el('span', { class: 'legend' }, 'muscles: primary | secondary')
      ),
      panelNode
    ),
    countNode,
    listNode
  );
}

/** Muscles as nodes so primary and secondary stay visually distinct, and a
 *  muscle you filtered on is called out in whichever role it plays here. */
function muscleNodes(exercise, highlight) {
  const part = (muscle, role) =>
    el(
      'span',
      { class: `m ${role}${highlight?.has(muscle) ? ' hit' : ''}` },
      muscle
    );

  const primary = exercise.primary.map((muscle) => part(muscle, 'primary'));
  const secondary = exercise.secondary.map((muscle) => part(muscle, 'secondary'));

  const joined = (nodes) =>
    nodes.flatMap((node, index) => (index ? [', ', node] : [node]));

  return frag(
    ...joined(primary),
    secondary.length ? el('span', { class: 'sep' }, ' | ') : null,
    ...joined(secondary)
  );
}

function exerciseRow(exercise, highlight) {
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
      el(
        'div',
        { class: 'title' },
        exercise.name,
        exercise.custom ? el('span', { class: 'mine' }, 'mine') : null
      ),
      el(
        'div',
        { class: 'sub' },
        exercise.equipment ? el('span', { class: 'kit' }, `${exercise.equipment} · `) : null,
        muscleNodes(exercise, highlight)
      )
    ),
    star
  );
}
