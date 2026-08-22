/**
 * GitHub-style contribution calendar over logged sessions.
 *
 * Columns are weeks, rows are weekdays, and a cell's shade comes from how much
 * was logged that day. Streaks read as unbroken horizontal runs, which is the
 * whole point of the layout.
 */

import { el, clear } from '../dom.js';
import * as history from '../history.js';
import { iso, parseISO, addDays, daysBetween, indexByDate, streaks } from '../stats.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-based weekday index, so weeks read Mon→Sun like the program does. */
const weekdayIndex = (date) => (date.getDay() + 6) % 7;

const RANGES = [
  { id: '30', label: '30 days', days: 30 },
  { id: '180', label: '6 months', days: 180 },
  { id: '365', label: '365 days', days: 365 },
];

// Survives rerenders so toggling the range then starring something elsewhere
// doesn't snap it back.
const state = { range: '180' };

/** Four shades, split on set count. Any logged work earns at least level 1. */
function level(record) {
  if (!record) return 0;
  if (!record.sets) return record.rest ? -1 : 1;
  if (record.sets >= 25) return 4;
  if (record.sets >= 15) return 3;
  if (record.sets >= 6) return 2;
  return 1;
}

export function render({ rerender }) {
  const byDate = indexByDate();
  const gridNode = el('div', { class: 'heat-wrap' });
  const statsNode = el('div', { class: 'heat-stats' });

  const rangeButtons = el(
    'div',
    { class: 'segmented', role: 'tablist' },
    RANGES.map((range) =>
      el(
        'button',
        {
          role: 'tab',
          dataset: { range: range.id },
          'aria-selected': String(range.id === state.range),
          onclick: () => {
            state.range = range.id;
            for (const button of rangeButtons.children)
              button.setAttribute('aria-selected', String(button.dataset.range === range.id));
            paint();
          },
        },
        range.label
      )
    )
  );

  function paint() {
    const range = RANGES.find((candidate) => candidate.id === state.range) ?? RANGES[1];
    const end = parseISO(history.todayISO());

    // Start on the Monday of the week containing the first day in range, so
    // every column is a whole week and row index === weekday.
    const rawStart = addDays(end, -(range.days - 1));
    const start = addDays(rawStart, -weekdayIndex(rawStart));
    const weeks = Math.ceil((daysBetween(start, end) + 1) / 7);

    const grid = el('div', {
      class: 'heat-grid',
      style: `grid-template-columns: repeat(${weeks}, 1fr)`,
      role: 'img',
      'aria-label': `Sessions over the past ${range.label}`,
    });

    const months = el('div', {
      class: 'heat-months',
      style: `grid-template-columns: repeat(${weeks}, 1fr)`,
    });

    let lastMonth = null;
    for (let week = 0; week < weeks; week++) {
      const monday = addDays(start, week * 7);
      const month = monday.getMonth();
      const isNew = month !== lastMonth && monday <= end;
      months.append(
        el(
          'span',
          { class: 'heat-month' },
          isNew ? monday.toLocaleString('en-US', { month: 'short' }) : ''
        )
      );
      if (isNew) lastMonth = month;
    }

    // Column-major: fill each week top to bottom before moving right.
    for (let week = 0; week < weeks; week++) {
      for (let row = 0; row < 7; row++) {
        const date = addDays(start, week * 7 + row);
        if (date > end || date < rawStart) {
          grid.append(el('span', { class: 'heat-cell out' }));
          continue;
        }

        const key = iso(date);
        const record = byDate.get(key);
        const shade = level(record);
        const label = record
          ? `${history.prettyDate(key)} — ${record.rest ? 'rest day' : `${record.sets} sets`}`
          : `${history.prettyDate(key)} — nothing logged`;

        const cell = record
          ? el('a', {
              class: `heat-cell l${shade < 0 ? 'r' : shade}`,
              href: `#/day/${encodeURIComponent(record.keys[0])}`,
              title: label,
              'aria-label': label,
            })
          : el('span', { class: 'heat-cell l0', title: label });

        grid.append(cell);
      }
    }

    // The most recent weeks are the ones worth seeing first; a year of columns
    // overflows a phone, so open the scroller at its right edge.
    const scroller = el(
      'div',
      { class: 'heat-scroll' },
      el('div', { class: 'heat-body' }, months, grid)
    );

    // Weekday labels sit outside the scroller so they stay put while the
    // weeks slide underneath them.
    const labels = el(
      'div',
      { class: 'heat-days' },
      WEEKDAYS.map((name, index) => el('span', { class: 'heat-day' }, index % 2 ? name : ''))
    );

    clear(gridNode).append(
      el('div', { class: 'heat-outer' }, labels, scroller),
      renderLegend()
    );
    requestAnimationFrame(() => {
      scroller.scrollLeft = scroller.scrollWidth;
    });

    const { current, longest, trained } = streaks(byDate, range.days, end);
    clear(statsNode).append(
      stat(current, 'day streak'),
      stat(longest, 'longest'),
      stat(trained, `sessions in ${range.label}`)
    );
  }

  paint();

  return el(
    'section',
    { class: 'heatmap' },
    rangeButtons,
    gridNode,
    statsNode
  );
}

function stat(value, label) {
  return el(
    'div',
    { class: 'heat-stat' },
    el('strong', {}, String(value)),
    el('span', {}, label)
  );
}

function renderLegend() {
  return el(
    'div',
    { class: 'heat-legend' },
    el('span', { class: 'heat-cell lr', title: 'Rest day' }),
    el('span', { class: 'legend-text' }, 'rest'),
    el('span', { style: 'flex:1' }),
    el('span', { class: 'legend-text' }, 'less'),
    ...[0, 1, 2, 3, 4].map((shade) => el('span', { class: `heat-cell l${shade}` })),
    el('span', { class: 'legend-text' }, 'more')
  );
}
