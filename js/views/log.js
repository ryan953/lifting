/** The workout log: every session, newest first. */

import { el, frag } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import * as history from '../history.js';
import * as model from '../day-model.js';
import { openNewDaySheet } from '../new-day.js';

export function render(context) {
  const days = store.allDays();

  return frag(
    el('h1', {}, 'Log'),
    el(
      'button',
      { class: 'btn primary wide', style: 'margin:8px 0 18px', onclick: () => openNewDaySheet() },
      '+ New session'
    ),
    days.length
      ? el('div', { class: 'list' }, days.map(row))
      : el('div', { class: 'empty' }, 'No sessions yet.'),
    renderReset(context)
  );
}

/** Demo escape hatch: drop everything and reload the vault export. */
function renderReset({ rerender }) {
  return el(
    'button',
    {
      class: 'btn ghost wide',
      style: 'margin-top:24px',
      onclick: async () => {
        if (!confirm('Delete all sessions, favorites and supersets, then reload the sample history?')) return;
        await store.reset();
        rerender();
      },
    },
    'Reset demo data'
  );
}

function row(day) {
  const template = catalog.dayType(day.dayType);
  const setCount = model.loggedSetCount(day);
  const accessories = model.accessoryLabels(day);

  // Date, then how much was logged, then the accessories by name — the title
  // already names the main lift and counts them.
  const detail = [
    history.prettyDate(day.date),
    setCount ? `${setCount} sets` : null,
    accessories.length ? accessories.join(', ') : null,
  ].filter(Boolean);

  return el(
    'a',
    { class: 'list-row', href: `#/day/${encodeURIComponent(day.key)}` },
    el(
      'div',
      { class: 'body' },
      el('div', { class: 'title' }, model.summarize(day)),
      el('div', { class: 'sub' }, detail.join(' · '))
    ),
    el('span', { class: `pill ${template?.group ?? 'rest'}` }, template?.group ?? '—')
  );
}
