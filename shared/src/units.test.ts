import { describe, expect, it } from 'vitest';
import { formatWeight, fromDisplay, kgToLb, lbToKg, roundToPlate, toDisplay } from './units';

describe('unit conversion', () => {
  it('round-trips kg↔lb', () => {
    expect(lbToKg(kgToLb(100))).toBeCloseTo(100, 10);
  });

  it('toDisplay/fromDisplay are identity for kg', () => {
    expect(toDisplay(62.5, 'kg')).toBe(62.5);
    expect(fromDisplay(62.5, 'kg')).toBe(62.5);
  });

  it('converts 135 lb to ~61.23 kg', () => {
    expect(fromDisplay(135, 'lb')).toBeCloseTo(61.235, 2);
  });
});

describe('roundToPlate', () => {
  it('rounds to nearest 5 lb for lb users', () => {
    const kg = fromDisplay(137.2, 'lb');
    expect(toDisplay(roundToPlate(kg, 'lb'), 'lb')).toBeCloseTo(135, 10);
  });

  it('rounds to nearest 2.5 kg for kg users', () => {
    expect(roundToPlate(61.2, 'kg')).toBeCloseTo(60, 10);
    expect(roundToPlate(61.3, 'kg')).toBeCloseTo(62.5, 10);
  });

  it('supports custom steps', () => {
    expect(roundToPlate(61.2, 'kg', 0.5)).toBeCloseTo(61, 10);
  });
});

describe('formatWeight', () => {
  it('formats whole numbers without decimals', () => {
    expect(formatWeight(fromDisplay(135, 'lb'), 'lb')).toBe('135 lb');
  });

  it('formats to one decimal otherwise', () => {
    expect(formatWeight(61.25, 'kg')).toBe('61.3 kg');
  });
});
