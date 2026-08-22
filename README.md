# Lifting — interface prototype

Third prototype of the lifting tracker, and the first one that is only about the
interface. It reproduces the workflow of my Obsidian-powered tracker as a
mobile-first web app: one file per workout day, a Main Lift plus accessories,
and the previous session's numbers always visible while logging.

No build step, no server, no framework. Plain HTML, CSS and ES modules, so the
repo root *is* the site and GitHub Pages can serve it as-is.

## Run it

```sh
python3 -m http.server 8199
open http://localhost:8199
```

Opening `index.html` directly with `file://` will not work — ES modules and
`fetch()` need an HTTP origin.

## What's here

**Workout days.** Every session comes from a template — Primary/Secondary
Push, Pull and Legs, plus Rest — pre-filled with that day's movements and set
counts. Sets are reps × weight text fields, deliberately free-form: the vault
has real entries like `Blue box 18"` and `10/limb`.

**Last time.** Every exercise on a day shows what it did last, dated. When you
open an older session it reports the session before *that*, not the newest one.

**Day checklists.** Each template carries requirements — "Horizontal press",
"Heavy hinge", "Compound calf movement". A requirement ticks itself once
something in the day satisfies it. Anything still open gets a dropdown of
matching exercises from the database; picking one adds it to the next free
accessory slot.

**Accessories and supersets.** Adding one exercise makes a normal block; adding
two or more makes a superset — bracketed, A/B labelled, 3 sets each per the
program's framework. Pairings are remembered and offered back under
*Supersets*, and can be starred.

**Exercise database.** All 873 exercises, searchable and filterable by muscle,
with instructions, illustrations and similar movements. Star any of them and
filter to favorites. Each one lists every set you have logged against it.

## Data

| Path | What it is |
| --- | --- |
| `data/exercises.json` | The exercise database, from [free-exercise-db][db] |
| `data/program.json` | Day templates, checklist requirements, my movement aliases |
| `data/seed-log.json` | Workout history exported from the Obsidian vault |

Everything you do is stored in IndexedDB under `lifting-proto`, private to your
browser. On first load the vault history is seeded in so "last time" has real
numbers immediately. Illustrations are loaded from the upstream dataset rather
than committed here, which keeps the deploy small.

Regenerating either input:

```sh
node scripts/build-catalog.mjs --source ../lifting.ryan953.com/exercise-db-source
node scripts/import-vault.mjs   # reads the Obsidian vault in iCloud
```

## Layout

```
index.html        shell: top bar, screen, tab bar
app.css           Obsidian-dark theme
js/main.js        hash router
js/store.js       IndexedDB + in-memory mirror
js/catalog.js     exercise database, search, requirement matching
js/history.js     "last time", performed-before, formatting
js/day-model.js   building and mutating a day
js/sheet.js       bottom sheets, exercise picker
js/views/         today, log, day, exercises, exercise
```

## Prototype limits

- Data lives in one browser. No sync, no export yet.
- The seed comes from a vault with some duplicate and empty entries; the
  importer dedupes what it can, so a few days legitimately show zero sets.
- Set values are free text — no unit handling, no volume math.

[db]: https://github.com/yuhonas/free-exercise-db
