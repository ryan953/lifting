/** Today: the session in progress, or a prompt to start one. */

import { el, frag } from '../dom.js';
import * as catalog from '../catalog.js';
import * as store from '../store.js';
import * as history from '../history.js';
import { openNewDaySheet } from '../new-day.js';
import * as dayView from './day.js';

export function render(context) {
  const today = history.todayISO();
  const days = store.allDays();
  const current = days.filter((day) => day.date === today);

  if (current.length === 1) return dayView.render(current[0], context);

  if (current.length > 1) {
    return frag(
      el('h1', {}, 'Today'),
      el('p', { class: 'muted' }, `${history.prettyDate(today)} — two sessions logged.`),
      el('div', { class: 'list' }, current.map(sessionRow))
    );
  }

  const recent = days.slice(0, 5);

  return frag(
    el('h1', {}, 'Today'),
    el('p', { class: 'muted' }, history.prettyDate(today)),
    el(
      'div',
      { class: 'empty', style: 'margin:16px 0' },
      'Nothing logged today.'
    ),
    el(
      'button',
      { class: 'btn primary wide', onclick: () => openNewDaySheet(today) },
      '+ Start a session'
    ),
    recent.length
      ? frag(
          el('h2', {}, 'Recent'),
          el('div', { class: 'list' }, recent.map(sessionRow))
        )
      : null
  );
}

function sessionRow(day) {
  const template = catalog.dayType(day.dayType);
  return el(
    'a',
    { class: 'list-row', href: `#/day/${encodeURIComponent(day.key)}` },
    el(
      'div',
      { class: 'body' },
      el('div', { class: 'title' }, template?.title ?? day.dayType),
      el('div', { class: 'sub' }, history.prettyDate(day.date))
    ),
    el('span', { class: `pill ${template?.group ?? 'rest'}` }, template?.group ?? '—')
  );
}
