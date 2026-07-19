import type {
  LoggedSet,
  Outcome,
  ProgressionRule,
  SessionExercise,
  Targets,
} from '../types';

export interface ProgressionContext {
  trainingMaxKg?: number;
  /** 0-based wave step the *last* session executed (percentage rules). */
  lastWaveWeek?: number;
  consecutiveMisses?: number;
}

export interface NextPrescription {
  targets: Targets;
  /** For percentage rules: the wave step the *next* session should execute. */
  waveWeek?: number;
  /** New training max, set when a percentage cycle completes. */
  newTrainingMaxKg?: number;
  isDeload: boolean;
}

export function workingSets(sets: LoggedSet[]): LoggedSet[] {
  return sets.filter((s) => !s.isWarmup);
}

/**
 * Did the lifter meet the prescription? Every target set must exist and hit
 * target reps at (or above) target weight. AMRAP-style overshoot counts as met.
 */
export function evaluateOutcome(ex: SessionExercise): Outcome {
  const sets = workingSets(ex.sets);
  if (sets.length === 0) return 'skipped';
  if (sets.length < ex.targetSets) return 'missed';

  const counted = sets.slice(0, Math.max(ex.targetSets, sets.length));
  const met = counted
    .slice(0, ex.targetSets)
    .every(
      (s) =>
        s.reps >= ex.targetReps &&
        (ex.targetWeightKg === null || s.weightKg >= ex.targetWeightKg),
    );
  return met ? 'met' : 'missed';
}

const DELOAD_FACTOR = 0.9;
const MISSES_BEFORE_DELOAD = 2;

/**
 * Pure state machine: given the rule, the last prescription, and how it went,
 * produce the next prescription.
 */
export function applyProgression(
  rule: ProgressionRule,
  last: Targets,
  lastOutcome: Outcome,
  ctx: ProgressionContext = {},
): NextPrescription {
  const misses = ctx.consecutiveMisses ?? (lastOutcome === 'missed' ? 1 : 0);
  const shouldDeload = lastOutcome === 'missed' && misses >= MISSES_BEFORE_DELOAD;

  switch (rule.kind) {
    case 'linear_weight': {
      if (shouldDeload) {
        return {
          targets: { ...last, weightKg: deload(last.weightKg) },
          isDeload: true,
        };
      }
      if (lastOutcome === 'met') {
        return {
          targets: { ...last, weightKg: addKg(last.weightKg, rule.incrementKg) },
          isDeload: false,
        };
      }
      return { targets: { ...last }, isDeload: false };
    }

    case 'double_progression': {
      const [minReps, maxReps] = rule.repRange;
      if (shouldDeload) {
        return {
          targets: { sets: last.sets, reps: minReps, weightKg: deload(last.weightKg) },
          isDeload: true,
        };
      }
      if (lastOutcome !== 'met') {
        return { targets: { ...last }, isDeload: false };
      }
      if (last.reps < maxReps) {
        return {
          targets: { ...last, reps: Math.min(last.reps + 1, maxReps) },
          isDeload: false,
        };
      }
      return {
        targets: { sets: last.sets, reps: minReps, weightKg: addKg(last.weightKg, rule.incrementKg) },
        isDeload: false,
      };
    }

    case 'set_progression': {
      const [minSets, maxSets] = rule.setRange;
      if (shouldDeload) {
        return {
          targets: { sets: minSets, reps: last.reps, weightKg: deload(last.weightKg) },
          isDeload: true,
        };
      }
      if (lastOutcome !== 'met') {
        return { targets: { ...last }, isDeload: false };
      }
      if (last.sets < maxSets) {
        return { targets: { ...last, sets: last.sets + 1 }, isDeload: false };
      }
      return {
        targets: { sets: minSets, reps: last.reps, weightKg: addKg(last.weightKg, rule.incrementKg) },
        isDeload: false,
      };
    }

    case 'percentage': {
      const tm = ctx.trainingMaxKg;
      if (tm === undefined) {
        throw new Error('percentage rule requires ctx.trainingMaxKg');
      }
      const lastWeek = ctx.lastWaveWeek ?? -1;
      const nextWeek = lastWeek + 1;

      if (shouldDeload) {
        // Reset the cycle with a reduced TM rather than dropping one session's weight.
        const newTM = deloadValue(tm);
        return {
          targets: waveTargets(rule, 0, newTM),
          waveWeek: 0,
          newTrainingMaxKg: newTM,
          isDeload: true,
        };
      }

      if (nextWeek >= rule.wave.length) {
        // Cycle complete → bump TM, restart wave.
        const newTM = tm + rule.tmIncrementKg;
        return {
          targets: waveTargets(rule, 0, newTM),
          waveWeek: 0,
          newTrainingMaxKg: newTM,
          isDeload: false,
        };
      }

      return { targets: waveTargets(rule, nextWeek, tm), waveWeek: nextWeek, isDeload: false };
    }
  }
}

/**
 * Prescription for a given wave week. A wave week holds multiple steps
 * (sets); targets summarize as sets=steps.length, reps/weight of the top
 * (last) step — the session UI reads the full wave for per-set targets.
 */
export function waveTargets(
  rule: Extract<ProgressionRule, { kind: 'percentage' }>,
  waveWeek: number,
  trainingMaxKg: number,
): Targets {
  const week = rule.wave[waveWeek];
  if (!week || week.length === 0) {
    throw new Error(`percentage rule has no wave week ${waveWeek}`);
  }
  const top = week[week.length - 1]!;
  return {
    sets: week.length,
    reps: top.reps,
    weightKg: (top.percentOfTM / 100) * trainingMaxKg,
  };
}

/** Per-set targets for a percentage-rule session. */
export function waveSetTargets(
  rule: Extract<ProgressionRule, { kind: 'percentage' }>,
  waveWeek: number,
  trainingMaxKg: number,
): { weightKg: number; reps: number; amrap: boolean }[] {
  const week = rule.wave[waveWeek];
  if (!week) return [];
  return week.map((step) => ({
    weightKg: (step.percentOfTM / 100) * trainingMaxKg,
    reps: step.reps,
    amrap: step.amrap ?? false,
  }));
}

function addKg(weightKg: number | null, incrementKg: number): number | null {
  return weightKg === null ? null : weightKg + incrementKg;
}

function deload(weightKg: number | null): number | null {
  return weightKg === null ? null : deloadValue(weightKg);
}

function deloadValue(weightKg: number): number {
  return weightKg * DELOAD_FACTOR;
}
