import type {
  ExerciseStats,
  Outcome,
  ProgressionRule,
  Targets,
  TemplateExercise,
  WeightUnit,
} from '../types';
import { formatWeight, roundToPlate } from '../units';
import { applyProgression, type NextPrescription } from './engine';

export interface Recommendation {
  rule: ProgressionRule;
  ruleIndex: number;
  prescription: NextPrescription;
  /** Higher = stronger recommendation; the max-scored entry is the default pick. */
  score: number;
  reason: string;
}

export interface RecommendInput {
  templateExercise: TemplateExercise;
  stats: ExerciseStats | null;
  trainingMaxKg?: number;
  unit: WeightUnit;
}

/**
 * Rank every progression option on the template exercise, projecting the next
 * prescription from recent history. Pure and offline-capable: needs only the
 * small ExerciseStats doc.
 */
export function recommend(input: RecommendInput): Recommendation[] {
  const { templateExercise: te, stats, trainingMaxKg, unit } = input;

  const templateTargets: Targets = {
    sets: te.targetSets,
    reps: te.targetReps,
    weightKg: te.targetWeightKg,
  };

  const recs = te.progressionOptions.map((rule, ruleIndex): Recommendation => {
    // First time or no history: prescribe the template verbatim (or wave week 0).
    if (!stats || stats.recentPerformances.length === 0) {
      const prescription = firstPrescription(rule, templateTargets, trainingMaxKg);
      return {
        rule,
        ruleIndex,
        prescription,
        score: ruleIndex === te.defaultProgressionIndex ? 1 : 0,
        reason: 'No history yet — starting from the template targets.',
      };
    }

    const last = lastPerformanceFor(stats, rule);
    const lastTargets: Targets = last
      ? { sets: last.targetSets, reps: last.targetReps, weightKg: last.targetWeightKg }
      : templateTargets;
    const lastOutcome: Outcome = last?.outcome ?? 'met';
    const misses = countConsecutiveMisses(stats);
    const streak = countConsecutiveMet(stats);

    const prescription = applyProgression(rule, lastTargets, lastOutcome, {
      trainingMaxKg,
      lastWaveWeek: last?.waveWeek,
      consecutiveMisses: misses,
    });

    let score = ruleIndex === te.defaultProgressionIndex ? 1 : 0;
    let reason: string;

    if (prescription.isDeload) {
      score += 2;
      reason = `${misses} misses in a row — time to deload and rebuild.`;
    } else if (rule.kind === 'percentage') {
      if (prescription.newTrainingMaxKg !== undefined) {
        reason = `Cycle complete — training max bumps to ${formatWeight(roundToPlate(prescription.newTrainingMaxKg, unit), unit)}.`;
        score += 1;
      } else {
        reason = `Wave week ${(prescription.waveWeek ?? 0) + 1} of ${rule.wave.length}.`;
      }
    } else if (lastOutcome === 'met') {
      const bump = describeBump(rule, lastTargets, prescription.targets, unit);
      reason =
        streak > 1
          ? `${streak} straight sessions met — ${bump}.`
          : `Last session met — ${bump}.`;
      score += Math.min(streak, 3);
    } else {
      reason = 'Missed last time — repeat the same targets.';
    }

    return { rule, ruleIndex, prescription, score, reason };
  });

  return recs.sort((a, b) => b.score - a.score);
}

function firstPrescription(
  rule: ProgressionRule,
  templateTargets: Targets,
  trainingMaxKg?: number,
): NextPrescription {
  if (rule.kind === 'percentage') {
    if (trainingMaxKg === undefined) {
      // UI must prompt for a TM before a percentage rule can be applied.
      return { targets: templateTargets, waveWeek: 0, isDeload: false };
    }
    // No lastWaveWeek → engine starts at wave week 0.
    return applyProgression(rule, templateTargets, 'met', { trainingMaxKg });
  }
  return { targets: templateTargets, isDeload: false };
}

function lastPerformanceFor(stats: ExerciseStats, rule: ProgressionRule) {
  // Prefer the most recent performance that used the same rule kind (its
  // targets are the meaningful baseline); fall back to the most recent overall.
  return (
    stats.recentPerformances.find((p) => p.appliedRule?.kind === rule.kind) ??
    stats.recentPerformances[0] ??
    null
  );
}

function countConsecutiveMisses(stats: ExerciseStats): number {
  let n = 0;
  for (const p of stats.recentPerformances) {
    if (p.outcome === 'missed') n++;
    else break;
  }
  return n;
}

function countConsecutiveMet(stats: ExerciseStats): number {
  let n = 0;
  for (const p of stats.recentPerformances) {
    if (p.outcome === 'met') n++;
    else break;
  }
  return n;
}

function describeBump(
  rule: ProgressionRule,
  last: Targets,
  next: Targets,
  unit: WeightUnit,
): string {
  if (next.weightKg !== null && last.weightKg !== null && next.weightKg > last.weightKg) {
    const delta = next.weightKg - last.weightKg;
    return `add ${formatWeight(roundToPlate(delta, unit, unit === 'kg' ? 0.5 : 2.5), unit)}`;
  }
  if (next.reps > last.reps) return `add a rep (${last.reps} → ${next.reps})`;
  if (next.sets > last.sets) return `add a set (${last.sets} → ${next.sets})`;
  return 'hold steady';
}
