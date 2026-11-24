---
name: captain-event-loop
description: "Captain's event loop for named children: launch and brief them, act on the one message Ada sends when children finish, stop, fail or need Captain, sweep every child on every wake, answer approvals, and take the next pipeline step. Read at the start of every Captain turn that launches, messages or checks a child, and after a PR merges."
---

# Captain event loop

## How children reach Captain

Ada starts an idle Captain turn with one "Child chats need you" message when any child chat finishes, stops, fails, hits a usage limit, needs an answer or approval, or stops answering on another machine. Each child's news arrives once, never while Captain is busy, and at most a few times an hour per child. A profile-less `delegate_task` helper still reports through its own "Delegated tasks … reached terminal states" message. Messages from the user, `watch_pull_request` events and background commands Captain started also wake it.

So never arm listeners, poll, sleep or send "status?" messages: end the turn and let the next message bring the news. The user can turn these messages off per thread ("Child chat messages: Never"); then sweep on every user message instead.

## Launching and messaging children

- Start named children with `t3_thread_launch` (or `create_threads`) so they get a task and show in the sweep. Avoid `delegate_task` with a `profileId`.
- Send follow-ups with `t3_thread_send`.
- Every brief ends with: _"End each turn with a short summary. Put any question on the last line as `BLOCKED: <question> (default: <your pick>)`. Do not use interactive question tools and do not message Captain. For a long wait (CI, a remote build, a helper), start it in the background, register it with `t3_background_wait`, and keep working or end your turn: Ada resumes you when it finishes. Do not write a final summary until that work is done. Never pass `rm` a `$(...)` target: use a literal path or a quoted variable (`d=$(mktemp -d); rm -rf "$d"`)."_
- Do not tell a child to "block in the foreground". Foreground `sleep` is blocked by the Claude Code harness, so the child cannot comply and ends its turn anyway.

### Children on another machine

`t3_thread_wait`, `t3_thread_send`, `t3_thread_read` and the `t3_task_read` sweep take `environmentId`. If a call returns `thread_not_found`, fall back to `t3_get_thread` / `t3_get_messages` / `t3_send_message` with `environmentId`. Record each remote child's `environmentId` in PIPELINE.md and pass it on every call about that child.

## Wake: sweep everything, then act

1. **Sweep once:** `t3_task_read` with no `threadId`. The digest names every child that changed and the call that answers it; the sweep catches anything else.
2. **Handle every changed child:**
   - **Needs approval:** read the child's last activity (`t3_thread_read` view `activity`, the last ~6 items) to see the command the approval guards. Approve with `t3_respond_to_approval` (`decision: "accept"`, a fresh `idempotencyKey`, and `confirmDestructive: true` when the API asks for it) if it is routine work inside the child's worktree or temp dirs. Decline it, and tell the child why with `t3_thread_send`, if it touches anything outside that scope or anything on the "ask the user" list.
   - **Asked a question:** `t3_pending_request` `read`, then `respond` using the defaults rule. Escalate to the user only for "ask the user" items.
   - **Finished:** if the last line holds a deliverable, verify it and start the next pipeline step. If it is `BLOCKED:`, decide it and reply with `t3_thread_send`.
   - **Stopped / failed:** resume once with `t3_thread_send` ("continue from where you stopped; re-check uncommitted work first") and report to the user if it stops again.
   - **Usage limit:** wait if the reset is near, otherwise reassign the work.
   - **Unreachable:** carry on with other work; another message comes when it answers again. Tell the user if it blocks the pipeline.
3. **End-of-turn invariant:** every idle child has its next step started or is waiting on the user for a listed decision, and nothing is waiting on Captain.

## Time-limited human steps (sign-in links, 2FA, codes)

A link that expires in minutes must reach the user in one hop, while they are likely to be there.

- Before launching work that needs a cloud or SSO session, check that session yourself as the project's AGENTS.md says (for AWS, `aws sts get-caller-identity` with the project's profile). If it is missing or near expiry, do the sign-in with the user **first**, then launch the child.
- When a child reports a sign-in link or code, relay it in your very next message, together with what to paste back, and send `PushNotification` (one line, under 200 characters) so the user sees it away from the screen. If a link has expired, regenerate it yourself before asking the user again.

## Pipeline table

Keep the job's table in `.t3/captain/<job>/PIPELINE.md`: child id | role | step | done means | next step | last state seen. Update it before acting on an instruction from the user that changes the plan.

## Defaults instead of blocking on the user

Decide reversible and routine choices yourself (order, naming, splitting PRs, resuming, approving routine in-scope commands, merging each PR as soon as the repo's PR skill allows), and list them under "Defaults taken". CI checks still apply, but they run locally through the repo's verification skill and nothing is rerun remotely. Never wait for a staging-deploy check before merging. Ask the user only about production deploys or releases, architecture exceptions, product decisions they have not made, destructive data operations, spending, and outward-facing actions they have not approved.

## After a PR merges

Clean up the task's worktree as the repo's AGENTS.md says first, then follow the worktree-cleanup-rule skill. Cleanup is the last pipeline step before the task is done; include it in implementation briefs.

## Reboots

Ada keeps what it has told Captain across a restart, so nothing is reported twice. After a reboot, sweep on the first wake and resume interrupted children.
