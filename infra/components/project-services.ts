import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

export interface ProjectServicesArgs {
  project: pulumi.Input<string>;
  /** Extra APIs beyond the baseline this stack needs. */
  additional?: string[];
}

/**
 * The APIs every stack needs enabled before anything else can be created.
 *
 * `disableOnDestroy: false` throughout: tearing a stack down should not switch
 * APIs off under any other resource that still depends on them, and re-enabling
 * is slow. Services are exported so dependants can wait on them explicitly
 * rather than racing the (eventually consistent) enablement.
 */
export class ProjectServices extends pulumi.ComponentResource {
  readonly services: gcp.projects.Service[];

  constructor(name: string, args: ProjectServicesArgs, opts?: pulumi.ComponentResourceOptions) {
    super('lifting:infra:ProjectServices', name, {}, opts);

    const apis = [
      'cloudresourcemanager.googleapis.com',
      'serviceusage.googleapis.com',
      'firebase.googleapis.com',
      'firebaserules.googleapis.com',
      'firebasehosting.googleapis.com',
      'firestore.googleapis.com',
      'identitytoolkit.googleapis.com',
      'iam.googleapis.com',
      'iamcredentials.googleapis.com',
      'sts.googleapis.com',
      ...(args.additional ?? []),
    ];

    this.services = apis.map(
      (service) =>
        new gcp.projects.Service(
          `${name}-${service.split('.')[0]}`,
          {
            project: args.project,
            service,
            disableOnDestroy: false,
          },
          { parent: this }
        )
    );

    this.registerOutputs({ enabled: apis });
  }
}
