import { useAtomValue } from "@effect/atom-react";
import { connectionErrorText } from "@t3tools/client-runtime/connection";
import { AuthProvidersManageScope, PROVIDER_DISPLAY_NAMES } from "@t3tools/contracts";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { sessionDeniesScope } from "@t3tools/client-runtime/state/session";
import {
  checkEnvironmentUpdates,
  type UpdateCheckItem,
} from "@t3tools/client-runtime/update-check";
import { useRef, useState } from "react";
import { T, useMessages } from "gt-react";

import { useEnvironmentProviders, useEnvironments } from "~/state/environments";
import { environmentIdsKey } from "~/state/environmentAtomList";
import { serverEnvironment } from "~/state/server";
import {
  environmentSessionStatesAtom,
  sessionHasScope,
  useEnvironmentsWithScope,
} from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { isHostedByThisApp } from "~/connection/desktopLocal";
import {
  getProviderUpdateRunToastView,
  type ProviderUpdateRun,
} from "./ProviderUpdateLaunchNotification.logic";
import { collectProviderUpdateTargets } from "./sidebar/updateEverything.logic";
import { Button } from "./ui/button";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { SharedTooltipTrigger } from "./ui/shared-tooltip";

// `refreshModels` always drops the server's hour-long latest-version cache. `modelCatalogOnly`
// drops it only when the model manifest changed.
export function useCheckEnvironmentUpdates() {
  const { environments } = useEnvironments();
  const manageableIds = useEnvironmentsWithScope(environments, AuthProvidersManageScope);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const lookupNpmRelease = useAtomCommand(serverEnvironment.lookupNpmRelease, {
    reportFailure: false,
  });
  const inFlight = useRef<Promise<UpdateCheckItem[]> | null>(null);

  const check = () =>
    checkEnvironmentUpdates(
      environments.map((environment) => ({
        ...environment,
        hostedByThisApp: isHostedByThisApp(environment),
        canManageProviders: manageableIds.has(environment.environmentId),
      })),
      { lookupNpmRelease, refreshProviders },
    );

  // A repeat click must not start a second model rediscovery while one is running.
  return () => {
    if (inFlight.current) return inFlight.current;
    const running = check().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = running;
    return running;
  };
}

export function useProviderUpdates() {
  const { environments } = useEnvironments();
  const resolve = useMessages();
  const sessionStates = useAtomValue(
    environmentSessionStatesAtom(
      environmentIdsKey(environments.map(({ environmentId }) => environmentId)),
    ),
  );
  const providersByEnvironment = useEnvironmentProviders();
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, {
    reportFailure: false,
  });
  const { targets: machines, skipped } = collectProviderUpdateTargets(
    environments.map((environment, index) => {
      const sessionState = sessionStates[index]!;
      return {
        environmentId: environment.environmentId,
        label: environment.label,
        connected: environment.connection.phase === "connected",
        connectionError: connectionErrorText(environment.connection, resolve) ?? null,
        turnedOff: environment.entry?.enabled === false,
        canManageProviders: sessionHasScope(sessionState, AuthProvidersManageScope),
        providerAccessDenied: sessionDeniesScope(sessionState, AuthProvidersManageScope),
        providers: providersByEnvironment.get(environment.environmentId) ?? [],
      };
    }),
    resolve,
  );

  const updateAll = async ({ quiet = false }: { readonly quiet?: boolean } = {}) => {
    const runs = await Promise.all(
      machines.flatMap(({ environmentId, label, candidates }) =>
        candidates.map(async (candidate): Promise<ProviderUpdateRun> => ({
          environmentId,
          machineLabel: label,
          driver: candidate.driver,
          instanceId: candidate.instanceId,
          result: await updateProvider({
            environmentId,
            input: { provider: candidate.driver, instanceId: candidate.instanceId },
          }),
        })),
      ),
    );
    const view = quiet ? null : getProviderUpdateRunToastView(runs);
    if (view) {
      toastManager.add(
        stackedThreadToast({
          ...view,
          description: <span className="whitespace-pre-line">{view.description}</span>,
        }),
      );
    }
    return runs;
  };

  return { machines, skipped, updateAll };
}

export function ProviderUpdatesAction() {
  const { machines, skipped, updateAll } = useProviderUpdates();
  const pending = useRef(false);
  const [isPending, setIsPending] = useState(false);
  if (machines.length === 0 && !isPending) {
    return null;
  }

  const handleUpdate = async () => {
    if (pending.current) return;
    pending.current = true;
    setIsPending(true);
    await settlePromise(() => updateAll());
    pending.current = false;
    setIsPending(false);
  };

  return (
    <SharedTooltipTrigger
      render={
        <Button
          size="xs"
          variant="ghost-muted"
          disabled={isPending}
          onClick={() => void handleUpdate()}
        >
          {isPending ? <T>Updating…</T> : <T>Update all</T>}
        </Button>
      }
      label={
        <>
          {machines.map((machine) => (
            <div key={machine.environmentId}>
              {machine.label}:{" "}
              {machine.candidates
                .map((candidate) => PROVIDER_DISPLAY_NAMES[candidate.driver] ?? candidate.driver)
                .join(", ")}
            </div>
          ))}
          {skipped.map((machine) => (
            <div key={`skipped:${machine.environmentId}`} className="text-muted-foreground">
              {machine.label}: {machine.reason}
            </div>
          ))}
        </>
      }
    />
  );
}
