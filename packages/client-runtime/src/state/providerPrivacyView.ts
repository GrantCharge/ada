import {
  resolveProviderPrivacy,
  type EnvironmentId,
  type ProviderPrivacyCategory,
  type ProviderPrivacySettings,
} from "@t3tools/contracts";
import { PROVIDER_PRIVACY_CATALOG, providerPrivacyBlocked } from "./providerPrivacy.ts";

/** A page-wide switch is on, off, or "custom" when providers differ below. */
export function providerPrivacySwitchState(
  settings: ProviderPrivacySettings | undefined,
  categories: ReadonlyArray<ProviderPrivacyCategory>,
): "on" | "off" | "custom" {
  if (providerPrivacyBlocked(settings, categories)) return "on";
  const anyBlocked = PROVIDER_PRIVACY_CATALOG.some((entry) => {
    const choice = resolveProviderPrivacy(settings, entry.driverKind);
    return entry.controls.some((category) => categories.includes(category) && choice[category]);
  });
  return anyBlocked ? "custom" : "off";
}

/**
 * A save shows at once, then gives way when a machine reports it or anything newer. Without this,
 * a second toggle before the first echoes back would be computed from the stale value and undo it.
 */
export function shownProviderPrivacy(
  saved: ProviderPrivacySettings | undefined,
  pending: ProviderPrivacySettings | null,
): ProviderPrivacySettings | undefined {
  if (pending === null) return saved;
  return (saved?.updatedAt ?? "") >= (pending.updatedAt ?? "") ? saved : pending;
}

export interface ProviderPrivacyEnvironmentStatus {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly applied: boolean;
}

/** Connected machines, and whether each one's server applies these settings. */
export function providerPrivacyEnvironmentStatuses(
  environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
    readonly connection: { readonly phase: string };
    readonly serverConfig?: {
      readonly environment: {
        readonly capabilities: { readonly providerPrivacy?: boolean | undefined };
      };
    } | null;
  }>,
): ReadonlyArray<ProviderPrivacyEnvironmentStatus> {
  return environments.flatMap((environment) =>
    environment.connection.phase === "connected" && environment.serverConfig
      ? [
          {
            environmentId: environment.environmentId,
            label: environment.label,
            applied: environment.serverConfig.environment.capabilities.providerPrivacy === true,
          },
        ]
      : [],
  );
}
