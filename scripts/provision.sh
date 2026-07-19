#!/usr/bin/env bash
#
# Idempotent GCP/Firebase provisioning preflight for one environment.
#
#   scripts/provision.sh staging            # check + create what it can
#   scripts/provision.sh prod --check-only  # report only, never mutate (CI preflight)
#
# Each step: check current state -> skip if done -> create via gcloud/firebase
# when possible -> otherwise print exact console instructions. Exits non-zero
# if anything required is still missing.

set -u -o pipefail

ENV_NAME="${1:-}"
CHECK_ONLY=false
[[ "${2:-}" == "--check-only" || "${1:-}" == "--check-only" ]] && CHECK_ONLY=true
if [[ "$ENV_NAME" == "--check-only" ]]; then ENV_NAME="${2:-}"; fi

case "$ENV_NAME" in
  staging) PROJECT_ID="ryan953-lifting-staging" ;;
  prod)    PROJECT_ID="lifting-prod" ;;
  *) echo "usage: provision.sh <staging|prod> [--check-only]" >&2; exit 2 ;;
esac

# Personal project — always the personal account, never the work default.
# CI authenticates via WIF instead; the override is skipped when the account
# isn't available on the machine (e.g. GitHub runners).
if gcloud auth list --format='value(account)' 2>/dev/null | grep -q '^ryan@ryanalbrecht.ca$'; then
  export CLOUDSDK_CORE_ACCOUNT="ryan@ryanalbrecht.ca"
fi

REGION="${FIRESTORE_REGION:-us-west1}"
DEPLOYER_SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
GITHUB_REPO="${GITHUB_REPO:-}"   # e.g. ryan953/lifting — required for WIF setup
WIF_POOL="github-pool"
WIF_PROVIDER="github-provider"

REQUIRED_APIS=(
  cloudfunctions.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
  run.googleapis.com
  eventarc.googleapis.com
  firestore.googleapis.com
  identitytoolkit.googleapis.com
  iamcredentials.googleapis.com
  firebasehosting.googleapis.com
  firebaseextensions.googleapis.com
  cloudbilling.googleapis.com
  pubsub.googleapis.com
  storage.googleapis.com
)

DEPLOYER_ROLES=(
  roles/firebasehosting.admin
  roles/cloudfunctions.developer
  roles/firebaserules.admin
  roles/datastore.indexAdmin
  roles/serviceusage.serviceUsageConsumer
  roles/firebaseextensions.viewer
)

PASS=() ; FAIL=() ; MANUAL=()
ok()     { PASS+=("$1");   echo "  ✅ $1"; }
bad()    { FAIL+=("$1");   echo "  ❌ $1"; }
manual() { MANUAL+=("$1"); echo "  📋 $1"; shift; printf '     %s\n' "$@"; }

run() { # run <description> <cmd...>  — respects --check-only
  local desc="$1"; shift
  if $CHECK_ONLY; then
    bad "$desc (needs: $*)"
    return 1
  fi
  if "$@" >/dev/null 2>&1; then ok "$desc"; else bad "$desc (command failed: $*)"; return 1; fi
}

echo "== Provisioning ${PROJECT_ID} (${ENV_NAME}) $($CHECK_ONLY && echo '[check-only]') =="

# --- 1. Project exists -------------------------------------------------------
echo "-- project"
if gcloud projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null 2>&1; then
  ok "project ${PROJECT_ID} exists"
else
  manual "project ${PROJECT_ID} missing" \
    "Create it (choose one):" \
    "  npx firebase projects:create ${PROJECT_ID}" \
    "  or: gcloud projects create ${PROJECT_ID} && npx firebase projects:addfirebase ${PROJECT_ID}" \
    "Then link billing (console-only):" \
    "  https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
  echo "== Cannot continue without the project. =="
  exit 1
fi

# Billing (functions deploys need it)
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || echo unknown)
if [[ "$BILLING" == "True" ]]; then
  ok "billing enabled"
elif [[ "$BILLING" == "unknown" ]]; then
  manual "billing state unknown (no permission to read it)" \
    "Verify at https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
else
  manual "billing NOT enabled (Cloud Functions deploys will fail)" \
    "Link a billing account: https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
fi

