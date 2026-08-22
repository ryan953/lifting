#!/usr/bin/env node
/**
 * Import the Obsidian vault's workout log into data/seed-log.json.
 *
 *   node scripts/import-vault.mjs [--vault <path>]
 *
 * The vault stores one file per session in `log/` (frontmatter: day_type, date,
 * movements[]) and one file per logged exercise in `log/entries/` (frontmatter:
 * exercise wikilink, session wikilink, slot, order, setN_reps, setN_weight).
 * We flatten those into the app's day/block/set shape so a fresh install has
 * real history to show under "Last time".
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const vaultFlag = process.argv.indexOf('--vault');
const vault =
  vaultFlag === -1
    ? path.join(
        process.env.HOME,
        'Library/Mobile Documents/iCloud~md~obsidian/Documents/Lifting'
      )
    : path.resolve(process.argv[vaultFlag + 1]);

if (!existsSync(vault)) {
  console.error(`No vault at ${vault}`);
  process.exit(1);
}

/** Parse just enough YAML for this vault: scalars, and `movements` list-of-maps. */
function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return {};

  const out = {};
  let list = null;
  let item = null;

  for (const raw of match[1].split('\n')) {
    const listItem = /^\s{2}- (\w+): (.*)$/.exec(raw);
    const listCont = /^\s{4}(\w+): (.*)$/.exec(raw);
    const scalar = /^(\w+): ?(.*)$/.exec(raw);

    if (list && listItem) {
      item = { [listItem[1]]: unquote(listItem[2]) };
      out[list].push(item);
    } else if (list && listCont && item) {
      item[listCont[1]] = unquote(listCont[2]);
    } else if (scalar) {
      const [, key, value] = scalar;
      if (value === '' || value === '[]') {
        list = value === '' ? key : null;
        item = null;
        out[key] = [];
      } else {
        list = null;
        item = null;
        out[key] = unquote(value);
      }
    }
  }
  return out;
}

const unquote = (v) => v.trim().replace(/^"(.*)"$/, '$1');

/** `[[exercise-db/notes/Pushups|Pushups]]` → { id: 'Pushups', label: 'Pushups' } */
function wikilink(value) {
  const match = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(value ?? '');
  if (!match) return null;
  const target = match[1];
  return { id: path.basename(target), label: match[2] ?? path.basename(target) };
}

const sessions = new Map();
for (const file of readdirSync(path.join(vault, 'log'))) {
  if (!file.endsWith('.md')) continue;
  const fm = frontmatter(readFileSync(path.join(vault, 'log', file), 'utf8'));
  if (!fm.date) continue;
  const day = {
    date: String(fm.date),
    dayType: fm.day_type,
    activation: {},
    checklist: {},
    blocks: [],
    notes: '',
  };
  sessions.set(`log/${file.replace(/\.md$/, '')}`, day);
}

const entriesDir = path.join(vault, 'log/entries');
const pending = [];
for (const file of readdirSync(entriesDir)) {
  if (!file.endsWith('.md')) continue;
  const fm = frontmatter(readFileSync(path.join(entriesDir, file), 'utf8'));
  const exercise = wikilink(fm.exercise);
  const session = wikilink(fm.session);
  if (!exercise || !session) continue;

  const sets = [];
  for (let i = 1; i <= 8; i++) {
    const reps = fm[`set${i}_reps`];
    const weight = fm[`set${i}_weight`];
    if (reps === undefined && weight === undefined) continue;
    sets.push({ reps: String(reps ?? ''), weight: String(weight ?? '') });
  }

  pending.push({
    sessionKey: `log/${session.id}`,
    date: fm.date ? String(fm.date) : null,
    slot: fm.slot ?? 'Accessory 1',
    order: Number(fm.order ?? 0),
    exerciseId: exercise.id,
    label: exercise.label,
    sets,
    notes: fm.notes ?? '',
  });
}

pending.sort((a, b) => a.order - b.order);

// The vault's QuickAdd script sometimes leaves a second, empty entry file for a
// movement (`pushups.md` plus `pushups-1.md`). Keep one entry per exercise per
// session — whichever actually recorded sets.
const best = new Map();
for (const entry of pending) {
  const key = `${entry.sessionKey}|${entry.exerciseId}`;
  const rival = best.get(key);
  if (!rival || entry.sets.length > rival.sets.length) best.set(key, entry);
}
const deduped = pending.filter((entry) => best.get(`${entry.sessionKey}|${entry.exerciseId}`) === entry);
const duplicates = pending.length - deduped.length;

let skipped = 0;
let recovered = 0;
for (const entry of deduped) {
  // Some entries point at a session file that no longer exists (renamed in the
  // vault). The reference itself is `log/<date>-<day-type>`, which carries
  // everything a day needs, so rebuild it rather than dropping the sets.
  let session = sessions.get(entry.sessionKey);
  if (!session) {
    const parsed = /^log\/(\d{4}-\d{2}-\d{2})-(.+)$/.exec(entry.sessionKey);
    if (!parsed) {
      skipped++;
      continue;
    }
    session = {
      date: parsed[1],
      dayType: parsed[2],
      activation: {},
      checklist: {},
      blocks: [],
      notes: '',
    };
    sessions.set(entry.sessionKey, session);
    recovered++;
  }
  session.blocks.push({
    id: `${session.date}-${session.dayType}-${session.blocks.length}`,
    slot: entry.slot,
    kind: 'single',
    exercises: [
      {
        exerciseId: entry.exerciseId,
        label: entry.label,
        sets: entry.sets,
        notes: entry.notes,
      },
    ],
  });
}

const days = [...sessions.values()].sort(
  (a, b) => b.date.localeCompare(a.date) || a.dayType.localeCompare(b.dayType)
);

writeFileSync(path.join(repoRoot, 'data/seed-log.json'), JSON.stringify(days, null, 2));

const setCount = days.flatMap((d) => d.blocks).flatMap((b) => b.exercises).flatMap((e) => e.sets).length;
console.log(`wrote data/seed-log.json — ${days.length} days, ${setCount} sets`);
if (recovered) console.warn(`rebuilt ${recovered} day(s) from renamed session references`);
if (duplicates) console.warn(`dropped ${duplicates} duplicate entry file(s)`);
if (skipped) console.warn(`skipped ${skipped} entries with an unparseable session reference`);
