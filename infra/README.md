# Infrastructure

Firestore, Firebase Auth, Hosting and a keyless CI identity — declared in
Pulumi (TypeScript), one stack per environment.

## The shape of it

There is **no compute tier**. The browser talks to Firestore directly and
`firestore/firestore.rules` is the entire authorization model. Nothing runs when
nobody is training, so an idle month costs nothing and there is no service to
keep warm, patch or scale.

```
browser ──auth──▶ Identity Platform
   │
   └──reads/writes──▶ Firestore  ◀── security rules (the only gatekeeper)

static files ──▶ Firebase Hosting   (uploaded by CI, see below)
```

| Component | What it declares |
| --- | --- |
| `ProjectServices` | The APIs every other component needs enabled |
| `FirebaseApp` | Firebase project, web app registration, Hosting site |
| `Firestore` | Native-mode database, composite indexes, rules ruleset + release |
| `Auth` | Identity Platform config, authorized domains, Google / email sign-in |
| `CiIdentity` | Deployer service account, Workload Identity Federation, IAM |

### The one imperative step

Neither Pulumi nor Terraform can upload static files to Firebase Hosting — the
underlying resource has no file support at all. So the *site* is declared here
and the *files* are pushed by `firebase deploy --only hosting` in
`.github/workflows/firebase.yml`. That is the only non-declarative step, and it
is confined to Hosting content.

## Composability

Every component is a `ComponentResource`, so parts can be applied on their own:

```sh
pulumi up --target '**Firestore**'    # rules and indexes only
pulumi up --target '**Auth**'         # sign-in providers only
pulumi up --target '**CiIdentity**'   # deploy identity only
```

Add `--target-dependents` to include what a component feeds.

## The projects these stacks use

| Stack | GCP project | Firestore | Hosting site |
| --- | --- | --- | --- |
| `staging` | `ryan953-lifting-staging` | `(default)`, **us-west1**, existing | `ryan953-lifting-staging-v3.web.app` |
| `prod` | `ryan953-lifting-prod` | `(default)`, us-west1, created | `ryan953-lifting-v3.web.app` |

Verified state as of 2026-08-23:

- **`ryan953-lifting-prod` is bare.** No Firebase, Firestore or Hosting APIs
  enabled, nothing deployed, billing on. Everything here creates from scratch.
- **`ryan953-lifting-staging` still runs prototype #1**, live and serving:
  Hosting site `ryan953-lifting-staging` → https://ryan953-lifting-staging.web.app
  (200), a `(default)` Firestore database in us-west1 holding a `users`
  collection, a released `cloud.firestore` ruleset, and two active Cloud
  Functions (`onSessionWrite`, `recomputeStats`).

Three consequences, all handled:

### Firestore location is us-west1, not nam5

A database's location is immutable. Staging's already exists in `us-west1`, so
both stacks use it — prod matches deliberately, and single-region is cheaper
per operation than a `nam5` multi-region anyway.

### Staging adopts, prod creates

`lifting:adoptExisting` is set in `Pulumi.staging.yaml` so the first apply
imports the existing Firebase project and database rather than failing to
create duplicates. **Remove that line after the first successful `pulumi up`.**
Prod needs no such flag.

### The rules file covers prototype #1 as well

Rules are per-database and whole-file, and #1 shares this database while still
serving traffic. Releasing a file that omitted its paths would break it
immediately. So `firestore/firestore.rules` carries #1's collections
(`exercises`, `templates`, `sessions`, `exerciseStats`, `weeklyStats`) in a
clearly-marked legacy block at the foot.

**Delete that block once #1 is retired** — it is the only thing in this repo
serving an app it doesn't own. Its data is otherwise untouched: #1's documents
sit under different subcollection names from this app's.

Prototype #1's Hosting site is also left alone; these stacks create their own
site per project rather than repointing the default one.

### Google sign-in

The OAuth client cannot be created by the provider — take the web client id and
secret from the Firebase console (Authentication → Sign-in method → Google) and
set them per stack:

```sh
pulumi config set lifting:googleClientId <id>
pulumi config set --secret lifting:googleClientSecret <secret>
```

Leave them unset and the app still works with email/password.

### Wiring up CI

After the first `pulumi up`, record the outputs as repository variables so the
hosting workflow can authenticate without any stored key:

```sh
pulumi stack output ciWorkloadIdentityProvider   # → WORKLOAD_IDENTITY_PROVIDER
pulumi stack output ciServiceAccount             # → DEPLOY_SERVICE_ACCOUNT
pulumi stack output projectId                    # → FIREBASE_PROJECT
```

## How the client finds its backend

Nothing is committed. Firebase Hosting serves `/__/firebase/init.json`
describing whichever project is serving the page, and `js/firebase.js` reads it
at boot. One artifact therefore works in staging and prod with no keys in the
repo and no build-time substitution.

Where that file doesn't exist — GitHub Pages, `python3 -m http.server` — the app
detects its absence and runs local-only, exactly as it did before there was a
backend.

## Costs

Everything used here has a perpetual free tier that this workload sits well
inside: Firestore 50k reads / 20k writes / 1 GiB per day, Auth free for these
providers, Hosting 10 GB stored and 360 MB/day transferred. The realistic bill
for a handful of users is **zero**, and there is no idle cost to accrue because
nothing is running between sessions.

The guards against that changing by accident: Firestore rules cap document size
and reject unknown paths, and `Auth` caps sign-ups per IP so a leaked API key
can't be used to run up a bill.

## Notes and limits

- **State** lives in Pulumi Cloud by default (`pulumi login`). For a self-managed
  backend instead: `pulumi login gs://<bucket>`.
- **Deletion protection** is on for the prod Firestore database and its Pulumi
  resource is marked `protect`, so `pulumi destroy` cannot take real data with
  it. Staging has neither.
- **Not manageable declaratively** (console or REST only, per the provider):
  auth email/SMS templates and password policy.
- The web app registration uses `deletionPolicy: ABANDON` — tearing down a stack
  must not invalidate an app id already shipped in someone's browser.