# --- 2. APIs -----------------------------------------------------------------
echo "-- APIs"
ENABLED=$(gcloud services list --enabled --project "$PROJECT_ID" --format='value(config.name)' 2>/dev/null)
for api in "${REQUIRED_APIS[@]}"; do
  if grep -q "^${api}$" <<<"$ENABLED"; then
    ok "$api"
  else
    run "enable $api" gcloud services enable "$api" --project "$PROJECT_ID"
  fi
done

# --- 3. Firestore database ---------------------------------------------------
echo "-- Firestore"
if gcloud firestore databases describe --database='(default)' --project "$PROJECT_ID" >/dev/null 2>&1; then
  ok "default Firestore database exists"
else
  run "create Firestore database in ${REGION}" \
    gcloud firestore databases create --database='(default)' --location="$REGION" --project "$PROJECT_ID"
fi

# --- 4. Auth provider (console-only) ----------------------------------------
echo "-- Authentication"
AUTH_CFG=$(curl -sf -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null)" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/google.com" 2>/dev/null || true)
if grep -q '"enabled": *true' <<<"$AUTH_CFG"; then
  ok "Google sign-in provider enabled"
else
  manual "Google sign-in provider not confirmed" \
    "Enable it: https://console.firebase.google.com/project/${PROJECT_ID}/authentication/providers" \
    "Add authorized domains: ${PROJECT_ID}.web.app, ${PROJECT_ID}.firebaseapp.com (+ any custom domain)"
fi

# --- 5. CI deployer service account -----------------------------------------
echo "-- deployer service account"
if gcloud iam service-accounts describe "$DEPLOYER_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  ok "service account ${DEPLOYER_SA}"
else
  run "create ${DEPLOYER_SA}" \
    gcloud iam service-accounts create github-deployer \
      --display-name="GitHub Actions deployer" --project "$PROJECT_ID"
fi

CURRENT_ROLES=$(gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:${DEPLOYER_SA}" \
  --format='value(bindings.role)' 2>/dev/null)
for role in "${DEPLOYER_ROLES[@]}"; do
  if grep -q "^${role}$" <<<"$CURRENT_ROLES"; then
    ok "binding $role"
  else
    run "bind $role" \
      gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${DEPLOYER_SA}" --role="$role" --condition=None
  fi
done

# actAs the runtime SAs for functions deploys: the compute default SA (v2
# runtime) and the App Engine default SA (firebase-tools checks it).
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null)
for RUNTIME_SA in "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" "${PROJECT_ID}@appspot.gserviceaccount.com"; do
  if gcloud iam service-accounts get-iam-policy "$RUNTIME_SA" --project "$PROJECT_ID" \
       --flatten='bindings[].members' --filter="bindings.members:serviceAccount:${DEPLOYER_SA}" \
       --format='value(bindings.role)' 2>/dev/null | grep -q 'roles/iam.serviceAccountUser'; then
    ok "deployer can actAs ${RUNTIME_SA}"
  else
    run "grant iam.serviceAccountUser on ${RUNTIME_SA}" \
      gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
        --member="serviceAccount:${DEPLOYER_SA}" --role='roles/iam.serviceAccountUser' --project "$PROJECT_ID"
  fi
done
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# --- 6. Functions runtime SA: Eventarc/Run trigger delivery -------------------
echo "-- functions runtime (Eventarc/Run)"
for role in roles/eventarc.eventReceiver roles/run.invoker; do
  if gcloud projects get-iam-policy "$PROJECT_ID" \
       --flatten='bindings[].members' --filter="bindings.members:serviceAccount:${RUNTIME_SA}" \
       --format='value(bindings.role)' 2>/dev/null | grep -q "^${role}$"; then
    ok "runtime SA has $role"
  else
    run "bind $role to runtime SA" \
      gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${RUNTIME_SA}" --role="$role" --condition=None
  fi
done

# Eventarc service agent must exist and hold its role before the first
# Firestore-trigger deploy (propagation can take minutes after creation).
EVENTARC_SA="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"
if gcloud projects get-iam-policy "$PROJECT_ID" \
     --flatten='bindings[].members' --filter="bindings.members:serviceAccount:${EVENTARC_SA}" \
     --format='value(bindings.role)' 2>/dev/null | grep -q 'roles/eventarc.serviceAgent'; then
  ok "eventarc service agent has its role"
