import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ThreadTaskError,
  type ThreadTaskRemoteAssignInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ParentSettlementFollow from "../../../orchestration-v2/ParentSettlementFollow.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ThreadTaskService from "../../../threadTask/ThreadTaskService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as PeerHandlers from "./handlers.ts";
import { PeerToolkit } from "./tools.ts";

const owner = EnvironmentId.make("owner-environment");

it.effect("a link relays a thread task only for its own environment", () =>
  Effect.gen(function* () {
    const assigned: Array<ThreadTaskRemoteAssignInput> = [];
    const relay = (client: McpInvocationContext.McpInvocationScope["client"]) => {
      const dependencies = Layer.mergeAll(
        Layer.succeed(McpInvocationContext.McpInvocationContext, {
          environmentId: EnvironmentId.make("worker-environment"),
          requestNamespace: "link",
          thread: undefined,
          client,
          issuedAt: 0,
          capabilities: new Set(["orchestration" as const]),
        }),
        Layer.mock(ParentSettlementFollow.ParentSettlementFollow)({}),
        Layer.mock(ThreadManagement.ThreadManagementService)({}),
        Layer.mock(ThreadTaskService.ThreadTaskService)({
          remoteAssign: (input) => {
            assigned.push(input);
            return Effect.fail(
              new ThreadTaskError({ code: "scope_denied", detail: "Reached the worker." }),
            );
          },
        }),
      );
      return Effect.gen(function* () {
        const toolkit = yield* PeerToolkit.pipe(
          Effect.provide(
            McpToolAccess.HandlersLayer.layer(PeerHandlers.layer).pipe(Layer.provide(dependencies)),
          ),
        );
        const results = yield* toolkit
          .handle("t3_peer_thread_task", {
            action: "remoteAssign",
            input: {
              ownerEnvironmentId: owner,
              ownerThreadId: "parent",
              workerThreadId: "child",
              taskId: "task:1",
              summary: "Review",
              capability: "secret",
            },
          })
          .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
        return results.at(-1)?.result;
      });
    };
    const link = (peerEnvironmentId: EnvironmentId) => ({
      sessionId: "link-session",
      label: "Owner",
      access: "approval-required" as const,
      linked: true,
      peerEnvironmentId,
    });

    expect(yield* relay(link(owner))).toMatchObject({ message: "Reached the worker." });
    expect(assigned.map((input) => input.ownerEnvironmentId)).toEqual([owner]);

    expect(yield* relay(link(EnvironmentId.make("other-environment")))).toMatchObject({
      code: "invalid_request",
    });
    expect(
      yield* relay({ sessionId: "client", label: "Claude Code", access: "full-access" }),
    ).toMatchObject({ code: "capability_denied" });
    expect(assigned).toHaveLength(1);
  }),
);
