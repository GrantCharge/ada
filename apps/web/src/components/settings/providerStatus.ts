import { msg } from "gt-react";
import { m, type MessageResolver } from "../../i18n/messages";
import type {
  ServerProvider,
  ServerProviderVersionAdvisory,
  ServerProviderCompatibilityAdvisory,
} from "@t3tools/contracts";
import { APP_NAME } from "@t3tools/shared/branding";

export const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-muted-foreground/50",
  },
  error: {
    dot: "bg-destructive",
  },
  neutral: {
    dot: "bg-muted-foreground",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

export type ProviderStatusKey = keyof typeof PROVIDER_STATUS_STYLES;

/** The server names a custom endpoint in English; other auth labels are product or plan names. */
export function providerAuthLabel(
  auth: Pick<ServerProvider["auth"], "label" | "type">,
  resolve: MessageResolver = m,
): string | undefined {
  if (auth.type === "customEndpoint") return resolve(msg("Custom API endpoint"));
  return auth.label ?? auth.type;
}

// Antigravity's local health check verifies installation and settings, not the account: the
// server reports missing credentials as an error, so a warning with unknown auth is only unchecked.
function isAntigravitySignInUnchecked(provider: ServerProvider): boolean {
  return (
    provider.driver === "antigravity" &&
    provider.installed &&
    provider.status === "warning" &&
    provider.auth.status === "unknown"
  );
}

const ANTIGRAVITY_CREDENTIAL_AUTH_TYPES = new Set(["gemini-api-key", "agent-platform"]);

export function getProviderStatusKey(provider: ServerProvider | undefined): ProviderStatusKey {
  if (provider && !provider.enabled) return "disabled";
  if (provider && isAntigravitySignInUnchecked(provider)) return "neutral";
  return provider?.status ?? "warning";
}

export function getProviderSummary(
  provider: ServerProvider | undefined,
  resolve: MessageResolver = m,
) {
  if (!provider) {
    return {
      headline: resolve(msg("Checking provider status")),
      detail: resolve(
        msg("Waiting for the server to report installation and authentication details."),
      ),
    };
  }
  if (!provider.enabled || provider.status === "disabled") {
    return {
      headline: resolve(msg("Disabled", { $context: "provider status" })),
      detail:
        provider.message ??
        `This provider is installed but disabled for new sessions in ${APP_NAME}.`,
    };
  }
  if (!provider.installed) {
    return {
      headline: resolve(msg("Not found", { $context: "provider status, CLI is missing" })),
      detail: provider.message ?? resolve(msg("CLI not detected on PATH.")),
    };
  }
  if (provider.auth.status === "unauthenticated") {
    const authLabel = providerAuthLabel(provider.auth, resolve);
    return {
      headline: authLabel
        ? resolve(msg("Not authenticated · {method}", { method: authLabel }))
        : resolve(msg("Not authenticated")),
      detail: provider.message ?? null,
    };
  }
  if (isAntigravitySignInUnchecked(provider)) {
    const credential = ANTIGRAVITY_CREDENTIAL_AUTH_TYPES.has(provider.auth.type ?? "")
      ? providerAuthLabel(provider.auth, resolve)
      : undefined;
    return {
      headline: credential
        ? resolve(msg("Installed · {method} not checked", { method: credential }))
        : resolve(msg("Installed · Sign-in not checked")),
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: resolve(msg("Needs attention")),
      detail:
        provider.message ??
        resolve(msg("The provider is installed, but the server could not fully verify it.")),
    };
  }
  if (provider.status === "error") {
    return {
      headline: resolve(msg("Unavailable", { $context: "provider status" })),
      detail: provider.message ?? resolve(msg("The provider failed its startup checks.")),
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = providerAuthLabel(provider.auth, resolve);
    return {
      headline: authLabel
        ? resolve(msg("Authenticated · {method}", { method: authLabel }))
        : resolve(msg("Authenticated")),
      detail: provider.message ?? null,
    };
  }
  return {
    headline: resolve(msg("Available", { $context: "provider status" })),
    detail: provider.message ?? null,
  };
}

export function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  const antigravity = /^agy_acp_server_(\d{4})(\d{2})(\d{2})_\d+(?:_(\w+))?$/.exec(version);
  if (antigravity) {
    const [, year, month, day, candidate] = antigravity;
    return `${year}-${month}-${day}${candidate ? ` ${candidate}` : ""}`;
  }
  return /^\d/.test(version) ? `v${version}` : version;
}

/** Where the server found the runtime; only a managed one is updated by the server. */
export function getProviderRuntimeSourcePresentation(
  source: ServerProvider["runtimeSource"],
  resolve: MessageResolver = m,
): { readonly label: string; readonly detail: string; readonly managed: boolean } | null {
  switch (source) {
    case "managed":
      return {
        label: resolve(msg("Managed by {appName}", { appName: APP_NAME })),
        detail: resolve(
          msg("{appName} installed this runtime and checks it for updates.", { appName: APP_NAME }),
        ),
        managed: true,
      };
    case "custom":
      return {
        label: resolve(msg("Custom path", { $context: "provider runtime source" })),
        detail: resolve(
          msg("Runs the custom binary path below. {appName} does not update it.", {
            appName: APP_NAME,
          }),
        ),
        managed: false,
      };
    case "path":
      return {
        label: resolve(msg("System PATH")),
        detail: resolve(
          msg("Runs the copy found on the system PATH. {appName} does not update it.", {
            appName: APP_NAME,
          }),
        ),
        managed: false,
      };
    case undefined:
      return null;
  }
}

const COMPATIBILITY_TITLES = {
  graceful: msg("Limited support"),
  unsupported: msg("Unsupported version"),
  broken: msg("Known broken version"),
} as const;

export function getProviderVersionAdvisoryPresentation(
  advisory: ServerProviderVersionAdvisory | undefined,
  compatibility?: ServerProviderCompatibilityAdvisory | undefined,
  showCompatibility = true,
  resolve: MessageResolver = m,
): {
  readonly title: string;
  readonly detail: string;
  readonly updateCommand: string | null;
  readonly emphasis: "normal" | "strong";
  readonly targetVersion: string | null;
} | null {
  const latestIsIncompatible =
    compatibility?.latestVersionStatus === "broken" ||
    compatibility?.latestVersionStatus === "unsupported";
  if (
    showCompatibility &&
    compatibility &&
    (compatibility.status === "graceful" ||
      compatibility.status === "unsupported" ||
      compatibility.status === "broken")
  ) {
    const targetVersion = compatibility.recommendedVersion;
    const recommendation = getProviderVersionLabel(targetVersion) ?? compatibility.recommendedRange;
    // Latest package versions cannot be updated into recommendations requiring another package.
    const isAlreadyLatest = advisory?.status === "current";
    return {
      title: resolve(COMPATIBILITY_TITLES[compatibility.status]),
      detail:
        compatibility.message ??
        (recommendation
          ? resolve(msg("Use {version} for full support.", { version: recommendation }))
          : resolve(msg("Update for full support."))),
      updateCommand:
        targetVersion || latestIsIncompatible || isAlreadyLatest
          ? null
          : (advisory?.updateCommand ?? null),
      emphasis: compatibility.status === "graceful" ? "normal" : "strong",
      targetVersion,
    };
  }
  if (
    !advisory ||
    advisory.status === "current" ||
    advisory.status === "unknown" ||
    latestIsIncompatible
  ) {
    return null;
  }

  const version = advisory.latestVersion;
  const versionLabel = getProviderVersionLabel(version);

  return {
    title: resolve(msg("Update available")),
    detail:
      advisory.message ??
      (versionLabel
        ? resolve(msg("Update available: install {version}.", { version: versionLabel }))
        : resolve(msg("Update available: install the latest provider version."))),
    updateCommand: advisory.updateCommand,
    emphasis: "normal" as const,
    targetVersion: null,
  };
}
