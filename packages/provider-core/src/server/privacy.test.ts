import { describe, expect, it } from "@effect/vitest";
import {
  ALLOW_ALL_PROVIDER_PRIVACY_CHOICE,
  DEFAULT_PROVIDER_PRIVACY_CHOICE,
} from "@t3tools/contracts";

import { withProviderPrivacyEnvironment, type ProviderPrivacyEnvironmentTable } from "./privacy.ts";

const table: ProviderPrivacyEnvironmentTable = {
  usageAnalytics: { DISABLE_TELEMETRY: "1" },
  minimalNetwork: { NONESSENTIAL: "1" },
};

describe("withProviderPrivacyEnvironment", () => {
  it("adds the variables of blocked categories only", () => {
    expect(
      withProviderPrivacyEnvironment(
        { PATH: "/bin" },
        table,
        () => DEFAULT_PROVIDER_PRIVACY_CHOICE,
      ),
    ).toEqual({ PATH: "/bin", DISABLE_TELEMETRY: "1" });
  });

  it("keeps a value the environment already sets, in any case", () => {
    expect(
      withProviderPrivacyEnvironment({ disable_telemetry: "0" }, table, () => ({
        ...DEFAULT_PROVIDER_PRIVACY_CHOICE,
        minimalNetwork: true,
      })),
    ).toEqual({ disable_telemetry: "0", NONESSENTIAL: "1" });
  });

  it("adds nothing when every category is allowed or no choice is wired", () => {
    const environment = { PATH: "/bin" };
    expect(
      withProviderPrivacyEnvironment(environment, table, () => ALLOW_ALL_PROVIDER_PRIVACY_CHOICE),
    ).toEqual(environment);
    expect(withProviderPrivacyEnvironment(environment, table, undefined)).toBe(environment);
  });

  it("reads the current choice on every call", () => {
    let choice = DEFAULT_PROVIDER_PRIVACY_CHOICE;
    const privacy = () => choice;
    expect(withProviderPrivacyEnvironment({}, table, privacy)).toHaveProperty("DISABLE_TELEMETRY");
    choice = ALLOW_ALL_PROVIDER_PRIVACY_CHOICE;
    expect(withProviderPrivacyEnvironment({}, table, privacy)).toEqual({});
  });
});
