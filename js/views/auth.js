/**
 * Signup and login.
 *
 * These screens work two ways depending on the deployment. Where a Firebase
 * backend is configured they are real — Google or email/password sign-in
 * through Firebase Auth, after which the log syncs across devices. Where none
 * is configured (GitHub Pages, a plain local server) there is nothing to talk
 * to, so they fall back to writing a local profile record and say so plainly.
 */

import { el, frag, toast } from '../dom.js';
import * as store from '../store.js';
import * as history from '../history.js';
import * as cloud from '../cloud.js';

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

function providerButtons(rerender) {
  const live = cloud.isAvailable();

  const onGoogle = async () => {
    if (!live) {
      toast('No backend configured for this deployment');
      return;
    }
    try {
      await cloud.signInWithGoogle();
      location.hash = '#/profile';
      rerender();
    } catch (error) {
      toast(signInMessage(error));
    }
  };

  return frag(
    ...PROVIDERS.map(([name, mark]) =>
      el(
        'button',
        {
          class: 'btn wide',
          type: 'button',
          onclick:
            name === 'Google'
              ? onGoogle
              : () => toast(`${name} sign-in is not configured`),
        },
        el('span', { class: 'provider-mark' }, mark),
        `Continue with ${name}`
      )
    ),
    el('div', { class: 'rule' }, el('span', {}, 'or'))
  );
}

/** Firebase error codes are not for humans. */
function signInMessage(error) {
  const code = String(error?.code ?? '');
  if (code.includes('popup-closed')) return 'Sign-in cancelled';
  if (code.includes('invalid-credential') || code.includes('wrong-password'))
    return 'That email and password do not match';
  if (code.includes('email-already-in-use')) return 'That email already has an account';
  if (code.includes('weak-password')) return 'Password needs at least 6 characters';
  if (code.includes('network')) return 'Cannot reach the server';
  return error?.message ?? 'Sign-in failed';
}

function backendNotice() {
  return cloud.isAvailable()
    ? el(
        'p',
        { class: 'mock-note' },
        'Signing in syncs your log, favorites and custom exercises across devices. Your data stays private to your account.'
      )
    : el(
        'p',
        { class: 'mock-note' },
        'This deployment has no backend configured, so sign-in is a mockup: nothing you type is sent anywhere, and the password field is never read or stored. The app works fully offline either way.'
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

  const submit = async (event) => {
    event.preventDefault();
    const address = email.input.value.trim();
    if (!address) {
      toast('Enter an email to continue');
      return;
    }

    if (cloud.isAvailable()) {
      try {
        await cloud.signInWithEmail(address, password.input.value);
      } catch (error) {
        toast(signInMessage(error));
        return;
      }
    } else {
      store.saveProfile({
        name: address.split('@')[0],
        email: address,
        units: 'lb',
        since: history.todayISO(),
      });
    }

    location.hash = '#/profile';
    rerender();
  };

  return frag(
    el('div', { class: 'auth' }, [
      el('div', { class: 'auth-mark' }, '🏋️'),
      el('h1', { class: 'auth-title' }, 'Welcome back'),
      el('p', { class: 'auth-sub' }, 'Log in to sync your training log.'),
      providerButtons(rerender),
      el(
        'form',
        { class: 'auth-form', onsubmit: submit },
        email.node,
        password.node,
        el(
          'button',
          { class: 'btn ghost sm', type: 'button', style: 'align-self:flex-end', onclick: () => toast('Password reset is not wired up yet') },
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
      backendNotice(),
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

  const submit = async (event) => {
    event.preventDefault();
    const address = email.input.value.trim();
    if (!address) {
      toast('Enter an email to continue');
      return;
    }
    const displayName = name.input.value.trim() || address.split('@')[0];

    if (cloud.isAvailable()) {
      try {
        await cloud.registerWithEmail(address, password.input.value, displayName);
      } catch (error) {
        toast(signInMessage(error));
        return;
      }
    }

    // Units are a local preference either way; the account itself carries no
    // training data of its own.
    store.saveProfile({
      ...(store.getProfile() ?? {}),
      name: displayName,
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
      providerButtons(rerender),
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
      backendNotice(),
    ])
  );
}
