import {
  type EnvironmentId,
  type McpGatewayRelayThread,
  type OrchestrationV2ChildAttention,
  OrchestratorMcpThreadWaitResult,
  RunId,
  RuntimeRequestId,
  type ThreadId,
  type ThreadTask,
} from "@t3tools/contracts";
import { childAttentionCursor, childAttentionKey } from "@t3tools/shared/childAttention";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { gatewayToolContext, getRemoteThread } from "../mcp/agents/remoteThreads.ts";
import * as PeerLinks from "../peer/PeerLinks.ts";
import * as PeerMcpClient from "../peer/PeerMcpClient.ts";
import { forkParked } from "../serverActivation.ts";
import { ThreadTaskStore } from "../threadTask/ThreadTaskStore.ts";
import { ChildAttentionService, type ChildReading } from "./ChildAttentionService.ts";

const FAILURES_BEFORE_UNREACHABLE = 3;
const POLL_INTERVAL = Duration.seconds(15);
const DISCOVERY_INTERVAL = Duration.minutes(1);
const LONG_POLL_MS = 25_000;
// Any actionable reading differs from this key, so a first wait returns the child's news at once.
const FIRST_CURSOR = "attention1:";

/**
 * A wait answered by a server without cursor waits reports a run's end; read the child's state
 * from that the way childAttention reads a shell.
 */
export function attentionFromWaitResult(
  result: OrchestratorMcpThreadWaitResult,
): OrchestrationV2ChildAttention {
  const item = result.items?.[0];
  if (item !== undefined) return item.attention;
  const runId = result.runId;
  if (result.pendingApproval !== undefined) {
    return { state: "needs-approval", runId, requestId: result.pendingApproval.requestId };
  }
  if (result.hasPendingQuestion === true && result.pendingRequestId !== undefined) {
    return { state: "needs-input", runId, requestId: result.pendingRequestId };
  }
  return attentionFromRunStatus(result.status, runId, true);
}

function attentionFromRunStatus(
  status: string,
  runId: RunId | null,
  started: boolean,
): OrchestrationV2ChildAttention {
  switch (status) {
    case "completed":
      return { state: "finished", runId };
    case "failed":
      return { state: "failed", runId };
    case "interrupted":
      return { state: "stopped", runId };
    case "cancelled":
      return started ? { state: "stopped", runId } : { state: "idle", runId };
    case "idle":
    case "rolled_back":
      return { state: "idle", runId };
    default:
      return { state: "working", runId };
  }
}

/** What a relaying app reports of a thread: its runs and pending requests, nothing finer. */
export function attentionFromRelayThread(
  thread: McpGatewayRelayThread,
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
    return request.kind === "user_input"
      ? { state: "needs-input", runId, requestId }
      : { state: "needs-approval", runId, requestId };
  }
  return latest === undefined
    ? { state: "idle", runId }
    : attentionFromRunStatus(
        latest.status,
        runId,
        latest.completedAt != null || latest.status !== "cancelled",
      );
}

export class RemoteChildFollower extends Context.Service<
  RemoteChildFollower,
  { readonly start: () => Effect.Effect<void, never, Scope.Scope> }
>()("t3/orchestration-v2/RemoteChildFollower") {}

interface Followed {
  readonly reading: ChildReading | null;
  readonly cursor: string;
  readonly failures: number;
}

const make = Effect.gen(function* () {
  const tasks = yield* ThreadTaskStore;
  const attention = yield* ChildAttentionService;
  const peers = yield* PeerMcpClient.PeerMcpClient;
  const links = yield* PeerLinks.PeerLinks;
  const local = (yield* (yield* ServerEnvironment.ServerEnvironment).getDescriptor).environmentId;
  const gateway = yield* gatewayToolContext;
  const followed = yield* Ref.make(new Map<ThreadId, Map<ThreadId, ChildReading>>());

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
    cursor: string,
  ) {
    const linked =
      (yield* links.enabled) &&
      Option.isSome(
        yield* links.get(environmentId).pipe(Effect.orElseSucceed(() => Option.none())),
      );
    if (linked) {
      const result = yield* peers.call({
        environmentId,
        tool: "t3_thread_wait",
        arguments: { threadId: task.workerThreadId, cursor, timeoutMs: LONG_POLL_MS },
        limits: { runtimeMode: "approval-required", interactionMode: "default" },
        success: OrchestratorMcpThreadWaitResult,
      });
      if (result.unreachable !== undefined) return yield* Effect.fail(result.unreachable);
      return {
        attention: attentionFromWaitResult(result),
        // A server with cursor waits held the call open; an older one answered at once.
        longPolled: result.cursor !== undefined,
        settledAtMs: null,
      };
    }
    if (gateway === undefined) return yield* Effect.fail("No app or link reaches it.");
    const thread = yield* getRemoteThread(
      { gateway, environmentId, caller: { environmentId: local, threadId: task.ownerThreadId } },
      task.workerThreadId,
    );
    const completedAt = thread.runs.at(-1)?.completedAt;
    return {
      attention: attentionFromRelayThread(thread),
      longPolled: false,
      settledAtMs:
        completedAt == null ? null : DateTime.toEpochMillis(DateTime.makeUnsafe(completedAt)),
    };
  });

  const follow = Effect.fn("RemoteChildFollower.follow")(function* (
    task: ThreadTask,
    environmentId: EnvironmentId,
  ) {
    const state = yield* Ref.make<Followed>({ reading: null, cursor: FIRST_CURSOR, failures: 0 });
    const step = Effect.gen(function* () {
      const before = yield* Ref.get(state);
      const outcome = yield* read(task, environmentId, before.cursor).pipe(Effect.result);
      const failures = outcome._tag === "Failure" ? before.failures + 1 : 0;
      const next: ChildReading | null =
        outcome._tag === "Success"
          ? {
              threadId: task.workerThreadId,
              title: task.summary,
              environmentId,
              attention: outcome.success.attention,
              settledAtMs: outcome.success.settledAtMs,
            }
          : failures >= FAILURES_BEFORE_UNREACHABLE
            ? {
                threadId: task.workerThreadId,
                title: task.summary,
                environmentId,
                attention: {
                  state: "unreachable",
                  runId: before.reading?.attention.runId ?? null,
                },
                settledAtMs: null,
              }
            : before.reading;
      yield* Ref.set(state, {
        reading: next,
        cursor:
          outcome._tag === "Success" && outcome.success.attention.state !== "unreachable"
            ? childAttentionCursor(outcome.success.attention)
            : before.cursor,
        failures,
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
        const remote = yield* tasks.listRemoteWorkers();
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
