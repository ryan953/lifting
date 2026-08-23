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

import { ProjectMetadata } from './components/project-metadata.js';
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
// Firebase gives every project one Hosting site named after it and refuses to
// delete it, so that is the site this app uses.
const hostingSiteId = config.get('hostingSiteId') ?? project;
const customDomain = config.get('customDomain');

// First-apply adoption flags. Each covers resources that already exist in the
// target project and therefore cannot be created; remove once in state.
const adoptProject = config.getBoolean('adoptProject') ?? true;
const adoptExisting = config.getBoolean('adoptExisting') ?? false;
const adoptHostingSite = config.getBoolean('adoptHostingSite') ?? false;

// Staging is meant to be disposable; prod is not.
const isProd = stack === 'prod';

const projectInfo = gcp.organizations.getProjectOutput({ projectId: project });

// Project-level metadata: the `environment` label that splits staging from prod
// in billing and reporting.
const metadata = new ProjectMetadata('meta', {
  project,
  displayName: config.get('projectDisplayName') ?? project,
  orgId: config.require('orgId'),
  billingAccount: config.require('billingAccount'),
  environment: stack,
  adopt: adoptProject,
});

const services = new ProjectServices('core', { project }, { dependsOn: [metadata.project] });

const app = new FirebaseApp(
  'app',
  {
    project,
    displayName: isProd ? 'Lifting' : `Lifting (${stack})`,
    hostingSiteId,
    customDomain,
    adoptExisting,
    adoptHostingSite,
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
      `${hostingSiteId}.web.app`,
      `${hostingSiteId}.firebaseapp.com`,
      // Sign-in redirects only complete on an authorized domain, so the custom
      // domain has to be listed or Google sign-in fails there.
      ...(customDomain ? [customDomain] : []),
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
export const customDomainUrl = customDomain ? `https://${customDomain}` : undefined;
export const webAppId = app.webApp.appId;

/** Written to the site as firebase-config.json so the client can boot. */
export const firebaseConfig = app.webConfig;

/** Paste these into the repository's GitHub Actions secrets/variables. */
export const ciServiceAccount = ci.serviceAccount.email;
export const ciWorkloadIdentityProvider = ci.workloadIdentityProvider;

export const firestoreDatabase = firestore.database.name;
export const authConfigName = auth.config.name;
