import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Session, UserExercise, MuscleGroup } from '@lifting/shared';
import {
  computeExerciseStats,
  computeExerciseWeek,
  computeWeeklyStats,
  isoWeekKey,
  type MuscleLookup,
  type SessionWithId,
} from '@lifting/shared';

/**
 * Muscle metadata for weekly volume rollups. The static catalog isn't
 * available server-side, so the catalog's muscle map is bundled at build time.
 */
import catalogMuscles from './catalog-muscles.json';

const CATALOG_MUSCLES = catalogMuscles as Record<
  string,
  { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] }
>;

interface AffectedKeys {
  weeks: Set<string>;
  exerciseIds: Set<string>;
}

export function affectedKeys(before: Session | null, after: Session | null): AffectedKeys {
  const weeks = new Set<string>();
  const exerciseIds = new Set<string>();
  for (const s of [before, after]) {
    if (!s) continue;
    // Only completed sessions contribute to aggregates, but a session leaving
    // the completed state must also trigger a recompute of its old week.
    if (s.status !== 'completed' && s !== before) continue;
    if (s.completedAt !== null) weeks.add(isoWeekKey(s.completedAt));
    for (const id of s.exerciseIds) exerciseIds.add(id);
  }
  return { weeks, exerciseIds };
}

async function muscleLookupFor(db: Firestore, uid: string): Promise<MuscleLookup> {
  const overlay = await db.collection(`users/${uid}/exercises`).get();
  const customs = new Map<string, { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] }>();
  for (const doc of overlay.docs) {
    const data = doc.data() as UserExercise;
    if (data.kind === 'custom') {
      customs.set(doc.id, { primaryMuscles: data.primaryMuscles, secondaryMuscles: data.secondaryMuscles });
    }
  }
  return (exerciseId) => customs.get(exerciseId) ?? CATALOG_MUSCLES[exerciseId] ?? null;
}

async function completedSessionsInWeek(db: Firestore, uid: string, week: string): Promise<SessionWithId[]> {
  // ISO week bounds derived by scanning: weeks are small; query by range.
  const snap = await db
    .collection(`users/${uid}/sessions`)
    .where('status', '==', 'completed')
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, session: d.data() as Session }))
    .filter(({ session }) => session.completedAt !== null && isoWeekKey(session.completedAt) === week);
}

async function recentSessionsForExercise(db: Firestore, uid: string, exerciseId: string): Promise<SessionWithId[]> {
  const snap = await db
    .collection(`users/${uid}/sessions`)
    .where('exerciseIds', 'array-contains', exerciseId)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'desc')
    .limit(30)
    .get();
  return snap.docs.map((d) => ({ id: d.id, session: d.data() as Session }));
}

/** Recompute every aggregate affected by a session write. Idempotent. */
export async function recomputeAffected(uid: string, before: Session | null, after: Session | null): Promise<void> {
  const db = getFirestore();
  const { weeks, exerciseIds } = affectedKeys(before, after);
  if (weeks.size === 0 && exerciseIds.size === 0) return;

  const muscles = await muscleLookupFor(db, uid);
  const batch = db.batch();

  for (const week of weeks) {
    const sessions = await completedSessionsInWeek(db, uid, week);
    const weeklyRef = db.doc(`users/${uid}/weeklyStats/${week}`);
    const weekly = computeWeeklyStats(sessions, muscles);
    if (weekly) batch.set(weeklyRef, weekly);
    else batch.delete(weeklyRef);

    for (const exerciseId of exerciseIds) {
      const exWeekRef = db.doc(`users/${uid}/exerciseStats/${exerciseId}/weeks/${week}`);
      const exWeek = computeExerciseWeek(exerciseId, sessions);
      if (exWeek) batch.set(exWeekRef, exWeek);
      else batch.delete(exWeekRef);
    }
  }

  for (const exerciseId of exerciseIds) {
    const sessions = await recentSessionsForExercise(db, uid, exerciseId);
    const statsRef = db.doc(`users/${uid}/exerciseStats/${exerciseId}`);
    const stats = computeExerciseStats(exerciseId, sessions);
    if (stats) batch.set(statsRef, stats);
    else batch.delete(statsRef);
  }

  await batch.commit();
}

/** Full rebuild: every completed session, every referenced exercise. */
export async function recomputeAll(uid: string): Promise<{ weeks: number; exercises: number }> {
  const db = getFirestore();
  const snap = await db.collection(`users/${uid}/sessions`).where('status', '==', 'completed').get();
  const sessions = snap.docs.map((d) => ({ id: d.id, session: d.data() as Session }));

  const muscles = await muscleLookupFor(db, uid);
  const weeks = new Map<string, SessionWithId[]>();
  const exerciseIds = new Set<string>();

  for (const s of sessions) {
    if (s.session.completedAt === null) continue;
    const week = isoWeekKey(s.session.completedAt);
    weeks.set(week, [...(weeks.get(week) ?? []), s]);
    for (const id of s.session.exerciseIds) exerciseIds.add(id);
  }

  const batch = db.batch();

  for (const [week, weekSessions] of weeks) {
    const weekly = computeWeeklyStats(weekSessions, muscles);
    if (weekly) batch.set(db.doc(`users/${uid}/weeklyStats/${week}`), weekly);
    for (const exerciseId of exerciseIds) {
      const exWeek = computeExerciseWeek(exerciseId, weekSessions);
      if (exWeek) batch.set(db.doc(`users/${uid}/exerciseStats/${exerciseId}/weeks/${week}`), exWeek);
    }
  }

  const byDateDesc = [...sessions].sort(
    (a, b) => (b.session.completedAt ?? 0) - (a.session.completedAt ?? 0),
  );
  for (const exerciseId of exerciseIds) {
    const stats = computeExerciseStats(
      exerciseId,
      byDateDesc.filter((s) => s.session.exerciseIds.includes(exerciseId)).slice(0, 30),
    );
    if (stats) batch.set(db.doc(`users/${uid}/exerciseStats/${exerciseId}`), stats);
  }

  await batch.commit();
  return { weeks: weeks.size, exercises: exerciseIds.size };
}
