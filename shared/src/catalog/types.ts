import type { BodyArea, Equipment, MuscleGroup } from '../types';

/**
 * Bumped when the generated catalog changes shape or content in a way the app
 * must react to. Catalog exercise ids are PERMANENT: user history references
 * them, so the build pipeline may add or deprecate entries but never rename
 * or remove ids.
 */
export const CATALOG_VERSION = 1;

export type VariantFlavor = 'free_weight' | 'machine' | 'cable' | 'at_home' | 'bodyweight';

export interface CatalogExercise {
  id: string;
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  bodyArea: BodyArea;
  equipment: Equipment;
  level: 'beginner' | 'intermediate' | 'expert';
  mechanic: 'compound' | 'isolation' | null;
  instructions: string[];
  /** Paths relative to /catalog/images/, typically [start, end]. */
  images: string[];
  /** Curated YouTube video id; absent → UI falls back to a search link. */
  videoId?: string;
  variantGroup?: { groupId: string; flavor: VariantFlavor };
  deprecated?: boolean;
}

export interface VariantGroup {
  groupId: string;
  members: { id: string; flavor: VariantFlavor }[];
}

export interface Catalog {
  version: number;
  exercises: CatalogExercise[];
}
