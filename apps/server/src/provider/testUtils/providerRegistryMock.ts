import * as ProviderRegistry from "../ProviderRegistry.ts";
import type { ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { makeManualOnlyProviderMaintenanceCapabilities } from "@t3tools/provider-core/server/maintenanceResolver";

const makeProviderRegistryMock = (
  providers: ReadonlyArray<ServerProvider> = [],
  refreshed: ReadonlyArray<ServerProvider> = providers,
): ProviderRegistry.ProviderRegistry["Service"] => ({
  getProviders: Effect.succeed(providers),
  refresh: () => Effect.succeed(refreshed),
  refreshInstance: () => Effect.succeed(refreshed),
  reloadSecretsAndRefresh: () => Effect.succeed(providers),
  rebuildMissingAndRefresh: Effect.succeed(providers),
  applySecretAndRefresh: () => Effect.succeed(providers),
  refreshAfterUpdate: () => Effect.succeed(providers),
  refreshWorkspaceSnapshot: () => Effect.succeed(providers),
  runtimeModeLimits: () => Effect.succeed([]),
  invalidateModelCaches: () => Effect.void,
  refreshModels: () => Effect.succeed(providers),
  refreshModelCatalog: Effect.void,
  getProviderMaintenanceCapabilitiesForInstance: (_instanceId, provider) =>
    Effect.succeed(makeManualOnlyProviderMaintenanceCapabilities({ provider, packageName: null })),
  setProviderMaintenanceActionState: () => Effect.succeed(providers),
  streamChanges: Stream.empty,
});

/** `refreshed` is what a refresh returns, for a catalog that is stale until refreshed. */
export const layer = (
  providers: ReadonlyArray<ServerProvider> = [],
  refreshed: ReadonlyArray<ServerProvider> = providers,
) =>
  Layer.succeed(ProviderRegistry.ProviderRegistry, makeProviderRegistryMock(providers, refreshed));
