/**
 * Seed the Firestore EMULATOR with months of plausible workout history for a
 * user, so analytics screens are developable without real gym data.
 *
 *   pnpm dev                     # emulators must be running (functions too)
 *   pnpm seed:fake -- --uid <uid> [--months 6]
 *
 * Writes sessions one at a time through the normal collection so the
 * onSessionWrite trigger fires in the functions emulator and materializes
 * aggregates exactly as production would.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { LoggedSet, Session, SessionExercise } from '../shared/src/types.ts';
import { evaluateOutcome } from '../shared/src/progression/engine.ts';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const uid = argValue('--uid');
const months = Number(argValue('--months') ?? 6);
if (!uid) {
  console.error('usage: seed-fake-history --uid <auth-emulator-uid> [--months 6]');
  process.exit(1);
}

// Deterministic PRNG so re-runs produce the same history.
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
}

interface PlanExercise {
  exerciseId: string;
  startWeightKg: number;
  incrementKg: number;
  sets: number;
  reps: number;
}

const PLANS: { name: string; exercises: PlanExercise[] }[] = [
  {
    name: 'Push Day',
    exercises: [
      { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', startWeightKg: 60, incrementKg: 2.5, sets: 3, reps: 5 },
      { exerciseId: 'Barbell_Shoulder_Press', startWeightKg: 40, incrementKg: 2.5, sets: 3, reps: 8 },
      { exerciseId: 'Triceps_Pushdown', startWeightKg: 25, incrementKg: 2.5, sets: 3, reps: 10 },
    ],
  },
  {
    name: 'Pull Day',
    exercises: [
      { exerciseId: 'Barbell_Deadlift', startWeightKg: 100, incrementKg: 5, sets: 3, reps: 5 },
      { exerciseId: 'Bent_Over_Barbell_Row', startWeightKg: 60, incrementKg: 2.5, sets: 3, reps: 8 },
      { exerciseId: 'Barbell_Curl', startWeightKg: 25, incrementKg: 1.25, sets: 3, reps: 10 },
    ],
  },
  {
    name: 'Leg Day',
    exercises: [
      { exerciseId: 'Barbell_Squat', startWeightKg: 80, incrementKg: 2.5, sets: 3, reps: 5 },
      { exerciseId: 'Romanian_Deadlift', startWeightKg: 70, incrementKg: 2.5, sets: 3, reps: 8 },
      { exerciseId: 'Standing_Calf_Raises', startWeightKg: 45, incrementKg: 2.5, sets: 4, reps: 12 },
    ],
  },
];

initializeApp({ projectId: 'demo-lifting' });
const db = getFirestore();

async function main() {
  const now = Date.now();
  const start = now - months * 30 * 86400_000;
  const weights = new Map<string, number>();
  for (const plan of PLANS) {
    for (const ex of plan.exercises) weights.set(ex.exerciseId, ex.startWeightKg);
  }

  let day = start;
  let planIndex = 0;
  let written = 0;

  while (day < now - 86400_000) {
    // Train ~3-4x/week: skip days probabilistically; occasional vacation week.
    const dayOfCycle = Math.floor((day - start) / 86400_000);
    const onVacation = dayOfCycle % 63 >= 56; // one week off every ~9 weeks
    const trainsToday = !onVacation && rand() < 0.52;

    if (trainsToday) {
      const plan = PLANS[planIndex % PLANS.length]!;
      planIndex++;

      const startedAt = day + (17 * 60 + Math.floor(rand() * 90)) * 60_000; // ~5-6:30pm
      const exercises: SessionExercise[] = [];

      for (const [order, planEx] of plan.exercises.entries()) {
        const targetWeight = weights.get(planEx.exerciseId)!;
        // ~15% chance of a bad day (missed reps).
        const badDay = rand() < 0.15;
        const sets: LoggedSet[] = [];
        for (let s = 0; s < planEx.sets; s++) {
          const isLastSet = s === planEx.sets - 1;
          const reps = badDay && isLastSet ? Math.max(1, planEx.reps - 1 - Math.floor(rand() * 2)) : planEx.reps;
          sets.push({
            weightKg: targetWeight,
            reps,
            isWarmup: false,
            completedAt: startedAt + (order * planEx.sets + s + 1) * 3 * 60_000,
          });
        }

        const ex: SessionExercise = {
          exerciseId: planEx.exerciseId,
          order,
          targetSets: planEx.sets,
          targetReps: planEx.reps,
          targetWeightKg: targetWeight,
          appliedRule: { kind: 'linear_weight', incrementKg: planEx.incrementKg },
          sets,
        };
        ex.outcome = evaluateOutcome(ex);
        exercises.push(ex);

        if (ex.outcome === 'met') {
          weights.set(planEx.exerciseId, targetWeight + planEx.incrementKg);
        } else if (rand() < 0.3) {
          // occasional deload after a miss
          weights.set(planEx.exerciseId, Math.round(targetWeight * 0.9 / 2.5) * 2.5);
        }
      }

      const completedAt = exercises.at(-1)!.sets.at(-1)!.completedAt + 5 * 60_000;
      const session: Session = {
        templateId: null,
        templateName: plan.name,
        status: 'completed',
        startedAt,
        completedAt,
        exercises,
        exerciseIds: exercises.map((e) => e.exerciseId),
      };

      await db.collection(`users/${uid}/sessions`).add(session);
      written++;
      if (written % 10 === 0) console.log(`  ${written} sessions…`);
    }

    day += 86400_000;
  }

  console.log(`Seeded ${written} sessions over ${months} months for uid=${uid}.`);
  console.log('If the functions emulator was running, aggregates are materializing now.');
  console.log('Otherwise call the recomputeStats function from the app, or restart emulators with functions.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
