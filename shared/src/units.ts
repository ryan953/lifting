import type { WeightUnit } from './types';

export const KG_PER_LB = 0.45359237;

/** Default plate-friendly increments per unit. */
const PLATE_STEP: Record<WeightUnit, number> = {
  kg: 2.5,
  lb: 5,
};

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Canonical kg → display value in the user's unit (unrounded). */
export function toDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg);
}

/** User-entered display value → canonical kg. */
export function fromDisplay(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value);
}

/**
 * Round a canonical-kg weight to the nearest loadable value in the display
 * unit, returning canonical kg. E.g. 61.2 kg for a lb user → 135 lb → 61.23 kg.
 */
export function roundToPlate(kg: number, unit: WeightUnit, step = PLATE_STEP[unit]): number {
  const display = toDisplay(kg, unit);
  const rounded = Math.round(display / step) * step;
  return fromDisplay(rounded, unit);
}

/** Format a canonical-kg weight for display, e.g. "135 lb" or "62.5 kg". */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const display = toDisplay(kg, unit);
  const value = Number.isInteger(display) ? display : Number(display.toFixed(1));
  return `${value} ${unit}`;
}
