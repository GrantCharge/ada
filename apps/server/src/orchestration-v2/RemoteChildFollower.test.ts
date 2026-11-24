import { assert, it } from "@effect/vitest";
import {
  type McpGatewayRelayThread,
  type OrchestratorMcpThreadWaitResult,
  ProjectId,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";

import { attentionFromRelayThread, attentionFromWaitResult } from "./RemoteChildFollower.ts";

const threadId = ThreadId.make("thread:remote-child");
const runId = RunId.make("run:remote");
const requestId = RuntimeRequestId.make("request:remote");

it("reads a remote child's attention from an older server's wait result", () => {
  const wait = (
    fields: Partial<OrchestratorMcpThreadWaitResult>,
  ): OrchestratorMcpThreadWaitResult => ({
    threadId,
    runId,
    status: "running",
    timedOut: false,
    ...fields,
  });
  const cases: ReadonlyArray<[OrchestratorMcpThreadWaitResult, unknown]> = [
    [wait({ status: "completed" }), { state: "finished", runId }],
    [wait({ status: "interrupted" }), { state: "stopped", runId }],
    [wait({ status: "running", timedOut: true }), { state: "working", runId }],
    [
      wait({ status: "waiting", hasPendingQuestion: true, pendingRequestId: requestId }),
      { state: "needs-input", runId, requestId },
    ],
    [
      wait({
        status: "waiting",
        items: [{ threadId, attention: { state: "needs-approval", runId, requestId } }],
      }),
      { state: "needs-approval", runId, requestId },
    ],
  ];
  for (const [result, expected] of cases) {
    assert.deepEqual(attentionFromWaitResult(result), expected);
  }
});

it("reads a remote child's attention from a relayed thread", () => {
  const thread = (
    runs: McpGatewayRelayThread["runs"],
    runtimeRequests?: ReadonlyArray<unknown>,
  ): McpGatewayRelayThread =>
    ({
      id: threadId,
      projectId: ProjectId.make("project:remote"),
      title: "Remote",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.1-codex" },
      runs,
      messages: [],
      ...(runtimeRequests === undefined ? {} : { runtimeRequests }),
    }) as unknown as McpGatewayRelayThread;
  const run = (status: McpGatewayRelayThread["runs"][number]["status"], completedAt?: string) =>
    ({
      id: runId,
      status,
      providerInstanceId: ProviderInstanceId.make("codex"),
      completedAt: completedAt ?? null,
    }) as unknown as McpGatewayRelayThread["runs"][number];
  assert.deepEqual(attentionFromRelayThread(thread([])), { state: "idle", runId: null });
  assert.deepEqual(
    attentionFromRelayThread(thread([run("completed", "2026-11-24T00:00:00.000Z")])),
    { state: "finished", runId },
  );
  assert.deepEqual(attentionFromRelayThread(thread([run("cancelled")])), {
    state: "idle",
    runId,
  });
  assert.deepEqual(
    attentionFromRelayThread(
      thread(
        [run("waiting")],
        [
          { id: "request:old", kind: "command", status: "resolved" },
          { id: requestId, kind: "user_input", status: "pending" },
        ],
      ),
    ),
    { state: "needs-input", runId, requestId },
  );
});
