import type {
  EnvironmentId,
  ExecutionEnvironmentCapabilities,
  ProviderPrivacySettings,
  ServerSettingsPatch,
} from "@t3tools/contracts";

import { createSyncGate } from "./agentLibrary.ts";

export interface ProviderPrivacySource {
  readonly environmentId: EnvironmentId;
  readonly providerPrivacy: ProviderPrivacySettings;
  readonly capabilities: Pick<ExecutionEnvironmentCapabilities, "providerPrivacy"> | undefined;
  readonly live: boolean;
}

export interface ProviderPrivacySyncPlan {
  readonly providerPrivacy: ProviderPrivacySettings | undefined;
  readonly targets: ReadonlyArray<{ readonly environmentId: EnvironmentId }>;
}

export function providerPrivacySources(
  environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly connection: { readonly phase: string };
    readonly serverConfig?: {
      readonly settings: { readonly providerPrivacy: ProviderPrivacySettings };
      readonly environment: { readonly capabilities: ProviderPrivacySource["capabilities"] };
    } | null;
  }>,
): ReadonlyArray<ProviderPrivacySource> {
  return environments.flatMap((environment) =>
    environment.serverConfig
      ? [
          {
            environmentId: environment.environmentId,
            providerPrivacy: environment.serverConfig.settings.providerPrivacy,
            capabilities: environment.serverConfig.environment.capabilities,
            live: environment.connection.phase === "connected",
          },
        ]
      : [],
  );
}

const fingerprint = (settings: ProviderPrivacySettings) => JSON.stringify(settings);

/**
 * The newest save wins, so a machine that slept through a change gets it when it reconnects.
 * Machines that never saved carry no time and copy nothing.
 */
export function planProviderPrivacySync(
  sources: ReadonlyArray<ProviderPrivacySource>,
): ProviderPrivacySyncPlan {
  const syncing = sources.filter((source) => source.capabilities?.providerPrivacy === true);
  const winner = syncing
    .filter((source) => (source.providerPrivacy.updatedAt ?? "") !== "")
    .sort(
      (a, b) =>
        (b.providerPrivacy.updatedAt ?? "").localeCompare(a.providerPrivacy.updatedAt ?? "") ||
        a.environmentId.localeCompare(b.environmentId),
    )[0];
  if (winner === undefined) return { providerPrivacy: undefined, targets: [] };
  return {
    providerPrivacy: winner.providerPrivacy,
    targets: syncing
      .filter(
        (source) =>
          source.live &&
          fingerprint(source.providerPrivacy) !== fingerprint(winner.providerPrivacy),
      )
      .map(({ environmentId }) => ({ environmentId })),
  };
}

export async function runProviderPrivacySync(
  plan: ProviderPrivacySyncPlan,
  replicate: (environmentId: EnvironmentId, patch: ServerSettingsPatch) => Promise<boolean>,
): Promise<boolean> {
  const { providerPrivacy } = plan;
  if (providerPrivacy === undefined || plan.targets.length === 0) return true;
  const results = await Promise.all(
    plan.targets.map(({ environmentId }) => replicate(environmentId, { providerPrivacy })),
  );
  return results.every(Boolean);
}

/** Each newest save goes to each machine once, until it fails. */
export function createProviderPrivacySyncGate() {
  const gate = createSyncGate<ProviderPrivacySyncPlan["targets"][number]>();
  return {
    take: (plan: ProviderPrivacySyncPlan) =>
      gate.take(plan.targets, () => JSON.stringify(plan.providerPrivacy)),
  };
}
