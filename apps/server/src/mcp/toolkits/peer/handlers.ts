import {
  OrchestratorMcpFailure,
  ThreadTaskProjectSnapshot,
  ThreadTaskProjectSnapshotInput,
  ThreadTaskRemoteAssignInput,
  ThreadTaskRemoteDeliverInput,
  ThreadTaskRemoteDeliverResult,
  ThreadTaskRemoteOwnerActionInput,
  ThreadTaskView,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ParentSettlementFollow from "../../../orchestration-v2/ParentSettlementFollow.ts";
import * as ThreadTaskService from "../../../threadTask/ThreadTaskService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { PeerToolkit } from "./tools.ts";

const linkedPeer = Effect.gen(function* () {
  const { client } = yield* McpInvocationContext.McpInvocationContext;
  return client?.linked === true ? client.peerEnvironmentId : undefined;
});

const isMcpFailure = Schema.is(OrchestratorMcpFailure);

const invalidTask = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

/** Relays one task call to the service; the environment it names must be the link's own. */
const threadTask = Effect.fn("PeerToolkit.threadTask")(function* (
  request: (typeof PeerToolkit.tools)["t3_peer_thread_task"]["parametersSchema"]["Type"],
) {
  const peer = yield* linkedPeer;
  if (peer === undefined) {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Only another environment's link relays thread tasks here.",
    });
  }
  const service = yield* Effect.serviceOption(ThreadTaskService.ThreadTaskService);
  if (Option.isNone(service)) {
    return yield* new OrchestratorMcpFailure({
      code: "orchestration_error",
      message: "This environment keeps no thread tasks.",
    });
  }
  const tasks = service.value;
  const decode = <S extends Schema.Top>(schema: S) =>
    Schema.decodeUnknownEffect(schema)(request.input).pipe(
      Effect.mapError(() => invalidTask(`The ${request.action} request is not valid.`)),
    );
  const fromPeer = (environmentId: string) =>
    environmentId === peer
      ? Effect.void
      : Effect.fail(invalidTask(`This link speaks only for environment ${peer}.`));
  const encode = <S extends Schema.Top>(schema: S) => Schema.encodeUnknownEffect(schema);
  const answered = Effect.gen(function* () {
    switch (request.action) {
      case "remoteAssign": {
        const input = yield* decode(ThreadTaskRemoteAssignInput);
        yield* fromPeer(input.ownerEnvironmentId);
        return yield* tasks.remoteAssign(input).pipe(Effect.flatMap(encode(ThreadTaskView)));
      }
      case "remoteOwnerAction": {
        const input = yield* decode(ThreadTaskRemoteOwnerActionInput);
        yield* fromPeer(input.ownerEnvironmentId);
        return yield* tasks.remoteOwnerAction(input).pipe(Effect.flatMap(encode(ThreadTaskView)));
      }
      case "remoteDeliver": {
        const input = yield* decode(ThreadTaskRemoteDeliverInput);
        yield* fromPeer(input.workerEnvironmentId);
        return yield* tasks
          .remoteDeliver(input)
          .pipe(Effect.flatMap(encode(ThreadTaskRemoteDeliverResult)));
      }
      case "projectSnapshot":
        return yield* tasks
          .projectSnapshot(yield* decode(ThreadTaskProjectSnapshotInput))
          .pipe(Effect.flatMap(encode(ThreadTaskProjectSnapshot)));
    }
  });
  return yield* answered.pipe(
    Effect.mapError((error) =>
      isMcpFailure(error)
        ? error
        : new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message }),
    ),
  );
});

export const layer = McpToolAccess.toLayer(PeerToolkit, {
  t3_peer_follow_parent_settlement: McpToolAccess.writes(
    (input) =>
      Effect.gen(function* () {
        const { client } = yield* McpInvocationContext.McpInvocationContext;
        // The parents' environment is the authenticated link's, never one the caller names.
        if (
          client?.linked !== true ||
          client.access !== "full-access" ||
          client.peerEnvironmentId === undefined
        ) {
          return yield* new OrchestratorMcpFailure({
            code: "capability_denied",
            message: "Only another environment's full-access link settles children here.",
          });
        }
        const settlements = yield* ParentSettlementFollow.ParentSettlementFollow;
        return yield* settlements
          .follow({ ...input, parentEnvironmentId: client.peerEnvironmentId })
          .pipe(
            Effect.mapError(
              (error) =>
                new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message }),
            ),
          );
      }),
    { linkedCallers: "allowed" },
  ),
  // Each call is authorized by its task's capability; the link only vouches for its environment.
  t3_peer_thread_task: McpToolAccess.writes(threadTask, { linkedCallers: "allowed" }),
});
