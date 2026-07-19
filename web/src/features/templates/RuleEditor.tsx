import type { ProgressionRule, WeightUnit } from '@lifting/shared';
import { WeightInput } from '@/components/WeightInput';
import { defaultRule, ruleKindLabel } from './progressionLabels';

const KINDS: ProgressionRule['kind'][] = ['linear_weight', 'double_progression', 'set_progression', 'percentage'];

interface Props {
  rule: ProgressionRule;
  onChange: (rule: ProgressionRule) => void;
  onRemove: () => void;
  unit: WeightUnit;
}

export function RuleEditor({ rule, onChange, onRemove, unit }: Props) {
  return (
    <div className="rounded-xl border border-neutral-700 p-3">
      <div className="flex items-center justify-between gap-2">
        <select
          value={rule.kind}
          onChange={(e) => onChange(defaultRule(e.target.value as ProgressionRule['kind'], unit))}
          aria-label="Progression type"
          className="rounded-lg border border-neutral-700 bg-surface px-2 py-1.5 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {ruleKindLabel(k)}
            </option>
          ))}
        </select>
        <button type="button" onClick={onRemove} aria-label="Remove progression option" className="text-sm text-red-400">
          Remove
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {rule.kind === 'linear_weight' && (
          <WeightInput
            label={`Increment (${unit})`}
            valueKg={rule.incrementKg}
            allowEmpty={false}
            unit={unit}
            onChange={(kg) => onChange({ ...rule, incrementKg: kg ?? 0 })}
          />
        )}

        {rule.kind === 'double_progression' && (
          <>
            <RangeInputs
              label="Rep range"
              value={rule.repRange}
              onChange={(repRange) => onChange({ ...rule, repRange })}
            />
            <WeightInput
              label={`Increment at top of range (${unit})`}
              valueKg={rule.incrementKg}
              allowEmpty={false}
              unit={unit}
              onChange={(kg) => onChange({ ...rule, incrementKg: kg ?? 0 })}
            />
          </>
        )}

        {rule.kind === 'set_progression' && (
          <>
            <RangeInputs
              label="Set range"
              value={rule.setRange}
              onChange={(setRange) => onChange({ ...rule, setRange })}
            />
            <WeightInput
              label={`Increment at max sets (${unit})`}
              valueKg={rule.incrementKg}
              allowEmpty={false}
              unit={unit}
              onChange={(kg) => onChange({ ...rule, incrementKg: kg ?? 0 })}
            />
          </>
        )}

        {rule.kind === 'percentage' && (
          <>
            <p className="text-xs text-neutral-400">
              {rule.wave.length}-week wave off a training max.{' '}
              {rule.wave
                .map((week) => week.map((s) => `${s.percentOfTM}%×${s.reps}${s.amrap ? '+' : ''}`).join(' / '))
                .join('  ·  ')}
            </p>
            <WeightInput
              label={`Training-max bump per cycle (${unit})`}
              valueKg={rule.tmIncrementKg}
              allowEmpty={false}
              unit={unit}
              onChange={(kg) => onChange({ ...rule, tmIncrementKg: kg ?? 0 })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function RangeInputs({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  return (
    <div className="text-sm text-neutral-400">
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={value[0]}
          aria-label={`${label} minimum`}
          onChange={(e) => onChange([Math.max(1, Number(e.target.value) || 1), value[1]])}
          className="w-20 rounded-xl border border-neutral-700 bg-surface px-3 py-2 text-base text-neutral-100"
        />
        <span>to</span>
        <input
          type="number"
          inputMode="numeric"
          min={value[0]}
          value={value[1]}
          aria-label={`${label} maximum`}
          onChange={(e) => onChange([value[0], Math.max(value[0], Number(e.target.value) || value[0])])}
          className="w-20 rounded-xl border border-neutral-700 bg-surface px-3 py-2 text-base text-neutral-100"
        />
      </div>
    </div>
  );
}
