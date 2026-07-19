import { useState } from 'react';
import type { LoggedSet } from '@lifting/shared';
import { formatWeight, roundToPlate, waveSetTargets } from '@lifting/shared';
import { useExerciseLibrary } from '@/features/exercises/useExerciseLibrary';
import { useUser } from '@/lib/auth';
import { refs, useLiveDoc } from '@/lib/db';
import { useProfile } from '@/lib/profile';
import { RestTimer } from './RestTimer';
import { SetLogger } from './SetLogger';
import { abandonSession, completeSession, logSet, updateSet } from './sessionActions';

const DEFAULT_REST_SEC = 90;

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const user = useUser();
  const { unit } = useProfile();
  const { exercises: library } = useExerciseLibrary();
  const live = useLiveDoc(['session', user.uid, sessionId], refs.session(user.uid, sessionId));
  const [rest, setRest] = useState<{ startedAt: number; targetSec: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const session = live.data?.data;
  if (!session) {
    return <p className="p-4 text-neutral-500">Loading session…</p>;
  }
  if (session.status !== 'active') {
    // activeSessionId will be cleared momentarily; nothing to show.
    return <p className="p-4 text-neutral-500">Session closed.</p>;
  }

  const totalSets = session.exercises.reduce((n, ex) => n + ex.sets.filter((s) => !s.isWarmup).length, 0);
  const targetSets = session.exercises.reduce((n, ex) => n + ex.targetSets, 0);

  async function finish() {
    if (!session) return;
    if (!confirm('Finish and save this workout?')) return;
    setBusy(true);
    await completeSession(user.uid, sessionId, session);
  }

  async function abandon() {
    if (!confirm('Abandon this workout? Logged sets are kept in history as abandoned.')) return;
    setBusy(true);
    await abandonSession(user.uid, sessionId);
  }

  return (
    <div className="p-4">
      <header>
        <p className="text-sm text-neutral-400">Active session</p>
        <h1 className="text-2xl font-bold">{session.templateName}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {totalSets}/{targetSets} working sets · started {new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
      </header>

      <div className="mt-4 space-y-6">
        {session.exercises.map((ex, i) => {
          const lib = library?.find((e) => e.id === ex.exerciseId);
          const waveSets =
            ex.appliedRule?.kind === 'percentage' && ex.waveWeek !== undefined && lib?.trainingMaxKg !== undefined
              ? waveSetTargets(ex.appliedRule, ex.waveWeek, lib.trainingMaxKg)
              : null;

          return (
            <section key={`${ex.exerciseId}-${i}`} aria-label={lib?.name ?? ex.exerciseId}>
              <h2 className="font-semibold">{lib?.name ?? ex.exerciseId}</h2>
              <p className="text-sm text-neutral-500">
                Target: {ex.targetSets}×{ex.targetReps}
                {ex.targetWeightKg !== null && ` @ ${formatWeight(roundToPlate(ex.targetWeightKg, unit), unit)}`}
              </p>
              {waveSets && (
                <p className="text-xs text-neutral-500">
                  Wave: {waveSets.map((s) => `${formatWeight(roundToPlate(s.weightKg, unit), unit)}×${s.reps}${s.amrap ? '+' : ''}`).join(' · ')}
                </p>
              )}
              <div className="mt-2">
                <SetLogger
                  exercise={ex}
                  unit={unit}
                  onLogSet={(set: LoggedSet) => {
                    void logSet(user.uid, sessionId, session, i, set);
                    setRest({ startedAt: set.completedAt, targetSec: ex.restSec ?? DEFAULT_REST_SEC });
                  }}
                  onEditSet={(setIndex, patch) => void updateSet(user.uid, sessionId, session, i, setIndex, patch)}
                />
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void finish()}
          className="flex-1 rounded-xl bg-accent py-3 font-semibold text-neutral-900 disabled:opacity-40"
        >
          Finish workout
        </button>
        <button type="button" disabled={busy} onClick={() => void abandon()} className="rounded-xl bg-surface px-4 text-sm text-red-400">
          Abandon
        </button>
      </div>

      {rest && <RestTimer startedAt={rest.startedAt} targetSec={rest.targetSec} onDismiss={() => setRest(null)} />}
    </div>
  );
}
