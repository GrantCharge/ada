import {
  type EnvironmentId,
  type McpGatewayRelayThread,
  type McpGatewayRelayThreadList,
  type OrchestrationV2ChildAttention,
  OrchestratorMcpFailure,
  OrchestratorMcpThreadWaitResult,
  ProviderRequestKind,
  type RunId,
  RuntimeRequestId,
  type ThreadId,
  type ThreadTask,
} from "@t3tools/contracts";
import { childAttentionCursor, childAttentionKey } from "@t3tools/shared/childAttention";
import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import {
  gatewayToolContext,
  getRemoteThread,
  listRemoteThreadSummaries,
} from "../mcp/agents/remoteThreads.ts";
import * as PeerLinks from "../peer/PeerLinks.ts";
import * as PeerMcpClient from "../peer/PeerMcpClient.ts";
import { forkParked } from "../serverActivation.ts";
import { ThreadTaskStore } from "../threadTask/ThreadTaskStore.ts";
import { ChildAttentionService, type ChildReading } from "./ChildAttentionService.ts";

const FAILURES_BEFORE_UNREACHABLE = 3;
const POLL_INTERVAL = Duration.seconds(15);
const DISCOVERY_INTERVAL = Duration.minutes(1);
const LONG_POLL_MS = 25_000;
// Shorter than a poll, so each round of polls reads an environment's list once.
const RELAY_LIST_TTL = Duration.seconds(10);
// Any actionable reading differs from this key, so a first wait returns the child's news at once.
const FIRST_CURSOR = "attention1:";

const LIVE_STATUSES: ReadonlySet<OrchestratorMcpThreadWaitResult["status"]> = new Set([
  "queued",
  "preparing",
  "starting",
  "running",
  "waiting",
]);

/**
 * The child's state from a wait, or null to keep `previous`. A cursor wait returns only
 * actionable news, so one that timed out says the child is working or went quiet without any.
 * A server without cursor waits reports a run's end, read the way childAttention reads a shell.
 */
export function attentionFromWaitResult(
  result: OrchestratorMcpThreadWaitResult,
  previous?: OrchestrationV2ChildAttention,
): OrchestrationV2ChildAttention | null {
  const item = result.items?.[0];
  if (item !== undefined) return item.attention;
  if (result.cursor !== undefined) {
    if (LIVE_STATUSES.has(result.status)) {
      return outstanding(previous) ? null : { state: "working", runId: result.runId };
    }
    return previous?.state === "working" ? { state: "idle", runId: result.runId } : null;
  }
  const runId = result.runId;
  if (result.pendingApproval !== undefined) {
    return { state: "needs-approval", runId, requestId: result.pendingApproval.requestId };
  }
  if (result.hasPendingQuestion === true && result.pendingRequestId !== undefined) {
    return { state: "needs-input", runId, requestId: result.pendingRequestId };
  }
  return attentionFromRunStatus(result.status, runId);
}

// Neither a wait nor the relay says whether a cancelled run had started, and one that had not
// is not news.
function attentionFromRunStatus(
  status: OrchestratorMcpThreadWaitResult["status"],
  runId: RunId | null,
): OrchestrationV2ChildAttention {
  switch (status) {
    case "completed":
      return { state: "finished", runId };
    case "failed":
      return { state: "failed", runId };
    case "interrupted":
      return { state: "stopped", runId };
    case "cancelled":
    case "idle":
    case "rolled_back":
      return { state: "idle", runId };
    default:
      return { state: "working", runId };
  }
}

type RelaySummary = McpGatewayRelayThreadList["items"][number];

const isApprovalKind = Schema.is(ProviderRequestKind);

/** What a relaying app reports of a thread: its runs, pending requests and whether work goes on. */
export function attentionFromRelayThread(
  thread: McpGatewayRelayThread,
  summary?: RelaySummary,
): OrchestrationV2ChildAttention {
  const latest = thread.runs.at(-1);
  const runId = latest?.id ?? null;
  for (const raw of thread.runtimeRequests ?? []) {
    if (typeof raw !== "object" || raw === null) continue;
    const request = raw as {
      readonly id?: unknown;
      readonly kind?: unknown;
      readonly status?: unknown;
    };
    if (request.status !== undefined && request.status !== "pending") continue;
    if (typeof request.id !== "string") continue;
    const requestId = RuntimeRequestId.make(request.id);
    if (request.kind === "user_input") return { state: "needs-input", runId, requestId };
    if (isApprovalKind(request.kind)) return { state: "needs-approval", runId, requestId };
  }
  if (summary?.hasActiveWork === true || summary?.activeRunId != null) {
    return { state: "working", runId };
  }
  return latest === undefined
    ? { state: "idle", runId }
    : attentionFromRunStatus(latest.status, runId);
}

