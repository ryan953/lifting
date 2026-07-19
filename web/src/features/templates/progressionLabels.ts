import type { ProgressionRule, WeightUnit } from '@lifting/shared';
import { formatWeight } from '@lifting/shared';

export function describeRule(rule: ProgressionRule, unit: WeightUnit): string {
  switch (rule.kind) {
    case 'linear_weight':
      return `Linear: +${formatWeight(rule.incrementKg, unit)} when all sets hit`;
    case 'double_progression':
      return `Double progression: ${rule.repRange[0]}–${rule.repRange[1]} reps, then +${formatWeight(rule.incrementKg, unit)}`;
    case 'set_progression':
      return `Set progression: ${rule.setRange[0]}–${rule.setRange[1]} sets, then +${formatWeight(rule.incrementKg, unit)}`;
    case 'percentage':
      return `Percentage waves: ${rule.wave.length}-week cycle, TM +${formatWeight(rule.tmIncrementKg, unit)}`;
  }
}

export function ruleKindLabel(kind: ProgressionRule['kind']): string {
  switch (kind) {
    case 'linear_weight':
      return 'Linear weight';
    case 'double_progression':
      return 'Double progression';
    case 'set_progression':
      return 'Set progression';
    case 'percentage':
      return 'Percentage (5/3/1-style)';
  }
}

/** Sensible starting rules per kind, in canonical kg. */
export function defaultRule(kind: ProgressionRule['kind'], unit: WeightUnit): ProgressionRule {
  const smallIncrement = unit === 'lb' ? 2.268 : 2.5; // 5 lb / 2.5 kg
  switch (kind) {
    case 'linear_weight':
      return { kind, incrementKg: smallIncrement };
    case 'double_progression':
      return { kind, repRange: [8, 12], incrementKg: smallIncrement };
    case 'set_progression':
      return { kind, setRange: [3, 5], incrementKg: smallIncrement };
    case 'percentage':
      return {
        kind,
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
        tmIncrementKg: smallIncrement,
      };
  }
}
