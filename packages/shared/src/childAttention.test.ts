import { describe, expect, it } from "vite-plus/test";
import { RunId, RuntimeRequestId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { type ChildAttentionShell, childAttention } from "./childAttention.ts";

const runId = RunId.make("run:1");
const requestId = RuntimeRequestId.make("request:1");
const at = DateTime.makeUnsafe("2026-11-24T00:00:00.000Z");
const shell = (overrides: Partial<ChildAttentionShell>): ChildAttentionShell => ({
  status: "completed",
  activityRunStatus: null,
  pendingRuntimeRequest: null,
  pendingBackgroundTasks: [],
  latestRunId: runId,
  latestRunStartedAt: at,
  lastErrorClass: null,
  usageLimitResetAt: null,
  limitRecovery: null,
  ...overrides,
});
const request = (kind: "user_input" | "command" | "auth_refresh", userOnly?: boolean) => ({
  id: requestId,
  kind,
  createdAt: at,
  ...(userOnly === undefined ? {} : { userOnly }),
});

describe("childAttention", () => {
  it.each([
    ["a completed run", shell({}), { state: "finished", runId }],
    [
      "a completed run with a subagent still running",
      shell({ pendingBackgroundTasks: [{ taskId: "review", kind: "subagent" }] }),
      { state: "working", runId },
    ],
    ["a queued run", shell({ status: "queued" }), { state: "working", runId }],
    [
      "a question while working",
      shell({ status: "running", pendingRuntimeRequest: request("user_input") }),
      { state: "needs-input", runId, requestId },
    ],
    [
      "an approval",
      shell({ status: "waiting", pendingRuntimeRequest: request("command") }),
      { state: "needs-approval", runId, requestId },
    ],
    [
      "a card only the user can answer",
      shell({ status: "waiting", pendingRuntimeRequest: request("user_input", true) }),
      { state: "working", runId },
    ],
    [
      "a sign-in refresh",
      shell({ status: "waiting", pendingRuntimeRequest: request("auth_refresh") }),
      { state: "working", runId },
    ],
    ["an interrupted run", shell({ status: "interrupted" }), { state: "stopped", runId }],
    ["a cancelled run that started", shell({ status: "cancelled" }), { state: "stopped", runId }],
    [
      "a run cancelled before it started",
      shell({ status: "cancelled", latestRunStartedAt: null }),
      { state: "idle", runId },
    ],
    [
      "a failed run",
      shell({ status: "failed", lastErrorClass: "transport_error" }),
      { state: "failed", runId, errorClass: "transport_error" },
    ],
    [
      "a usage limit Ada resumes",
      shell({
        status: "failed",
        lastErrorClass: "usage_limit",
        usageLimitResetAt: "2026-11-24T05:00:00.000Z",
        limitRecovery: { runId, resetAt: "2026-11-24T05:00:00.000Z", autoResume: true },
      }),
      { state: "limited", runId, resetAt: "2026-11-24T05:00:00.000Z", autoResume: true },
    ],
    [
      "a never-run thread",
      shell({ status: "idle", latestRunId: null }),
      { state: "idle", runId: null },
    ],
    ["a rolled-back run", shell({ status: "rolled_back" }), { state: "idle", runId }],
  ] as const)("reads %s", (_case, input, expected) => {
    expect(childAttention(input)).toEqual(expected);
  });

  it("holds a finished child as working while its own children are active", () => {
    expect(childAttention(shell({}), { activeDescendants: true })).toEqual({
      state: "working",
      runId,
    });
  });
});
