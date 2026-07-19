import { useNavigate } from '@tanstack/react-router';
import { setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import type { ExerciseStats, TemplateExercise } from '@lifting/shared';
import { formatWeight, recommend, roundToPlate, type Recommendation } from '@lifting/shared';
import { overrideDoc, useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { describeRule } from '@/features/templates/progressionLabels';
import { WeightInput } from '@/components/WeightInput';
import { useUser } from '@/lib/auth';
import { refs, useLiveDoc } from '@/lib/db';
import { useProfile } from '@/lib/profile';
import { startSession, type ExercisePlan } from './sessionActions';

interface Props {
  templateId: string;
  onClose: () => void;
}

interface CardSelection {
  plan: ExercisePlan;
  /** TM to persist when this plan is confirmed (percentage cycle rollover). */
  newTrainingMaxKg?: number;
}

export function StartSessionSheet({ templateId, onClose }: Props) {
  const user = useUser();
  const navigate = useNavigate();
  const template = useLiveDoc(['template', user.uid, templateId], refs.template(user.uid, templateId));
  const { exercises: library } = useExerciseLibrary();
  const [selections, setSelections] = useState<Record<number, CardSelection>>({});
  const [busy, setBusy] = useState(false);

  const t = template.data?.data;

  if (!t || !library) {
    return (
      <Sheet onClose={onClose}>
        <p className="p-4 text-neutral-500">Loading…</p>
      </Sheet>
    );
  }

  const ordered = [...t.exercises].sort((a, b) => a.order - b.order);
  const ready = ordered.every((_, i) => selections[i]);

  async function begin() {
    if (!t || !ready) return;
    setBusy(true);

    for (const [i] of ordered.entries()) {
      const sel = selections[i]!;
      if (sel.newTrainingMaxKg !== undefined) {
        const lib = library?.find((e) => e.id === sel.plan.exerciseId);
        await setDoc(
          refs.exercise(user.uid, sel.plan.exerciseId),
          lib?.isCustom
            ? ({ trainingMaxKg: sel.newTrainingMaxKg } as never)
            : overrideDoc(sel.plan.exerciseId, {
                trainingMaxKg: sel.newTrainingMaxKg,
                isArchived: lib?.isArchived,
                notes: lib?.notes,
              }),
          { merge: true },
        );
      }
    }

    await startSession(
      user.uid,
      templateId,
      t.name,
      ordered.map((_, i) => selections[i]!.plan),
    );
    onClose();
    void navigate({ to: '/' });
  }

  return (
    <Sheet onClose={onClose}>
      <div className="p-4">
        <h2 className="text-xl font-bold">{t.name}</h2>
        <p className="mt-1 text-sm text-neutral-400">Review targets, then start.</p>

        <div className="mt-4 space-y-4">
          {ordered.map((te, i) => (
            <ExercisePlanCard
              key={`${te.exerciseId}-${i}`}
              index={i}
              templateExercise={te}
              onSelect={(sel) => setSelections((s) => ({ ...s, [i]: sel }))}
            />
          ))}
        </div>

        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void begin()}
          className="mt-6 w-full rounded-xl bg-accent py-3 font-semibold text-neutral-900 disabled:opacity-40"
        >
          Start workout
        </button>
      </div>
    </Sheet>
  );
}

function ExercisePlanCard({
  index,
  templateExercise: te,
  onSelect,
}: {
  index: number;
  templateExercise: TemplateExercise;
  onSelect: (selection: CardSelection) => void;
}) {
  const user = useUser();
  const { unit } = useProfile();
  const { exercises: library } = useExerciseLibrary();
  const stats = useLiveDoc(['exerciseStats', user.uid, te.exerciseId], refs.exerciseStats(user.uid, te.exerciseId));
  const lib = library?.find((e) => e.id === te.exerciseId);
  const [chosenIndex, setChosenIndex] = useState(0);
  const [tmDraftKg, setTmDraftKg] = useState<number | null>(null);

  const needsTM = te.progressionOptions.some((r) => r.kind === 'percentage') && lib?.trainingMaxKg === undefined;

  const recs = useMemo(
    () =>
      recommend({
        templateExercise: te,
        stats: (stats.data?.data as ExerciseStats | undefined) ?? null,
        trainingMaxKg: lib?.trainingMaxKg,
        unit,
      }),
    [te, stats.data, lib?.trainingMaxKg, unit],
  );

  // Report the chosen plan upward whenever the pick (or recs) change.
  useEffect(() => {
    const rec: Recommendation | undefined = recs[chosenIndex] ?? recs[0];
    if (!rec) return;
    onSelect({
      plan: {
        exerciseId: te.exerciseId,
        targets: rec.prescription.targets,
        appliedRule: rec.rule,
        waveWeek: rec.prescription.waveWeek,
        restSec: te.restSec,
      },
      newTrainingMaxKg: rec.prescription.newTrainingMaxKg,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, chosenIndex]);

  async function saveTM() {
    if (tmDraftKg === null || !lib) return;
    await setDoc(
      refs.exercise(user.uid, te.exerciseId),
      lib.isCustom
        ? ({ trainingMaxKg: tmDraftKg } as never)
        : overrideDoc(te.exerciseId, { trainingMaxKg: tmDraftKg, isArchived: lib.isArchived, notes: lib.notes }),
      { merge: true },
    );
  }

  const suggestedTM = stats.data?.data?.bestE1rm ? roundToPlate(stats.data.data.bestE1rm.valueKg * 0.9, unit) : null;

  return (
    <article className="rounded-2xl bg-surface p-4">
      <h3 className="font-semibold">{lib?.name ?? te.exerciseId}</h3>

      {needsTM && (
        <div className="mt-2 rounded-xl border border-amber-500/40 p-3">
          <p className="text-sm text-amber-300">Percentage progression needs a training max.</p>
          {suggestedTM !== null && (
            <p className="mt-1 text-xs text-neutral-400">Suggested from history: {formatWeight(suggestedTM, unit)}</p>
          )}
          <div className="mt-2 flex items-end gap-2">
            <WeightInput
              valueKg={tmDraftKg ?? suggestedTM}
              unit={unit}
              allowEmpty={false}
              label={`Training max (${unit})`}
              onChange={setTmDraftKg}
            />
            <button
              type="button"
              onClick={() => void saveTM()}
              className="rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-neutral-900"
            >
              Set
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 space-y-2">
        {recs.map((rec, ri) => (
          <label
            key={ri}
            className={`block cursor-pointer rounded-xl border p-3 ${
              chosenIndex === ri ? 'border-accent bg-accent/10' : 'border-neutral-700'
            }`}
          >
            <input
              type="radio"
              name={`rec-${index}`}
              className="sr-only"
              checked={chosenIndex === ri}
              onChange={() => setChosenIndex(ri)}
            />
            <span className="font-mono text-sm">
              {rec.prescription.targets.sets}×{rec.prescription.targets.reps}
              {rec.prescription.targets.weightKg !== null &&
                ` @ ${formatWeight(roundToPlate(rec.prescription.targets.weightKg, unit), unit)}`}
              {rec.prescription.isDeload && ' (deload)'}
            </span>
            <span className="mt-0.5 block text-xs text-neutral-400">{rec.reason}</span>
            <span className="mt-0.5 block text-xs text-neutral-500">{describeRule(rec.rule, unit)}</span>
          </label>
        ))}
      </div>
    </article>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Start session"
        className="max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-background pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
