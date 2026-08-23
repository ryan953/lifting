import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

export interface ProjectMetadataArgs {
  project: string;
  /** Display name. Must match what exists, or the import diffs. */
  displayName: string;
  orgId: string;
  /**
   * Required, not optional: leaving it unset would diff against the live
   * billing link and try to unset it, which would disable billing.
   */
  billingAccount: string;
  /** Value for the `environment` label. */
  environment: string;
  extraLabels?: Record<string, string>;
  /** First apply only — import the existing project rather than create one. */
  adopt?: boolean;
}

/**
 * Project-level metadata: the `environment` label used to split staging from
 * prod in billing and reporting.
 *
 * This adopts a project that already exists and is never allowed to create or
 * destroy one:
 *
 * - `deletionPolicy: PREVENT` makes the provider refuse to delete it.
 * - `protect: true` makes Pulumi itself refuse to delete or replace it, so even
 *   a spurious diff on a create-only field fails loudly instead of doing harm.
 *
 * Labels are non-authoritative in this provider (see `effectiveLabels`), so
 * declaring `environment` here leaves Firebase's own `firebase` /
 * `firebase-core` labels alone rather than fighting over them.
 */
export class ProjectMetadata extends pulumi.ComponentResource {
  readonly project: gcp.organizations.Project;

  constructor(name: string, args: ProjectMetadataArgs, opts?: pulumi.ComponentResourceOptions) {
    super('lifting:infra:ProjectMetadata', name, {}, opts);

    this.project = new gcp.organizations.Project(
      `${name}-project`,
      {
        projectId: args.project,
        name: args.displayName,
        orgId: args.orgId,
        billingAccount: args.billingAccount,
        deletionPolicy: 'PREVENT',
        labels: {
          environment: args.environment,
          ...(args.extraLabels ?? {}),
        },
        // autoCreateNetwork is deliberately left at its default. The field only
        // has meaning when creating a project, and we never do; declaring the
        // non-default would diff on a create-only field and ask to replace.
      },
      {
        parent: this,
        protect: true,
        ...(args.adopt ? { import: args.project } : {}),
      }
    );

    this.registerOutputs({ projectId: this.project.projectId });
  }
}
