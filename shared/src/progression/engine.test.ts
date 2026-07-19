import { describe, expect, it } from 'vitest';
import type { LoggedSet, ProgressionRule, SessionExercise, Targets } from '../types';
import { applyProgression, evaluateOutcome, waveSetTargets } from './engine';

function set(weightKg: number, reps: number, isWarmup = false): LoggedSet {
  return { weightKg, reps, isWarmup, completedAt: 0 };
}

function sessionExercise(overrides: Partial<SessionExercise>): SessionExercise {
  return {
    exerciseId: 'bench',
    order: 0,
    targetSets: 3,
    targetReps: 5,
    targetWeightKg: 100,
    appliedRule: null,
    sets: [],
    ...overrides,
  };
}

describe('evaluateOutcome', () => {
  it('is skipped with no working sets', () => {
    expect(evaluateOutcome(sessionExercise({ sets: [] }))).toBe('skipped');
    expect(evaluateOutcome(sessionExercise({ sets: [set(60, 10, true)] }))).toBe('skipped');
  });

  it('is met when all target sets hit reps at weight', () => {
    const sets = [set(100, 5), set(100, 5), set(100, 5)];
    expect(evaluateOutcome(sessionExercise({ sets }))).toBe('met');
  });

  it('counts AMRAP overshoot as met', () => {
    const sets = [set(100, 5), set(100, 5), set(100, 8)];
    expect(evaluateOutcome(sessionExercise({ sets }))).toBe('met');
  });

  it('is missed when a set falls short on reps', () => {
    const sets = [set(100, 5), set(100, 4), set(100, 5)];
    expect(evaluateOutcome(sessionExercise({ sets }))).toBe('missed');
  });

  it('is missed when fewer sets than target', () => {
    const sets = [set(100, 5), set(100, 5)];
    expect(evaluateOutcome(sessionExercise({ sets }))).toBe('missed');
  });

  it('is missed when weight below target', () => {
    const sets = [set(95, 5), set(100, 5), set(100, 5)];
    expect(evaluateOutcome(sessionExercise({ sets }))).toBe('missed');
  });

  it('ignores warmup sets', () => {
    const sets = [set(60, 5, true), set(100, 5), set(100, 5), set(100, 5)];
    expect(evaluateOutcome(sessionExercise({ sets }))).toBe('met');
  });

  it('handles bodyweight (null target weight)', () => {
    const sets = [set(0, 10), set(0, 10), set(0, 10)];
    expect(evaluateOutcome(sessionExercise({ targetWeightKg: null, targetReps: 10, sets }))).toBe('met');
  });
});

const targets = (sets: number, reps: number, weightKg: number | null): Targets => ({ sets, reps, weightKg });

describe('linear_weight', () => {
  const rule: ProgressionRule = { kind: 'linear_weight', incrementKg: 2.5 };

  it('adds weight on met', () => {
    const next = applyProgression(rule, targets(3, 5, 100), 'met');
    expect(next.targets).toEqual(targets(3, 5, 102.5));
    expect(next.isDeload).toBe(false);
  });

  it('holds on first miss', () => {
    const next = applyProgression(rule, targets(3, 5, 100), 'missed', { consecutiveMisses: 1 });
    expect(next.targets).toEqual(targets(3, 5, 100));
    expect(next.isDeload).toBe(false);
  });

  it('deloads 10% on second consecutive miss', () => {
    const next = applyProgression(rule, targets(3, 5, 100), 'missed', { consecutiveMisses: 2 });
    expect(next.targets.weightKg).toBeCloseTo(90);
    expect(next.isDeload).toBe(true);
  });
});

