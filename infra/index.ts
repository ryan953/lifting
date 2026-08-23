/**
 * Lifting — GCP/Firebase infrastructure.
 *
 * One Pulumi project, one stack per environment (staging, prod), assembled from
 * composable components. Each component is independently targetable:
 *
 *   pulumi up --target '**Firestore**'      # rules + indexes only
 *   pulumi up --target '**Auth**'           # sign-in providers only
 *   pulumi up --target '**CiIdentity**'     # deploy identity only
 *
 * The design has no compute tier at all: the browser talks to Firestore
 * directly, and the security rules are the entire authorization model. Nothing
 * runs when nobody is training, so an idle month costs nothing.
 */
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

import { ProjectServices } from './components/project-services.js';
import { Firestore } from './components/firestore.js';
import { FirebaseApp } from './components/firebase-app.js';
import { Auth } from './components/auth.js';
import { CiIdentity } from './components/ci-identity.js';

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config('gcp');

const stack = pulumi.getStack();
const project = gcpConfig.require('project');
const firestoreLocation = config.get('firestoreLocation') ?? 'nam5';
const githubRepository = config.get('githubRepository') ?? 'ryan953/lifting';
const githubBranch = config.get('githubBranch') ?? 'main';
// A distinct Hosting site rather than the project's default one: these
// projects already served prototype #1, and taking over its site would point
// its URL at this app.
const hostingSiteId = config.get('hostingSiteId') ?? `${project}-v3`;

// First apply against a project that already has Firebase resources: adopt
// them into state instead of failing to create duplicates. Unset afterwards.
const adoptExisting = config.getBoolean('adoptExisting') ?? false;

// Staging is meant to be disposable; prod is not.
const isProd = stack === 'prod';

const projectInfo = gcp.organizations.getProjectOutput({ projectId: project });

const services = new ProjectServices('core', { project });

const app = new FirebaseApp(
  'app',
  {
    project,
    displayName: isProd ? 'Lifting' : `Lifting (${stack})`,
    hostingSiteId,
    adoptExisting,
  },
  { dependsOn: services.services }
);

const firestore = new Firestore(
  'store',
  {
    project,
    location: firestoreLocation,
    deleteProtection: isProd,
    adoptExisting,
    dependsOn: services.services,
  },
  { dependsOn: [app.firebase] }
);

const auth = new Auth(
  'auth',
  {
    project,
    // web.app and firebaseapp.com are the Hosting domains; localhost keeps the
    // emulator and `python3 -m http.server` flow working.
    authorizedDomains: [
      'localhost',
      pulumi.interpolate`${hostingSiteId}.web.app`,
      pulumi.interpolate`${hostingSiteId}.firebaseapp.com`,
      ...(config.getObject<string[]>('extraAuthDomains') ?? []),
    ],
    emailPassword: config.getBoolean('emailPasswordAuth') ?? false,
    // Set with: pulumi config set --secret googleClientSecret <value>
    google:
      config.get('googleClientId') && config.getSecret('googleClientSecret')
        ? {
            clientId: config.require('googleClientId'),
            clientSecret: config.requireSecret('googleClientSecret'),
          }
        : undefined,
  },
  { dependsOn: services.services }
);

const ci = new CiIdentity(
  'ci',
  {
    project,
    projectNumber: projectInfo.number,
    githubRepository,
    githubBranch,
  },
  { dependsOn: services.services }
);

// ---------------------------------------------------------------- outputs

export const projectId = project;
export const projectNumber = projectInfo.number;
export const hostingUrl = pulumi.interpolate`https://${app.hostingSite.siteId}.web.app`;
export const webAppId = app.webApp.appId;

/** Written to the site as firebase-config.json so the client can boot. */
export const firebaseConfig = app.webConfig;

/** Paste these into the repository's GitHub Actions secrets/variables. */
export const ciServiceAccount = ci.serviceAccount.email;
export const ciWorkloadIdentityProvider = ci.workloadIdentityProvider;

export const firestoreDatabase = firestore.database.name;
export const authConfigName = auth.config.name;
