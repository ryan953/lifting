/**
 * Signup and login screens.
 *
 * These are mockups. There is no server, no account and no session: submitting
 * writes a local profile record and nothing leaves the browser. The password
 * fields exist so the layout is honest about what a real form would ask for;
 * their values are never read, stored or transmitted.
 */

import { el, frag, toast } from '../dom.js';
import * as store from '../store.js';
import * as history from '../history.js';

const PROVIDERS = [
  ['Apple', '\u{f8ff}'],
  ['Google', 'G'],
];

function field({ label, type = 'text', name, placeholder, autocomplete, value = '' }) {
  const input = el('input', {
    type,
    name,
    placeholder,
    autocomplete,
    value,
    id: `field-${name}`,
    class: 'field-input',
  });
  return {
    input,
    node: el(
      'label',
      { class: 'field', for: `field-${name}` },
      el('span', { class: 'field-label' }, label),
      input
    ),
  };
}

function providerButtons() {
  return frag(
    ...PROVIDERS.map(([name, mark]) =>
      el(
        'button',
        {
          class: 'btn wide',
          type: 'button',
          onclick: () => toast(`${name} sign-in is not wired up in this prototype`),
        },
        el('span', { class: 'provider-mark' }, mark),
        `Continue with ${name}`
      )
    ),
    el('div', { class: 'rule' }, el('span', {}, 'or'))
  );
}

function mockNotice() {
  return el(
    'p',
    { class: 'mock-note' },
    'Prototype — there is no server. Nothing you type is sent anywhere, and the password field is never read or stored.'
  );
}

export function renderLogin({ rerender }) {
  const email = field({
    label: 'Email',
    type: 'email',
    name: 'email',
    placeholder: 'you@example.com',
    autocomplete: 'email',
  });
  const password = field({
    label: 'Password',
    type: 'password',
    name: 'password',
    placeholder: '••••••••',
    autocomplete: 'current-password',
  });

  const submit = (event) => {
    event.preventDefault();
    const address = email.input.value.trim();
    if (!address) {
      toast('Enter an email to continue');
      return;
    }
    store.saveProfile({
      name: address.split('@')[0],
      email: address,
      units: 'lb',
      since: history.todayISO(),
    });
    location.hash = '#/profile';
    rerender();
  };

  return frag(
    el('div', { class: 'auth' }, [
      el('div', { class: 'auth-mark' }, '🏋️'),
      el('h1', { class: 'auth-title' }, 'Welcome back'),
      el('p', { class: 'auth-sub' }, 'Log in to sync your training log.'),
      providerButtons(),
      el(
        'form',
        { class: 'auth-form', onsubmit: submit },
        email.node,
        password.node,
        el(
          'button',
          { class: 'btn ghost sm', type: 'button', style: 'align-self:flex-end', onclick: () => toast('Password reset is not wired up in this prototype') },
          'Forgot password?'
        ),
        el('button', { class: 'btn primary wide', type: 'submit' }, 'Log in')
      ),
      el(
        'p',
        { class: 'auth-alt' },
        'New here? ',
        el('a', { href: '#/signup' }, 'Create an account')
      ),
      mockNotice(),
    ])
  );
}

export function renderSignup({ rerender }) {
  const name = field({
    label: 'Name',
    name: 'name',
    placeholder: 'Ryan',
    autocomplete: 'name',
  });
  const email = field({
    label: 'Email',
    type: 'email',
    name: 'email',
    placeholder: 'you@example.com',
    autocomplete: 'email',
  });
  const password = field({
    label: 'Password',
    type: 'password',
    name: 'password',
    placeholder: 'At least 8 characters',
    autocomplete: 'new-password',
  });

  let units = 'lb';
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
          'aria-selected': String(value === units),
          onclick: (event) => {
            units = value;
            for (const button of event.currentTarget.parentElement.children)
              button.setAttribute('aria-selected', String(button.dataset.unit === value));
          },
        },
        value
      )
    )
  );

  const submit = (event) => {
    event.preventDefault();
    const address = email.input.value.trim();
    if (!address) {
      toast('Enter an email to continue');
      return;
    }
    store.saveProfile({
      name: name.input.value.trim() || address.split('@')[0],
      email: address,
      units,
      since: history.todayISO(),
    });
    location.hash = '#/profile';
    rerender();
  };

  return frag(
    el('div', { class: 'auth' }, [
      el('div', { class: 'auth-mark' }, '🏋️'),
      el('h1', { class: 'auth-title' }, 'Create your account'),
      el('p', { class: 'auth-sub' }, 'Keep your log, favorites and templates in one place.'),
      providerButtons(),
      el(
        'form',
        { class: 'auth-form', onsubmit: submit },
        name.node,
        email.node,
        password.node,
        el(
          'div',
          { class: 'field' },
          el('span', { class: 'field-label' }, 'Units'),
          unitToggle
        ),
        el('button', { class: 'btn primary wide', type: 'submit' }, 'Create account')
      ),
      el(
        'p',
        { class: 'auth-alt' },
        'Already have an account? ',
        el('a', { href: '#/login' }, 'Log in')
      ),
      mockNotice(),
    ])
  );
}
