# Lifting

Personal weight-lifting progression tracker. Mobile-first PWA on Firebase (Hosting + Firestore + Cloud Functions), Google sign-in, offline-capable for gym use.

## Layout

- `web/` — Vite + React PWA (Tailwind, TanStack Router/Query, Recharts)
- `functions/` — Cloud Functions v2 (stats aggregation), esbuild-bundled
- `shared/` — pure-TS domain logic: types, progression engine, stats math, units
- `catalog/` — exercise catalog build pipeline (free-exercise-db → static JSON)

## Development

Requires Node ≥ 24, pnpm, and a Java runtime (Firestore emulator):

```sh
brew install openjdk && export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
pnpm install
pnpm dev          # Firebase emulators (with data persistence) + Vite
pnpm dev:fresh    # same, but empty emulator state
pnpm test         # all packages
pnpm typecheck
```

The app runs against local emulators in dev — no cloud project needed. Auth emulator fakes Google sign-in.

## Deployment

Push to `main` deploys **staging** (`lifting-staging`) via GitHub Actions; promote to **prod** (`lifting-prod`) with the manual `deploy-prod` workflow. `pnpm provision -- staging|prod` checks/creates required GCP APIs, IAM, and CI credentials, printing instructions for console-only steps.
