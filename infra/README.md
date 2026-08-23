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

| Stack | GCP project | Hosting site |
| --- | --- | --- |
| `staging` | `ryan953-lifting-staging` | `ryan953-lifting-staging-v3.web.app` |
| `prod` | `ryan953-lifting-prod` | `ryan953-lifting-v3.web.app` |

Both projects **already exist and already served prototype #1**, which shapes
two decisions here.

### The Hosting site is a new one, not the project default

Prototype #1 deployed to each project's default site. Pointing that site at this
app would silently replace it, so these stacks create a *separate* site per
project. Firebase allows many sites per project at no cost, and #1's URL is left
alone.

### ⚠️ The Firestore rules are shared, and this stack replaces them

There is only one `(default)` database per project, and rules are per-database
and whole-file. Applying this stack **replaces whatever rules are currently
deployed** — including prototype #1's, which allowed `sessions`,
`exerciseStats` and `templates`. This stack's rules deny every path they don't
name, so a still-running prototype #1 would start failing its reads and writes.

The *data* is not touched: #1's documents live under different subcollection
names and stay where they are. Only the rules change.

Check what is live before the first apply:

```sh
gcloud firestore databases list --project=ryan953-lifting-prod
firebase --project=ryan953-lifting-prod hosting:sites:list
```

If prototype #1 is retired, nothing more is needed. If it is not, either keep it
on its own project or extend `firestore/firestore.rules` to cover both apps
before applying.

## First-time setup

The projects are *referenced*, not created, so billing and project creation stay
deliberate manual acts.

```sh
# 1. Credentials Pulumi will use
gcloud auth login
gcloud auth application-default login

# 2. Select a stack
cd infra
pulumi stack select staging   # or: pulumi stack init staging

# 3. First apply only — adopt the Firebase project and the existing
#    (default) Firestore database instead of trying to create them
pulumi config set lifting:adoptExisting true
pulumi up

# 4. Turn adoption back off; the resources are in state now
pulumi config rm lifting:adoptExisting
```

Skipping step 3 against these projects fails with "already exists" on the
Firebase project and the Firestore database — they were created for #1.

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
