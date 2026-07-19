/** Estimated 1-rep-max formulas. Reps are capped: estimates degrade badly past ~12. */

export const E1RM_REP_CAP = 12;

export function epley(weightKg: number, reps: number): number {
  const r = Math.min(reps, E1RM_REP_CAP);
  if (r <= 1) return weightKg;
  return weightKg * (1 + r / 30);
}

export function brzycki(weightKg: number, reps: number): number {
  const r = Math.min(reps, E1RM_REP_CAP);
  if (r <= 1) return weightKg;
  return weightKg * (36 / (37 - r));
}
