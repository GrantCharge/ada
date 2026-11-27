import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, type ProviderPrivacySettings } from "@t3tools/contracts";

import {
  createProviderPrivacySyncGate,
  planProviderPrivacySync,
  runProviderPrivacySync,
  type ProviderPrivacySource,
} from "./providerPrivacy.ts";
import { setProviderPrivacyCategory } from "../state/providerPrivacy.ts";

const source = (
  id: string,
  providerPrivacy: ProviderPrivacySettings,
  overrides: Partial<ProviderPrivacySource> = {},
): ProviderPrivacySource => ({
  environmentId: EnvironmentId.make(id),
  providerPrivacy,
  capabilities: { providerPrivacy: true },
  live: true,
  ...overrides,
});

const saved = setProviderPrivacyCategory(
  undefined,
  "claudeAgent",
  "usageAnalytics",
  false,
  "2026-11-27T10:00:00.000Z",
);

describe("planProviderPrivacySync", () => {
  it("copies the newest save to connected machines that missed it", () => {
    const plan = planProviderPrivacySync([
      source("laptop", saved),
      source("desktop", { drivers: {} }),
      source("asleep", { drivers: {} }, { live: false }),
      source("old-server", { drivers: {} }, { capabilities: {} }),
    ]);
    expect(plan.providerPrivacy).toEqual(saved);
    expect(plan.targets).toEqual([{ environmentId: EnvironmentId.make("desktop") }]);
  });

  it("lets a later save win over an earlier one", () => {
    const later = { ...saved, updatedAt: "2026-11-27T11:00:00.000Z" };
    expect(planProviderPrivacySync([source("a", saved), source("b", later)]).targets).toEqual([
      { environmentId: EnvironmentId.make("a") },
    ]);
  });

  it("does nothing until some machine has saved a choice", () => {
    expect(
      planProviderPrivacySync([source("a", { drivers: {} }), source("b", { drivers: {} })]),
    ).toEqual({ providerPrivacy: undefined, targets: [] });
  });

  it("sends each save once and retries after a failure", async () => {
    const gate = createProviderPrivacySyncGate();
    const plan = planProviderPrivacySync([source("a", saved), source("b", { drivers: {} })]);
    const first = gate.take(plan);
    expect(first.targets).toHaveLength(1);
    expect(gate.take(plan).targets).toHaveLength(0);
    const sent: Array<unknown> = [];
    const accepted = await runProviderPrivacySync(
      { ...plan, targets: first.targets },
      async (_id, patch) => {
        sent.push(patch);
        return false;
      },
    );
    first.settle(accepted);
    expect(sent).toEqual([{ providerPrivacy: saved }]);
    expect(gate.take(plan).targets).toHaveLength(1);
  });
});
