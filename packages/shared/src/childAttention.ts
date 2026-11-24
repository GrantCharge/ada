import {
  type OrchestrationV2ChildAttention,
  type OrchestrationV2ThreadShell,
  ProviderRequestKind,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { threadShellHasActiveWork } from "./orchestrationV2PendingBackgroundWork.ts";

const isApprovalKind = Schema.is(ProviderRequestKind);

export type ChildAttentionShell = Pick<
  OrchestrationV2ThreadShell,
  | "status"
  | "activityRunStatus"
  | "pendingRuntimeRequest"
  | "pendingBackgroundTasks"
  | "latestRunId"
  | "latestRunStartedAt"
  | "lastErrorClass"
  | "usageLimitResetAt"
  | "limitRecovery"
>;

/**
 * A child whose own children are still active is working: its parent hears from it once the
 * whole subtree is quiet.
 */
export function childAttention(
  shell: ChildAttentionShell,
  options?: { readonly activeDescendants?: boolean },
): OrchestrationV2ChildAttention {
  const runId = shell.latestRunId;
  const request = shell.pendingRuntimeRequest;
  if (request != null && request.userOnly !== true) {
    if (request.kind === "user_input")
      return { state: "needs-input", runId, requestId: request.id };
    if (isApprovalKind(request.kind)) {
      return { state: "needs-approval", runId, requestId: request.id };
    }
  }
  if (threadShellHasActiveWork(shell) || options?.activeDescendants === true) {
    return { state: "working", runId };
  }
  switch (shell.status) {
    case "completed":
      return { state: "finished", runId };
    case "interrupted":
      return { state: "stopped", runId };
    // A run cancelled before it started is not news.
    case "cancelled":
      return shell.latestRunStartedAt == null
        ? { state: "idle", runId }
        : { state: "stopped", runId };
    case "failed": {
      if (shell.lastErrorClass !== "usage_limit") {
        return {
          state: "failed",
          runId,
          ...(shell.lastErrorClass == null ? {} : { errorClass: shell.lastErrorClass }),
        };
      }
      const recovery = shell.limitRecovery;
      return {
        state: "limited",
        runId,
        ...(shell.usageLimitResetAt == null ? {} : { resetAt: shell.usageLimitResetAt }),
        autoResume: recovery?.runId === runId && recovery?.autoResume === true,
      };
    }
    default:
      return { state: "idle", runId };
  }
}

/** Something the parent should act on, as opposed to work in progress or nothing at all. */
export function childAttentionIsActionable(attention: OrchestrationV2ChildAttention): boolean {
  return attention.state !== "working" && attention.state !== "idle";
}

/** Two readings with the same key are the same news. */
export function childAttentionKey(attention: OrchestrationV2ChildAttention): string {
  return `${attention.state}:${attention.runId ?? ""}:${attention.requestId ?? ""}`;
}

const CURSOR_PREFIX = "attention1:";

export function childAttentionCursor(attention: OrchestrationV2ChildAttention): string {
  return `${CURSOR_PREFIX}${childAttentionKey(attention)}`;
}

/** The key a cursor saw, or null for a cursor this build cannot read. */
export function childAttentionCursorKey(cursor: string): string | null {
  return cursor.startsWith(CURSOR_PREFIX) ? cursor.slice(CURSOR_PREFIX.length) : null;
}
