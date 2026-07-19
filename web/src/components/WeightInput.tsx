import type { WeightUnit } from '@lifting/shared';
import { fromDisplay, toDisplay } from '@lifting/shared';

interface Props {
  /** Canonical kg, or null for bodyweight/unset. */
  valueKg: number | null;
  onChange: (kg: number | null) => void;
  unit: WeightUnit;
  label?: string;
  allowEmpty?: boolean;
}

/** Numeric weight input that displays in the user's unit, stores kg. */
export function WeightInput({ valueKg, onChange, unit, label, allowEmpty = true }: Props) {
  const display = valueKg === null ? '' : String(round1(toDisplay(valueKg, unit)));

  return (
    <label className="block text-sm text-neutral-400">
      {label ?? `Weight (${unit})`}
      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={unit === 'kg' ? 2.5 : 5}
          value={display}
          placeholder={allowEmpty ? 'bodyweight' : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(allowEmpty ? null : 0);
              return;
            }
            const n = Number(raw);
            if (!Number.isNaN(n)) onChange(fromDisplay(n, unit));
          }}
          className="w-full rounded-xl border border-neutral-700 bg-surface px-4 py-2.5 text-base text-neutral-100"
        />
        <span className="text-neutral-500">{unit}</span>
      </div>
    </label>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
