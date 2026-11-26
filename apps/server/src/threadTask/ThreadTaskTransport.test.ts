import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  type ExecutionEnvironmentDescriptor,
  OrchestratorMcpFailure,
  PEER_THREAD_TASK_TOOL,
  type PeerLink,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { McpGatewayBroker } from "../mcp/McpGatewayBroker.ts";
import * as PeerLinks from "../peer/PeerLinks.ts";
import * as PeerMcpClient from "../peer/PeerMcpClient.ts";
import * as ThreadTaskTransport from "./ThreadTaskTransport.ts";

const linked = EnvironmentId.make("linked-environment");
const relayed = EnvironmentId.make("relayed-environment");
const request = { action: "projectSnapshot" as const, input: { projectKey: "repo" } };

it.effect(
  "a task call goes over a stored link, and through an app only where none carries it",
  () =>
    Effect.gen(function* () {
      const overLink: Array<{ readonly environmentId: string; readonly tool: string }> = [];
      const throughApp: Array<unknown> = [];
      let peerKnowsTool = true;
      const transport = yield* ThreadTaskTransport.ThreadTaskTransport.pipe(
        Effect.provide(
          ThreadTaskTransport.layerFromBroker.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.mock(ServerEnvironment.ServerEnvironment)({
                  getDescriptor: Effect.succeed({
                    environmentId: EnvironmentId.make("here"),
                  } as ExecutionEnvironmentDescriptor),
                }),
                Layer.mock(McpGatewayBroker)({
                  view: () => ({ grants: {}, refusals: {} }),
                  available: () => true,
                  call: (_method, args) => {
                    throughApp.push(args[0]);
                    return Effect.succeed("from app");
                  },
                }),
                Layer.mock(PeerLinks.PeerLinks)({
                  get: (environmentId) =>
                    Effect.succeed(
                      environmentId === linked ? Option.some({} as PeerLink) : Option.none(),
                    ),
                }),
                Layer.mock(PeerMcpClient.PeerMcpClient)({
                  call: (input) => {
                    overLink.push({ environmentId: input.environmentId, tool: input.tool });
                    return peerKnowsTool
                      ? Effect.succeed("from link")
                      : Effect.fail(
                          new OrchestratorMcpFailure({
                            code: "orchestration_error",
                            message: `Tool '${PEER_THREAD_TASK_TOOL}' not found`,
                          }),
                        );
                  },
                }),
              ),
            ),
          ),
        ),
      );

      expect(yield* transport.call(linked, request)).toBe("from link");
      expect(overLink).toEqual([{ environmentId: linked, tool: PEER_THREAD_TASK_TOOL }]);
      expect(throughApp).toEqual([]);

      expect(yield* transport.call(relayed, request)).toBe("from app");
      expect(throughApp).toEqual([relayed]);

      // A peer from before the task tool still answers through an app.
      peerKnowsTool = false;
      expect(yield* transport.call(linked, request)).toBe("from app");
      expect(throughApp).toEqual([relayed, linked]);
    }),
);
