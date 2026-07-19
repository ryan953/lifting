/**
 * Catalog build pipeline: free-exercise-db → web/public/catalog/.
 *
 *   pnpm catalog:build [--source <path-to-free-exercise-db>]
 *
 * Clones the dataset if no --source is given, normalizes every exercise into
 * our CatalogExercise shape, merges curated variants.json and videos.json,
 * emits catalog.json plus resized-in-place demo images.
 *
 * Catalog ids are the dataset's stable ids and are PERMANENT — user history
 * references them. This script must only ever add entries or mark them
 * deprecated; it must never rename or drop an id that shipped.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BodyArea, Equipment, MuscleGroup } from '../shared/src/types.ts';
import type { Catalog, CatalogExercise, VariantGroup } from '../shared/src/catalog/types.ts';
import { CATALOG_VERSION } from '../shared/src/catalog/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const outDir = path.join(repoRoot, 'web/public/catalog');

// ---------------------------------------------------------------------------
// Source dataset
// ---------------------------------------------------------------------------

interface SourceExercise {
  id: string;
  name: string;
  force: string | null;
  level: 'beginner' | 'intermediate' | 'expert';
  mechanic: 'compound' | 'isolation' | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

const sourceArg = process.argv.indexOf('--source');
let sourceDir: string;
if (sourceArg !== -1 && process.argv[sourceArg + 1]) {
  sourceDir = path.resolve(process.argv[sourceArg + 1]!);
} else {
  sourceDir = path.join(repoRoot, '.cache/free-exercise-db');
  if (!existsSync(sourceDir)) {
    mkdirSync(path.dirname(sourceDir), { recursive: true });
    console.log('Cloning free-exercise-db…');
    execSync(`git clone --depth 1 https://github.com/yuhonas/free-exercise-db.git "${sourceDir}"`, {
      stdio: 'inherit',
    });
  }
}

const exercisesDir = path.join(sourceDir, 'exercises');
if (!existsSync(exercisesDir)) {
  console.error(`No exercises/ directory in ${sourceDir}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Taxonomy mapping
// ---------------------------------------------------------------------------

const MUSCLE_MAP: Record<string, MuscleGroup> = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower_back',
  'middle back': 'upper_back',
  neck: 'neck',
  quadriceps: 'quads',
  shoulders: 'shoulders',
  traps: 'traps',
  triceps: 'triceps',
};

const EQUIPMENT_MAP: Record<string, Equipment> = {
  barbell: 'barbell',
  'e-z curl bar': 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  kettlebells: 'kettlebell',
  bands: 'bands',
  'body only': 'bodyweight',
  'medicine ball': 'other',
  'exercise ball': 'other',
  'foam roll': 'other',
  other: 'other',
};

function bodyArea(primary: MuscleGroup[], force: string | null): BodyArea {
  const first = primary[0];
  if (!first) return 'other';
  if (['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'].includes(first)) return 'lower';
  if (['abs', 'obliques', 'lower_back'].includes(first)) return 'core';
  if (['chest', 'shoulders', 'triceps'].includes(first)) return 'upper_push';
  if (['lats', 'upper_back', 'traps', 'biceps', 'forearms', 'neck'].includes(first)) return 'upper_pull';
  return force === 'push' ? 'upper_push' : force === 'pull' ? 'upper_pull' : 'other';
}

/** Categories that make sense to track sets×reps×weight against. */
const INCLUDED_CATEGORIES = new Set(['strength', 'powerlifting', 'olympic weightlifting', 'strongman', 'plyometrics']);

// ---------------------------------------------------------------------------
// Curated overlays
// ---------------------------------------------------------------------------

const variants: VariantGroup[] = JSON.parse(readFileSync(path.join(here, 'variants.json'), 'utf8'));
const videos: Record<string, string> = JSON.parse(readFileSync(path.join(here, 'videos.json'), 'utf8'));

const variantByExercise = new Map<string, { groupId: string; flavor: VariantGroup['members'][number]['flavor'] }>();
for (const group of variants) {
  for (const member of group.members) {
    variantByExercise.set(member.id, { groupId: group.groupId, flavor: member.flavor });
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const files = readdirSync(exercisesDir).filter((f) => f.endsWith('.json'));
const exercises: CatalogExercise[] = [];
const skipped: string[] = [];
const unknownIds = new Set(variantByExercise.keys());
const imageTasks: { from: string; to: string }[] = [];

for (const file of files) {
  const src: SourceExercise = JSON.parse(readFileSync(path.join(exercisesDir, file), 'utf8'));

  if (!INCLUDED_CATEGORIES.has(src.category)) {
    skipped.push(src.id);
    continue;
  }

  const primaryMuscles = src.primaryMuscles.map((m) => MUSCLE_MAP[m]).filter((m): m is MuscleGroup => !!m);
  const secondaryMuscles = src.secondaryMuscles.map((m) => MUSCLE_MAP[m]).filter((m): m is MuscleGroup => !!m);
  const variant = variantByExercise.get(src.id);
  unknownIds.delete(src.id);

  exercises.push({
    id: src.id,
    name: src.name,
    primaryMuscles,
    secondaryMuscles,
    bodyArea: bodyArea(primaryMuscles, src.force),
    equipment: EQUIPMENT_MAP[src.equipment ?? 'other'] ?? 'other',
    level: src.level,
    mechanic: src.mechanic,
    instructions: src.instructions,
    images: src.images,
    ...(videos[src.id] ? { videoId: videos[src.id] } : {}),
    ...(variant ? { variantGroup: variant } : {}),
  });

  for (const img of src.images) {
    imageTasks.push({ from: path.join(exercisesDir, img), to: path.join(outDir, 'images', img) });
  }
}

if (unknownIds.size > 0) {
  console.error(`variants.json references unknown/excluded exercise ids:\n  ${[...unknownIds].join('\n  ')}`);
  process.exit(1);
}

exercises.sort((a, b) => a.id.localeCompare(b.id));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, 'images'), { recursive: true });

const catalog: Catalog = { version: CATALOG_VERSION, exercises };
writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(catalog));

for (const task of imageTasks) {
  cpSync(task.from, task.to);
}

// Muscle map for server-side aggregation (functions can't fetch the catalog).
const muscleMap = Object.fromEntries(
  exercises.map((ex) => [ex.id, { primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles }]),
);
writeFileSync(path.join(repoRoot, 'functions/src/catalog-muscles.json'), JSON.stringify(muscleMap));

const jsonKb = Math.round(Buffer.byteLength(JSON.stringify(catalog)) / 1024);
console.log(
  `catalog.json: ${exercises.length} exercises (${jsonKb} KB), ${imageTasks.length} images. Skipped ${skipped.length} (cardio/stretching/etc).`,
);
