import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { DEFAULT_PROVIDER_PRIVACY_CHOICE, resolveProviderPrivacy } from "./providerPrivacy.ts";
import { DEFAULT_SERVER_SETTINGS, ServerSettings, ServerSettingsPatch } from "./settings.ts";

const decodePatch = Schema.decodeUnknownSync(ServerSettingsPatch);
const decodeSettings = Schema.decodeUnknownSync(ServerSettings);

describe("providerPrivacy settings", () => {
  it("defaults to blocking telemetry but not non-essential traffic", () => {
    expect(DEFAULT_SERVER_SETTINGS.providerPrivacy).toEqual({ drivers: {} });
    expect(resolveProviderPrivacy(DEFAULT_SERVER_SETTINGS.providerPrivacy, "claudeAgent")).toEqual({
      usageAnalytics: true,
      errorReports: true,
      feedback: true,
      minimalNetwork: false,
    });
  });

  it("keeps a driver this build does not know, so newer clients' choices survive", () => {
    const providerPrivacy = {
      drivers: { futureAgent: { ...DEFAULT_PROVIDER_PRIVACY_CHOICE, usageAnalytics: false } },
      updatedAt: "2026-11-27T00:00:00.000Z",
    };
    expect(decodePatch({ providerPrivacy })).toEqual({
      providerPrivacy,
    });
    const settings = decodeSettings({ providerPrivacy });
    expect(resolveProviderPrivacy(settings.providerPrivacy, "futureAgent").usageAnalytics).toBe(
      false,
    );
    expect(resolveProviderPrivacy(settings.providerPrivacy, "codex")).toEqual(
      DEFAULT_PROVIDER_PRIVACY_CHOICE,
    );
  });
});
