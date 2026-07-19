import { describe, expect, it } from 'vitest';
import type { LoggedSet, Session, SessionExercise } from '../types';
import {
  computeExerciseStats,
  computeExerciseWeek,
  computeWeeklyStats,
  isoDateKey,
  isoWeekKey,
  type MuscleLookup,
} from './aggregate';

function set(weightKg: number, reps: number, isWarmup = false): LoggedSet {
  return { weightKg, reps, isWarmup, completedAt: 0 };
}

function exercise(exerciseId: string, sets: LoggedSet[], overrides: Partial<SessionExercise> = {}): SessionExercise {
  return {
    exerciseId,
    order: 0,
    targetSets: 3,
    targetReps: 5,
    targetWeightKg: 100,
    appliedRule: { kind: 'linear_weight', incrementKg: 2.5 },
    sets,
    outcome: 'met',
    ...overrides,
  };
}

function session(completedAt: number, exercises: SessionExercise[]): Session {
  return {
    templateId: 't1',
    templateName: 'Push',
    status: 'completed',
    startedAt: completedAt - 3600_000,
    completedAt,
    exercises,
    exerciseIds: exercises.map((e) => e.exerciseId),
  };
}

const JUL_14 = Date.UTC(2026, 6, 14, 17); // Tuesday
const JUL_16 = Date.UTC(2026, 6, 16, 17); // Thursday

const muscles: MuscleLookup = (id) =>
  id === 'bench'
    ? { primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] }
    : { primaryMuscles: ['quads'], secondaryMuscles: [] };

describe('isoWeekKey', () => {
  it('computes ISO week with Monday start', () => {
    expect(isoWeekKey(Date.UTC(2026, 6, 14))).toBe('2026-W29');
    expect(isoWeekKey(Date.UTC(2026, 6, 13))).toBe('2026-W29'); // Monday
    expect(isoWeekKey(Date.UTC(2026, 6, 12))).toBe('2026-W28'); // Sunday
  });

  it('handles year boundaries', () => {
    expect(isoWeekKey(Date.UTC(2026, 0, 1))).toBe('2026-W01');
    expect(isoWeekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
  });
});

describe('computeExerciseStats', () => {
  it('returns null with no performances', () => {
    expect(computeExerciseStats('bench', [])).toBeNull();
  });

  it('tracks best e1RM, rep PRs, and recent performances', () => {
    const s1 = session(JUL_14, [exercise('bench', [set(100, 5), set(100, 5), set(100, 5)])]);
    const s2 = session(JUL_16, [exercise('bench', [set(102.5, 5), set(102.5, 4)], { outcome: 'missed' })]);

    const stats = computeExerciseStats('bench', [
      { id: 's1', session: s1 },
      { id: 's2', session: s2 },
    ])!;

    expect(stats.lastPerformedAt).toBe(JUL_16);
    expect(stats.bestE1rm?.weightKg).toBe(102.5);
    expect(stats.bestE1rm?.valueKg).toBeCloseTo(102.5 * (1 + 5 / 30));
    expect(stats.repPRs['5']?.weightKg).toBe(102.5);
    expect(stats.repPRs['4']?.weightKg).toBe(102.5);
    expect(stats.recentPerformances[0]?.sessionId).toBe('s2');
    expect(stats.recentPerformances[0]?.outcome).toBe('missed');
    expect(stats.recentPerformances[1]?.topSet).toEqual({ weightKg: 100, reps: 5 });
  });

  it('ignores non-completed sessions and warmups', () => {
    const active: Session = { ...session(JUL_14, [exercise('bench', [set(100, 5)])]), status: 'active' };
    const done = session(JUL_16, [exercise('bench', [set(60, 5, true), set(100, 5)])]);

    const stats = computeExerciseStats('bench', [
      { id: 'a', session: active },
      { id: 'b', session: done },
    ])!;

    expect(stats.recentPerformances).toHaveLength(1);
    expect(stats.recentPerformances[0]?.totalVolumeKg).toBe(500);
  });

  it('caps recentPerformances at 10', () => {
    const sessions = Array.from({ length: 14 }, (_, i) => ({
      id: `s${i}`,
      session: session(JUL_14 + i * 86400_000, [exercise('bench', [set(100, 5)])]),
    }));
    const stats = computeExerciseStats('bench', sessions)!;
    expect(stats.recentPerformances).toHaveLength(10);
    expect(stats.recentPerformances[0]?.sessionId).toBe('s13');
  });
});

describe('computeExerciseWeek', () => {
  it('sums volume and finds top set within the week', () => {
    const s1 = session(JUL_14, [exercise('bench', [set(100, 5), set(100, 5)])]);
    const s2 = session(JUL_16, [exercise('bench', [set(105, 3)])]);

    const week = computeExerciseWeek('bench', [
      { id: 's1', session: s1 },
      { id: 's2', session: s2 },
    ])!;

    expect(week.volumeKg).toBe(1000 + 315);
    expect(week.topSetWeightKg).toBe(105);
    expect(week.setCount).toBe(3);
  });
});

describe('computeWeeklyStats', () => {
  it('rolls up muscles (secondary 0.5x), rep ranges, dates, and progression', () => {
    const s1 = session(JUL_14, [
      exercise('bench', [set(100, 5), set(100, 5), set(100, 5)]),
      exercise('squat', [set(140, 8)], { outcome: 'missed' }),
    ]);
    const s2 = session(JUL_16, [exercise('bench', [set(50, 15)], { appliedRule: null, outcome: undefined })]);

    const stats = computeWeeklyStats(
      [
        { id: 's1', session: s1 },
        { id: 's2', session: s2 },
      ],
      muscles,
    )!;

    expect(stats.sessionCount).toBe(2);
    expect(stats.trainedDates).toEqual([isoDateKey(JUL_14), isoDateKey(JUL_16)]);
    expect(stats.volumeByMuscleKg.chest).toBe(1500 + 750);
    expect(stats.volumeByMuscleKg.triceps).toBe((1500 + 750) * 0.5);
    expect(stats.volumeByMuscleKg.quads).toBe(1120);
    expect(stats.setsByRepRange).toEqual({ r1_5: 3, r6_10: 1, r11_15: 1, r16p: 0 });
    expect(stats.progression).toEqual({ attempted: 2, met: 1 });
  });

  it('returns null for a week with no completed sessions', () => {
    expect(computeWeeklyStats([], muscles)).toBeNull();
  });
});
