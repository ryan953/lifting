import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';

function db(uid: string | null) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
}

const validSession = {
  templateId: null,
  templateName: 'Push',
  status: 'active',
  startedAt: Date.now(),
  completedAt: null,
  exercises: [],
  exerciseIds: [],
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lifting',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

describe('user profile', () => {
  it('owner can read and write their profile', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE), { units: 'lb' }));
    await assertSucceeds(getDoc(doc(db(ALICE), 'users', ALICE)));
  });

  it('other users and anonymous are denied', async () => {
    await assertFails(getDoc(doc(db(BOB), 'users', ALICE)));
    await assertFails(setDoc(doc(db(BOB), 'users', ALICE), { units: 'kg' }));
    await assertFails(getDoc(doc(db(null), 'users', ALICE)));
  });
});

describe('owned subcollections', () => {
  it('owner can CRUD exercises and templates', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'exercises', 'e1'), { kind: 'custom', name: 'Bench' }));
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'templates', 't1'), { name: 'Push', exercises: [] }));
  });

  it('cross-user access is denied', async () => {
    await assertFails(setDoc(doc(db(BOB), 'users', ALICE, 'exercises', 'e1'), { kind: 'custom' }));
    await assertFails(getDoc(doc(db(BOB), 'users', ALICE, 'templates', 't1')));
  });
});

describe('sessions', () => {
  it('accepts a well-formed session', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'sessions', 's1'), validSession));
  });

  it('rejects invalid status', async () => {
    await assertFails(
      setDoc(doc(db(ALICE), 'users', ALICE, 'sessions', 's1'), { ...validSession, status: 'paused' }),
    );
  });

  it('rejects non-numeric startedAt', async () => {
    await assertFails(
      setDoc(doc(db(ALICE), 'users', ALICE, 'sessions', 's1'), { ...validSession, startedAt: 'now' }),
    );
  });

  it('rejects non-list exercises', async () => {
    await assertFails(
      setDoc(doc(db(ALICE), 'users', ALICE, 'sessions', 's1'), { ...validSession, exercises: {} }),
    );
  });

  it('owner can update and delete', async () => {
    const ref = doc(db(ALICE), 'users', ALICE, 'sessions', 's1');
    await assertSucceeds(setDoc(ref, validSession));
    await assertSucceeds(updateDoc(ref, { status: 'completed', completedAt: Date.now() }));
  });
});

describe('aggregates are client-read-only', () => {
  it('owner can read but never write', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', ALICE, 'exerciseStats', 'bench'), { lastPerformedAt: 1 });
      await setDoc(doc(ctx.firestore(), 'users', ALICE, 'weeklyStats', '2026-W29'), { sessionCount: 1 });
    });

    await assertSucceeds(getDoc(doc(db(ALICE), 'users', ALICE, 'exerciseStats', 'bench')));
    await assertSucceeds(getDoc(doc(db(ALICE), 'users', ALICE, 'weeklyStats', '2026-W29')));

    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'exerciseStats', 'bench'), { hacked: true }));
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'exerciseStats', 'bench', 'weeks', '2026-W29'), { volumeKg: 1 }));
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'weeklyStats', '2026-W29'), { sessionCount: 99 }));
  });
});
