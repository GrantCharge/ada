import {
  EnvironmentId,
  type McpGatewayRelayEvent,
  type McpGatewayRelayThreadTaskRequest,
  PEER_THREAD_TASK_TOOL,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { McpGatewayBroker } from "../mcp/McpGatewayBroker.ts";
import * as PeerLinks from "../peer/PeerLinks.ts";
import * as PeerMcpClient from "../peer/PeerMcpClient.ts";

export type ThreadTaskRemoteRequest = McpGatewayRelayThreadTaskRequest;

/**
 * Reaches another environment over this server's own link, or through a connected T3 app.
 * The receiving server authorizes each call by the task's capability, never by the session.
 */
export class ThreadTaskTransport extends Context.Service<
  ThreadTaskTransport,
  {
    readonly localEnvironmentId: EnvironmentId;
    /** Fails with a reason when neither a link nor a connected app reaches the environment. */
    readonly call: (
      environmentId: EnvironmentId,
      request: ThreadTaskRemoteRequest,
      /** The modes of the chat that made the call; the app answering applies them there. */
      modeCeiling?: McpGatewayRelayEvent["modeCeiling"],
    ) => Effect.Effect<unknown, string>;
    /** Environments a connected app currently reaches, as far as the network allows. */
    readonly peers: () => ReadonlyArray<EnvironmentId>;
    /** Emits when a path to other environments may have opened. */
    readonly connected: Stream.Stream<void>;
  }
>()("t3/threadTask/ThreadTaskTransport") {}

export const layerFromBroker = Layer.effect(
  ThreadTaskTransport,
  Effect.gen(function* () {
    const broker = yield* McpGatewayBroker;
    const links = Option.getOrUndefined(yield* Effect.serviceOption(PeerLinks.PeerLinks));
    const peerClient = Option.getOrUndefined(
      yield* Effect.serviceOption(PeerMcpClient.PeerMcpClient),
    );
    const descriptor = yield* (yield* ServerEnvironment.ServerEnvironment).getDescriptor;
    const throughApp = (
      environmentId: EnvironmentId,
      request: ThreadTaskRemoteRequest,
      modeCeiling?: McpGatewayRelayEvent["modeCeiling"],
    ) =>
      broker
        .call("threadTask", [environmentId, request], modeCeiling)
        .pipe(Effect.mapError((error) => error.message));
    const linked = (environmentId: EnvironmentId) =>
      links === undefined || peerClient === undefined
        ? Effect.succeed(false)
        : links.get(environmentId).pipe(
            Effect.map(Option.isSome),
            Effect.orElseSucceed(() => false),
          );
    return ThreadTaskTransport.of({
      localEnvironmentId: descriptor.environmentId,
      call: Effect.fn("ThreadTaskTransport.call")(function* (environmentId, request, modeCeiling) {
        if (peerClient === undefined || !(yield* linked(environmentId))) {
          return yield* throughApp(environmentId, request, modeCeiling);
        }
        // Only a peer that predates the task tool falls back to an app: any other failure may
        // have run there, and a write is never run twice.
        return yield* peerClient
          .call({
            environmentId,
            tool: PEER_THREAD_TASK_TOOL,
            arguments: request,
            limits: modeCeiling ?? { runtimeMode: "full-access", interactionMode: "default" },
            success: Schema.Unknown,
          })
          .pipe(
            Effect.catchIf(
              (error) => error.message.includes(`Tool '${PEER_THREAD_TASK_TOOL}' not found`),
              () => throughApp(environmentId, request, modeCeiling),
            ),
            Effect.mapError((error) => (typeof error === "string" ? error : error.message)),
          );
      }),
      peers: () =>
        Object.keys(broker.view().grants)
          .filter((id) => id !== descriptor.environmentId)
          .map((id) => EnvironmentId.make(id)),
      connected: broker.hostConnected,
    });
  }),
);
