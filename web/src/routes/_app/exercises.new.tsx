import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { addDoc } from 'firebase/firestore';
import { useState } from 'react';
import type { BodyArea, Equipment, MuscleGroup, UserExercise } from '@lifting/shared';
import { MuscleDiagram } from '@/features/exercises/MuscleDiagram';
import { useUser } from '@/lib/auth';
import { refs } from '@/lib/db';

export const Route = createFileRoute('/_app/exercises/new')({
  component: NewExercisePage,
});

const ALL_MUSCLES: MuscleGroup[] = [
  'chest', 'lats', 'upper_back', 'lower_back', 'traps', 'shoulders', 'biceps', 'triceps',
  'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'abs', 'obliques', 'neck',
];

const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bands', 'bodyweight', 'other'];

function inferBodyArea(primary: MuscleGroup[]): BodyArea {
  const first = primary[0];
  if (!first) return 'other';
  if (['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'].includes(first)) return 'lower';
  if (['abs', 'obliques', 'lower_back'].includes(first)) return 'core';
  if (['chest', 'shoulders', 'triceps'].includes(first)) return 'upper_push';
  return 'upper_pull';
}

function NewExercisePage() {
  const user = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [primary, setPrimary] = useState<MuscleGroup[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(list: MuscleGroup[], set: (v: MuscleGroup[]) => void, m: MuscleGroup) {
    set(list.includes(m) ? list.filter((x) => x !== m) : [...list, m]);
  }

  async function save() {
    if (!name.trim() || primary.length === 0) return;
    setBusy(true);
    const doc: UserExercise = {
      kind: 'custom',
      name: name.trim(),
      primaryMuscles: primary,
      secondaryMuscles: secondary.filter((m) => !primary.includes(m)),
      bodyArea: inferBodyArea(primary),
      equipment,
      isArchived: false,
      createdAt: Date.now(),
    };
    const ref = await addDoc(refs.exercises(user.uid), doc);
    void navigate({ to: '/exercises/$exerciseId', params: { exerciseId: ref.id } });
  }

  return (
    <div className="p-4">
      <Link to="/exercises" className="text-sm text-neutral-400">
        ‹ Exercises
      </Link>
      <h1 className="mt-2 text-2xl font-bold">New custom exercise</h1>

      <label className="mt-4 block text-sm text-neutral-400">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Safety-bar box squat"
          className="mt-1 w-full rounded-xl border border-neutral-700 bg-surface px-4 py-2.5 text-base text-neutral-100"
        />
      </label>

      <label className="mt-4 block text-sm text-neutral-400">
        Equipment
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as Equipment)}
          className="mt-1 w-full rounded-xl border border-neutral-700 bg-surface px-4 py-2.5 text-base text-neutral-100"
        >
          {EQUIPMENT.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm text-neutral-400">Primary muscles</legend>
        <MusclePicker selected={primary} onToggle={(m) => toggle(primary, setPrimary, m)} />
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm text-neutral-400">Secondary muscles</legend>
        <MusclePicker selected={secondary} onToggle={(m) => toggle(secondary, setSecondary, m)} />
      </fieldset>

      {(primary.length > 0 || secondary.length > 0) && (
        <div className="mt-4 rounded-2xl bg-surface p-4">
          <MuscleDiagram primary={primary} secondary={secondary} />
        </div>
      )}

      <button
        type="button"
        disabled={busy || !name.trim() || primary.length === 0}
        onClick={() => void save()}
        className="mt-6 w-full rounded-xl bg-accent py-3 font-semibold text-neutral-900 disabled:opacity-40"
      >
        Create exercise
      </button>
    </div>
  );
}

function MusclePicker({ selected, onToggle }: { selected: MuscleGroup[]; onToggle: (m: MuscleGroup) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {ALL_MUSCLES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onToggle(m)}
          aria-pressed={selected.includes(m)}
          className={`rounded-full px-3 py-1 text-sm ${
            selected.includes(m) ? 'bg-accent font-semibold text-neutral-900' : 'bg-surface text-neutral-300'
          }`}
        >
          {m.replaceAll('_', ' ')}
        </button>
      ))}
    </div>
  );
}
