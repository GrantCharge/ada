import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  type McpGatewayRelayThread,
  type OrchestrationV2ChildAttention,
  OrchestratorMcpFailure,
  type OrchestratorMcpThreadWaitResult,
  ProjectId,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  type ThreadTask,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as PeerLinks from "../peer/PeerLinks.ts";
import * as PeerMcpClient from "../peer/PeerMcpClient.ts";
import { ThreadTaskStore } from "../threadTask/ThreadTaskStore.ts";
import { ChildAttentionService } from "./ChildAttentionService.ts";
import * as RemoteChildFollower from "./RemoteChildFollower.ts";

const { attentionFromRelayThread, attentionFromWaitResult } = RemoteChildFollower;

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
    // A cursor wait that timed out says nothing changed.
    [
      wait({
        status: "failed",
        timedOut: true,
        cursor: "attention1:limited:run:remote:",
        items: [],
      }),
      null,
    ],
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
  // Cancellation sets completedAt even on a run that never started.
  assert.deepEqual(
    attentionFromRelayThread(thread([run("cancelled", "2026-11-24T00:00:00.000Z")])),
    { state: "idle", runId },
  );
  assert.deepEqual(
    attentionFromRelayThread(thread([run("completed", "2026-11-24T00:00:00.000Z")]), {
      id: threadId,
      settledAt: null,
      hasActiveWork: true,
    } as never),
    { state: "working", runId },
  );
  assert.deepEqual(
    attentionFromRelayThread(
      thread([run("waiting")], [{ id: "request:auth", kind: "auth_refresh", status: "pending" }]),
    ),
    { state: "working", runId },
  );
  assert.deepEqual(
    attentionFromRelayThread(
      thread(
        [run("waiting")],
        [
          { id: "request:old", kind: "command", status: "resolved" },
          { id: "request:tool", kind: "dynamic_tool_call", status: "pending" },
          { id: requestId, kind: "user_input", status: "pending" },
        ],
      ),
    ),
    { state: "needs-input", runId, requestId },
  );
});

const environmentId = EnvironmentId.make("environment:peer");
const ownerThreadId = ThreadId.make("thread:owner");

type Answer = OrchestratorMcpThreadWaitResult | OrchestratorMcpFailure;

/** Follows one remote child whose environment answers each wait with the next scripted answer. */
const followScripted = (answers: ReadonlyArray<Answer>) =>
  Effect.gen(function* () {
    const published = yield* Ref.make<ReadonlyArray<OrchestrationV2ChildAttention>>([]);
    const calls = yield* Ref.make<ReadonlyArray<Record<string, unknown>>>([]);
    const firstCall = yield* Deferred.make<void>();
    const remaining = [...answers];
    const task = {
      ownerThreadId,
      workerThreadId: threadId,
      workerEnvironmentId: environmentId,
      summary: "Remote work",
    } as unknown as ThreadTask;
    const layer = RemoteChildFollower.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(ThreadTaskStore, {
            listRemoteWorkers: () => Effect.succeed([task]),
          } as unknown as ThreadTaskStore["Service"]),
          Layer.succeed(ChildAttentionService, {
            setRemoteReadings: (_parent, readings) =>
              Ref.update(published, (all) => [...all, ...readings.map((r) => r.attention)]),
          } as ChildAttentionService["Service"]),
          Layer.succeed(PeerLinks.PeerLinks, {
            enabled: Effect.succeed(true),
            get: () => Effect.succeedSome({}),
          } as unknown as PeerLinks.PeerLinks["Service"]),
          Layer.succeed(PeerMcpClient.PeerMcpClient, {
            call: (input) =>
              Ref.update(calls, (all) => [...all, input.arguments]).pipe(
                Effect.andThen(Deferred.succeed(firstCall, undefined)),
                Effect.andThen(
                  Effect.suspend(() => {
                    const answer = remaining.shift();
                    if (answer === undefined) return Effect.never;
                    return "status" in answer ? Effect.succeed(answer) : Effect.fail(answer);
                  }),
                ),
              ),
          } as PeerMcpClient.PeerMcpClient["Service"]),
          Layer.succeed(ServerEnvironment.ServerEnvironment, {
            getDescriptor: Effect.succeed({
              environmentId: EnvironmentId.make("environment:here"),
            }),
          } as unknown as ServerEnvironment.ServerEnvironment["Service"]),
        ),
      ),
    );
    yield* Effect.gen(function* () {
      yield* (yield* RemoteChildFollower.RemoteChildFollower).start();
      yield* Deferred.await(firstCall);
      yield* TestClock.adjust(Duration.minutes(5));
    }).pipe(Effect.provide(layer), Effect.scoped);
    return { published: yield* Ref.get(published), calls: yield* Ref.get(calls) };
  });

const offline = new OrchestratorMcpFailure({
  code: "orchestration_error",
  message: "The linked environment stopped answering.",
});

it.effect("says a child is unreachable only when it loses one with work outstanding", () =>
  Effect.gen(function* () {
    const answer = (state: "working" | "finished") => ({
      threadId,
      runId,
      status: state === "working" ? ("running" as const) : ("completed" as const),
      timedOut: false,
      cursor: `attention1:${state}:${runId}:`,
      items: [{ threadId, attention: { state, runId } }],
    });
    const { published } = yield* followScripted([
      answer("working"),
      offline,
      offline,
      offline,
      answer("finished"),
      offline,
      offline,
      offline,
    ]);
    assert.deepEqual(
      published.map((attention) => attention.state),
      ["working", "unreachable", "finished"],
    );
  }),
);

it.effect("keeps a cursor wait's last reading when it times out", () =>
  Effect.gen(function* () {
    const cursor = "attention1:limited:run:remote:";
    const { published, calls } = yield* followScripted([
      {
        threadId,
        runId,
        status: "failed",
        timedOut: false,
        cursor,
        items: [{ threadId, attention: { state: "limited", runId } }],
      },
      { threadId, runId, status: "failed", timedOut: true, cursor, items: [] },
    ]);
    assert.deepEqual(
      published.map((attention) => attention.state),
      ["limited"],
    );
    assert.equal(calls[1]?.cursor, cursor);
  }),
);
