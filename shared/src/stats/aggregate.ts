import type {
  ExerciseStats,
  ExerciseWeek,
  MuscleGroup,
  PerformanceSummary,
  Session,
  SessionExercise,
  WeeklyStats,
} from '../types';
import { workingSets } from '../progression/engine';
import { epley } from './e1rm';

/** Minimal muscle metadata the aggregator needs per exercise id. */
export interface MuscleLookup {
  (exerciseId: string): { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] } | null;
}

export interface SessionWithId {
  id: string;
  session: Session;
}

const SECONDARY_MUSCLE_FACTOR = 0.5;
const RECENT_PERFORMANCES_CAP = 10;

// ---------------------------------------------------------------------------
// ISO week helpers ('2026-W29' style keys, weeks start Monday)
// ---------------------------------------------------------------------------

export function isoWeekKey(epochMs: number): string {
  const d = new Date(epochMs);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // nearest Thursday
  const isoYear = target.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((target.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function isoDateKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Per-exercise aggregates
// ---------------------------------------------------------------------------

export function summarizePerformance(sessionId: string, session: Session, ex: SessionExercise): PerformanceSummary {
  const sets = workingSets(ex.sets);
  const topSet = sets.reduce<{ weightKg: number; reps: number } | null>((best, s) => {
    if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) {
      return { weightKg: s.weightKg, reps: s.reps };
    }
    return best;
  }, null);

  return {
    sessionId,
    date: session.completedAt ?? session.startedAt,
    appliedRule: ex.appliedRule,
    ...(ex.waveWeek !== undefined ? { waveWeek: ex.waveWeek } : {}),
    targetSets: ex.targetSets,
    targetReps: ex.targetReps,
    targetWeightKg: ex.targetWeightKg,
    topSet,
    totalVolumeKg: sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0),
    outcome: ex.outcome ?? 'skipped',
  };
}

/**
 * Rebuild the full ExerciseStats rollup for one exercise from the sessions
 * that contain it (completed sessions only, any order).
 */
export function computeExerciseStats(exerciseId: string, sessions: SessionWithId[]): ExerciseStats | null {
  const performances: PerformanceSummary[] = [];
  let bestE1rm: ExerciseStats['bestE1rm'] = null;
  const repPRs: ExerciseStats['repPRs'] = {};

  for (const { id, session } of sessions) {
    if (session.status !== 'completed') continue;
    for (const ex of session.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const sets = workingSets(ex.sets);
      if (sets.length === 0) continue;

      performances.push(summarizePerformance(id, session, ex));
      const date = session.completedAt ?? session.startedAt;

      for (const s of sets) {
        const e1 = epley(s.weightKg, s.reps);
        if (!bestE1rm || e1 > bestE1rm.valueKg) {
          bestE1rm = { valueKg: e1, weightKg: s.weightKg, reps: s.reps, sessionId: id, date };
        }
        const key = String(Math.min(s.reps, 12));
        const existing = repPRs[key];
        if (s.reps <= 12 && (!existing || s.weightKg > existing.weightKg)) {
          repPRs[key] = { weightKg: s.weightKg, sessionId: id, date };
        }
      }
    }
  }

  if (performances.length === 0) return null;
  performances.sort((a, b) => b.date - a.date);

  return {
    lastPerformedAt: performances[0]!.date,
    bestE1rm,
    repPRs,
    recentPerformances: performances.slice(0, RECENT_PERFORMANCES_CAP),
  };
}

/** Rebuild one exercise's week doc from that week's completed sessions. */
export function computeExerciseWeek(exerciseId: string, sessions: SessionWithId[]): ExerciseWeek | null {
  let volumeKg = 0;
  let topSetWeightKg = 0;
  let bestE1rmKg = 0;
  let setCount = 0;

  for (const { session } of sessions) {
    if (session.status !== 'completed') continue;
    for (const ex of session.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of workingSets(ex.sets)) {
        volumeKg += s.weightKg * s.reps;
        topSetWeightKg = Math.max(topSetWeightKg, s.weightKg);
        bestE1rmKg = Math.max(bestE1rmKg, epley(s.weightKg, s.reps));
        setCount++;
      }
    }
  }

  return setCount === 0 ? null : { volumeKg, topSetWeightKg, bestE1rmKg, setCount };
}

// ---------------------------------------------------------------------------
// Weekly rollup
// ---------------------------------------------------------------------------

export function computeWeeklyStats(sessions: SessionWithId[], muscles: MuscleLookup): WeeklyStats | null {
  const completed = sessions.filter(({ session }) => session.status === 'completed');
  if (completed.length === 0) return null;

  const trainedDates = new Set<string>();
  const volumeByMuscleKg: Partial<Record<MuscleGroup, number>> = {};
  const setsByRepRange = { r1_5: 0, r6_10: 0, r11_15: 0, r16p: 0 };
  let attempted = 0;
  let met = 0;

  for (const { session } of completed) {
    trainedDates.add(isoDateKey(session.completedAt ?? session.startedAt));

    for (const ex of session.exercises) {
      const sets = workingSets(ex.sets);
      if (sets.length === 0) continue;

      if (ex.appliedRule && ex.outcome && ex.outcome !== 'skipped') {
        attempted++;
        if (ex.outcome === 'met') met++;
      }

      const m = muscles(ex.exerciseId);
      for (const s of sets) {
        const vol = s.weightKg * s.reps;
        if (m) {
          for (const muscle of m.primaryMuscles) {
            volumeByMuscleKg[muscle] = (volumeByMuscleKg[muscle] ?? 0) + vol;
          }
          for (const muscle of m.secondaryMuscles) {
            volumeByMuscleKg[muscle] = (volumeByMuscleKg[muscle] ?? 0) + vol * SECONDARY_MUSCLE_FACTOR;
          }
        }
        if (s.reps <= 5) setsByRepRange.r1_5++;
        else if (s.reps <= 10) setsByRepRange.r6_10++;
        else if (s.reps <= 15) setsByRepRange.r11_15++;
        else setsByRepRange.r16p++;
      }
    }
  }

  return {
    sessionCount: completed.length,
    trainedDates: [...trainedDates].sort(),
    volumeByMuscleKg,
    setsByRepRange,
    progression: { attempted, met },
  };
}
