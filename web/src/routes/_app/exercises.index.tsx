import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { Equipment, MuscleGroup } from '@lifting/shared';
import { useExerciseLibrary, type LibraryExercise } from '@/features/exercises/useExerciseLibrary';

export const Route = createFileRoute('/_app/exercises/')({
  component: ExerciseListPage,
});

const MUSCLE_FILTERS: { value: MuscleGroup | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'chest', label: 'Chest' },
  { value: 'lats', label: 'Lats' },
  { value: 'upper_back', label: 'Upper back' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'traps', label: 'Traps' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'forearms', label: 'Forearms' },
  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'calves', label: 'Calves' },
  { value: 'abs', label: 'Abs' },
];

const EQUIPMENT_FILTERS: { value: Equipment | 'all'; label: string }[] = [
  { value: 'all', label: 'Any equipment' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'bands', label: 'Bands' },
  { value: 'bodyweight', label: 'Bodyweight' },
];

function ExerciseListPage() {
  const { exercises, isPending, error } = useExerciseLibrary();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const q = search.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (!showArchived && ex.isArchived) return false;
      if (muscle !== 'all' && !ex.primaryMuscles.includes(muscle) && !ex.secondaryMuscles.includes(muscle)) return false;
      if (equipment !== 'all' && ex.equipment !== equipment) return false;
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, search, muscle, equipment, showArchived]);

  if (error) {
    return <p className="p-4 text-red-400">Failed to load the exercise catalog: {String(error)}</p>;
  }

  return (
    <div className="p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercises</h1>
        <Link to="/exercises/new" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-neutral-900">
          + Custom
        </Link>
      </header>

      <input
        type="search"
        placeholder="Search exercises…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-3 w-full rounded-xl border border-neutral-700 bg-surface px-4 py-2.5 placeholder:text-neutral-500"
      />

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by muscle">
        {MUSCLE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setMuscle(f.value)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm ${
              muscle === f.value ? 'bg-accent font-semibold text-neutral-900' : 'bg-surface text-neutral-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as Equipment | 'all')}
          aria-label="Filter by equipment"
          className="rounded-lg border border-neutral-700 bg-surface px-2 py-1.5 text-sm"
        >
          {EQUIPMENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-400">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archived
        </label>
        <span className="ml-auto text-sm text-neutral-500">{isPending ? '…' : `${filtered.length}`}</span>
      </div>

      <ul className="mt-3 divide-y divide-neutral-800">
        {filtered.map((ex) => (
          <ExerciseRow key={ex.id} exercise={ex} />
        ))}
      </ul>
      {!isPending && filtered.length === 0 && (
        <p className="mt-8 text-center text-neutral-500">No exercises match.</p>
      )}
    </div>
  );
}

function ExerciseRow({ exercise }: { exercise: LibraryExercise }) {
  return (
    <li>
      <Link
        to="/exercises/$exerciseId"
        params={{ exerciseId: exercise.id }}
        className="flex items-center justify-between gap-2 py-3"
      >
        <div>
          <span className={exercise.isArchived ? 'text-neutral-500 line-through' : ''}>{exercise.name}</span>
          {exercise.isCustom && <span className="ml-2 rounded bg-neutral-700 px-1.5 text-xs">custom</span>}
          <p className="text-xs text-neutral-500">
            {exercise.primaryMuscles.join(', ').replaceAll('_', ' ')} · {exercise.equipment}
          </p>
        </div>
        <span className="text-neutral-600">›</span>
      </Link>
    </li>
  );
}
