#!/usr/bin/env node
/**
 * Regenerate data/exercises.json from the free-exercise-db dataset.
 *
 *   node scripts/build-catalog.mjs [--source <path-to-free-exercise-db>]
 *
 * Ids are the dataset's stable ids and are referenced by logged sets, so this
 * script may add entries but must never rename one that has shipped. Images are
 * not copied — the app points at the upstream raw URLs (see IMAGE_BASE in
 * js/catalog.js), which keeps the repo small enough for GitHub Pages.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sourceFlag = process.argv.indexOf('--source');
const sourceRoot =
  sourceFlag === -1
    ? path.resolve(repoRoot, '../lifting.ryan953.com/exercise-db-source')
    : path.resolve(process.argv[sourceFlag + 1]);

const source = JSON.parse(readFileSync(path.join(sourceRoot, 'dist/exercises.json'), 'utf8'));

const catalog = source
  .map((e) => ({
    id: e.id,
    name: e.name,
    force: e.force ?? null,
    level: e.level ?? null,
    mechanic: e.mechanic ?? null,
    equipment: e.equipment ?? null,
    category: e.category ?? null,
    primary: e.primaryMuscles ?? [],
    secondary: e.secondaryMuscles ?? [],
    instructions: e.instructions ?? [],
    images: e.images ?? [],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
writeFileSync(path.join(repoRoot, 'data/exercises.json'), JSON.stringify(catalog));

console.log(`wrote data/exercises.json — ${catalog.length} exercises`);
