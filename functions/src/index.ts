import { initializeApp } from 'firebase-admin/app';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Session } from '@lifting/shared';
import { recomputeAffected, recomputeAll } from './aggregates';

initializeApp();

/**
 * Keep aggregates in sync with any session create/edit/delete. Recompute
 * (not increment) so history edits and deletes are always consistent.
 */
export const onSessionWrite = onDocumentWritten('users/{uid}/sessions/{sessionId}', async (event) => {
  const uid = event.params.uid;
  const before = (event.data?.before?.data() as Session | undefined) ?? null;
  const after = (event.data?.after?.data() as Session | undefined) ?? null;

  // Active-session set logging writes constantly; aggregates only care about
  // transitions into/out of 'completed' and edits while completed.
  const touchesCompleted = before?.status === 'completed' || after?.status === 'completed';
  if (!touchesCompleted) return;

  await recomputeAffected(uid, before, after);
});

/** Full rebuild for the calling user: backfill and repair hatch. */
export const recomputeStats = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return recomputeAll(uid);
});
