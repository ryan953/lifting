/**
 * Profile screen.
 *
 * The training figures are read straight out of the log. The account itself is
 * real where a backend is configured and a local record where none is — see
 * auth.js — so the note at the foot says which of the two you're looking at.
 */

import { el, frag, toast } from '../dom.js';
import * as store from '../store.js';
import * as cloud from '../cloud.js';
import * as history from '../history.js';
import { indexByDate, streaks, totals } from '../stats.js';

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || '?';

export function render({ rerender }) {
  const profile = store.getProfile();
  return profile ? signedIn(profile, rerender) : signedOut();
}

function signedOut() {
  return frag(
    el('h1', {}, 'Profile'),
    el(
      'div',
      { class: 'empty', style: 'margin:16px 0' },
      cloud.isAvailable()
        ? 'Not signed in. Your log lives in this browser until you do — signing in keeps it and syncs it across devices.'
        : 'Not signed in. Your log lives in this browser.'
    ),
    el('a', { class: 'btn primary wide', href: '#/signup' }, 'Create an account'),
    el('a', { class: 'btn wide', href: '#/login', style: 'margin-top:8px' }, 'Log in'),
    el(
      'p',
      { class: 'mock-note' },
      cloud.isAvailable()
        ? 'Signing in never discards what is already here: this browser\'s history is merged into the account.'
        : 'Accounts are a mockup in this deployment — signing in only writes a local record, and everything keeps working signed out.'
    )
  );
}

function signedIn(profile, rerender) {
  const byDate = indexByDate();
  const year = streaks(byDate, 365);
  const lifetime = totals();

  const nameInput = el('input', {
    class: 'field-input',
    value: profile.name,
    id: 'field-name',
    onchange: (event) => {
      store.saveProfile({ ...profile, name: event.target.value.trim() || profile.name });
      rerender();
    },
  });

  const unitToggle = el(
    'div',
    { class: 'segmented', role: 'tablist', 'aria-label': 'Preferred units' },
    ['lb', 'kg'].map((value) =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          dataset: { unit: value },
          'aria-selected': String(value === profile.units),
          onclick: () => {
            store.saveProfile({ ...profile, units: value });
            toast(`Units set to ${value}`);
            rerender();
          },
        },
        value
      )
    )
  );

  return frag(
    el(
      'div',
      { class: 'profile-head' },
      el('div', { class: 'avatar' }, initials(profile.name)),
      el(
        'div',
        { class: 'profile-id' },
        el('h1', {}, profile.name),
        el('p', { class: 'muted' }, profile.email)
      )
    ),

    el('h2', {}, 'Training'),
    el(
      'div',
      { class: 'stat-grid' },
      tile(lifetime.sessions, 'sessions'),
      tile(lifetime.sets, 'sets logged'),
      tile(year.current, 'day streak'),
      tile(year.longest, 'longest streak'),
      tile(lifetime.favorites, 'favorites'),
      tile(lifetime.supersets, 'supersets')
    ),
    lifetime.since
      ? el('p', { class: 'faint', style: 'margin-top:8px' }, `First session ${history.prettyDate(lifetime.since)}`)
      : null,

    el('h2', {}, 'Preferences'),
    el(
      'div',
      { class: 'card' },
      el(
        'label',
        { class: 'field', for: 'field-name' },
        el('span', { class: 'field-label' }, 'Display name'),
        nameInput
      ),
      el(
        'div',
        { class: 'field' },
        el('span', { class: 'field-label' }, 'Units'),
        unitToggle
      )
    ),

    el('h2', {}, 'Account'),
    el(
      'button',
      {
        class: 'btn wide',
        onclick: async () => {
          // Signing out of Firebase drives the local profile clear through the
          // auth listener; without a backend, clear it directly.
          if (cloud.isAvailable()) await cloud.signOut();
          else store.signOut();
          toast('Signed out');
          location.hash = '#/login';
          rerender();
        },
      },
      'Sign out'
    ),
    el(
      'p',
      { class: 'mock-note' },
      cloud.isAvailable()
        ? 'Your log syncs to this account. Changes on another device appear here, and vice versa; edits made offline sync when you reconnect.'
        : 'Mocked account: this deployment has no backend, so nothing leaves the browser and no password is stored. Your training data is unaffected by signing in or out.'
    )
  );
}

function tile(value, label) {
  return el(
    'div',
    { class: 'stat-tile' },
    el('strong', {}, String(value)),
    el('span', {}, label)
  );
}
