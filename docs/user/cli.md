# CLI reference (`ada`)

The `ada` command (`t3` still works beside it) runs and manages Ada servers, background services, remote access, threads, workflows, and diagnostics. Run `ada --help` or `ada <command> --help` for full flags.

See [Install Ada](./install.md#command-line) for installation (`curl -fsSL https://raw.githubusercontent.com/jayleaton/ada/main/scripts/install.sh | sh` or the PowerShell installer).

## Running and connecting

| Command                  | Description                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `ada [path]` / `ada start` | Start a foreground server and open the web app (optionally in a project directory).                                              |
| `ada serve`               | Start the server without opening a browser (`--lan`, `--tailscale-serve`, `--host`, `--port`, `--base-dir`).                     |
| `ada app [path]`          | Open a directory as a project/thread in the running desktop app.                                                                 |
| `ada up`                 | Interactive setup for remote access over your LAN plus the background service (`--lan`, `--no-lan`, `--yes`).                    |
| `ada status`              | Show how other devices can reach this host (`--json`).                                                                           |
| `ada pair`                | Generate a one-time pairing URL / QR code (`--tailscale`, `--scope <scope>`).                                                    |

## Background service and updates

| Command                       | Description                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ada service`                  | Manage the background service (`install`, `status`, `restart`, `uninstall`, `protect [--undo]`). See [Background service](./background-service.md). |
| `ada update [version]`         | Update `ada` and the service (`--allow-downgrade`, `--yes`).                                                                    |
| `ada install` / `ada uninstall` | Install or remove the `ada` launcher and background service (keeps `~/.t3/userdata`).                                                                |

## Threads, projects, and workflows

| Command       | Description                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ada thread`   | Script threads on the host (`start`, `send`, `show`, `list`; supports `--wait`, `--json`, `--worktree`, `--provider`, `--model`, `--option`). See [Host scripts](./outside-agents.md#host-scripts-ada-thread). |
| `ada project`  | Manage projects on the host (e.g. `ada project add <path> --track <folder>`).                                                                                                                                  |
| `ada workflow` | Start and steer durable workflows (`start`, `list`, `show`, `resume`, `cancel`, `questions`, `signal`, `withdraw`, `hooks`, `store`). See [Workflows](./workflows.md).                                        |

## Environments, auth, themes, and policy

| Command          | Description                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ada environment` | Link or manage peer environments (`ada environment link <addr> --pairing-code <code> --access <mode>`, `--from <file>`).                                |
| `ada auth`        | Manage pairing codes, and sessions (`pairing create`, `session list/revoke/issue`). |
| `ada theme`       | Manage server-published themes (`set <id>`, `clear`, `show`). See [Appearance](./appearance.md#environment-themes).                                    |
| `ada policy`      | Validate, inspect, and generate MDM/GPO templates for [managed policies](./managed-policy.md) (`check`, `show`, `settings`, `templates`).              |

## Diagnostics and maintenance

| Command            | Description                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `ada doctor`        | Inspect database size and reclaim disk space (`--dry-run`, `--fix`).                                       |
| `ada browser setup` | One-time Linux host setup (AppArmor sandbox profile, libraries, fonts) for the headless preview browser.   |
| `ada trace summary` | Summarize local server trace latency and errors (`--since 30m`, `--limit 50`).                             |
| `ada triage`        | Launch Claude Code, Codex, or Antigravity in your terminal with the Ada triage playbook.                    |
