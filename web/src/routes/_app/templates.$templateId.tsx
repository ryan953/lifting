import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { TemplateExercise, WorkoutTemplate } from '@lifting/shared';
import { WeightInput } from '@/components/WeightInput';
import { ExercisePickerSheet } from '@/features/templates/ExercisePickerSheet';
import { RuleEditor } from '@/features/templates/RuleEditor';
import { defaultRule, describeRule } from '@/features/templates/progressionLabels';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { useUser } from '@/lib/auth';
import { refs, useLiveDoc } from '@/lib/db';
import { useProfile } from '@/lib/profile';

export const Route = createFileRoute('/_app/templates/$templateId')({
  component: TemplateEditorPage,
});

function newTemplate(): WorkoutTemplate {
  return {
    name: '',
    exercises: [],
    isArchived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function TemplateEditorPage() {
  const { templateId } = Route.useParams();
  const isNew = templateId === 'new';
  const user = useUser();
  const navigate = useNavigate();
  const { unit } = useProfile();
  const { exercises: library } = useExerciseLibrary();

  const remote = useLiveDoc(
    ['template', user.uid, templateId],
    isNew ? null : refs.template(user.uid, templateId),
  );

  const [draft, setDraft] = useState<WorkoutTemplate | null>(isNew ? newTemplate() : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hydrate the draft from Firestore exactly once per template load.
  useEffect(() => {
    if (!isNew && remote.data && draft === null) {
      setDraft(remote.data.data);
    }
  }, [isNew, remote.data, draft]);

  if (!draft) {
    if (!isNew && remote.data === null && !remote.isPending) {
      return <p className="p-4 text-neutral-500">Template not found.</p>;
    }
    return <p className="p-4 text-neutral-500">Loading…</p>;
  }

  function exerciseName(id: string): string {
    return library?.find((e) => e.id === id)?.name ?? id;
  }

  function updateExercise(index: number, patch: Partial<TemplateExercise>) {
    setDraft((d) => {
      if (!d) return d;
      const exercises = d.exercises.map((ex, i) => (i === index ? { ...ex, ...patch } : ex));
      return { ...d, exercises };
    });
  }

  function removeExercise(index: number) {
    setDraft((d) => {
      if (!d) return d;
      const exercises = d.exercises.filter((_, i) => i !== index).map((ex, i) => ({ ...ex, order: i }));
      return { ...d, exercises };
    });
  }

  function moveExercise(index: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const target = index + dir;
      if (target < 0 || target >= d.exercises.length) return d;
      const exercises = [...d.exercises];
      const [ex] = exercises.splice(index, 1);
      exercises.splice(target, 0, ex!);
      return { ...d, exercises: exercises.map((e, i) => ({ ...e, order: i })) };
    });
  }

  async function save() {
    if (!draft || !draft.name.trim() || draft.exercises.length === 0) return;
    setBusy(true);
    const doc: WorkoutTemplate = { ...draft, name: draft.name.trim(), updatedAt: Date.now() };
    if (isNew) {
      await addDoc(refs.templates(user.uid), doc);
    } else {
      await setDoc(refs.template(user.uid, templateId), doc);
    }
    void navigate({ to: '/templates' });
  }

  async function remove() {
    if (isNew) return;
    if (!confirm(`Delete template "${draft?.name}"? Completed sessions are unaffected.`)) return;
    await deleteDoc(refs.template(user.uid, templateId));
    void navigate({ to: '/templates' });
  }

  return (
    <div className="p-4">
      <Link to="/templates" className="text-sm text-neutral-400">
        ‹ Templates
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{isNew ? 'New template' : 'Edit template'}</h1>

      <label className="mt-4 block text-sm text-neutral-400">
        Name
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. Push Day A"
          className="mt-1 w-full rounded-xl border border-neutral-700 bg-surface px-4 py-2.5 text-base text-neutral-100"
        />
      </label>

      <section className="mt-6 space-y-4">
        {draft.exercises.map((ex, i) => (
          <article key={`${ex.exerciseId}-${i}`} className="rounded-2xl bg-surface p-4">
            <header className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{exerciseName(ex.exerciseId)}</h2>
              <div className="flex shrink-0 gap-2 text-sm text-neutral-400">
                <button type="button" onClick={() => moveExercise(i, -1)} disabled={i === 0} aria-label="Move up" className="disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => moveExercise(i, 1)} disabled={i === draft.exercises.length - 1} aria-label="Move down" className="disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => removeExercise(i)} className="text-red-400">
                  ✕
                </button>
              </div>
            </header>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <label className="text-sm text-neutral-400">
                Sets
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={ex.targetSets}
                  onChange={(e) => updateExercise(i, { targetSets: Math.max(1, Number(e.target.value) || 1) })}
                  className="mt-1 w-full rounded-xl border border-neutral-700 bg-background px-3 py-2 text-base text-neutral-100"
                />
              </label>
              <label className="text-sm text-neutral-400">
                Reps
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={ex.targetReps}
                  onChange={(e) => updateExercise(i, { targetReps: Math.max(1, Number(e.target.value) || 1) })}
                  className="mt-1 w-full rounded-xl border border-neutral-700 bg-background px-3 py-2 text-base text-neutral-100"
                />
              </label>
              <label className="text-sm text-neutral-400">
                Rest (s)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={15}
                  value={ex.restSec ?? ''}
                  placeholder="90"
                  onChange={(e) => updateExercise(i, { restSec: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                  className="mt-1 w-full rounded-xl border border-neutral-700 bg-background px-3 py-2 text-base text-neutral-100"
                />
              </label>
            </div>

            <div className="mt-3">
              <WeightInput
                label={`Starting weight (${unit})`}
                valueKg={ex.targetWeightKg}
                unit={unit}
                onChange={(kg) => updateExercise(i, { targetWeightKg: kg })}
              />
            </div>

            <fieldset className="mt-4">
              <legend className="text-sm text-neutral-400">Progression options</legend>
              <div className="mt-2 space-y-2">
                {ex.progressionOptions.map((rule, ri) => (
                  <div key={ri}>
                    <label className="flex items-center gap-2 pb-1 text-xs text-neutral-500">
                      <input
                        type="radio"
                        name={`default-rule-${i}`}
                        checked={ex.defaultProgressionIndex === ri}
                        onChange={() => updateExercise(i, { defaultProgressionIndex: ri })}
                      />
                      Default · {describeRule(rule, unit)}
                    </label>
                    <RuleEditor
                      rule={rule}
                      unit={unit}
                      onChange={(r) =>
                        updateExercise(i, {
                          progressionOptions: ex.progressionOptions.map((o, oi) => (oi === ri ? r : o)),
                        })
                      }
                      onRemove={() =>
                        updateExercise(i, {
                          progressionOptions: ex.progressionOptions.filter((_, oi) => oi !== ri),
                          defaultProgressionIndex: Math.max(
                            0,
                            Math.min(ex.defaultProgressionIndex, ex.progressionOptions.length - 2),
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateExercise(i, {
                      progressionOptions: [...ex.progressionOptions, defaultRule('linear_weight', unit)],
                    })
                  }
                  className="text-sm text-accent"
                >
                  + Add progression option
                </button>
              </div>
            </fieldset>
          </article>
        ))}
      </section>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mt-4 w-full rounded-xl border border-dashed border-neutral-600 py-3 text-neutral-300"
      >
        + Add exercise
      </button>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={busy || !draft.name.trim() || draft.exercises.length === 0}
          onClick={() => void save()}
          className="flex-1 rounded-xl bg-accent py-3 font-semibold text-neutral-900 disabled:opacity-40"
        >
          Save template
        </button>
        {!isNew && (
          <button type="button" onClick={() => void remove()} className="rounded-xl bg-surface px-4 text-sm text-red-400">
            Delete
          </button>
        )}
      </div>

      {pickerOpen && (
        <ExercisePickerSheet
          onClose={() => setPickerOpen(false)}
          onPick={(ex) => {
            setDraft((d) =>
              d
                ? {
                    ...d,
                    exercises: [
                      ...d.exercises,
                      {
                        exerciseId: ex.id,
                        order: d.exercises.length,
                        targetSets: 3,
                        targetReps: 8,
                        targetWeightKg: null,
                        progressionOptions: [defaultRule('linear_weight', unit)],
                        defaultProgressionIndex: 0,
                        restSec: 90,
                      },
                    ],
                  }
                : d,
            );
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
