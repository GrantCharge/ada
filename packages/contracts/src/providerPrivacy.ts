import * as Schema from "effect/Schema";

export const PROVIDER_PRIVACY_CATEGORIES = [
  "usageAnalytics",
  "errorReports",
  "feedback",
  "minimalNetwork",
] as const;
export type ProviderPrivacyCategory = (typeof PROVIDER_PRIVACY_CATEGORIES)[number];

/** `true` blocks that kind of traffic from the provider's CLI to its vendor. */
export const ProviderPrivacyChoice = Schema.Struct({
  usageAnalytics: Schema.Boolean,
  errorReports: Schema.Boolean,
  feedback: Schema.Boolean,
  minimalNetwork: Schema.Boolean,
});
export type ProviderPrivacyChoice = typeof ProviderPrivacyChoice.Type;

export const DEFAULT_PROVIDER_PRIVACY_CHOICE: ProviderPrivacyChoice = {
  usageAnalytics: true,
  errorReports: true,
  feedback: true,
  minimalNetwork: false,
};

export const ALLOW_ALL_PROVIDER_PRIVACY_CHOICE: ProviderPrivacyChoice = {
  usageAnalytics: false,
  errorReports: false,
  feedback: false,
  minimalNetwork: false,
};

/**
 * Keyed by driver kind, not instance id: instance ids are local to one machine, driver kinds match
 * on every machine this setting syncs to. A missing driver uses the defaults.
 */
export const ProviderPrivacySettings = Schema.Struct({
  drivers: Schema.Record(Schema.String, ProviderPrivacyChoice),
  /** Newest write wins when a machine that was offline catches up. */
  updatedAt: Schema.optionalKey(Schema.String),
});
export type ProviderPrivacySettings = typeof ProviderPrivacySettings.Type;

export const DEFAULT_PROVIDER_PRIVACY_SETTINGS: ProviderPrivacySettings = { drivers: {} };

export const resolveProviderPrivacy = (
  settings: ProviderPrivacySettings | undefined,
  driverKind: string,
): ProviderPrivacyChoice => settings?.drivers[driverKind] ?? DEFAULT_PROVIDER_PRIVACY_CHOICE;

/** Reads the current choice for one driver at spawn time, so changes reach the next process. */
export type ProviderPrivacySource = () => ProviderPrivacyChoice;
