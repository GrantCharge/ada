import { describe, expect, it } from "@effect/vitest";
import { resolveProviderPrivacy } from "@t3tools/contracts";

import {
  PROVIDER_PRIVACY_CATALOG,
  PROVIDER_TELEMETRY_CATEGORIES,
  providerPrivacyBlocked,
  setProviderPrivacyCategory,
  setProviderPrivacyForAll,
} from "./providerPrivacy.ts";

const now = "2026-11-27T10:00:00.000Z";

describe("provider privacy helpers", () => {
  it("blocks telemetry by default and leaves non-essential traffic on", () => {
    expect(providerPrivacyBlocked(undefined, PROVIDER_TELEMETRY_CATEGORIES)).toBe(true);
    expect(providerPrivacyBlocked(undefined, ["minimalNetwork"])).toBe(false);
  });

  it("turns telemetry back on everywhere without touching non-essential traffic", () => {
    const strict = setProviderPrivacyForAll(undefined, ["minimalNetwork"], true, now);
    const allowed = setProviderPrivacyForAll(strict, PROVIDER_TELEMETRY_CATEGORIES, false, now);
    expect(providerPrivacyBlocked(allowed, PROVIDER_TELEMETRY_CATEGORIES)).toBe(false);
    expect(providerPrivacyBlocked(allowed, ["minimalNetwork"])).toBe(true);
    expect(allowed.updatedAt).toBe(now);
  });

  it("writes every provider's full choice when one switch changes", () => {
    const next = setProviderPrivacyCategory(undefined, "claudeAgent", "usageAnalytics", false, now);
    expect(Object.keys(next.drivers).toSorted()).toEqual(
      PROVIDER_PRIVACY_CATALOG.map((entry) => entry.driverKind).toSorted(),
    );
    expect(resolveProviderPrivacy(next, "claudeAgent").usageAnalytics).toBe(false);
    expect(resolveProviderPrivacy(next, "codex").usageAnalytics).toBe(true);
    expect(providerPrivacyBlocked(next, PROVIDER_TELEMETRY_CATEGORIES)).toBe(false);
  });
});
