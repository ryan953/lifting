import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { deleteDoc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import type { VariantFlavor } from '@lifting/shared';
import { catalogImageUrl, useCatalog, youtubeSearchUrl } from '@/features/exercises/catalog';
import { MuscleDiagram } from '@/features/exercises/MuscleDiagram';
import { VideoEmbed } from '@/features/exercises/VideoEmbed';
import { overrideDoc, useLibraryExercise } from '@/features/exercises/useExerciseLibrary';
import { useUser } from '@/lib/auth';
import { refs } from '@/lib/db';

export const Route = createFileRoute('/_app/exercises/$exerciseId')({
  component: ExerciseDetailPage,
});

const FLAVOR_LABEL: Record<VariantFlavor, string> = {
  free_weight: 'Free weight',
  machine: 'Machine',
  cable: 'Cable',
  at_home: 'At home',
  bodyweight: 'Bodyweight',
};

function ExerciseDetailPage() {
  const { exerciseId } = Route.useParams();
  const user = useUser();
  const navigate = useNavigate();
  const exercise = useLibraryExercise(exerciseId);
  const catalog = useCatalog();
  const [imageIndex, setImageIndex] = useState(0);

  if (exercise === undefined) {
    return <p className="p-4 text-neutral-500">Loading…</p>;
  }
  if (exercise === null) {
    return <p className="p-4 text-neutral-500">Exercise not found.</p>;
  }

  const cat = exercise.catalog;
  const variantSiblings =
    cat?.variantGroup && catalog.data
      ? catalog.data.exercises.filter(
          (e) => e.variantGroup?.groupId === cat.variantGroup!.groupId && e.id !== cat.id && !e.deprecated,
        )
      : [];

  async function toggleArchived() {
    if (!exercise) return;
    if (exercise.isCustom) {
      await setDoc(refs.exercise(user.uid, exercise.id), { isArchived: !exercise.isArchived } as never, { merge: true });
    } else {
      await setDoc(
        refs.exercise(user.uid, exercise.id),
        overrideDoc(exercise.id, { isArchived: !exercise.isArchived, notes: exercise.notes }),
      );
    }
  }

  async function deleteCustom() {
    if (!exercise?.isCustom) return;
    if (!confirm(`Delete "${exercise.name}"? History referencing it keeps the id.`)) return;
    await deleteDoc(refs.exercise(user.uid, exercise.id));
    void navigate({ to: '/exercises' });
  }

  return (
    <div className="p-4">
      <Link to="/exercises" className="text-sm text-neutral-400">
        ‹ Exercises
      </Link>
      <header className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{exercise.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {exercise.equipment}
            {cat && <> · {cat.level}</>}
            {cat?.mechanic && <> · {cat.mechanic}</>}
            {exercise.isCustom && <> · custom</>}
          </p>
        </div>
        <button type="button" onClick={() => void toggleArchived()} className="shrink-0 rounded-lg bg-surface px-3 py-1.5 text-sm">
          {exercise.isArchived ? 'Unarchive' : 'Archive'}
        </button>
      </header>

      <section aria-label="Muscles worked" className="mt-4 rounded-2xl bg-surface p-4">
        <MuscleDiagram primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} />
        <p className="mt-3 text-center text-sm">
          <span className="text-accent">{exercise.primaryMuscles.join(', ').replaceAll('_', ' ')}</span>
          {exercise.secondaryMuscles.length > 0 && (
            <span className="text-neutral-400"> · {exercise.secondaryMuscles.join(', ').replaceAll('_', ' ')}</span>
          )}
        </p>
      </section>

      {cat && cat.images.length > 0 && (
        <section aria-label="Demonstration" className="mt-4">
          <button
            type="button"
            className="w-full overflow-hidden rounded-2xl"
            onClick={() => setImageIndex((i) => (i + 1) % cat.images.length)}
            aria-label="Toggle start/end position"
          >
            <img
              src={catalogImageUrl(cat.images[imageIndex] ?? cat.images[0]!)}
              alt={`${exercise.name} — position ${imageIndex + 1} of ${cat.images.length}`}
              className="w-full bg-white"
            />
          </button>
          <p className="mt-1 text-center text-xs text-neutral-500">
            Tap to see {imageIndex === 0 ? 'end' : 'start'} position
          </p>
          <VideoEmbed videoId={cat.videoId} searchUrl={youtubeSearchUrl(cat)} title={exercise.name} />
        </section>
      )}

      {cat && cat.instructions.length > 0 && (
        <section aria-label="How to perform" className="mt-4">
          <h2 className="text-lg font-semibold">How to</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-neutral-300">
            {cat.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {variantSiblings.length > 0 && (
        <section aria-label="Variants" className="mt-4">
          <h2 className="text-lg font-semibold">Variants</h2>
          <ul className="mt-2 space-y-2">
            {variantSiblings.map((v) => (
              <li key={v.id}>
                <Link
                  to="/exercises/$exerciseId"
                  params={{ exerciseId: v.id }}
                  className="flex items-center justify-between rounded-xl bg-surface px-4 py-3"
                >
                  <span>{v.name}</span>
                  <span className="text-xs text-neutral-400">{FLAVOR_LABEL[v.variantGroup!.flavor]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {exercise.isCustom && (
        <button type="button" onClick={() => void deleteCustom()} className="mt-6 text-sm text-red-400">
          Delete custom exercise
        </button>
      )}
    </div>
  );
}
