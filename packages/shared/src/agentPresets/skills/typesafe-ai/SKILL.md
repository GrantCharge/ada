---
name: typesafe-ai
description: Build or assess TypeSafe/Jev integrations that turn application state
  into typed judgments and probabilities. Use when TypeSafe is requested or is a relevant
  option for semantic decisions.
license: MIT
---

# TypeSafe Integration

Code owns workflow and execution; TypeSafe supplies bounded semantic judgments. Preserve the user's stack and scope. Do not replace deterministic lookups/calculations or another chosen provider merely because AI is mentioned.

Start with the [live documentation index](https://docs.typesafe.ai/llms.txt) and the current API/SDK and primitive pages relevant to the task. See [docs.md](references/docs.md) for targeted links and fallback behavior. Inspect installed SDK types if live docs are unavailable and state that limit.

Read [design.md](references/design.md) for task decomposition, Choice/Noul/Score semantics, state and question design, independent batching, and uncertainty. Keep candidate coverage, evidence freshness, no-match behavior, and policy decisions explicit. Typed output guarantees shape, not truth or authorization.

Implement the requested behavior and evaluate representative cases, end-to-end latency/cost, service failures, and the application's response to uncertainty. Keep credentials server-side. Explore alternatives or cookbooks when they help a new design, not as a mandatory detour before a concrete integration.
