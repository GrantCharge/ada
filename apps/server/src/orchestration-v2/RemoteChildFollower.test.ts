import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  type McpGatewayRelayThread,
  type McpGatewayRelayThreadList,
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
import { LocalGatewayPort } from "../mcp/agents/LocalGatewayPort.ts";
import { McpGatewayBroker } from "../mcp/McpGatewayBroker.ts";
import { ChildAttentionService, type ChildReading } from "./ChildAttentionService.ts";
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

const remoteTask = (workerThreadId: ThreadId, owner = ownerThreadId) =>
  ({
    ownerThreadId: owner,
    workerThreadId,
    workerEnvironmentId: environmentId,
    summary: "Remote work",
  }) as unknown as ThreadTask;

interface Relay {
  readonly list: McpGatewayRelayThreadList;
  readonly thread: (threadId: string) => McpGatewayRelayThread;
}

/**
 * Follows remote children for five minutes. Over a link each wait takes the next scripted
 * answer; with `relay`, a connected app answers instead.
 */
const followScripted = (options: {
  readonly answers?: ReadonlyArray<Answer>;
  readonly tasks?: ReadonlyArray<ThreadTask>;
  readonly listening?: (parent: ThreadId) => boolean;
  readonly relay?: Relay;
}) =>
  Effect.gen(function* () {
    const published = yield* Ref.make<ReadonlyArray<ChildReading>>([]);
    const calls = yield* Ref.make<ReadonlyArray<Record<string, unknown>>>([]);
    const relayed = yield* Ref.make<ReadonlyArray<string>>([]);
    const firstCall = yield* Deferred.make<void>();
    const remaining = [...(options.answers ?? [])];
    const tasks = options.tasks ?? [remoteTask(threadId)];
    const layer = RemoteChildFollower.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(ThreadTaskStore, {
            listRemoteWorkers: () => Effect.succeed(tasks),
          } as unknown as ThreadTaskStore["Service"]),
          Layer.succeed(ChildAttentionService, {
            setRemoteReadings: (_parent, readings) =>
              Ref.update(published, (all) => [...all, ...readings]),
            listening: (parent) => Effect.succeed(options.listening?.(parent) ?? true),
          } as ChildAttentionService["Service"]),
          Layer.succeed(PeerLinks.PeerLinks, {
            enabled: Effect.succeed(options.relay === undefined),
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
            getDescriptor: Effect.succeed({ environmentId: localEnvironmentId }),
          } as unknown as ServerEnvironment.ServerEnvironment["Service"]),
          options.relay === undefined ? Layer.empty : relayLayer(options.relay, relayed),
        ),
      ),
    );
    yield* Effect.gen(function* () {
      yield* (yield* RemoteChildFollower.RemoteChildFollower).start();
      if (options.relay === undefined && tasks.length > 0 && options.listening === undefined) {
        yield* Deferred.await(firstCall);
      }
      yield* TestClock.adjust(Duration.minutes(5));
    }).pipe(Effect.provide(layer), Effect.scoped);
    return {
      published: yield* Ref.get(published),
      calls: yield* Ref.get(calls),
      relayed: yield* Ref.get(relayed),
    };
  });

const localEnvironmentId = EnvironmentId.make("environment:here");

const relayLayer = (relay: Relay, relayed: Ref.Ref<ReadonlyArray<string>>) =>
  Layer.mergeAll(
    Layer.succeed(LocalGatewayPort, {
      environmentId: localEnvironmentId,
      label: "Here",
      port: {} as never,
      events: {} as never,
    } as LocalGatewayPort["Service"]),
    Layer.succeed(McpGatewayBroker, {
      view: () => ({ grants: { [environmentId]: ["read"] }, linked: {} }),
      access: Effect.succeed({ grants: {}, refusals: {} }),
      forward: (method: string, args: ReadonlyArray<unknown>) =>
        Ref.update(relayed, (all) => [...all, method]).pipe(
          Effect.as(method === "listThreads" ? relay.list : relay.thread(String(args[1]))),
        ),
    } as unknown as McpGatewayBroker["Service"]),
  );

