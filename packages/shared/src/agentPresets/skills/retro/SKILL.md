---
name: retro
description: "Conduct a requested session retrospective and rank evidence-backed improvements to the agent environment."
license: MIT
metadata:
  intended-agents: "Captain"
  upstream:
    author: Matt Pocock
    url: "https://github.com/mattpocock/skills/blob/4588b32ecab9ecc9fc8cc6b6c5e7d675b6004b0d/skills/engineering/retro/SKILL.md"
    commit: "4588b32ecab9ecc9fc8cc6b6c5e7d675b6004b0d"
---

# Retrospective

Run only when the user requests or assigns a retrospective (default: current session). **Recommendations only:** do not edit code/skills/configs/hooks or open PRs without a separate explicit assignment.

## 1. Read Primary Evidence

Inspect real session artifacts (history, task ledgers, tool calls, diffs, test/CI logs, requested reviews) and the repo's actual check wiring before recommending checks or docs. Tie every finding to a cited event/artifact; separate facts from inference; note missing evidence; omit secrets.

## 2. Compare Prior Retros

Bounded search of the project's `.t3/captain/` reports and incident ledgers for matching symptoms/obligations. For each prior recommendation, inspect live code/config/revisions and classify as: `proposed`, `implemented`, `verified effective`, `ineffective`, `reverted/superseded`, or `unknown`. Reconcile pending items instead of duplicating them; fix gaps in existing remedies before adding new rules.

## 3. Seven Categories (only where evidenced)

1. **Navigation:** repeated lookups → short trigger-to-destination pointer.
2. **Automated checks:** defects lint/type/test/hooks should catch, or unwired/broken checks.
3. **Coding standards:** mechanical rules belong in linters/hooks/CI (specify failing + passing fixtures), not prose; reserve prose for judgement calls.
4. **Global steering:** keep always-loaded instructions sparse and routing-focused.
5. **Tool economy:** costly/repetitive/verbose calls → batching, narrower queries, or tool fixes.
6. **No-ops:** instructions duplicating defaults or changing no behavior.
7. **Information access:** missing read-only telemetry/logs that would unlock decisions.

## 4. Writing Rules for Proposed Steering

Place guidance on the narrowest surface; keep one authoritative location per rule; account for always-loaded token cost; state desired behavior directly with checkable completion criteria.

## 5. Output Format

Rank findings **Critical / High / Medium / Low**. For each: severity + category, cited observation, impact, exact proposed change + destination, and concrete validation (failing/passing case for mechanical rules; concrete decision example for judgement rules). Include the prior-results comparison and stop—implementation waits for assignment.

## Attribution & License

Adapted from Matt Pocock's `retro` skill (`4588b32ecab9ecc9fc8cc6b6c5e7d675b6004b0d`). MIT License — Copyright (c) 2026 Matt Pocock. Permission is hereby granted, free of charge, to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies subject to including this notice, provided "AS IS" without warranty.
