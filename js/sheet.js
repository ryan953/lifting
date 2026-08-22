/** Bottom sheets: a generic host plus the exercise picker used to add work
 *  to a day. Picking one exercise makes a normal set; picking two or more
 *  makes a superset. */

import { el, clear, frag } from './dom.js';
import * as catalog from './catalog.js';
import * as store from './store.js';
import * as history from './history.js';

const host = document.getElementById('sheet-host');

export function openSheet({ title, body, footer, onClose }) {
  const close = () => {
    host.hidden = true;
    clear(host);
    document.body.style.overflow = '';
    onClose?.();
  };

  const sheet = el(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el(
      'div',
      { class: 'sheet-head' },
      el('h3', {}, title),
      el('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: close }, '✕')
    ),
    el('div', { class: 'sheet-body' }, body),
    footer ? el('div', { class: 'sheet-foot' }, footer) : null
  );

  clear(host);
  host.append(sheet);
  host.hidden = false;
  document.body.style.overflow = 'hidden';

  host.onclick = (event) => {
    if (event.target === host) close();
  };

  return { close, sheet };
}

/**
 * Resolves with an array of exercise ids, or null if dismissed.
 * `requirementId` narrows the browse tabs to the checklist item being filled.
 */
export function pickExercises({ title = 'Add exercise', requirementId = null } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const picked = [];
    let tab = requirementId ? 'match' : 'favorites';
    let query = '';

    const finish = (value) => {
      if (settled) return;
      settled = true;
      controls.close();
      resolve(value);
    };

    const pickedRow = el('div', { class: 'picked' });
    const listRow = el('div', { class: 'list' });
    const countRow = el('div', { class: 'count' });

    const tabs = [
      requirementId && ['match', 'Matching'],
      ['favorites', '★ Favorites'],
      ['recent', 'Done before'],
      ['supersets', 'Supersets'],
      ['all', 'All'],
    ].filter(Boolean);

    const selectTab = (id) => {
      tab = id;
      for (const button of segmented.children)
        button.setAttribute('aria-selected', String(button.dataset.tab === id));
      renderList();
    };

    const segmented = el(
      'div',
      { class: 'segmented', role: 'tablist' },
      tabs.map(([id, label]) =>
        el(
          'button',
          {
            role: 'tab',
            dataset: { tab: id },
            'aria-selected': String(id === tab),
            onclick: () => selectTab(id),
          },
          label
        )
      )
    );

    const searchInput = el('input', {
      type: 'search',
      placeholder: 'Search all 873 exercises…',
      oninput: (event) => {
        query = event.target.value;
        // Typing means "search everything", not "search inside this tab".
        if (query && tab !== 'all') selectTab('all');
        else renderList();
      },
    });

    // ------------------------------------------------------------- selection

    function togglePick(id) {
      const at = picked.indexOf(id);
      if (at === -1) picked.push(id);
      else picked.splice(at, 1);
      renderPicked();
      renderList();
      renderFooter();
    }

    function renderPicked() {
      clear(pickedRow).append(
        ...picked.map((id) =>
          el(
            'span',
            {},
            catalog.name(id),
            el('button', { 'aria-label': `Remove ${catalog.name(id)}`, onclick: () => togglePick(id) }, '✕')
          )
        )
      );
    }

    // ------------------------------------------------------------------ list

    function exerciseRow(exercise) {
      const chosen = picked.includes(exercise.id);
      return el(
        'button',
        {
          class: 'list-row',
          style: 'text-align:left;width:100%;cursor:pointer',
          onclick: () => togglePick(exercise.id),
        },
        el(
          'div',
          { class: 'body' },
          el('div', { class: 'title' }, exercise.name),
          el('div', { class: 'sub' }, catalog.subtitle(exercise))
        ),
        store.isFavorite(exercise.id) ? el('span', { class: 'star on' }, '★') : null,
        el('span', { class: 'pill', style: chosen ? 'color:var(--accent);border-color:var(--accent-dim)' : '' }, chosen ? 'Added' : '+')
      );
    }

    function supersetRow(record) {
      const names = record.exerciseIds.map(catalog.name);
      return el(
        'button',
        {
          class: 'list-row',
          style: 'text-align:left;width:100%;cursor:pointer',
          onclick: () => finish(record.exerciseIds),
        },
        el(
          'div',
          { class: 'body' },
          el('div', { class: 'title' }, names.join('  +  ')),
          el('div', { class: 'sub' }, record.favorite ? 'Saved superset' : `Last used ${record.date ?? '—'}`)
        ),
        record.favorite ? el('span', { class: 'star on' }, '★') : null
      );
    }

    function poolFor(current) {
      if (current === 'match') {
        const { preferred, rest } = catalog.requirementCandidates(requirementId);
        return [...preferred, ...rest];
      }
      if (current === 'favorites') {
        return store.favoriteIds().map(catalog.get).filter(Boolean);
      }
      if (current === 'recent') {
        return history.performedIds().map((r) => catalog.get(r.id)).filter(Boolean);
      }
      return catalog.all();
    }

    function renderList() {
      if (tab === 'supersets') {
        const saved = store.allSupersets();
        const logged = history
          .performedSupersets()
          .filter((s) => !saved.some((existing) => existing.id === s.id));
        const rows = [...saved, ...logged];
        clear(countRow).append(rows.length ? `${rows.length} pairing${rows.length === 1 ? '' : 's'}` : '');
        clear(listRow).append(
          rows.length
            ? frag(...rows.map(supersetRow))
            : el('div', { class: 'empty' }, 'No supersets yet. Pick two exercises below and add them together.')
        );
        return;
      }

      const pool = poolFor(tab);
      const results = query ? catalog.search(query, pool) : pool;
      const shown = results.slice(0, 120);

      clear(countRow).append(
        results.length
          ? `${results.length} exercise${results.length === 1 ? '' : 's'}${shown.length < results.length ? ` · showing ${shown.length}` : ''}`
          : ''
      );

      clear(listRow).append(
        shown.length
          ? frag(...shown.map(exerciseRow))
          : el(
              'div',
              { class: 'empty' },
              tab === 'favorites'
                ? 'No favorites yet — star exercises from the Exercises tab.'
                : 'Nothing matches.'
            )
      );
    }

    // ---------------------------------------------------------------- footer

    const addButton = el('button', {
      class: 'btn primary',
      onclick: () => picked.length && finish([...picked]),
    });

    function renderFooter() {
      clear(addButton).append(
        picked.length === 0
          ? 'Add'
          : picked.length === 1
            ? 'Add exercise'
            : `Add superset (${picked.length})`
      );
      addButton.disabled = picked.length === 0;
      addButton.style.opacity = picked.length === 0 ? '0.5' : '1';
    }

    const controls = openSheet({
      title,
      body: frag(
        el('div', { class: 'searchbar', style: 'position:static;padding-top:0' }, searchInput),
        segmented,
        pickedRow,
        countRow,
        listRow
      ),
      footer: frag(
        el('button', { class: 'btn', onclick: () => finish(null) }, 'Cancel'),
        addButton
      ),
      onClose: () => finish(null),
    });

    renderPicked();
    renderFooter();
    renderList();
  });
}
