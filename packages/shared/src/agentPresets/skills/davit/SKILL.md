---
name: davit
description: "Run heavy tests, builds, installs, docker, or benchmarks in a Davit Firecracker box (repo box target first, else `davit box run`), with local fallback if Davit cannot run."
---

# Davit project boxes

Davit runs heavy commands in fast Firecracker VMs on the user's configured Davit host. Edit code locally; run only commands in the box—never run an agent/harness inside a box.

## When to Use

- **Repo target first:** If the repo defines a box target (e.g. `make box-ci`), use it.
- **Global:** Otherwise run locally, moving heavy work (full test suites, `-race`, builds, installs, docker, benchmarks) to `davit box run -- <cmd>` when the host is busy. Keep reads, git, edits, and small lints local.
- Verify setup with `davit box ls` (if missing/old/unreachable, see Setup below).

## Commands (from repo/worktree)

```bash
davit box run -- <cmd>               # auto-picks repo/branch, builds image, syncs worktree, runs cmd
davit box up [--memory 6GiB]         # start/resume or resize (sticks)
davit box ssh [-- <cmd>]             # shell or command
davit box sync --pull dist ./dist    # pull artifacts locally
davit box down                       # save & stop (ALWAYS run when done)
davit box ls --json                  # list host RAM, images, instances
davit box rm <proj>/<inst> --yes     # delete finished instance
davit box gc [--dry-run]             # clean your idle/old boxes
davit box image update <proj>        # rebuild image after lockfile/setup changes (then `box up --refresh`)
davit box pin [--hot] <proj>/<inst>  # prevent auto-eviction
```

JS projects get `node_modules/.bin` on PATH and 4 GiB RAM default (others 2 GiB). `.davit/setup.sh` (or `.slipway/setup.sh`) customizes image setup.

## Rules

1. Always `davit box down` when done; `davit box rm` instances for finished worktrees.
2. One instance per worktree—never share across concurrent tasks.
3. Never sync secrets/tokens. Never SSH to the Davit host or its hypervisor directly; never touch other agents' boxes.
4. Report exact box command, exit code, duration, and any image rebuild.

## Failures & Local Fallback

If Davit fails due to infrastructure/capacity, run the equivalent check locally, one heavy job at a time, and report where each check ran. Test failures are real bugs—investigate and fix.

- **Unreachable:** Verify `ssh <user>@<davit-host> true`; if down, run locally.
- **OOM (exit 137):** Resize (`--memory 6GiB` or `8GiB`) after processes stop (exit 6 if busy).
- **Host disk low / waiting for capacity:** (1) `davit box rm` your finished instances, (2) retry once with `--wait 15m`, (3) if still exit 8, run locally and note "davit disk full, ran locally". Never stop to ask.
- **Box disk full (`boxDisk`):** Grow with `davit box up --disk 40GiB` or clear box caches; else run locally.
- **Host OOM (exit 8):** `box down`/`box gc` your idle boxes, retry `--wait 10m` or `--memory 2GiB --cpus 2`; else run locally.
- **Image setup failed:** Check `davit history` and fix `.davit/setup.sh` / `--setup-cmd`.
- **Fails in box, passes locally:** Box is clean Ubuntu 24.04 (`dash` `/bin/sh`)—treat as a real portability bug.

## Set Up a New Machine (only if missing/old)

No sudo (writes `~/.local/bin`, `~/.ssh`, user config):

1. Install client: `curl -fsSL https://github.com/jayleaton/davit/releases/download/v0.1.0-rc8/install.sh | sh -s -- --client` (check latest tag at `github.com/jayleaton/davit/releases`; verify `SHA256SUMS` if desired). Ensure `~/.local/bin` is on PATH and check `davit version`.
2. Connect: `davit connect <user>@<davit-host>` (add `--via <jump-host>` when off the host's network). Or set `davit client-config --set-host ssh://<user>@<davit-host>` and configure `~/.ssh/config` (ed25519 key, `IdentitiesOnly yes`, `StrictHostKeyChecking accept-new`, plus `ProxyJump` when needed). If the host is unknown, emit `BLOCKED: which Davit host should I connect to? (default: run locally)`.
3. Test `ssh -o BatchMode=yes <user>@<davit-host> true`. If denied, print the PUBLIC key line and emit `BLOCKED: authorize this key on <user>@<davit-host> (default: wait)`.
4. Verify `davit box ls` and a test `davit box run` + `davit box down`.
