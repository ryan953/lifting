import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { deleteDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import type { LoggedSet } from '@lifting/shared';
import { evaluateOutcome, formatWeight } from '@lifting/shared';
import { SetLogger } from '@/features/session/SetLogger';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { useUser } from '@/lib/auth';
import { refs, useLiveDoc } from '@/lib/db';
import { useProfile } from '@/lib/profile';

export const Route = createFileRoute('/_app/history/$sessionId')({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  const user = useUser();
  const navigate = useNavigate();
  const { unit } = useProfile();
  const { exercises: library } = useExerciseLibrary();
  const live = useLiveDoc(['session', user.uid, sessionId], refs.session(user.uid, sessionId));
  const [editing, setEditing] = useState(false);

  const session = live.data?.data;
  if (live.data === null) return <p className="p-4 text-neutral-500">Session not found.</p>;
  if (!session) return <p className="p-4 text-neutral-500">Loading…</p>;

  async function editSet(exerciseIndex: number, setIndex: number, patch: Partial<LoggedSet> | null) {
    if (!session) return;
    const exercises = session.exercises.map((ex, i) => {
      if (i !== exerciseIndex) return ex;
      const sets =
        patch === null ? ex.sets.filter((_, si) => si !== setIndex) : ex.sets.map((s, si) => (si === setIndex ? { ...s, ...patch } : s));
      const updated = { ...ex, sets };
      return { ...updated, outcome: evaluateOutcome(updated) };
    });
    await updateDoc(refs.session(user.uid, sessionId), { exercises });
  }

  async function addSet(exerciseIndex: number, set: LoggedSet) {
    if (!session) return;
    const exercises = session.exercises.map((ex, i) => {
      if (i !== exerciseIndex) return ex;
      const updated = { ...ex, sets: [...ex.sets, set] };
      return { ...updated, outcome: evaluateOutcome(updated) };
    });
    await updateDoc(refs.session(user.uid, sessionId), { exercises });
  }

  async function remove() {
    if (!confirm('Delete this workout from history? This cannot be undone.')) return;
    await deleteDoc(refs.session(user.uid, sessionId));
    void navigate({ to: '/history' });
  }

  return (
    <div className="p-4">
      <Link to="/history" className="text-sm text-neutral-400">
        ‹ History
      </Link>
      <header className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{session.templateName}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {session.completedAt && new Date(session.completedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            {session.status === 'abandoned' && <span className="ml-2 text-amber-400">abandoned</span>}
          </p>
        </div>
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded-lg bg-surface px-3 py-1.5 text-sm">
          {editing ? 'Done' : 'Edit'}
        </button>
      </header>

      <div className="mt-4 space-y-6">
        {session.exercises.map((ex, i) => {
          const lib = library?.find((e) => e.id === ex.exerciseId);
          return (
            <section key={`${ex.exerciseId}-${i}`}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{lib?.name ?? ex.exerciseId}</h2>
                {ex.outcome && (
                  <span
                    className={`text-xs ${
                      ex.outcome === 'met' ? 'text-accent' : ex.outcome === 'missed' ? 'text-amber-400' : 'text-neutral-500'
                    }`}
                  >
                    {ex.outcome}
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-500">
                Target: {ex.targetSets}×{ex.targetReps}
                {ex.targetWeightKg !== null && ` @ ${formatWeight(ex.targetWeightKg, unit)}`}
              </p>

              {editing ? (
                <div className="mt-2">
                  <SetLogger
                    exercise={ex}
                    unit={unit}
                    onLogSet={(set) => void addSet(i, set)}
                    onEditSet={(si, patch) => void editSet(i, si, patch)}
                  />
                </div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {ex.sets.map((s, si) => (
                    <li key={si} className="flex items-center gap-2 rounded-lg bg-surface/50 px-3 py-2 font-mono text-sm">
                      <span className="text-neutral-600">#{si + 1}</span>
                      {s.weightKg === 0 ? 'BW' : formatWeight(s.weightKg, unit)} ×{s.reps}
                      {s.isWarmup && <span className="rounded bg-neutral-800 px-1.5 font-sans text-xs text-neutral-400">warmup</span>}
                    </li>
                  ))}
                  {ex.sets.length === 0 && <li className="text-sm text-neutral-600">No sets logged.</li>}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <button type="button" onClick={() => void remove()} className="mt-8 text-sm text-red-400">
        Delete workout
      </button>
    </div>
  );
}
