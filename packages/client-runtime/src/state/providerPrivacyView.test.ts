import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  PROVIDER_TELEMETRY_CATEGORIES,
  setProviderPrivacyCategory,
  setProviderPrivacyForAll,
} from "./providerPrivacy.ts";
import {
  providerPrivacyEnvironmentStatuses,
  providerPrivacySwitchState,
  shownProviderPrivacy,
} from "./providerPrivacyView.ts";

const NOW = "2026-11-27T10:00:00.000Z";
const LATER = "2026-11-27T10:00:05.000Z";

describe("providerPrivacySwitchState", () => {
  it("is on by default for telemetry and off for non-essential traffic", () => {
    expect(providerPrivacySwitchState(undefined, PROVIDER_TELEMETRY_CATEGORIES)).toBe("on");
    expect(providerPrivacySwitchState(undefined, ["minimalNetwork"])).toBe("off");
  });

  it("reports custom when one provider differs", () => {
    const settings = setProviderPrivacyCategory(undefined, "codex", "usageAnalytics", false, NOW);
    expect(providerPrivacySwitchState(settings, PROVIDER_TELEMETRY_CATEGORIES)).toBe("custom");
  });

  it("is off once every provider allows telemetry", () => {
    const settings = setProviderPrivacyForAll(undefined, PROVIDER_TELEMETRY_CATEGORIES, false, NOW);
    expect(providerPrivacySwitchState(settings, PROVIDER_TELEMETRY_CATEGORIES)).toBe("off");
  });
});

describe("shownProviderPrivacy", () => {
  const first = setProviderPrivacyForAll(undefined, ["minimalNetwork"], true, NOW);
  const second = setProviderPrivacyForAll(first, ["minimalNetwork"], false, LATER);

  it("shows a pending save until a machine reports it", () => {
    expect(shownProviderPrivacy(undefined, first)).toBe(first);
    expect(shownProviderPrivacy(first, second)).toBe(second);
    expect(shownProviderPrivacy(second, second)).toBe(second);
  });

  it("gives way to a newer save from elsewhere", () => {
    expect(shownProviderPrivacy(second, first)).toBe(second);
  });
});

describe("providerPrivacyEnvironmentStatuses", () => {
  it("lists connected machines and whether their server applies the setting", () => {
    const environment = (id: string, phase: string, providerPrivacy?: boolean) => ({
      environmentId: EnvironmentId.make(id),
      label: id,
      connection: { phase },
      serverConfig: {
        environment: {
          capabilities: providerPrivacy === undefined ? {} : { providerPrivacy },
        },
      },
    });
    expect(
      providerPrivacyEnvironmentStatuses([
        environment("new", "connected", true),
        environment("old", "connected"),
        environment("asleep", "disconnected", true),
      ]),
    ).toEqual([
      { environmentId: "new", label: "new", applied: true },
      { environmentId: "old", label: "old", applied: false },
    ]);
  });
});
