import {
  AuthSettingsWriteScope,
  resolveProviderPrivacy,
  type ProviderPrivacyCategory,
  type ProviderPrivacySettings,
} from "@t3tools/contracts";
import {
  planProviderPrivacySync,
  providerPrivacySources,
} from "@t3tools/client-runtime/operations/providerPrivacy";
import {
  PROVIDER_PRIVACY_CATALOG,
  PROVIDER_PRIVACY_CATEGORY_LABELS,
  PROVIDER_TELEMETRY_CATEGORIES,
  setProviderPrivacyCategory,
  setProviderPrivacyForAll,
} from "@t3tools/client-runtime/state/provider-privacy";
import {
  providerPrivacyEnvironmentStatuses,
  providerPrivacySwitchState,
  shownProviderPrivacy,
} from "@t3tools/client-runtime/state/provider-privacy-view";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { T, useGT, useMessages } from "gt-react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { MOBILE_APP_NAME } from "../../lib/mobileBranding";
import { useEnvironments } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentsWithScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";

const MINIMAL_NETWORK: ReadonlyArray<ProviderPrivacyCategory> = ["minimalNetwork"];

export function SettingsPrivacyRouteScreen() {
  const gt = useGT();
  const m = useMessages();
  const insets = useSafeAreaInsets();
  const { environments } = useEnvironments();
  const statuses = providerPrivacyEnvironmentStatuses(environments);
  const capable = statuses.filter((status) => status.applied);
  const writable = useEnvironmentsWithScope(capable, AuthSettingsWriteScope);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "provider privacy update",
    reportFailure: false,
  });
  const [pending, setPending] = useState<ProviderPrivacySettings | null>(null);
  const saved = planProviderPrivacySync(providerPrivacySources(environments)).providerPrivacy;
  const settings = shownProviderPrivacy(saved, pending);
  const targets = capable.filter((status) => writable.has(status.environmentId));
  const disabled = targets.length === 0;
  const telemetry = providerPrivacySwitchState(settings, PROVIDER_TELEMETRY_CATEGORIES);
  const network = providerPrivacySwitchState(settings, MINIMAL_NETWORK);

  // Older servers drop the key, so only machines that apply it are written to.
  const save = (providerPrivacy: ProviderPrivacySettings) => {
    setPending(providerPrivacy);
    void Promise.all(
      targets.map(async (target) => {
        const result = await updateSettings({
          environmentId: target.environmentId,
          input: { patch: { providerPrivacy } },
        });
        if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return null;
        const error = squashAtomCommandFailure(result);
        return gt("{environment}: {error}", {
          environment: target.label,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    ).then((outcomes) => {
      const failures = outcomes.filter((outcome) => outcome !== null);
      if (failures.length === 0) return;
      if (failures.length === targets.length) setPending(null);
      Dialog.alert(gt("Could not save settings"), failures.join("\n\n"));
    });
  };
  const customHint = gt("Custom: some providers differ below.");
  const withHint = (description: string, state: string) =>
    state === "custom" ? `${description} ${customHint}` : description;

  return (
    <SettingsScreen title={gt("Privacy")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection
          footer={gt(
            "Changes apply to provider processes {app} starts next; running sessions keep their settings.",
            { app: MOBILE_APP_NAME },
          )}
        >
          <SettingsSwitchRow
            icon="eye.slash"
            label={gt("Block provider telemetry")}
            subtitle={withHint(
              gt("Usage analytics, error reports and feedback uploads from every provider CLI."),
              telemetry,
            )}
            value={telemetry === "on"}
            disabled={disabled}
            onValueChange={(value) =>
              save(
                setProviderPrivacyForAll(
                  settings,
                  PROVIDER_TELEMETRY_CATEGORIES,
                  value,
                  new Date().toISOString(),
                ),
              )
            }
          />
          <SettingsSwitchRow
            icon="wifi.slash"
            label={gt("Block non-essential traffic")}
            subtitle={withHint(
              gt(
                "Also stops update checks and other optional calls. This can break auto-update, cloud features and model lists.",
              ),
              network,
            )}
            value={network === "on"}
            disabled={disabled}
            onValueChange={(value) =>
              save(
                setProviderPrivacyForAll(
                  settings,
                  MINIMAL_NETWORK,
                  value,
                  new Date().toISOString(),
                ),
              )
            }
          />
        </SettingsSection>

        <SettingsSection title={gt("Environments")}>
          {statuses.length === 0 ? (
            <ListRowLayout
              icon="info.circle"
              label={gt("Connect an environment to apply these settings.")}
            />
          ) : (
            statuses.map((status) => (
              <ListRowLayout
                key={status.environmentId}
                icon={status.applied ? "checkmark.circle" : "exclamationmark.triangle"}
                label={
                  status.applied
                    ? gt("Applied on {environment}", { environment: status.label })
                    : gt("Not applied on {environment}: update its server", {
                        environment: status.label,
                      })
                }
              />
            ))
          )}
        </SettingsSection>

        <Text textRole="footnote" className="-mb-3 px-2 text-foreground-muted">
          <T>A switch that is on blocks that traffic.</T>
        </Text>
        {PROVIDER_PRIVACY_CATALOG.map((entry) => {
          const choice = resolveProviderPrivacy(settings, entry.driverKind);
          const account = entry.account;
          return (
            <SettingsSection
              key={entry.driverKind}
              title={entry.name}
              footer={[m(entry.sends), ...(entry.note ? [m(entry.note)] : [])].join("\n\n")}
            >
              {entry.controls.map((category) => (
                <SettingsSwitchRow
                  key={category}
                  label={m(PROVIDER_PRIVACY_CATEGORY_LABELS[category])}
                  value={choice[category]}
                  disabled={disabled}
                  onValueChange={(value) =>
                    save(
                      setProviderPrivacyCategory(
                        settings,
                        entry.driverKind,
                        category,
                        value,
                        new Date().toISOString(),
                      ),
                    )
                  }
                />
              ))}
              {account ? (
                <ListActionRow
                  icon="arrow.up.right"
                  label={`${m(account.label)} ↗`}
                  description={gt("Whether your prompts train models is an account setting.")}
                  onPress={() => void tryOpenExternalUrl(account.url)}
                />
              ) : null}
            </SettingsSection>
          );
        })}
      </ScrollView>
    </SettingsScreen>
  );
}
