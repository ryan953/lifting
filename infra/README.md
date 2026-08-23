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

| Stack | GCP project | Firestore | Site | Custom domain |
| --- | --- | --- | --- | --- |
| `staging` | `ryan953-lifting-staging` | `(default)`, us-west1 | `ryan953-lifting-staging.web.app` | `lifting-staging.ryan953.com` |
| `prod` | `ryan953-lifting-prod` | `(default)`, us-west1 | `ryan953-lifting-prod.web.app` | `lifting.ryan953.com` |

Both sit under the `ryanalbrecht.ca` organization and carry an `environment`
label (`staging` / `prod`) for billing breakdown.

Prototype #1's leftovers were cleared out of staging on 2026-08-23 — both Cloud
Functions, their Cloud Run services and artifact buckets, and its single
Firestore user document. Firebase refuses to delete a project's default Hosting
site, so that site is reused rather than sidestepped.

### Firestore location is us-west1

A database's location is immutable and staging's already exists in `us-west1`.
Prod matches deliberately; single-region is also cheaper per operation than a
`nam5` multi-region.

### Adoption flags

Resources that already exist cannot be created a second time, so the first
apply imports them. Each flag sits in the stack config with a note to remove it
once that apply succeeds:

| Flag | staging | prod | Covers |
| --- | --- | --- | --- |
| `adoptProject` | yes | yes | The GCP project record itself |
| `adoptExisting` | yes | — | Firebase project and `(default)` Firestore |
| `adoptHostingSite` | yes | — | The default Hosting site |

The project resource is additionally `protect: true` with
`deletionPolicy: PREVENT`, so neither Pulumi nor the provider can delete or
replace it — a surprising diff fails loudly instead of doing damage.

### Custom domains need DNS

`HostingCustomDomain` registers the domain but cannot create DNS records, and
`waitDnsVerification` is off so the apply doesn't block on propagation. After
the first apply, read the required records and add them at the registrar:

```sh
firebase hosting:sites:get ryan953-lifting-prod --project ryan953-lifting-prod
```

Each custom domain is also added to the Auth authorized domains — a sign-in
redirect only completes on a listed domain, so Google sign-in would fail there
otherwise.

## Secrets

Nothing sensitive is committed in plaintext, and nothing has to live outside the
repo either.

`pulumi config set --secret` encrypts the value before it is written, so what
lands in `Pulumi.<stack>.yaml` is ciphertext:

```sh
pulumi config set lifting:googleClientId <id>            # not secret, plain
pulumi config set --secret lifting:googleClientSecret <secret>
```

```yaml
lifting:googleClientSecret:
  secure: v1:8fJk2...          # committed, useless without the key
```

Reading it back needs the stack's encryption key, and `requireSecret()` in
`index.ts` keeps the value marked all the way through — so it stays encrypted in
Pulumi state and is redacted from `pulumi preview` output rather than printed.

### Choosing where the key lives

The encryption provider is set once, when the stack is created:

| Provider | Set with | Who can decrypt |
| --- | --- | --- |
| Pulumi Cloud (default) | `pulumi stack init staging` | Anyone with access to the stack |
| GCP KMS | `pulumi stack init staging --secrets-provider="gcpkms://projects/<p>/locations/global/keyRings/<r>/cryptoKeys/<k>" ` | Anyone with `roles/cloudkms.cryptoKeyDecrypter` |
| Passphrase | `--secrets-provider passphrase` | Anyone with `PULUMI_CONFIG_PASSPHRASE` |

**GCP KMS is the best fit here**: the projects are already on GCP, so both you
and CI decrypt through normal IAM with no shared passphrase to distribute and no
dependency on Pulumi Cloud. A key ring costs nothing; keys are ~$0.06/month.

```sh
gcloud kms keyrings create pulumi --location=global --project=ryan953-lifting-prod
gcloud kms keys create stacks --keyring=pulumi --location=global \
  --purpose=encryption --project=ryan953-lifting-prod
```

To move an existing stack onto it: `pulumi stack change-secrets-provider "gcpkms://…"`.

### Secrets that shouldn't be in Pulumi at all

For anything rotated independently of a deploy, keep it in Secret Manager and
read it at apply time instead, so the value never enters Pulumi config or state:

```ts
const secret = gcp.secretmanager.getSecretVersionOutput({ secret: 'google-oauth', project });
// secret.secretData is already marked secret by the provider
```

That costs about $0.06 per active version per month — worth it for a shared or
frequently-rotated credential, unnecessary for a single OAuth client secret.

### Google sign-in specifically

The OAuth client cannot be created by the provider. Take the web client id and
secret from the Firebase console (Authentication → Sign-in method → Google) and
set them as above. Leave them unset and the app still works with
email/password.

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
