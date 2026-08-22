/** The workout log: every session, newest first. */

import { el, frag } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import * as history from '../history.js';
import { openNewDaySheet } from '../new-day.js';

export function render() {
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
      : el('div', { class: 'empty' }, 'No sessions yet.')
  );
}

function row(day) {
  const template = catalog.dayType(day.dayType);
  const names = day.blocks.flatMap((block) => block.exercises.map((entry) => entry.label));
  const setCount = day.blocks
    .flatMap((block) => block.exercises)
    .flatMap((entry) => entry.sets)
    .filter((set) => set.reps !== '' || set.weight !== '').length;

  return el(
    'a',
    { class: 'list-row', href: `#/day/${encodeURIComponent(day.key)}` },
    el(
      'div',
      { class: 'body' },
      el(
        'div',
        { class: 'title' },
        `${day.date} · ${template?.title ?? day.dayType}`
      ),
      el(
        'div',
        { class: 'sub' },
        names.length ? `${setCount} sets · ${names.join(', ')}` : history.prettyDate(day.date)
      )
    ),
    el('span', { class: `pill ${template?.group ?? 'rest'}` }, template?.group ?? '—')
  );
}
