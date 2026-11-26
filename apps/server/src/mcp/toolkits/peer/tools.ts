import {
  McpGatewayRelayThreadTaskRequest,
  OrchestrationV2ParentSettlement,
  OrchestrationV2ParentSettlementResult,
  OrchestratorMcpFailure,
  PEER_FOLLOW_PARENT_SETTLEMENT_TOOL,
  PEER_THREAD_TASK_TOOL,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { Tool, Toolkit } from "effect/ai";

import * as ParentSettlementFollow from "../../../orchestration-v2/ParentSettlementFollow.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const PeerFollowParentSettlementTool = Tool.make(PEER_FOLLOW_PARENT_SETTLEMENT_TOOL, {
  description: "Children here follow a settlement of their parents on the calling environment.",
  parameters: Schema.Struct(
    Struct.omit(OrchestrationV2ParentSettlement.fields, ["parentEnvironmentId"]),
  ),
  success: OrchestrationV2ParentSettlementResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ParentSettlementFollow.ParentSettlementFollow,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Follow a parent's settlement")
  .annotate(Tool.Strict, true)
  .annotate(Tool.Destructive, true);

const PeerThreadTaskTool = Tool.make(PEER_THREAD_TASK_TOOL, {
  description: "A task split between this environment and the calling one, by its capability.",
  parameters: McpGatewayRelayThreadTaskRequest,
  success: Schema.Unknown,
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Relay a thread task")
  .annotate(Tool.Strict, true)
  .annotate(Tool.Destructive, true);

export const PeerToolkit = Toolkit.make(PeerFollowParentSettlementTool, PeerThreadTaskTool);
