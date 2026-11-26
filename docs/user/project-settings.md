# Settings and project overrides

Ada separates **device preferences** (saved locally per browser/device, like Appearance and Confirmations) from **server settings** (stored on each environment, like Threads, Worktrees, and Source control).

## Scope and inheritance

Use the **"Applying settings for …"** selector at the top of Settings (web/desktop) or the header filter (mobile) to choose which **environment(s)** and **project** you are editing:

- **All environments**: Bulk-edits every currently connected environment (offline environments keep their values). Controls show **Mixed** where environments disagree.
- **Project scope**: Creates a project override for that setting without changing environment defaults. Settings that cannot be overridden appear read-only.
- **Inheritance order**: `Project override` → `Environment setting` → `t3.json` in the repo → `Built-in default`. Leave a setting on **Inherit** to defer to the next tier.
- Click the **layers icon** beside a server setting to inspect its inheritance chain, jump to overriding projects, or **Reset all** back to the environment default.
- **Per-project providers**: With a project selected in **Settings → Providers**, toggling a provider enables or disables it for that project only (in either direction). Running turns finish; no new turns start on a disabled provider.

## Pin and archive projects

- **Pin**: Pinned projects sort first in project pickers, the command palette, the sidebar filter, and mobile (`mod+shift+p` on a highlighted row, or **Settings → Projects**).
- **Archive**: Archive finished projects in **Settings → Projects** (mobile: **Settings → Projects → Organize**). Archived projects leave pickers while keeping their threads, settings, and files; unarchive anytime from Settings.
- Pinning or archiving a project that exists on multiple machines requires all of those machines to be connected.

## Project icons and multi-repo projects

- **Icons**: In **Settings → Projects**, set an icon, emoji, monogram, or image (applies across checkouts). Without one, Ada generates a two-character monogram (or single CJK character) from the project name.
- **Multiple repositories**: See [Projects with several repositories](./multi-repo-projects.md).

## Worktree settings

Configure worktrees in **Settings → Worktrees** (environment default or project override):

- **Branch naming**: Choose a static prefix (default `t3/`), model-selected semantic prefix (`feat/`, `fix/`), or custom instructions. Falls back to the temporary branch name if generation fails or collides.
- **Submodules** (under Advanced): Defaults to recursive checkout; set to **Top level only** or **Skip** (or `"worktreeSubmodules"` in `t3.json`) for repos with heavy nested submodules.
- **Sparse checkout**: Set `"worktreeSparsePatternsPath"` in `t3.json` to a repo-relative file of Git sparse-checkout patterns (non-cone syntax; requires Git 2.35+; enables `extensions.worktreeConfig`). Set Submodules to **Skip** if you don't want submodules initialized under excluded paths.
- **Worktree location** (per machine): Set an absolute path (e.g. `D:\worktrees` or `~/worktrees`) to store new worktrees elsewhere. Existing worktrees stay where they are; cleanup covers both folders.
- **Fast worktree checkout (macOS beta)**: Enable **Settings → Labs → Fast worktree checkout** (Git 2.42+) to clone new worktrees via APFS copy-on-write from a local cache. Falls back to normal checkout for cross-drive paths, sparse checkouts, or Git LFS/filter repos.

### Storage cleanup

Enable automatic cleanup in **Settings → Worktrees → Cleanup** (off by default; runs on startup, on change, and hourly). Projects can set **Automatic worktree cleanup** to **Inherit**, **Off**, or **Custom**.

