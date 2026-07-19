import { addDoc, updateDoc } from 'firebase/firestore';
import type {
  LoggedSet,
  Session,
  SessionExercise,
  Targets,
  WorkoutTemplate,
} from '@lifting/shared';
import { evaluateOutcome } from '@lifting/shared';
import { refs } from '@/lib/db';

export interface ExercisePlan {
  exerciseId: string;
  targets: Targets;
  appliedRule: SessionExercise['appliedRule'];
  waveWeek?: number;
  restSec?: number;
}

/** Create the session doc and point activeSessionId at it. */
export async function startSession(
  uid: string,
  templateId: string | null,
  templateName: string,
  plans: ExercisePlan[],
): Promise<string> {
  const session: Session = {
    templateId,
    templateName,
    status: 'active',
    startedAt: Date.now(),
    completedAt: null,
    exercises: plans.map((p, order) => ({
      exerciseId: p.exerciseId,
      order,
      targetSets: p.targets.sets,
      targetReps: p.targets.reps,
      targetWeightKg: p.targets.weightKg,
      appliedRule: p.appliedRule,
      ...(p.waveWeek !== undefined ? { waveWeek: p.waveWeek } : {}),
      ...(p.restSec !== undefined ? { restSec: p.restSec } : {}),
      sets: [],
    })),
    exerciseIds: plans.map((p) => p.exerciseId),
  };

  const ref = await addDoc(refs.sessions(uid), session);
  await updateDoc(refs.userProfile(uid), { activeSessionId: ref.id });
  return ref.id;
}

/** Plans that mirror the template verbatim (no progression applied). */
export function plansFromTemplate(template: WorkoutTemplate): ExercisePlan[] {
  return [...template.exercises]
    .sort((a, b) => a.order - b.order)
    .map((te) => ({
      exerciseId: te.exerciseId,
      targets: { sets: te.targetSets, reps: te.targetReps, weightKg: te.targetWeightKg },
      appliedRule: te.progressionOptions[te.defaultProgressionIndex] ?? null,
      restSec: te.restSec,
    }));
}

export async function logSet(uid: string, sessionId: string, session: Session, exerciseIndex: number, set: LoggedSet) {
  const exercises = session.exercises.map((ex, i) =>
    i === exerciseIndex ? { ...ex, sets: [...ex.sets, set] } : ex,
  );
  await updateDoc(refs.session(uid, sessionId), { exercises });
}

export async function updateSet(
  uid: string,
  sessionId: string,
  session: Session,
  exerciseIndex: number,
  setIndex: number,
  patch: Partial<LoggedSet> | null,
) {
  const exercises = session.exercises.map((ex, i) => {
    if (i !== exerciseIndex) return ex;
    const sets =
      patch === null
        ? ex.sets.filter((_, si) => si !== setIndex)
        : ex.sets.map((s, si) => (si === setIndex ? { ...s, ...patch } : s));
    return { ...ex, sets };
  });
  await updateDoc(refs.session(uid, sessionId), { exercises });
}

/** Evaluate outcomes, mark completed, clear the active pointer. */
export async function completeSession(uid: string, sessionId: string, session: Session) {
  const exercises = session.exercises.map((ex) => ({ ...ex, outcome: evaluateOutcome(ex) }));
  await updateDoc(refs.session(uid, sessionId), {
    exercises,
    status: 'completed',
    completedAt: Date.now(),
  });
  await updateDoc(refs.userProfile(uid), { activeSessionId: null });
}

export async function abandonSession(uid: string, sessionId: string) {
  await updateDoc(refs.session(uid, sessionId), { status: 'abandoned', completedAt: Date.now() });
  await updateDoc(refs.userProfile(uid), { activeSessionId: null });
}
