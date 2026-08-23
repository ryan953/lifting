import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

export interface FirebaseAppArgs {
  project: pulumi.Input<string>;
  displayName: pulumi.Input<string>;
  /** Hosting site id; becomes <id>.web.app. Defaults to the project id. */
  hostingSiteId?: pulumi.Input<string>;
  dependsOn?: pulumi.Resource[];
}

/**
 * Turns the GCP project into a Firebase project, registers the web app, and
 * creates the Hosting site.
 *
 * Note what is deliberately absent: the Hosting *content*. Neither Pulumi nor
 * Terraform can upload static files to Firebase Hosting — the underlying
 * resource has no file support — so the site exists here while the files are
 * pushed by `firebase deploy --only hosting` in CI. That is the one imperative
 * step in this design, and it is confined to exactly this resource.
 */
export class FirebaseApp extends pulumi.ComponentResource {
  readonly firebase: gcp.firebase.Project;
  readonly webApp: gcp.firebase.WebApp;
  readonly hostingSite: gcp.firebase.HostingSite;
  /** The config the browser SDK needs, assembled from the created resources. */
  readonly webConfig: pulumi.Output<{
    projectId: string;
    appId: string;
    apiKey: string;
    authDomain: string;
    storageBucket: string;
    messagingSenderId: string;
  }>;

  constructor(name: string, args: FirebaseAppArgs, opts?: pulumi.ComponentResourceOptions) {
    super('lifting:infra:FirebaseApp', name, {}, opts);

    this.firebase = new gcp.firebase.Project(
      `${name}-firebase`,
      { project: args.project },
      { parent: this, dependsOn: args.dependsOn }
    );

    this.webApp = new gcp.firebase.WebApp(
      `${name}-web`,
      {
        project: args.project,
        displayName: args.displayName,
        // Keep the app registration if the stack is torn down: deleting it
        // would invalidate the app id baked into anything already shipped.
        deletionPolicy: 'ABANDON',
      },
      { parent: this, dependsOn: [this.firebase] }
    );

    this.hostingSite = new gcp.firebase.HostingSite(
      `${name}-hosting`,
      {
        project: args.project,
        siteId: args.hostingSiteId ?? args.project,
        appId: this.webApp.appId,
      },
      { parent: this, dependsOn: [this.firebase] }
    );

    const config = gcp.firebase.getWebAppConfigOutput(
      { webAppId: this.webApp.appId, project: args.project },
      { parent: this }
    );

    this.webConfig = pulumi
      .all([args.project, this.webApp.appId, config])
      .apply(([project, appId, cfg]) => ({
        projectId: project,
        appId,
        apiKey: cfg.apiKey,
        authDomain: cfg.authDomain,
        storageBucket: cfg.storageBucket ?? '',
        messagingSenderId: cfg.messagingSenderId ?? '',
      }));

    this.registerOutputs({
      appId: this.webApp.appId,
      hostingSite: this.hostingSite.siteId,
    });
  }
}
