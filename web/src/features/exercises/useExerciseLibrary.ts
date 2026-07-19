import { useMemo } from 'react';
import type {
  BodyArea,
  CatalogExercise,
  CustomExercise,
  Equipment,
  MuscleGroup,
  UserExercise,
} from '@lifting/shared';
import { useUser } from '@/lib/auth';
import { refs, useLiveQuery } from '@/lib/db';
import { useCatalog } from './catalog';

/** A catalog exercise merged with its user overlay, or a custom exercise. */
export interface LibraryExercise {
  id: string;
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  bodyArea: BodyArea;
  equipment: Equipment;
  isArchived: boolean;
  isCustom: boolean;
  notes?: string;
  trainingMaxKg?: number;
  catalog?: CatalogExercise;
}

/** Merge the static catalog with the user's overlay docs. Pure; unit-tested. */
export function mergeLibrary(
  catalogExercises: CatalogExercise[],
  overlayDocs: { id: string; data: UserExercise }[],
): LibraryExercise[] {
  const overrides = new Map<string, { isArchived?: boolean; notes?: string; trainingMaxKg?: number }>();
  const customs: LibraryExercise[] = [];

  for (const { id, data } of overlayDocs) {
    if (data.kind === 'override') {
      overrides.set(data.catalogId, data);
    } else {
      const c = data as { kind: 'custom' } & CustomExercise;
      customs.push({
        id,
        name: c.name,
        primaryMuscles: c.primaryMuscles,
        secondaryMuscles: c.secondaryMuscles,
        bodyArea: c.bodyArea,
        equipment: c.equipment,
        isArchived: c.isArchived,
        isCustom: true,
        notes: c.notes,
        trainingMaxKg: c.trainingMaxKg,
      });
    }
  }

  const fromCatalog: LibraryExercise[] = catalogExercises
    .filter((ex) => !ex.deprecated)
    .map((ex) => {
      const o = overrides.get(ex.id);
      return {
        id: ex.id,
        name: ex.name,
        primaryMuscles: ex.primaryMuscles,
        secondaryMuscles: ex.secondaryMuscles,
        bodyArea: ex.bodyArea,
        equipment: ex.equipment,
        isArchived: o?.isArchived ?? false,
        isCustom: false,
        notes: o?.notes,
        trainingMaxKg: o?.trainingMaxKg,
        catalog: ex,
      };
    });

  return [...customs, ...fromCatalog].sort((a, b) => a.name.localeCompare(b.name));
}

export function useExerciseLibrary() {
  const user = useUser();
  const catalog = useCatalog();
  const overlay = useLiveQuery(['exercises', user.uid], refs.exercises(user.uid));

  const merged = useMemo(
    () => (catalog.data ? mergeLibrary(catalog.data.exercises, overlay.data ?? []) : null),
    [catalog.data, overlay.data],
  );

  return {
    exercises: merged,
    isPending: catalog.isPending || overlay.isPending,
    error: catalog.error,
  };
}

export function useLibraryExercise(id: string): LibraryExercise | null | undefined {
  const { exercises, isPending } = useExerciseLibrary();
  if (isPending || !exercises) return undefined;
  return exercises.find((e) => e.id === id) ?? null;
}

/** Overlay doc for modifying a catalog exercise; write to refs.exercise(uid, catalogId). */
export function overrideDoc(
  catalogId: string,
  patch: { isArchived?: boolean; notes?: string; trainingMaxKg?: number },
): UserExercise {
  return { kind: 'override', catalogId, ...patch };
}
