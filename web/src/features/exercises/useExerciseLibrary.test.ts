import { describe, expect, it } from 'vitest';
import type { CatalogExercise, UserExercise } from '@lifting/shared';
import { mergeLibrary } from './useExerciseLibrary';

const bench: CatalogExercise = {
  id: 'Barbell_Bench_Press',
  name: 'Barbell Bench Press',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'shoulders'],
  bodyArea: 'upper_push',
  equipment: 'barbell',
  level: 'beginner',
  mechanic: 'compound',
  instructions: [],
  images: [],
};

const oldLift: CatalogExercise = { ...bench, id: 'Old_Lift', name: 'Old Lift', deprecated: true };

describe('mergeLibrary', () => {
  it('returns catalog exercises with no overlay', () => {
    const result = mergeLibrary([bench], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: bench.id, isCustom: false, isArchived: false });
  });

  it('excludes deprecated catalog entries', () => {
    expect(mergeLibrary([bench, oldLift], [])).toHaveLength(1);
  });

  it('applies overrides to catalog exercises', () => {
    const overlay: { id: string; data: UserExercise }[] = [
      { id: bench.id, data: { kind: 'override', catalogId: bench.id, isArchived: true, trainingMaxKg: 100 } },
    ];
    const result = mergeLibrary([bench], overlay);
    expect(result[0]).toMatchObject({ isArchived: true, trainingMaxKg: 100, isCustom: false });
  });

  it('includes custom exercises alongside catalog, sorted by name', () => {
    const overlay: { id: string; data: UserExercise }[] = [
      {
        id: 'custom-1',
        data: {
          kind: 'custom',
          name: 'Axle Press',
          primaryMuscles: ['shoulders'],
          secondaryMuscles: [],
          bodyArea: 'upper_push',
          equipment: 'other',
          isArchived: false,
          createdAt: 0,
        },
      },
    ];
    const result = mergeLibrary([bench], overlay);
    expect(result.map((e) => e.name)).toEqual(['Axle Press', 'Barbell Bench Press']);
    expect(result[0]).toMatchObject({ isCustom: true, id: 'custom-1' });
  });
});
