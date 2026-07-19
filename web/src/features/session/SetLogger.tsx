import { useState } from 'react';
import type { LoggedSet, SessionExercise, WeightUnit } from '@lifting/shared';
import { formatWeight, fromDisplay, toDisplay } from '@lifting/shared';

interface Props {
  exercise: SessionExercise;
  unit: WeightUnit;
  onLogSet: (set: LoggedSet) => void;
  onEditSet: (setIndex: number, patch: Partial<LoggedSet> | null) => void;
}

/**
 * Prefilled tap-to-confirm set rows: each pending row is primed with the
 * target weight×reps; one tap logs it. Steppers adjust before logging if the
 * lifter deviated. Logged rows can be re-opened to fix or delete.
 */
export function SetLogger({ exercise, unit, onLogSet, onEditSet }: Props) {
  const loggedCount = exercise.sets.length;
  const pendingRows = Math.max(exercise.targetSets - loggedCount, 0);

  return (
    <div className="space-y-2">
      {exercise.sets.map((set, i) => (
        <LoggedRow key={i} index={i} set={set} unit={unit} onEdit={(patch) => onEditSet(i, patch)} />
      ))}
      {Array.from({ length: pendingRows }, (_, i) => (
        <PendingRow
          key={`pending-${loggedCount + i}`}
          setNumber={loggedCount + i + 1}
          defaultWeightKg={lastLoggedWeight(exercise) ?? exercise.targetWeightKg}
          defaultReps={exercise.targetReps}
          unit={unit}
          primed={i === 0}
          onLog={onLogSet}
        />
      ))}
      <ExtraSetRow
        setNumber={Math.max(exercise.targetSets, loggedCount) + 1}
        defaultWeightKg={lastLoggedWeight(exercise) ?? exercise.targetWeightKg}
        defaultReps={exercise.targetReps}
        unit={unit}
        onLog={onLogSet}
      />
    </div>
  );
}

function lastLoggedWeight(ex: SessionExercise): number | null {
  const last = ex.sets.filter((s) => !s.isWarmup).at(-1);
  return last ? last.weightKg : null;
}

interface RowProps {
  setNumber: number;
  defaultWeightKg: number | null;
  defaultReps: number;
  unit: WeightUnit;
  primed?: boolean;
  onLog: (set: LoggedSet) => void;
}

function PendingRow({ setNumber, defaultWeightKg, defaultReps, unit, primed, onLog }: RowProps) {
  const [weightKg, setWeightKg] = useState(defaultWeightKg);
  const [reps, setReps] = useState(defaultReps);
  const [isWarmup, setIsWarmup] = useState(false);

  const step = unit === 'kg' ? 2.5 : 5;

  function bumpWeight(dir: -1 | 1) {
    setWeightKg((w) => {
      const display = toDisplay(w ?? 0, unit);
      return fromDisplay(Math.max(0, display + dir * step), unit);
    });
  }

  return (
    <div className={`rounded-xl p-3 ${primed ? 'bg-surface ring-1 ring-accent/40' : 'bg-surface/50'}`}>
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm text-neutral-500">#{setNumber}</span>

        <div className="flex items-center gap-1">
          <Stepper label="decrease weight" onClick={() => bumpWeight(-1)}>−</Stepper>
          <span className="min-w-16 text-center font-mono">
            {weightKg === null ? 'BW' : formatWeight(weightKg, unit)}
          </span>
          <Stepper label="increase weight" onClick={() => bumpWeight(1)}>+</Stepper>
        </div>

        <div className="ml-1 flex items-center gap-1">
          <Stepper label="decrease reps" onClick={() => setReps((r) => Math.max(1, r - 1))}>−</Stepper>
          <span className="min-w-10 text-center font-mono">×{reps}</span>
          <Stepper label="increase reps" onClick={() => setReps((r) => r + 1)}>+</Stepper>
        </div>

        <button
          type="button"
          onClick={() => onLog({ weightKg: weightKg ?? 0, reps, isWarmup, completedAt: Date.now() })}
          className="ml-auto rounded-lg bg-accent px-4 py-2 font-semibold text-neutral-900"
        >
          ✓
        </button>
      </div>
      <label className="mt-1 flex items-center gap-1.5 pl-8 text-xs text-neutral-500">
        <input type="checkbox" checked={isWarmup} onChange={(e) => setIsWarmup(e.target.checked)} />
        warmup
      </label>
    </div>
  );
}

function ExtraSetRow(props: RowProps) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full py-2 text-sm text-neutral-500">
        + extra set
      </button>
    );
  }
  return <PendingRow {...props} primed />;
}

function LoggedRow({
  index,
  set,
  unit,
  onEdit,
}: {
  index: number;
  set: LoggedSet;
  unit: WeightUnit;
  onEdit: (patch: Partial<LoggedSet> | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const step = unit === 'kg' ? 2.5 : 5;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-2 rounded-xl bg-background px-3 py-2.5 text-left"
      >
        <span className="w-8 text-sm text-neutral-600">#{index + 1}</span>
        <span className="font-mono text-neutral-300">
          {set.weightKg === 0 ? 'BW' : formatWeight(set.weightKg, unit)} ×{set.reps}
        </span>
        {set.isWarmup && <span className="rounded bg-neutral-800 px-1.5 text-xs text-neutral-400">warmup</span>}
        {set.rpe !== undefined && <span className="text-xs text-neutral-500">RPE {set.rpe}</span>}
        <span className="ml-auto text-accent">✓</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-3 ring-1 ring-neutral-600">
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm text-neutral-500">#{index + 1}</span>
        <div className="flex items-center gap-1">
          <Stepper label="decrease weight" onClick={() => onEdit({ weightKg: Math.max(0, fromDisplay(toDisplay(set.weightKg, unit) - step, unit)) })}>−</Stepper>
          <span className="min-w-16 text-center font-mono">{formatWeight(set.weightKg, unit)}</span>
          <Stepper label="increase weight" onClick={() => onEdit({ weightKg: fromDisplay(toDisplay(set.weightKg, unit) + step, unit) })}>+</Stepper>
        </div>
        <div className="ml-1 flex items-center gap-1">
          <Stepper label="decrease reps" onClick={() => onEdit({ reps: Math.max(1, set.reps - 1) })}>−</Stepper>
          <span className="min-w-10 text-center font-mono">×{set.reps}</span>
          <Stepper label="increase reps" onClick={() => onEdit({ reps: set.reps + 1 })}>+</Stepper>
        </div>
        <button type="button" onClick={() => setEditing(false)} className="ml-auto rounded-lg bg-neutral-700 px-3 py-2 text-sm">
          Done
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between pl-8">
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          <input type="checkbox" checked={set.isWarmup} onChange={(e) => onEdit({ isWarmup: e.target.checked })} />
          warmup
        </label>
        <button type="button" onClick={() => onEdit(null)} className="text-xs text-red-400">
          delete set
        </button>
      </div>
    </div>
  );
}

function Stepper({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-9 w-9 rounded-lg bg-neutral-700 text-lg leading-none"
    >
      {children}
    </button>
  );
}
