import {
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
  type ProviderPrivacyEntry,
} from "@t3tools/client-runtime/state/provider-privacy";
import { APP_NAME } from "@t3tools/shared/branding";
import { T, useGT, useMessages, Var } from "gt-react";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { useUpdatePrimarySettings } from "../../hooks/useSettings";
import { useEnvironments } from "../../state/environments";
import { Switch } from "../ui/switch";
import {
  providerPrivacyEnvironmentStatuses,
  providerPrivacySwitchState,
  shownProviderPrivacy,
} from "@t3tools/client-runtime/state/provider-privacy-view";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { providerPrivacySearchId, useSearchableSetting } from "./settingsSearch";

const MINIMAL_NETWORK: ReadonlyArray<ProviderPrivacyCategory> = ["minimalNetwork"];

export function ProviderPrivacySettingsPanel() {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const { environments } = useEnvironments();
  const updateSettings = useUpdatePrimarySettings();
  const [pending, setPending] = useState<ProviderPrivacySettings | null>(null);
  const saved = planProviderPrivacySync(providerPrivacySources(environments)).providerPrivacy;
  const settings = shownProviderPrivacy(saved, pending);
  const statuses = providerPrivacyEnvironmentStatuses(environments);
  const canSave = statuses.some((status) => status.applied);
  const telemetry = providerPrivacySwitchState(settings, PROVIDER_TELEMETRY_CATEGORIES);
  const network = providerPrivacySwitchState(settings, MINIMAL_NETWORK);

  const save = (providerPrivacy: ProviderPrivacySettings) => {
    setPending(providerPrivacy);
    void updateSettings({ providerPrivacy }, { onFailed: () => setPending(null) });
  };
  const customHint = gt("Custom: some providers differ below.");

  return (
    <SettingsPageContainer>
      <SettingsSection {...searchableSetting("provider-privacy")}>
        <SettingsRow
          {...searchableSetting("provider-telemetry")}
          description={gt(
            "Usage analytics, error reports and feedback uploads from every provider CLI.",
          )}
          status={telemetry === "custom" ? customHint : undefined}
          control={
            <Switch
              checked={telemetry === "on"}
              disabled={!canSave}
              onCheckedChange={(checked) =>
                save(
                  setProviderPrivacyForAll(
                    settings,
                    PROVIDER_TELEMETRY_CATEGORIES,
                    Boolean(checked),
                    new Date().toISOString(),
                  ),
                )
              }
              aria-label={gt("Block provider telemetry")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("provider-non-essential-traffic")}
          description={gt(
            "Also stops update checks and other optional calls. This can break auto-update, cloud features and model lists.",
          )}
          status={network === "custom" ? customHint : undefined}
          control={
            <Switch
              checked={network === "on"}
              disabled={!canSave}
              onCheckedChange={(checked) =>
                save(
                  setProviderPrivacyForAll(
                    settings,
                    MINIMAL_NETWORK,
                    Boolean(checked),
                    new Date().toISOString(),
                  ),
                )
              }
              aria-label={gt("Block non-essential traffic")}
            />
          }
        />
        <div className="space-y-1.5 px-3 py-3 text-xs text-muted-foreground sm:px-4">
          <p>
            {gt(
              "Changes apply to provider processes {app} starts next; running sessions keep their settings.",
              { app: APP_NAME },
            )}
          </p>
          {statuses.length === 0 ? (
            <p>
              <T>Connect an environment to apply these settings.</T>
            </p>
          ) : (
            <ul className="space-y-1">
              {statuses.map((status) => (
                <li key={status.environmentId} className="flex items-center gap-1.5">
                  {status.applied ? (
                    <CheckIcon className="size-3.5 shrink-0 text-success" aria-hidden />
                  ) : (
                    <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" aria-hidden />
                  )}
                  {status.applied ? (
                    <T>
                      Applied on <Var>{status.label}</Var>
                    </T>
                  ) : (
                    <T>
                      Not applied on <Var>{status.label}</Var>: update its server
                    </T>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsSection>
      <SettingsSection title={gt("By provider")}>
        <p className="px-3 pt-3 text-xs text-muted-foreground sm:px-4">
          <T>A switch that is on blocks that traffic.</T>
        </p>
        {PROVIDER_PRIVACY_CATALOG.map((entry) => (
          <ProviderPrivacyRow
            key={entry.driverKind}
            entry={entry}
            settings={settings}
            disabled={!canSave}
            onChange={(category, blocked) =>
              save(
                setProviderPrivacyCategory(
                  settings,
                  entry.driverKind,
                  category,
                  blocked,
                  new Date().toISOString(),
                ),
              )
            }
          />
        ))}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function ProviderPrivacyRow({
  entry,
  settings,
  disabled,
  onChange,
}: {
  readonly entry: ProviderPrivacyEntry;
  readonly settings: ProviderPrivacySettings | undefined;
  readonly disabled: boolean;
  readonly onChange: (category: ProviderPrivacyCategory, blocked: boolean) => void;
}) {
  const gt = useGT();
  const resolve = useMessages();
  const choice = resolveProviderPrivacy(settings, entry.driverKind);
  return (
    <SettingsRow
      id={providerPrivacySearchId(entry.driverKind)}
      title={entry.name}
      description={resolve(entry.sends)}
    >
      <div className="space-y-2 pt-1 pb-2">
        {entry.controls.length > 0 ? (
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {entry.controls.map((category) => {
              const label = resolve(PROVIDER_PRIVACY_CATEGORY_LABELS[category]);
              return (
                <label
                  key={category}
                  className="flex min-h-8 items-center justify-between gap-3 text-sm"
                >
                  <span>{label}</span>
                  <Switch
                    size="sm"
                    checked={choice[category]}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange(category, Boolean(checked))}
                    aria-label={gt("{provider}: {category}", {
                      provider: entry.name,
                      category: label,
                    })}
                  />
                </label>
              );
            })}
          </div>
        ) : null}
        {entry.note ? <p className="text-xs text-muted-foreground">{resolve(entry.note)}</p> : null}
        {entry.account ? (
          <p className="text-xs text-muted-foreground">
            {gt("Whether your prompts train models is an account setting.")}{" "}
            <a
              href={entry.account.url}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              {resolve(entry.account.label)} ↗
            </a>
          </p>
        ) : null}
      </div>
    </SettingsRow>
  );
}