const offline = new OrchestratorMcpFailure({
  code: "orchestration_error",
  message: "The linked environment stopped answering.",
});

// What a peer answers a cursor wait: actionable news as an item, otherwise a timeout.
const news = (attention: OrchestrationV2ChildAttention, completedAt?: string) =>
  ({
    threadId,
    runId,
    status: attention.state === "finished" ? "completed" : "waiting",
    timedOut: false,
    cursor: `attention1:${attention.state}:${runId}:${attention.requestId ?? ""}`,
    items: [{ threadId, attention, ...(completedAt === undefined ? {} : { completedAt }) }],
  }) as OrchestratorMcpThreadWaitResult;
const quiet = (status: OrchestratorMcpThreadWaitResult["status"], cursor = "attention1:") =>
  ({
    threadId,
    runId,
    status,
    timedOut: true,
    cursor,
    items: [],
  }) as OrchestratorMcpThreadWaitResult;

it.effect("says a child is unreachable only when it loses one with work outstanding", () =>
  Effect.gen(function* () {
    const { published } = yield* followScripted({
      answers: [
        quiet("running"),
        offline,
        offline,
        offline,
        news({ state: "finished", runId }),
        offline,
        offline,
        offline,
      ],
    });
    assert.deepEqual(
      published.map((reading) => reading.attention.state),
      ["working", "unreachable", "finished"],
    );
  }),
);

it.effect("keeps a cursor wait's last reading when it times out", () =>
  Effect.gen(function* () {
    const limited = news({ state: "limited", runId });
    const { published, calls } = yield* followScripted({
      answers: [
        limited,
        quiet("failed", limited.cursor),
        quiet("running", limited.cursor),
        quiet("running", limited.cursor),
      ],
    });
    assert.deepEqual(
      published.map((reading) => reading.attention.state),
      ["limited", "working"],
    );
    assert.equal(calls[1]?.cursor, limited.cursor);
  }),
);

it.effect("dates a remote child's news from when its run ended", () =>
  Effect.gen(function* () {
    const { published } = yield* followScripted({
      answers: [news({ state: "finished", runId }, "2026-11-20T00:00:00.000Z")],
    });
    assert.deepEqual(
      published.map((reading) => reading.settledAtMs),
      [Date.parse("2026-11-20T00:00:00.000Z")],
    );
  }),
);

it.effect("follows no child whose parent can no longer hear it", () =>
  Effect.gen(function* () {
    const archivedOwner = ThreadId.make("thread:archived-owner");
    const { calls, published } = yield* followScripted({
      tasks: [remoteTask(threadId, archivedOwner)],
      listening: (parent) => parent !== archivedOwner,
    });
    assert.deepEqual(calls, []);
    assert.deepEqual(published, []);
  }),
);

it.effect("reads a relayed environment's thread list once per poll for all its children", () =>
  Effect.gen(function* () {
    const children = [ThreadId.make("thread:relayed-a"), ThreadId.make("thread:relayed-b")];
    const { relayed } = yield* followScripted({
      tasks: children.map((child) => remoteTask(child)),
      relay: {
        list: {
          items: children.map((id) => ({ id, settledAt: null, activeRunId: runId })),
        } as unknown as McpGatewayRelayThreadList,
        thread: (id) =>
          ({
            id,
            projectId: ProjectId.make("project:remote"),
            title: "Remote",
            modelSelection: {
              instanceId: ProviderInstanceId.make("codex"),
              model: "gpt-5.1-codex",
            },
            settledAt: null,
            archivedAt: null,
            deletedAt: null,
            runs: [],
            messages: [],
            createdAt: "2026-11-24T00:00:00.000Z",
            updatedAt: "2026-11-24T00:00:00.000Z",
          }) as unknown as McpGatewayRelayThread,
      },
    });
    const lists = relayed.filter((method) => method === "listThreads").length;
    // Five minutes of 15 s polls, shared by both children.
    assert.isAtMost(lists, 21);
    assert.isAtLeast(lists, 19);
  }),
);
