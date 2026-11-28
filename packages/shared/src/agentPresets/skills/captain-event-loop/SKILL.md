---
name: captain-event-loop
description: "Captain's trigger-driven event loop for named children: launch with parent linkage, wake on Ada's 'Child chats need you' triggers, sweep, approve, advance, and clean up."
---

# Captain event loop

## Child-to-Captain Triggers (How Wakes Work)

Ada automatically fires a `"Child chats need you"` wake to an idle Captain whenever a linked child finishes its turn, stops, fails, hits a usage limit, needs input/approval, or goes unreachable. `delegate_task` helpers, user messages, `watch_pull_request`, and background commands also wake Captain.

- **Never poll, sleep, arm listeners, or send "status?" checks:** end your turn and wait for the child's trigger.
- **Parent linkage is required for triggers:** `t3_thread_launch` and `create_threads` link local children automatically. For **remote children** (`environmentId`), verify `parentThreadId` + `parentEnvironmentId` are set right after launch—if empty, call `t3_set_thread_parent` immediately so Ada's `"Child chats need you"` trigger fires when the remote child finishes.

## Launching & Briefing Children

- Launch work on the user's devices/repos as a named agent via `t3_thread_launch` (explicit `workspaceStrategy`) or `create_threads` with its `profileId`—never `delegate_task` with a `profileId` (profile-less `delegate_task` is only for Captain's own helpers). Follow up with `t3_thread_send`.
- Scope constraints (`read-only`, `no push`, `fail-closed`, `hard cap`) ONLY to steps that truly require them—never stamp them as boilerplate. For review briefs, state `Round N/3`.
- **Merge mode:** State whether the repo auto-merges after local CI or requires the user to merge per its `AGENTS.md`/ruleset (`github-git`). On auto-merge repos, merge PRs as soon as full local CI passes; never let stacks sit unmerged. Children never call `watch_pull_request`.
- Never preempt or kill active GPU, model-serving, or benchmark runs unless the user explicitly authorizes immediate preemption ("when finished" means wait, not stop).
- End every brief with:
  _"Work autonomously: decide reversible implementation/scripting/tooling choices yourself and list them under `Defaults taken:`. Only emit `BLOCKED: <question> (default: <pick>)` on the last line for missing credentials/2FA, unavailable hardware, destructive actions outside worktree/temp, or unmade irreversible product/architecture choices. Do not invent unrequested fail-closed gates or caps. Follow the repo's PR/merge rule (`github-git`) and never call `watch_pull_request`. Ending your turn triggers Ada's done notification to Captain—do not message Captain or use interactive question tools, and do not end your turn early while waiting on background work (register long waits with `t3_background_wait` and never foreground-`sleep`). Never pass `$(...)` to `rm` (use a literal path or quoted variable)."_
- Remote children: pass `environmentId` on every call (`t3_thread_send`, `t3_thread_read`, `t3_thread_wait`, `t3_task_read`) and record it in `PIPELINE.md`. On `thread_not_found`, use `t3_get_thread` / `t3_get_messages` / `t3_send_message`.

## Wake: Sweep, Then Act

1. Run `t3_task_read` (no `threadId`). If a child looks stuck with no trigger, check `t3_get_agents_view` (`waiting-approval`, `waiting-input`).
2. For each changed child:
   - **Approval:** Inspect via `t3_thread_read` (`activity`). Approve routine in-worktree/temp actions with `t3_respond_to_approval` (fresh `idempotencyKey`, `confirmDestructive: true` if asked); otherwise decline with reason.
   - **Question:** `t3_pending_request` read, answer per Defaults rule.
   - **Finished:** Verify the real deliverable, start next step, or decide a `BLOCKED:` line and reply.
   - **Stopped / failed:** Resume once ("continue from where you stopped; re-check uncommitted work first"); escalate to the user if it stops again.
   - **Usage limit:** Wait if reset is near, else reassign (and unwatch any PRs the stopped thread watched).
   - **Unreachable:** Continue other streams; report to the user if pipeline-blocking.
3. Before ending the turn, every idle child has its next step started or awaits a listed user decision.

## Fallback Watcher

Only if child triggers are disabled or not arriving: run `<skill dir>/scripts/watch-children [--timeout 240] <threadId> <threadId>@<environmentId> ...` in background. Exits on `APPROVAL`, `INPUT`, `ENDED`, `ERROR`, or `TIMEOUT` (restart). Record task ID in `PIPELINE.md`. Needs `ada auth session issue --subject mcp-client` and `ada acp-mcp-call`.

## Sign-in Links, Pipeline & Cleanup

- **Auth:** Check required cloud sessions up front per repo `AGENTS.md`. Relay sign-in links/codes immediately with a one-line `PushNotification`; regenerate expired links before re-asking.
- **Pipeline table:** Maintain `.t3/captain/<job>/PIPELINE.md` (`child id | env | role | step | done means | next step | last state seen`). Update before acting on plan changes.
- **Defaults:** Decide reversible/routine choices yourself (order, naming, PR splits, resumes, in-scope approvals, merging on auto-merge repos once local CI passes) and list under `Defaults taken`. Run CI locally per repo skill. Ask the user only for prod deploys/releases, architecture exceptions, unmade product decisions, destructive data ops, spending, or unapproved external actions.
- **Post-merge & reboots:** Clean worktrees per repo `AGENTS.md` + `worktree-cleanup-rule` (make cleanup the last step in briefs). After a reboot, sweep, resume interrupted children, restart watcher if used, and settle finished children promptly.