describe('double_progression', () => {
  const rule: ProgressionRule = { kind: 'double_progression', repRange: [8, 12], incrementKg: 2.5 };

  it('adds a rep within range on met', () => {
    const next = applyProgression(rule, targets(3, 8, 50), 'met');
    expect(next.targets).toEqual(targets(3, 9, 50));
  });

  it('bumps weight and resets reps at top of range', () => {
    const next = applyProgression(rule, targets(3, 12, 50), 'met');
    expect(next.targets).toEqual(targets(3, 8, 52.5));
  });

  it('holds on first miss', () => {
    const next = applyProgression(rule, targets(3, 10, 50), 'missed', { consecutiveMisses: 1 });
    expect(next.targets).toEqual(targets(3, 10, 50));
  });

  it('deloads to bottom of rep range with reduced weight', () => {
    const next = applyProgression(rule, targets(3, 10, 50), 'missed', { consecutiveMisses: 2 });
    expect(next.targets.reps).toBe(8);
    expect(next.targets.weightKg).toBeCloseTo(45);
    expect(next.isDeload).toBe(true);
  });
});

describe('set_progression', () => {
  const rule: ProgressionRule = { kind: 'set_progression', setRange: [3, 5], incrementKg: 2.5 };

  it('adds a set within range on met', () => {
    const next = applyProgression(rule, targets(3, 8, 60), 'met');
    expect(next.targets).toEqual(targets(4, 8, 60));
  });

  it('bumps weight and resets sets at top of range', () => {
    const next = applyProgression(rule, targets(5, 8, 60), 'met');
    expect(next.targets).toEqual(targets(3, 8, 62.5));
  });

  it('deloads to min sets with reduced weight', () => {
    const next = applyProgression(rule, targets(4, 8, 60), 'missed', { consecutiveMisses: 2 });
    expect(next.targets.sets).toBe(3);
    expect(next.targets.weightKg).toBeCloseTo(54);
    expect(next.isDeload).toBe(true);
  });
});

describe('percentage', () => {
  // Simplified 5/3/1: three weeks, top set percent climbing.
  const rule: ProgressionRule = {
    kind: 'percentage',
    wave: [
      [
        { percentOfTM: 65, reps: 5 },
        { percentOfTM: 75, reps: 5 },
        { percentOfTM: 85, reps: 5, amrap: true },
      ],
      [
        { percentOfTM: 70, reps: 3 },
        { percentOfTM: 80, reps: 3 },
        { percentOfTM: 90, reps: 3, amrap: true },
      ],
      [
        { percentOfTM: 75, reps: 5 },
        { percentOfTM: 85, reps: 3 },
        { percentOfTM: 95, reps: 1, amrap: true },
      ],
    ],
    tmIncrementKg: 2.5,
  };

  it('throws without a training max', () => {
    expect(() => applyProgression(rule, targets(3, 5, 100), 'met')).toThrow(/trainingMaxKg/);
  });

  it('starts at wave week 0 with no history', () => {
    const next = applyProgression(rule, targets(3, 5, null), 'met', { trainingMaxKg: 100 });
    expect(next.waveWeek).toBe(0);
    expect(next.targets.weightKg).toBeCloseTo(85);
    expect(next.targets.sets).toBe(3);
  });

  it('advances through the wave', () => {
    const next = applyProgression(rule, targets(3, 5, 85), 'met', { trainingMaxKg: 100, lastWaveWeek: 0 });
    expect(next.waveWeek).toBe(1);
    expect(next.targets.weightKg).toBeCloseTo(90);
    expect(next.newTrainingMaxKg).toBeUndefined();
  });

  it('bumps TM and restarts after the final week', () => {
    const next = applyProgression(rule, targets(3, 1, 95), 'met', { trainingMaxKg: 100, lastWaveWeek: 2 });
    expect(next.waveWeek).toBe(0);
    expect(next.newTrainingMaxKg).toBeCloseTo(102.5);
    expect(next.targets.weightKg).toBeCloseTo(0.85 * 102.5);
  });

  it('resets cycle with reduced TM on repeated misses', () => {
    const next = applyProgression(rule, targets(3, 3, 90), 'missed', {
      trainingMaxKg: 100,
      lastWaveWeek: 1,
      consecutiveMisses: 2,
    });
    expect(next.isDeload).toBe(true);
    expect(next.newTrainingMaxKg).toBeCloseTo(90);
    expect(next.waveWeek).toBe(0);
  });

  it('exposes per-set targets for the session UI', () => {
    const sets = waveSetTargets(rule, 1, 100);
    expect(sets).toHaveLength(3);
    expect(sets[2]).toEqual({ weightKg: 90, reps: 3, amrap: true });
  });
});
