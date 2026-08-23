import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export interface FirestoreArgs {
  project: pulumi.Input<string>;
  /** Firestore location, e.g. `nam5` or `europe-west`. Immutable once created. */
  location: pulumi.Input<string>;
  /** Guard against `pulumi destroy` taking the database (and its data) with it. */
  deleteProtection?: boolean;
  dependsOn?: pulumi.Resource[];
}

/**
 * Firestore in Native mode, its composite indexes, and the security rules.
 *
 * Rules are managed as a firebaserules Ruleset plus a Release pointing at it,
 * which is genuinely declarative: editing firestore.rules produces a new
 * ruleset and repoints the release, with a real diff and no `--force` prompt.
 */
export class Firestore extends pulumi.ComponentResource {
  readonly database: gcp.firestore.Database;
  readonly rulesRelease: gcp.firebaserules.Release;

  constructor(name: string, args: FirestoreArgs, opts?: pulumi.ComponentResourceOptions) {
    super('lifting:infra:Firestore', name, {}, opts);

    const protect = args.deleteProtection ?? true;

    this.database = new gcp.firestore.Database(
      `${name}-db`,
      {
        project: args.project,
        // "(default)" is the only database the Firebase web SDK talks to
        // without extra configuration.
        name: '(default)',
        locationId: args.location,
        type: 'FIRESTORE_NATIVE',
        concurrencyMode: 'OPTIMISTIC',
        deleteProtectionState: protect ? 'DELETE_PROTECTION_ENABLED' : 'DELETE_PROTECTION_DISABLED',
        // Point-in-time recovery costs nothing until used and is the only way
        // back from a bad client-side write, since there is no server tier.
        pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
      },
      { parent: this, dependsOn: args.dependsOn, protect }
    );

    // Days are read newest-first per user; the collection-group index lets the
    // client query across a user's sessions without a per-collection scan.
    new gcp.firestore.Index(
      `${name}-days-by-date`,
      {
        project: args.project,
        database: this.database.name,
        collection: 'days',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'date', order: 'DESCENDING' },
          { fieldPath: 'dayType', order: 'ASCENDING' },
        ],
      },
      { parent: this, dependsOn: [this.database] }
    );

    const rules = fs.readFileSync(path.join(repoRoot, 'firestore/firestore.rules'), 'utf8');

    const ruleset = new gcp.firebaserules.Ruleset(
      `${name}-ruleset`,
      {
        project: args.project,
        source: {
          language: 'FIREBASE_RULES',
          files: [{ name: 'firestore.rules', content: rules }],
        },
      },
      { parent: this, dependsOn: args.dependsOn }
    );

    this.rulesRelease = new gcp.firebaserules.Release(
      `${name}-rules-release`,
      {
        project: args.project,
        // The release name Firestore actually reads for the default database.
        name: pulumi.interpolate`cloud.firestore/${this.database.name}`,
        rulesetName: ruleset.name,
      },
      { parent: this, dependsOn: [this.database] }
    );

    this.registerOutputs({
      databaseName: this.database.name,
      rulesetName: ruleset.name,
    });
  }
}
