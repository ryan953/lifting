import { collection, documentId, orderBy, query, where, type Query } from 'firebase/firestore';
import type { ExerciseWeek, WeeklyStats } from '@lifting/shared';
import { isoWeekKey } from '@lifting/shared';
import { useUser } from '@/lib/auth';
import { db, } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/db';

export const RANGE_WEEKS = 26;

function sinceWeekKey(weeks: number): string {
  return isoWeekKey(Date.now() - weeks * 7 * 86400_000);
}

/** weeklyStats docs for the last N weeks, keyed by yyyy-Www doc id. */
export function useWeeklyStats(weeks = RANGE_WEEKS) {
  const user = useUser();
  const since = sinceWeekKey(weeks);
  const q = query(
    collection(db, 'users', user.uid, 'weeklyStats'),
    where(documentId(), '>=', since),
    orderBy(documentId()),
  ) as Query<WeeklyStats>;
  return useLiveQuery<WeeklyStats>(['weeklyStats', user.uid, since], q);
}

/** Per-exercise week docs for the last N weeks. */
export function useExerciseWeeks(exerciseId: string | null, weeks = RANGE_WEEKS) {
  const user = useUser();
  const since = sinceWeekKey(weeks);
  const q = exerciseId
    ? (query(
        collection(db, 'users', user.uid, 'exerciseStats', exerciseId, 'weeks'),
        where(documentId(), '>=', since),
        orderBy(documentId()),
      ) as Query<ExerciseWeek>)
    : null;
  return useLiveQuery<ExerciseWeek>(['exerciseWeeks', user.uid, exerciseId, since], q);
}
