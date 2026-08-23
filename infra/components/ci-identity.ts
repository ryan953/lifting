import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

export interface CiIdentityArgs {
  project: string;
  projectNumber: pulumi.Input<string>;
  /** `owner/repo` allowed to impersonate the deployer. */
  githubRepository: string;
  /** Branch that may deploy, e.g. `main`. Others are refused by the WIF condition. */
  githubBranch?: string;
  dependsOn?: pulumi.Resource[];
}

/**
 * A deploy identity for GitHub Actions with no long-lived key anywhere.
 *
 * Workload Identity Federation trades GitHub's OIDC token for short-lived GCP
 * credentials. The attribute condition is the load-bearing part: without it any
 * GitHub repository in the world could mint tokens for this service account.
 */
export class CiIdentity extends pulumi.ComponentResource {
  readonly serviceAccount: gcp.serviceaccount.Account;
  readonly provider: gcp.iam.WorkloadIdentityPoolProvider;
  readonly workloadIdentityProvider: pulumi.Output<string>;

  constructor(name: string, args: CiIdentityArgs, opts?: pulumi.ComponentResourceOptions) {
    super('lifting:infra:CiIdentity', name, {}, opts);

    const branch = args.githubBranch ?? 'main';

    this.serviceAccount = new gcp.serviceaccount.Account(
      `${name}-sa`,
      {
        project: args.project,
        accountId: 'github-deployer',
        displayName: 'GitHub Actions deployer',
        description: `Deploys ${args.githubRepository} via Workload Identity Federation`,
      },
      { parent: this, dependsOn: args.dependsOn }
    );

    // Additive membership only — never IAMPolicy, which would replace the whole
    // project policy including Google's own service-agent grants.
    const roles = [
      'roles/firebasehosting.admin',
      'roles/firebaserules.admin',
      'roles/datastore.indexAdmin',
      'roles/serviceusage.serviceUsageConsumer',
    ];

    for (const role of roles) {
      new gcp.projects.IAMMember(
        `${name}-${role.split('/')[1].replace(/\./g, '-')}`,
        {
          project: args.project,
          role,
          member: pulumi.interpolate`serviceAccount:${this.serviceAccount.email}`,
        },
        { parent: this }
      );
    }

    const pool = new gcp.iam.WorkloadIdentityPool(
      `${name}-pool`,
      {
        project: args.project,
        workloadIdentityPoolId: 'github-actions',
        displayName: 'GitHub Actions',
        description: 'Keyless OIDC federation for CI',
      },
      { parent: this, dependsOn: args.dependsOn }
    );

    this.provider = new gcp.iam.WorkloadIdentityPoolProvider(
      `${name}-provider`,
      {
        project: args.project,
        workloadIdentityPoolId: pool.workloadIdentityPoolId,
        workloadIdentityPoolProviderId: 'github',
        displayName: 'GitHub OIDC',
        attributeMapping: {
          'google.subject': 'assertion.sub',
          'attribute.repository': 'assertion.repository',
          'attribute.ref': 'assertion.ref',
        },
        // Without this, tokens from *any* repository would be accepted.
        attributeCondition: `assertion.repository == '${args.githubRepository}'`,
        oidc: { issuerUri: 'https://token.actions.githubusercontent.com' },
      },
      { parent: this, dependsOn: [pool] }
    );

    // Narrow further: only this repo, on this branch, may impersonate.
    new gcp.serviceaccount.IAMMember(
      `${name}-wif-binding`,
      {
        serviceAccountId: this.serviceAccount.name,
        role: 'roles/iam.workloadIdentityUser',
        member: pulumi.interpolate`principalSet://iam.googleapis.com/projects/${args.projectNumber}/locations/global/workloadIdentityPools/${pool.workloadIdentityPoolId}/attribute.ref/refs/heads/${branch}`,
      },
      { parent: this, dependsOn: [this.provider] }
    );

    this.workloadIdentityProvider = pulumi.interpolate`projects/${args.projectNumber}/locations/global/workloadIdentityPools/${pool.workloadIdentityPoolId}/providers/${this.provider.workloadIdentityPoolProviderId}`;

    this.registerOutputs({
      serviceAccountEmail: this.serviceAccount.email,
      workloadIdentityProvider: this.workloadIdentityProvider,
    });
  }
}
