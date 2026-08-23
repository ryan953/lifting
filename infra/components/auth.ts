import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

export interface AuthArgs {
  project: string;
  /** Domains allowed to complete a sign-in redirect. */
  authorizedDomains: pulumi.Input<string>[];
  /** Google sign-in OAuth client. Omit to leave the provider unconfigured. */
  google?: {
    clientId: pulumi.Input<string>;
    clientSecret: pulumi.Input<string>;
  };
  /** Email + password sign-in, alongside Google. */
  emailPassword?: boolean;
  dependsOn?: pulumi.Resource[];
}

/**
 * Identity Platform — the API behind Firebase Auth.
 *
 * Two things here are deliberately conservative for a project with no server
 * tier: anonymous auth stays off (an unauthenticated writer is still a writer),
 * and per-IP quota is capped so a leaked API key can't be used to run up a
 * sign-up bill.
 *
 * Not manageable here, per the research: email/SMS templates and password
 * policy are console/REST only.
 */
export class Auth extends pulumi.ComponentResource {
  readonly config: gcp.identityplatform.Config;

  constructor(name: string, args: AuthArgs, opts?: pulumi.ComponentResourceOptions) {
    super('lifting:infra:Auth', name, {}, opts);

    this.config = new gcp.identityplatform.Config(
      `${name}-config`,
      {
        project: args.project,
        autodeleteAnonymousUsers: true,
        signIn: {
          allowDuplicateEmails: false,
          anonymous: { enabled: false },
          email: args.emailPassword
            ? { enabled: true, passwordRequired: true }
            : { enabled: false, passwordRequired: false },
        },
        authorizedDomains: args.authorizedDomains,
        quota: {
          signUpQuotaConfig: {
            quota: 100,
            startTime: '',
            quotaDuration: '7200s',
          },
        },
      },
      { parent: this, dependsOn: args.dependsOn }
    );

    if (args.google) {
      new gcp.identityplatform.DefaultSupportedIdpConfig(
        `${name}-google`,
        {
          project: args.project,
          idpId: 'google.com',
          clientId: args.google.clientId,
          clientSecret: args.google.clientSecret,
          enabled: true,
        },
        { parent: this, dependsOn: [this.config] }
      );
    }

    this.registerOutputs({});
  }
}