/** Whether losing touch with a child in this state could leave its parent waiting on it. */
function outstanding(attention: OrchestrationV2ChildAttention | undefined) {
  return (
    attention !== undefined &&
    (attention.state === "working" ||
      attention.state === "needs-input" ||
      attention.state === "needs-approval")
  );
}

const epochMillis = (iso: string) => DateTime.toEpochMillis(DateTime.makeUnsafe(iso));

export class RemoteChildFollower extends Context.Service<
  RemoteChildFollower,
  { readonly start: () => Effect.Effect<void, never, Scope.Scope> }
>()("t3/orchestration-v2/RemoteChildFollower") {}

interface Followed {
  readonly reading: ChildReading | null;
  readonly cursor: string;
  readonly failures: number;
  /** The relay summary the last full read answered, so an unchanged child is not read again. */
  readonly summary: string | null;
}

interface Read {
  readonly attention: OrchestrationV2ChildAttention | null;
  readonly longPolled: boolean;
  readonly settledAtMs: number | null;
  readonly summary: string | null;
}

const make = Effect.gen(function* () {
  const tasks = yield* ThreadTaskStore;
  const attention = yield* ChildAttentionService;
  const peers = yield* PeerMcpClient.PeerMcpClient;
  const links = yield* PeerLinks.PeerLinks;
  const local = (yield* (yield* ServerEnvironment.ServerEnvironment).getDescriptor).environmentId;
  const gateway = yield* gatewayToolContext;
  const followed = yield* Ref.make(new Map<ThreadId, Map<ThreadId, ChildReading>>());
  const relayLists = yield* Cache.make({
    capacity: Infinity,
    timeToLive: RELAY_LIST_TTL,
    lookup: (environmentId: EnvironmentId) =>
      gateway === undefined
        ? Effect.succeed([])
        : listRemoteThreadSummaries({ gateway, environmentId, caller: undefined }),
  });

  const publish = Effect.fn("RemoteChildFollower.publish")(function* (
    task: ThreadTask,
    reading: ChildReading | null,
  ) {
    const parents = yield* Ref.updateAndGet(followed, (current) => {
      const next = new Map(current);
      const children = new Map(next.get(task.ownerThreadId));
      if (reading === null) children.delete(task.workerThreadId);
      else children.set(task.workerThreadId, reading);
      next.set(task.ownerThreadId, children);
      return next;
    });
    yield* attention.setRemoteReadings(task.ownerThreadId, [
      ...(parents.get(task.ownerThreadId)?.values() ?? []),
    ]);
  });

  /** One read: a long poll over this server's own link, else the app's relayed thread. */
  const read = Effect.fn("RemoteChildFollower.read")(function* (
    task: ThreadTask,
    environmentId: EnvironmentId,
    before: Followed,
  ): Effect.fn.Return<Read, OrchestratorMcpFailure> {
    const linked =
      (yield* links.enabled) &&
      Option.isSome(
        yield* links.get(environmentId).pipe(Effect.orElseSucceed(() => Option.none())),
      );
    if (linked) {
      const result = yield* peers.call({
        environmentId,
        tool: "t3_thread_wait",
        arguments: {
          threadId: task.workerThreadId,
          cursor: before.cursor,
          timeoutMs: LONG_POLL_MS,
        },
        limits: { runtimeMode: "approval-required", interactionMode: "default" },
        success: OrchestratorMcpThreadWaitResult,
      });
      if (result.unreachable !== undefined) {
        return yield* new OrchestratorMcpFailure({
          code: "orchestration_error",
          message: result.unreachable,
        });
      }
      const completedAt = result.items?.[0]?.completedAt;
      return {
        attention: attentionFromWaitResult(result, before.reading?.attention),
        longPolled: true,
        settledAtMs: completedAt === undefined ? null : epochMillis(completedAt),
        summary: null,
      };
    }
    if (gateway === undefined) {
      return yield* new OrchestratorMcpFailure({
        code: "orchestration_error",
        message: "No connected app or link reaches the child's environment.",
      });
    }
    const remote = {
      gateway,
      environmentId,
      caller: { environmentId: local, threadId: task.ownerThreadId },
    };
    // The environment's small list each poll, shared by its children; a thread only when its
    // entry changed.
    const summary = (yield* Cache.get(relayLists, environmentId)).find(
      (item) => item.id === task.workerThreadId,
    );
    if (summary === undefined) {
      return yield* new OrchestratorMcpFailure({
        code: "thread_not_found",
        message: `Environment ${environmentId} no longer lists thread ${task.workerThreadId}.`,
      });
    }
    const signature = [
      summary.activeRunId,
      summary.latestRunId,
      summary.hasPendingApprovals,
      summary.hasPendingUserInput,
      summary.pendingRequestId,
      summary.hasActiveWork,
      summary.settledAt,
    ].join("|");
    if (before.reading !== null && signature === before.summary) {
      return { attention: null, longPolled: false, settledAtMs: null, summary: signature };
    }
    const thread = yield* getRemoteThread(remote, task.workerThreadId);
    const completedAt = thread.runs.at(-1)?.completedAt;
    return {
      attention: attentionFromRelayThread(thread, summary),
      longPolled: false,
      settledAtMs: completedAt == null ? null : epochMillis(completedAt),
      summary: signature,
    };
  });

  const follow = Effect.fn("RemoteChildFollower.follow")(function* (
    task: ThreadTask,
    environmentId: EnvironmentId,
  ) {
    const state = yield* Ref.make<Followed>({
      reading: null,
      cursor: FIRST_CURSOR,
      failures: 0,
      summary: null,
    });
    const reading = (
      attention: OrchestrationV2ChildAttention,
      settledAtMs: number | null,
    ): ChildReading => ({
      threadId: task.workerThreadId,
      title: task.summary,
      environmentId,
      attention,
      settledAtMs,
    });
    const step = Effect.gen(function* () {
      const before = yield* Ref.get(state);
      const outcome = yield* read(task, environmentId, before).pipe(Effect.result);
      const failures = outcome._tag === "Failure" ? before.failures + 1 : 0;
      const known = before.reading?.attention;
      const next: ChildReading | null =
        outcome._tag === "Success"
          ? outcome.success.attention === null
            ? before.reading
            : reading(outcome.success.attention, outcome.success.settledAtMs)
          : failures >= FAILURES_BEFORE_UNREACHABLE && outstanding(known)
            ? reading({ state: "unreachable", runId: known?.runId ?? null }, null)
            : before.reading;
      yield* Ref.set(state, {
        reading: next,
        cursor:
          next !== null && next.attention.state !== "unreachable"
            ? childAttentionCursor(next.attention)
            : before.cursor,
        failures,
        summary: outcome._tag === "Success" ? outcome.success.summary : before.summary,
      });
      if (
        next !== null &&
        (before.reading === null ||
          childAttentionKey(before.reading.attention) !== childAttentionKey(next.attention))
      ) {
        yield* publish(task, next);
      }
      if (outcome._tag === "Failure" || !outcome.success.longPolled) {
        yield* Effect.sleep(POLL_INTERVAL);
      }
    });
    return yield* Effect.forever(step);
  });

  const start: RemoteChildFollower["Service"]["start"] = Effect.fn("RemoteChildFollower.start")(
    function* () {
      const fibers = yield* FiberMap.make<ThreadId>();
      const discover = Effect.gen(function* () {
        // A parent that is archived, settled, deleted or muted cannot be woken, so its children
        // are left until it can.
        const remote = yield* Effect.filter(yield* tasks.listRemoteWorkers(), (task) =>
          attention.listening(task.ownerThreadId),
        );
        const live = new Set(remote.map((task) => task.workerThreadId));
        const gone: Array<ThreadId> = [];
        for (const [key] of fibers) if (!live.has(key)) gone.push(key);
        for (const key of gone) yield* FiberMap.remove(fibers, key);
        for (const [parent, children] of yield* Ref.get(followed)) {
          for (const child of children.keys()) {
            if (live.has(child)) continue;
            const task = { ownerThreadId: parent, workerThreadId: child } as ThreadTask;
            yield* publish(task, null);
          }
        }
        for (const task of remote) {
          if (task.workerEnvironmentId === null) continue;
          yield* FiberMap.run(fibers, task.workerThreadId, follow(task, task.workerEnvironmentId), {
            onlyIfMissing: true,
          });
        }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("discovering remote children failed", { cause }),
        ),
      );
      yield* forkParked(discover.pipe(Effect.repeat(Schedule.spaced(DISCOVERY_INTERVAL))));
    },
  );

  return { start } satisfies RemoteChildFollower["Service"];
});

export const layer = Layer.effect(RemoteChildFollower, make);
