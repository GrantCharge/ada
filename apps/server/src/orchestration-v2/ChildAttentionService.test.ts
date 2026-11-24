import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as ChildAttentionService from "./ChildAttentionService.ts";
import * as EffectOutbox from "./EffectOutbox.ts";
import * as EventSink from "./EventSink.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process needed"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = ChildAttentionService.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      layerDatabase,
      ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
      EffectOutbox.layer.pipe(Layer.provide(layerDatabase)),
      ProviderReplayHarness.layerWithRegistry(
        { name: "child-attention" },
        ProviderAdapterRegistry.layerFromAdapters([adapter]),
        { databaseLayer: layerDatabase, runEffectWorker: false },
      ),
    ),
  ),
);

const fixture = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const eventSink = yield* EventSink.EventSinkV2;
  const service = yield* ChildAttentionService.ChildAttentionService;
  const parentThreadId = ThreadId.make("thread:attention-parent");
  const createThread = (threadId: ThreadId, title: string) =>
    orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create-${threadId}`),
      threadId,
      projectId: ProjectId.make("project:attention"),
      title,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
  const startRun = (threadId: ThreadId, label: string) =>
    Effect.gen(function* () {
      const messageId = MessageId.make(`message:${threadId}:${label}`);
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`start-${threadId}-${label}`),
        threadId,
        messageId,
        text: "Work on it",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
        createdBy: "user",
        creationSource: "web",
      });
      return (yield* projections.getThreadRecords(threadId, ["runs"])).runs.find(
        (run) => run.userMessageId === messageId,
      )!;
    });
  const setRun = (
    run: OrchestrationV2Run,
    status: OrchestrationV2Run["status"],
    started = true,
    tag = "",
  ) =>
    Effect.gen(function* () {
      const now = yield* DateTime.now;
      const ended = !["queued", "preparing", "starting", "running", "waiting"].includes(status);
      yield* eventSink.write({
        events: [
          {
            id: EventId.make(`event:${run.id}:${status}${tag}`),
            type: "run.updated",
            threadId: run.threadId,
            runId: run.id,
            occurredAt: now,
            payload: {
              ...run,
              status,
              startedAt: started ? now : null,
              completedAt: ended ? now : null,
            },
          } satisfies OrchestrationV2DomainEvent,
        ],
      });
    });
  const createChild = (threadId: ThreadId, title: string) =>
    Effect.gen(function* () {
      yield* createThread(threadId, title);
      yield* orchestrator.dispatch({
        type: "thread.parent-link.repair",
        commandId: CommandId.make(`link-${threadId}`),
        threadId,
        parentThreadId,
        parentRelationship: "child",
      });
    });
  const digests = projections
    .getThreadRecords(parentThreadId, ["messages"])
    .pipe(
      Effect.map(({ messages }) =>
        messages.filter((message) =>
          message.id.startsWith(ChildAttentionService.DIGEST_MESSAGE_PREFIX),
        ),
      ),
    );
  // Finished, stopped and failed children wait out the debounce first.
  const reconcileAfterDebounce = TestClock.adjust(ChildAttentionService.DEBOUNCE).pipe(
    Effect.andThen(service.reconcile(parentThreadId)),
  );
  yield* createThread(parentThreadId, "Captain");
  return {
    orchestrator,
    projections,
    eventSink,
    service,
    parentThreadId,
    createThread,
    createChild,
    startRun,
    setRun,
    digests,
    reconcileAfterDebounce,
  };
});

it.effect("tells an idle parent once when its child finishes", () =>
  Effect.gen(function* () {
    const t = yield* fixture;
    const childId = ThreadId.make("thread:attention-child");
    yield* t.createChild(childId, "Reviewer");
    const run = yield* t.startRun(childId, "first");
    yield* t.service.reconcile(t.parentThreadId);
    assert.lengthOf(yield* t.digests, 0);

    yield* t.setRun(run, "completed");
    // Inside the debounce a continuation may still supersede it.
    yield* t.service.reconcile(t.parentThreadId);
    assert.lengthOf(yield* t.digests, 0);
    yield* t.reconcileAfterDebounce;
    const [digest, ...rest] = yield* t.digests;
    assert.lengthOf(rest, 0);
    assert.include(digest!.text, `"Reviewer" (threadId ${childId}) finished.`);
    assert.deepEqual(digest!.notification?.source, { kind: "subagent", childThreadId: childId });

    // A replayed or rewritten run, or a restart, is not news again.
    yield* t.setRun(run, "completed", true, ":replayed");
    yield* t.reconcileAfterDebounce;
    assert.lengthOf(yield* t.digests, 1);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("ignores a run cancelled before it started", () =>
  Effect.gen(function* () {
    const t = yield* fixture;
    const childId = ThreadId.make("thread:attention-cancelled");
    yield* t.createChild(childId, "Never ran");
    const run = yield* t.startRun(childId, "first");
    yield* t.setRun(run, "cancelled", false);
    yield* t.reconcileAfterDebounce;
    assert.lengthOf(yield* t.digests, 0);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("holds news while the parent works, then sends one digest for every child", () =>
  Effect.gen(function* () {
    const t = yield* fixture;
    const first = ThreadId.make("thread:attention-first");
    const second = ThreadId.make("thread:attention-second");
    yield* t.createChild(first, "First");
    yield* t.createChild(second, "Second");
    const parentRun = yield* t.startRun(t.parentThreadId, "busy");
    yield* t.setRun(parentRun, "running");
    yield* t.setRun(yield* t.startRun(first, "first"), "completed");
    const secondRun = yield* t.startRun(second, "first");
    yield* t.setRun(secondRun, "failed");
    yield* t.reconcileAfterDebounce;
    assert.lengthOf(yield* t.digests, 0);

    yield* t.setRun(parentRun, "completed");
    yield* t.service.reconcile(t.parentThreadId);
    const digests = yield* t.digests;
    assert.lengthOf(digests, 1);
    assert.include(digests[0]!.text, `(threadId ${first}) finished.`);
    assert.include(digests[0]!.text, `(threadId ${second}) failed`);
    assert.deepEqual(digests[0]!.notification?.source, { kind: "subagent" });
    assert.equal(digests[0]!.notification?.outcome, "failed");

    // Nothing new while the digest is queued or running: at most one digest per parent.
    yield* t.setRun(secondRun, "interrupted");
    yield* t.reconcileAfterDebounce;
    assert.lengthOf(yield* t.digests, 1);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("puts a launched child's approval in the digest without waiting", () =>
  Effect.gen(function* () {
    const t = yield* fixture;
    const childId = ThreadId.make("thread:attention-question");
    yield* t.createChild(childId, "Asker");
    const run = yield* t.startRun(childId, "first");
    const now = yield* DateTime.now;
    const request = (id: string, kind: "user_input" | "command") =>
      ({
        id: EventId.make(`event:${id}`),
        type: "runtime-request.updated",
        threadId: childId,
        runId: run.id,
        occurredAt: now,
        payload: {
          id: RuntimeRequestId.make(id),
          nodeId: run.rootNodeId!,
          providerTurnId: null,
          nativeRequestRef: null,
          kind,
          status: "pending",
          responseCapability: {
            type: "live",
            providerSessionId: ProviderSessionId.make("session:attention"),
          },
          createdAt: now,
          resolvedAt: null,
        },
      }) satisfies OrchestrationV2DomainEvent;
    yield* t.eventSink.write({ events: [request("request:approval", "command")] });
    yield* t.service.reconcile(t.parentThreadId);
    const [approval] = yield* t.digests;
    assert.include(
      approval!.text,
      "is blocked on an approval. Answer with t3_respond_to_approval and approvalRequestId request:approval",
    );
    assert.equal(approval!.notification?.summary, 'Child thread "Asker" needs approval');
  }).pipe(Effect.provide(layerTest)),
);

it.effect("stays quiet while muted and reports once unmuted", () =>
  Effect.gen(function* () {
    const t = yield* fixture;
    const childId = ThreadId.make("thread:attention-muted");
    yield* t.createChild(childId, "Muted");
    yield* t.orchestrator.dispatch({
      type: "thread.child-wake.set",
      commandId: CommandId.make("mute"),
      threadId: t.parentThreadId,
      enabled: false,
    });
    yield* t.setRun(yield* t.startRun(childId, "first"), "completed");
    yield* t.reconcileAfterDebounce;
    assert.lengthOf(yield* t.digests, 0);

    yield* t.orchestrator.dispatch({
      type: "thread.child-wake.set",
      commandId: CommandId.make("unmute"),
      threadId: t.parentThreadId,
      enabled: true,
    });
    yield* t.service.reconcile(t.parentThreadId);
    assert.lengthOf(yield* t.digests, 1);
  }).pipe(Effect.provide(layerTest)),
);

it("caps wakes per child within the window", () => {
  const nowMs = Date.parse("2026-11-24T00:00:00.000Z");
  const reading = (runId: string): ChildAttentionService.ChildReading => ({
    threadId: ThreadId.make("thread:cap"),
    title: "Chatty",
    attention: { state: "finished", runId: runId as never },
    settledAtMs: null,
  });
  const full = {
    key: "finished:run:1:",
    windowStartedAt: DateTime.formatIso(DateTime.makeUnsafe(nowMs - 1_000)),
    wakes: ChildAttentionService.MAX_WAKES_PER_WINDOW,
  };
  assert.isNull(ChildAttentionService.dueReport(reading("run:2"), full, nowMs));
  const later = nowMs + Duration.toMillis(ChildAttentionService.WAKE_WINDOW);
  assert.deepInclude(ChildAttentionService.dueReport(reading("run:2"), full, later), {
    key: "finished:run:2:",
    wakes: 1,
  });
});