- **Triggers**: Inactive days, days after settlement (`0` = next cleanup), merged PRs (including GitHub squash/rebase merges into the default branch), or settled/archived threads with no commits beyond the default branch.
- **Safety**: Active sessions and shared worktrees are never removed. **Keep worktrees with local changes** defaults to **Uncommitted changes** (protects tracked edits and untracked files; removes ignored files like `.env`/build output). Choose **Any local files** (also protects ignored files except `node_modules`) or **Edited tracked files** (protects tracked edits only).
- **Delete with deleted threads**: Enable **Delete worktrees with deleted threads** to automatically clean up safe worktrees once their last thread is deleted.
- **Scratch folders**: Inactive and settled rules also apply to [no-project scratch folders](./thread-sidebar.md#start-without-a-project) (skipped if they contain a Git repo or enabled scheduled task). Because scratch files aren't in Git, deleted files cannot be recovered.
- **Manual run**: Click **Delete now** to run rules immediately and inspect what was removed, kept, or orphaned (untracked folders are listed but never auto-deleted).
- **Captures and logs**: Browser captures and rotated logs have separate machine-wide retention periods.
- **Reclaim a finished thread's worktree**: To free a finished thread's worktree without enabling a policy, ask an agent connected through
Ada's MCP tools to reclaim it (`t3_reclaim_worktree`; a dry run only reports). The thread keeps
its history and branch, and its next turn recreates the checkout. Reclaiming also requires the
latest commit to be included in the remote default branch, so squash-merged branches are kept;
dependency installs and build output may be removed, other ignored files are kept. Every reason a checkout is kept is reported.

## Light worktrees

Build caches inside a checkout, such as `.zig-cache`, are rebuilt and stored again in every new
worktree. Two `t3.json` fields keep worktrees small:

- `worktreeSharedPaths` links each listed folder in every new worktree to one folder per
  repository in the `caches` folder of the Ada home directory. The first link starts from a
  copy-on-write clone of the source checkout's folder when the filesystem supports it. Builds in
  any worktree reuse what the others compiled, whether they run from Ada, an agent, or your own
  terminal. List only caches whose tool allows several builds at once.
- `worktreeClonePaths` clones each listed folder from the source checkout into a new worktree
  before its setup script runs. Clones share disk blocks until a file changes, so they take
  almost no space. They need APFS on macOS or a filesystem with reflinks on Linux, such as Btrfs
  or XFS; elsewhere Ada skips them.

Both take Git-ignored, repository-relative folders. `.git`, `.t3`, and `.env` files are refused.
Ada keeps shared links out of `git status`, and removing or reclaiming a worktree leaves the
shared folder in place, so it only grows. Each shared folder is listed with its size under
**Settings → Maintenance → Cleanup → Last run**; **Clear** empties it, and the next build fills it
again. A build running in one of the repository's worktrees may fail while you clear it. A settle
script that deletes build output must not delete a shared path, because the cache belongs to every
worktree.

Examples by toolchain:

- **Zig:** share the local cache. Zig locks its manifests, so concurrent builds are safe.
  `{ "worktreeSharedPaths": [".zig-cache"] }`. Compiled Zig modules are reused across worktrees.
  As of Zig 0.17, steps that run external commands (`addSystemCommand`) are cached per checkout
  folder, so anything built from their output is rebuilt in each worktree.
- **Rust:** clone `target`, so the first build is incremental:
  `{ "worktreeClonePaths": ["target"] }`. Don't share `target`, because each build replaces the
  binaries another worktree runs. To share compiled crates, use
  [sccache](https://github.com/mozilla/sccache), whose cache is already global.
- **Go:** nothing to add. Go's build and module caches are already shared across checkouts.
- **uv:** nothing to add. uv's cache is global and new environments link to it, so a setup script
  running `uv sync` is fast and small.
- **Next.js:** clone the build cache: `{ "worktreeClonePaths": [".next/cache"] }`. Next.js does
  not document concurrent builds in one cache, so don't share it.
- **pnpm or npm:** clone `node_modules`, then keep `pnpm install` in the setup script. Some links
  in a cloned `node_modules/.bin` still point at the source checkout until the install fixes
  them.

## Keep the default branch current

Enable **Settings → Source control & issues → Automatically pull** to fast-forward clean default-branch checkouts from their configured upstream. Skips checkouts with local changes, untracked files, local commits, other branches, or no upstream.

## Scheduled tasks and webhooks

Create and manage scheduled tasks in **Settings → Scheduled tasks** (web, desktop, and mobile).

- **Schedules**: Recurring fixed-time schedules use the target environment's time zone. **Once** uses your local time zone (runs on reconnect if offline).
- **Destination**: Choose **New thread each run**, **One thread (continue conversation)**, or **One thread (fresh session each run)**. Deleting a target thread deletes tasks bound to it; archiving a target thread causes runs to fail (settle it instead).
- **Controls**: Edit, pause, resume, run now (except webhook tasks), or delete from the list.

### Stale tasks are archived

Tasks that stop doing anything are archived after 10 days: a one-time task after
its run, a task paused or left off for 10 days, a task whose runs have failed at
least three times in a row for 10 days, and a task whose thread has been
archived for 10 days. A webhook task is archived only if its URL received no
request for 30 days since you created or last edited it; a webhook that has run
is never archived for being quiet. Archiving turns the task off.

Choose **Archived** at the top of the list to see these tasks, why each was
archived, and the date it will be deleted, 30 days after archiving. **Restore**
turns a task back on; a one-time task whose time passed opens the editor so you
can pick a new time. Saving an archived task also restores it. A restored
webhook keeps its URL. The 10-day and 30-day windows can't be changed.

### Webhook automations

Choose **On webhook** as a task's schedule to trigger runs from external services (e.g., GitHub PR or CI events). The URL uses the machine's [Tailscale HTTPS](./remote-access.md#tailscale-https) address, so only senders on your tailnet can reach it; outside services such as GitHub or Linear cannot. After you save the task, copy its URL from the editor; without a Tailscale HTTPS address the editor shows only the URL's path. Click **Rotate** to invalidate and replace the URL.

- **Prompt placeholders**: Insert `{{body.path}}`, `{{headers.name}}`, `{{query.name}}`, `{{body}}`, or `{{request}}`. Missing values render empty.
- **Untrusted input protection**: Placeholder values are wrapped in `<webhook-data-…>` tags, and `$`/`@`/leading `/` tokens are neutralized so untrusted payloads can't invoke skills or commands.
- **Signatures** (web/desktop setup): Enable **Require signature** to verify HMAC signatures (for GitHub, keep `x-hub-signature-256`, hex, and `sha256=` prefix with the same secret and `application/json`).
- **Filters**: Add conditions (using paths without braces, e.g. `headers.x-github-event` equals `pull_request`, or `body.action` is one of `opened, reopened`). All filters must match; non-matching requests are logged as **Filtered**.
- **Deduplication & coalescing**: Set a **Duplicate request key** (e.g. `{{headers.delivery-id}}`; ignores repeats for 7 days) or a **Coalesce key** with a 10–3600s window (default 120s; runs once with the latest payload when the window closes). Coalesced updates are rate-limited to 60/min (`HTTP 429`).
- **Idempotency**: A script that may retry a request can send an `Idempotency-Key` header, 1 to 200 printable characters with no spaces. Ada runs the task once per key for 48 hours; a retry with the same key is accepted as a duplicate and answers with the first delivery's id. A malformed key gets a 400 and nothing runs.
- **Offline delivery**: Offline environments return an error; redeliver from the sender once the environment is back.
- **Debugging**: Open **Deliveries** from a task's menu (web/desktop) to inspect recent payloads and rendered prompts.

### Trigger a webhook only when something changes

`ada watch` turns external state into a webhook call without spending a model
run on polling. It probes a file, an HTTP endpoint, or a command's exit status,
and sends one POST to your webhook task only when a value changes into one you
listed. While nothing changes it sends nothing. Send actionable changes only,
never routine progress.

```json
{
  "name": "build-box",
  "webhookUrl": "https://<the webhook URL shown for the task>",
  "intervalSeconds": 30,
  "probes": [
    { "kind": "file", "name": "lease", "path": "/var/run/build.lease", "notify": ["present"] },
    {
      "kind": "http",
      "name": "api",
      "url": "http://localhost:8080/health",
      "notify": ["status:500", "unreachable"]
    },
    {
      "kind": "command",
      "name": "backup",
      "argv": ["/usr/local/bin/check-backup"],
      "notify": ["exit:1"]
    }
  ],
  "deadlines": [
    {
      "name": "backup-by-dawn",
      "at": "2026-10-12T06:00:00Z",
      "unless": { "probe": "backup", "value": "exit:0" }
    }
  ]
}
```

Values are `present`/`absent` for files, `status:<code>`/`unreachable` for HTTP,
and `exit:<code>`/`timeout` for commands (add `"output": true` to use the first
line of stdout instead). `"*"` in `notify` means any change. The first run
records a baseline and sends nothing unless a probe sets `"notifyInitial": true`.
Commands run directly, without a shell. The webhook URL can be the direct or
Tailscale URL. Failed deliveries retry, and a still-undelivered
event is re-sent with the same `Idempotency-Key` on the next run.

Use the `ada` command from the same Ada release as your server. Earlier
releases and the `ada` package on npm don't include `watch`, so if `ada watch`
reports an unknown command, that `ada` is too old.

- **Desktop app:** the app keeps its own launcher at `~/.t3/bin/t3`, or
  `%USERPROFILE%\.t3\bin\t3.cmd` on Windows (under your Ada home if you changed
  it). [The `ada` command](./install.md#the-ada-command) explains how to put it on
  your `PATH`.
- **Server without the desktop app:** use the standalone `ada` CLI built with
  the same release, not one installed from npm.

Run `ada watch /path/config.json --once` from a scheduler, or `ada watch
/path/config.json --interval 30` under any supervisor. Progress is kept next
to the config, in `config.json.state.json`.

Each state file is one watcher: it holds a single-writer lock while a run is in
progress, so overlapping scheduled runs skip safely instead of sending twice or
failing. A crashed run's lock is reclaimed automatically. The state file also
carries the watcher's identity, which is part of every `Idempotency-Key`. Don't
copy a state file to another host or machine; give each its own. To start fresh,
delete the state file.

Schedulers don't read your shell's `PATH`, so give them absolute paths for
both the `ada` launcher and the config. These examples use the desktop app's
launcher. Check them against your scheduler's own documentation before relying
on them:

- Linux: a cron line such as
  `* * * * * /home/me/.t3/bin/t3 watch /home/me/watch/config.json --once`, or a
  systemd user timer with the same command.
- macOS: a launchd agent with `ProgramArguments` of `/Users/me/.t3/bin/t3`,
  `watch`, `/Users/me/watch/config.json` and `--once`, and `StartInterval`
  `60`. launchd skips runs while the Mac sleeps.
- Windows, from Command Prompt (paths with spaces keep their inner `\"`
  quotes):

  ```bat
  schtasks /Create /TN t3-watch /SC MINUTE /TR "\"%USERPROFILE%\.t3\bin\t3.cmd\" watch \"C:\watch\config.json\" --once"
  ```

The command exits non-zero while an event is still undelivered, so schedulers
show the failure.
