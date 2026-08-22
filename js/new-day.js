/** The "start a session" sheet: pick a date and one of the day templates. */

import { el, frag, toast } from './dom.js';
import * as catalog from './catalog.js';
import * as store from './store.js';
import * as history from './history.js';
import * as model from './day-model.js';
import { openSheet } from './sheet.js';

export function openNewDaySheet(defaultDate = history.todayISO()) {
  const dateInput = el('input', {
    type: 'date',
    value: defaultDate,
    style:
      'width:100%;min-height:44px;padding:0 12px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-input);color:var(--text);font:inherit;font-size:16px',
  });

  const start = (dayTypeId) => {
    const date = dateInput.value || defaultDate;
    const key = store.dayKey(date, dayTypeId);

    if (store.getDay(key)) {
      toast('That session already exists — opening it.');
    } else {
      store.putDay(model.createDay(date, dayTypeId));
    }

    controls.close();
    location.hash = `#/day/${encodeURIComponent(key)}`;
  };

  const controls = openSheet({
    title: 'New session',
    body: frag(
      el('label', { class: 'slot-label', style: 'display:block;margin-bottom:6px' }, 'Date'),
      dateInput,
      el('h3', { style: 'margin:18px 0 8px' }, 'Template'),
      el(
        'div',
        { class: 'list' },
        catalog.prog().dayTypes.map((template) =>
          el(
            'button',
            {
              class: 'list-row',
              style: 'text-align:left;width:100%;cursor:pointer',
              onclick: () => start(template.id),
            },
            el(
              'div',
              { class: 'body' },
              el('div', { class: 'title' }, template.title),
              el(
                'div',
                { class: 'sub' },
                template.movements.length
                  ? template.movements.map((m) => m.name).join(' · ')
                  : 'Nothing scheduled'
              )
            ),
            el('span', { class: `pill ${template.group}` }, template.group)
          )
        )
      )
    ),
  });
}
