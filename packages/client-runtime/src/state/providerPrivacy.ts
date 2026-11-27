import {
  PROVIDER_PRIVACY_CATEGORIES,
  resolveProviderPrivacy,
  type ProviderPrivacyCategory,
  type ProviderPrivacyChoice,
  type ProviderPrivacySettings,
} from "@t3tools/contracts";
import { msg } from "gt-i18n";

type Message = string;

export interface ProviderPrivacyEntry {
  readonly driverKind: string;
  readonly name: string;
  /** What the CLI sends its vendor, in one line. */
  readonly sends: Message;
  /** Categories Ada can switch off for this CLI. */
  readonly controls: ReadonlyArray<ProviderPrivacyCategory>;
  /** Shown when the CLI's switches have side effects or Ada can only ask politely. */
  readonly note?: Message;
  /** Model training and retention are account settings no client can change. */
  readonly account?: { readonly label: Message; readonly url: string };
}

export const PROVIDER_PRIVACY_CATALOG: ReadonlyArray<ProviderPrivacyEntry> = [
  {
    driverKind: "claudeAgent",
    name: "Claude",
    sends: msg(
      "Usage metrics to Anthropic and its vendors, error reports on Pro and Max plans, session surveys and /feedback uploads.",
    ),
    controls: PROVIDER_PRIVACY_CATEGORIES,
    note: msg(
      "Blocking usage analytics also disables Claude Remote Control and flag-delivered features.",
    ),
    account: {
      label: msg("Anthropic privacy settings"),
      url: "https://claude.ai/settings/data-privacy-controls",
    },
  },
  {
    driverKind: "codex",
    name: "Codex",
    sends: msg("Usage metrics to OpenAI (Statsig), /feedback reports and startup update checks."),
    controls: ["usageAnalytics", "feedback", "minimalNetwork"],
    account: {
      label: msg("ChatGPT data controls"),
      url: "https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt",
    },
  },
  {
    driverKind: "grok",
    name: "Grok Build",
    sends: msg("Product analytics, session trace uploads and feedback to xAI."),
    controls: ["usageAnalytics", "feedback", "minimalNetwork"],
    account: {
      label: msg("xAI data controls"),
      url: "https://docs.x.ai/developers/faq/security",
    },
  },
  {
    driverKind: "antigravity",
    name: "Antigravity",
    sends: msg("Telemetry to Google."),
    controls: ["usageAnalytics"],
    account: {
      label: msg("Antigravity settings"),
      url: "https://antigravity.google/docs/settings/",
    },
  },
  {
    driverKind: "commandcode",
    name: "Command Code",
    sends: msg("Telemetry spans, lifecycle events and error reports to Command Code."),
    controls: ["usageAnalytics"],
    note: msg("One switch covers its analytics and error reports."),
  },
  {
    driverKind: "opencode",
    name: "OpenCode",
    sends: msg("Session sharing to opncd.ai when used, and self-update checks."),
    controls: ["usageAnalytics", "feedback", "minimalNetwork"],
    note: msg(
      "Blocking feedback turns session sharing off. OpenCode documents no product telemetry; Ada also sets DO_NOT_TRACK.",
    ),
  },
  {
    driverKind: "kiro",
    name: "Kiro",
    sends: msg("Usage data, errors and crash reports to AWS."),
    controls: ["usageAnalytics"],
    note: msg("Best effort: Ada sets DO_NOT_TRACK. Turn telemetry off in Kiro's own settings too."),
    account: {
      label: msg("Kiro data protection"),
      url: "https://kiro.dev/docs/privacy-and-security/data-protection/",
    },
  },
  {
    driverKind: "pi",
    name: "Pi",
    sends: msg(
      "A version check with pi.dev. Ada runs Pi in RPC mode, which skips its install ping.",
    ),
    controls: ["usageAnalytics", "minimalNetwork"],
    note: msg("Best effort for analytics: Ada sets DO_NOT_TRACK."),
  },
  {
    driverKind: "muse",
    name: "Muse Code",
    sends: msg("Usage events to Meta. Its telemetry switch lives only in Muse's settings file."),
    controls: ["usageAnalytics"],
    note: msg("Best effort: Ada sets DO_NOT_TRACK."),
    account: {
      label: msg("Muse Code Contributor mode"),
      url: "https://dev.meta.ai/docs/muse-code/subscriptions",
    },
  },
  {
    driverKind: "fx",
    name: "fx",
    sends: msg("No telemetry. It checks releases.fx.sh for updates."),
    controls: ["minimalNetwork"],
    account: { label: msg("fx privacy"), url: "https://fx.sh/privacy" },
  },
  {
    driverKind: "cursor",
    name: "Cursor",
    sends: msg("Cursor documents no client switch for its agent's telemetry."),
    controls: [],
    note: msg("Ada can't turn this off. Privacy Mode on your Cursor account is the control."),
    account: { label: msg("Cursor Privacy Mode"), url: "https://cursor.com/data-use" },
  },
  {
    driverKind: "acpRegistry",
    name: "ACP Registry agents",
    sends: msg("Varies by agent."),
    controls: ["usageAnalytics"],
    note: msg("Best effort: Ada sets DO_NOT_TRACK, which some agents ignore."),
  },
];

export const PROVIDER_PRIVACY_CATEGORY_LABELS: Record<ProviderPrivacyCategory, Message> = {
  usageAnalytics: msg("Usage analytics"),
  errorReports: msg("Error reports"),
  feedback: msg("Feedback and sharing"),
  minimalNetwork: msg("Non-essential traffic"),
};

export const PROVIDER_TELEMETRY_CATEGORIES = [
  "usageAnalytics",
  "errorReports",
  "feedback",
] as const;

/** True when every listed category is blocked for each provider that supports it. */
export function providerPrivacyBlocked(
  settings: ProviderPrivacySettings | undefined,
  categories: ReadonlyArray<ProviderPrivacyCategory>,
): boolean {
  return PROVIDER_PRIVACY_CATALOG.every((entry) => {
    const choice = resolveProviderPrivacy(settings, entry.driverKind);
    return entry.controls.every((category) => !categories.includes(category) || choice[category]);
  });
}

/** The page-wide switches: one setting for every provider at once. */
export function setProviderPrivacyForAll(
  settings: ProviderPrivacySettings | undefined,
  categories: ReadonlyArray<ProviderPrivacyCategory>,
  blocked: boolean,
  now: string,
): ProviderPrivacySettings {
  const drivers: Record<string, ProviderPrivacyChoice> = { ...settings?.drivers };
  for (const entry of PROVIDER_PRIVACY_CATALOG) {
    const choice = resolveProviderPrivacy(settings, entry.driverKind);
    drivers[entry.driverKind] = {
      ...choice,
      ...Object.fromEntries(categories.map((category) => [category, blocked])),
    };
  }
  return { drivers, updatedAt: now };
}

/**
 * Writes every provider's full choice, so the server's deep merge leaves each machine with exactly
 * this value and catch-up comparisons settle.
 */
export function setProviderPrivacyCategory(
  settings: ProviderPrivacySettings | undefined,
  driverKind: string,
  category: ProviderPrivacyCategory,
  blocked: boolean,
  now: string,
): ProviderPrivacySettings {
  const all = setProviderPrivacyForAll(settings, [], blocked, now);
  return {
    drivers: {
      ...all.drivers,
      [driverKind]: { ...resolveProviderPrivacy(settings, driverKind), [category]: blocked },
    },
    updatedAt: now,
  };
}
