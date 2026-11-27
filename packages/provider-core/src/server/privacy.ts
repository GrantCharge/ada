import {
  PROVIDER_PRIVACY_CATEGORIES,
  type ProviderPrivacyCategory,
  type ProviderPrivacyChoice,
  type ProviderPrivacySource,
} from "@t3tools/contracts";

/** Env vars a driver sets for each blocked category. */
export type ProviderPrivacyEnvironmentTable = Partial<
  Record<ProviderPrivacyCategory, Readonly<Record<string, string>>>
>;

/** Honored by many CLIs; harmless where ignored. */
export const DO_NOT_TRACK_TABLE: ProviderPrivacyEnvironmentTable = {
  usageAnalytics: { DO_NOT_TRACK: "1" },
};

const providerPrivacyEnvironment = (
  table: ProviderPrivacyEnvironmentTable,
  choice: ProviderPrivacyChoice,
): Record<string, string> => {
  const overlay: Record<string, string> = {};
  for (const category of PROVIDER_PRIVACY_CATEGORIES) {
    if (choice[category]) Object.assign(overlay, table[category]);
  }
  return overlay;
};

/**
 * Adds the overlay without replacing a variable the environment already sets, so a value the user
 * put in the instance environment (or the server's own) wins.
 */
export const withProviderPrivacyEnvironment = <
  Env extends Readonly<Record<string, string | undefined>>,
>(
  environment: Env,
  table: ProviderPrivacyEnvironmentTable,
  privacy: ProviderPrivacySource | undefined,
): Env => {
  if (privacy === undefined) return environment;
  const overlay = providerPrivacyEnvironment(table, privacy());
  const present = new Set(
    Object.entries(environment)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([name]) => name.toUpperCase()),
  );
  const next: Record<string, string | undefined> = { ...environment };
  for (const [name, value] of Object.entries(overlay)) {
    if (!present.has(name.toUpperCase())) next[name] = value;
  }
  return next as Env;
};
