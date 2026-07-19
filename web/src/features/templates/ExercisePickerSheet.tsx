import { useMemo, useState } from 'react';
import { useExerciseLibrary, type LibraryExercise } from '@/features/exercises/useExerciseLibrary';

interface Props {
  onPick: (exercise: LibraryExercise) => void;
  onClose: () => void;
}

/** Full-screen searchable picker used by the template editor. */
export function ExercisePickerSheet({ onPick, onClose }: Props) {
  const { exercises } = useExerciseLibrary();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const q = search.trim().toLowerCase();
    return exercises
      .filter((ex) => !ex.isArchived && (!q || ex.name.toLowerCase().includes(q)))
      .slice(0, 50);
  }, [exercises, search]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label="Pick an exercise">
      <div className="flex items-center gap-2 border-b border-neutral-800 p-4">
        <input
          autoFocus
          type="search"
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-neutral-700 bg-surface px-4 py-2.5 placeholder:text-neutral-500"
        />
        <button type="button" onClick={onClose} className="text-sm text-neutral-400">
          Cancel
        </button>
      </div>
      <ul className="flex-1 divide-y divide-neutral-800 overflow-y-auto p-4 pt-0">
        {filtered.map((ex) => (
          <li key={ex.id}>
            <button type="button" onClick={() => onPick(ex)} className="w-full py-3 text-left">
              {ex.name}
              <span className="block text-xs text-neutral-500">
                {ex.primaryMuscles.join(', ').replaceAll('_', ' ')} · {ex.equipment}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
