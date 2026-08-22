/** Boot and hash routing. Hash routes keep deep links working on GitHub
 *  Pages, which cannot rewrite unknown paths back to index.html. */

import { el, clear, frag } from './dom.js';
import * as catalog from './catalog.js';
import * as store from './store.js';
import * as history from './history.js';
import { openNewDaySheet } from './new-day.js';
import * as todayView from './views/today.js';
import * as logView from './views/log.js';
import * as dayView from './views/day.js';
import * as exercisesView from './views/exercises.js';
import * as exerciseView from './views/exercise.js';

const screen = document.getElementById('screen');
const topbar = document.getElementById('topbar');
const tabbar = document.getElementById('tabbar');

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, ...rest] = raw.split('/');
  return { path: path || 'today', param: rest.map(decodeURIComponent).join('/') };
}

function render() {
  const route = parseRoute();
  const context = { rerender: render };

  clear(screen);
  clear(topbar);

  let tab = route.path;
  let body;

  switch (route.path) {
    case 'log':
      topbar.append(crumb('log'));
      body = logView.render(context);
      break;

    case 'day': {
      const day = store.getDay(route.param);
      tab = 'log';
      if (!day) {
        topbar.append(backButton('#/log'), crumb('log', 'missing'));
        body = el('div', { class: 'empty' }, 'That session no longer exists.');
        break;
      }
      topbar.append(
        backButton('#/log'),
        crumb('log', `${day.date}-${day.dayType}`),
        deleteDayButton(day)
      );
      body = dayView.render(day, context);
      break;
    }

    case 'exercises':
      topbar.append(crumb('exercise-db'));
      body = exercisesView.render(context);
      break;

    case 'exercise':
      tab = 'exercises';
      topbar.append(
        backButton('#/exercises'),
        crumb('exercise-db', catalog.get(route.param)?.name ?? route.param)
      );
      body = exerciseView.render(route.param, context);
      break;

    default:
      tab = 'today';
      topbar.append(
        crumb('lifting', history.todayISO()),
        el('button', { 'aria-label': 'New session', onclick: () => openNewDaySheet() }, '+')
      );
      body = todayView.render(context);
      break;
  }

  screen.append(body);

  for (const link of tabbar.querySelectorAll('a')) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  // scrollIntoView would tuck the heading under the sticky top bar.
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ top bar

function crumb(section, leaf) {
  return el(
    'div',
    { class: 'crumb' },
    section,
    leaf ? frag(' / ', el('strong', {}, leaf)) : null
  );
}

function backButton(href) {
  return el('a', { class: 'iconbtn', href, 'aria-label': 'Back' }, '‹');
}

function deleteDayButton(day) {
  return el(
    'button',
    {
      'aria-label': 'Delete session',
      onclick: () => {
        if (!confirm(`Delete ${day.date} ${day.dayType}?`)) return;
        store.deleteDay(day.key);
        location.hash = '#/log';
      },
    },
    '🗑'
  );
}

// ---------------------------------------------------------------------- boot

async function boot() {
  try {
    await catalog.load();
    await store.init();
  } catch (error) {
    clear(screen).append(
      el('div', { class: 'empty' }, `Could not start: ${error.message}`)
    );
    throw error;
  }

  addEventListener('hashchange', render);
  render();
}

boot();
