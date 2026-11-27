---
name: worktree-cleanup-rule
description: "Disposable worktrees (merged or >14d untouched): delete directly, never back up. Keep primary checkouts, live worktrees, branches, and shared caches."
---

# Worktree cleanup rule

A git worktree is disposable if:

- **Merged:** HEAD is in the default branch (ancestor, patch-equivalent, merged PR head, or tree-equal to squash commit), OR
- **Old:** no commits and no source edits for >14 days (ignore `node_modules`, `.git`, build dirs). Dirty/unpushed state does NOT block removal past 14 days.

## Never back up worktrees

Remove directly—never create patches, tars, bundles, or copies.

## Keep

- Primary repo checkouts.
- Live worktrees (bound to a running thread, active process cwd, or held/stacked for active work).
- Git branches (delete branches only when the user asks).
- Shared caches (`GOCACHE`, `GOMODCACHE`), model weights, databases, Docker volumes.

## How

- Follow repo `AGENTS.md` first.
- Ada-managed: `t3_reclaim_worktree` dry-run, then reclaim. If it refuses after a squash merge and `gh pr view <branch> --json state,headRefOid` confirms `MERGED` (head or tree match), run `git worktree remove --force <path> && git worktree prune`. Report other refusals.
- Unmanaged: `git worktree remove --force <path> && git worktree prune`. Remove only that worktree's own build outputs.