elif $CHECK_ONLY; then
  bad "eventarc service agent missing roles/eventarc.serviceAgent"
else
  curl -s -X POST "https://serviceusage.googleapis.com/v1beta1/projects/${PROJECT_ID}/services/eventarc.googleapis.com:generateServiceIdentity" \
    -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null)" >/dev/null 2>&1
  run "bind eventarc.serviceAgent" \
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${EVENTARC_SA}" --role='roles/eventarc.serviceAgent' --condition=None
fi

# Pub/Sub service agent needs token-creator for Eventarc push delivery.
PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
if gcloud projects get-iam-policy "$PROJECT_ID" \
     --flatten='bindings[].members' --filter="bindings.members:serviceAccount:${PUBSUB_SA}" \
     --format='value(bindings.role)' 2>/dev/null | grep -q 'roles/iam.serviceAccountTokenCreator'; then
  ok "pubsub service agent has tokenCreator"
elif $CHECK_ONLY; then
  bad "pubsub service agent missing tokenCreator"
else
  # The agent may not exist until first use; generate it, then bind.
  curl -s -X POST "https://serviceusage.googleapis.com/v1beta1/projects/${PROJECT_ID}/services/pubsub.googleapis.com:generateServiceIdentity" \
    -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null)" >/dev/null 2>&1
  run "bind tokenCreator to pubsub service agent" \
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${PUBSUB_SA}" --role='roles/iam.serviceAccountTokenCreator' --condition=None
fi

# --- 7. Workload Identity Federation for GitHub Actions ----------------------
echo "-- GitHub Actions credential (WIF)"
if [[ -z "$GITHUB_REPO" ]]; then
  manual "GITHUB_REPO not set — skipping WIF setup" \
    "Re-run with: GITHUB_REPO=<owner>/<repo> scripts/provision.sh ${ENV_NAME}"
else
  if gcloud iam workload-identity-pools describe "$WIF_POOL" --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
    ok "workload identity pool ${WIF_POOL}"
  else
    run "create workload identity pool" \
      gcloud iam workload-identity-pools create "$WIF_POOL" \
        --location=global --display-name='GitHub Actions' --project "$PROJECT_ID"
  fi

  if gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
       --workload-identity-pool="$WIF_POOL" --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
    ok "workload identity provider ${WIF_PROVIDER}"
  else
    run "create OIDC provider bound to ${GITHUB_REPO}" \
      gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
        --workload-identity-pool="$WIF_POOL" --location=global --project "$PROJECT_ID" \
        --issuer-uri='https://token.actions.githubusercontent.com' \
        --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository' \
        --attribute-condition="assertion.repository == '${GITHUB_REPO}'"
  fi

  if [[ -n "$PROJECT_NUMBER" ]]; then
    WIF_MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}"
    if gcloud iam service-accounts get-iam-policy "$DEPLOYER_SA" --project "$PROJECT_ID" \
         --flatten='bindings[].members' --filter="bindings.members:${WIF_MEMBER}" \
         --format='value(bindings.role)' 2>/dev/null | grep -q 'roles/iam.workloadIdentityUser'; then
      ok "repo can impersonate deployer SA"
    else
      run "allow ${GITHUB_REPO} to impersonate deployer" \
        gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
          --member="$WIF_MEMBER" --role='roles/iam.workloadIdentityUser' --project "$PROJECT_ID"
    fi
    echo "     Workflow auth values for ${ENV_NAME}:"
    echo "       workload_identity_provider: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
    echo "       service_account: ${DEPLOYER_SA}"
  fi
fi

# --- Summary ------------------------------------------------------------------
echo
echo "== Summary for ${PROJECT_ID}: ${#PASS[@]} ok, ${#FAIL[@]} failed, ${#MANUAL[@]} manual =="
((${#FAIL[@]})) && printf '  ❌ %s\n' "${FAIL[@]}"
((${#MANUAL[@]})) && printf '  📋 %s\n' "${MANUAL[@]}"

if ((${#FAIL[@]} + ${#MANUAL[@]} > 0)); then
  exit 1
fi
echo "All green."
