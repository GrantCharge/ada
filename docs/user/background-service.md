# Running Ada in the background

Run Ada as a background user service on Linux, macOS, or Windows so your host stays reachable without keeping a terminal open.

## Manage the service

Install the `ada` CLI first ([Command line](./install.md#command-line)), then run these commands on the host machine:

| Task                                    | Command                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| Set up access from other devices        | `ada up`                                                   |
| Check how other devices reach it        | `ada status`                                               |
| Install and start (or repair)           | `ada service install`                                      |
| Check status and log path               | `ada service status`                                       |
| Update to a newer release               | `ada update`                                               |
| Restart                                 | `ada service restart`                                      |
| Stop and remove from startup            | `ada service uninstall`                                    |
| Remove service, launcher, and downloads | `ada uninstall` (keeps `~/.t3/userdata` and `service.env`) |

- Pairing codes are never written to logs; run `ada pair` or `ada up` on the host to connect a device.
- `ada update` asks before restarting (pass `--yes` in scripts). Pin a version with `ada update <version>`, or downgrade with `--allow-downgrade`.

## Local network access

New services bind to localhost only. Run `ada up --lan` (sets `T3CODE_LAN=true` in `service.env`) to listen on LAN and Tailscale addresses for direct desktop/mobile connections, or `ada up --no-lan` to disable it. Anyone on that network can reach the port (gated by pairing). `T3CODE_HOST` overrides `T3CODE_LAN`. A web app served over HTTPS needs an HTTPS address for the service, such as [Tailscale HTTPS](./remote-access.md#tailscale-https), because browsers block plain HTTP from an HTTPS page.

## Configure the service environment

Add `KEY=VALUE` entries to `service.env` in your Ada home directory (`~/.t3/service.env` by default). Values are literal (quote spaces or `#`; no shell expansion) and survive installs and updates.

```dotenv
T3CODE_PORT=3773
T3CODE_HOST=127.0.0.1
```

- `PATH`, `T3CODE_HOME`, `T3_BOOT_SERVICE_UNIT`, and `T3_SERVICE_LAUNCHER_CONTEXT` cannot be overridden here.
- Run `ada service restart` after editing (and `chmod 600 ~/.t3/service.env` if it holds secrets).

### Ada webhooks without the desktop app

Ada events and webhooks normally come from the desktop app. To have a headless service
send them, open the service's environment in a browser or the mobile app and turn on its
**Server gateway** in Settings → Environments → MCP Gateway (mobile: Settings → Maintenance →
Agent gateway). The service creates the bridge token in `~/.config/t3code/mcp-gateway.env`,
the file the desktop app reads it from, if there is none; **Show token** and **Rotate token**
are on the same row. Webhooks registered with `t3_register_webhook` fire while the service
runs. When you open the desktop app, it takes over and the service steps aside.

Until the setting is saved once, the service follows `T3_MCP_HEADLESS_GATEWAY=1` and
`T3_MCP_HEADLESS_SCOPES` from its environment, as older versions did.

## Platform support

- **Linux**: Requires systemd user services with lingering enabled so Ada starts at boot and survives logout.
- **macOS**: Starts at login, stops at logout. Keep the Mac logged in and awake for unattended access. If agents can't read Desktop/Documents/Downloads, grant Full Disk Access to the `ada` path in `~/Library/LaunchAgents/com.t3tools.t3code.service.plist`.
- **Windows**: Runs windowless via Task Scheduler (`t3code-<domain>-<user>`) while signed in and auto-restarts on exit. Lock the screen instead of signing out for unattended access.

## Keep the server responsive under memory pressure (Linux)

On Linux, agents run at lower priority than the server, but heavy memory use can still trigger the OOM killer. Run as your normal user:

```sh
ada service protect
```

It previews system changes, asks for confirmation and `sudo`, and optionally protects Tailscale and SSH too. Run `ada service restart` for OOM-killer protection to take effect, or `ada service protect --undo` to remove it.

## Troubleshooting

Run `ada service status` on the host to see the log path and health checks:

| Status                                 | Fix                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `linger-disabled`                      | Run `sudo loginctl enable-linger "$(id -un)"` (or `ssh -t your-server '...'`), then retry setup as your normal user. Never run Ada as root. |
| `linger-unavailable`                   | Check `loginctl show-user "$(id -un)" --property=Linger` and verify `systemd-logind`.                                                           |
| `user-manager-unavailable`             | Run `systemctl --user status` in a login session to verify systemd user support.                                                                |
| `service-disabled` / `service-stopped` | Check the log and `systemctl --user status t3code.service`, then run `ada service install`.                                                      |
| `restart-pending`                      | Run `ada service restart` to switch to the newly installed version.                                                                              |

## Trim old threads

Tool output and agent reasoning take up most of the space a thread uses. After a
thread goes 30 days without use, Ada removes them and adds a short note to the
thread saying older detail was trimmed. Messages, plans, file changes and
checkpoints stay, so you can still read, search and continue the thread.
Running, pinned and snoozed threads and threads with an open pull request are
never trimmed.

A trim pass runs every 30 days. If Ada wasn't running when one came due, it runs
a few minutes after the next start. Settings > Maintenance shows when the last
pass ran and when the next is due.

Change the days or turn trimming off with **Trim old threads** in Settings >
Maintenance (web and desktop) or Settings > Threads (mobile). It applies to the
whole environment. On web and desktop, **Trim now** shows how many threads
qualify and about how much space they use, and trims them once you confirm. The
next automatic pass is then 30 days after that. Trimming can't be undone.

On databases created before automatic shrinking, the database file keeps its
size until you [reclaim database space](#reclaim-database-space).

## Reclaim database space

Ada automatically prunes old internal history while keeping conversations. Older databases that still hold freed space show a **Reclaim** button in **Settings → Maintenance** when at least 1 GiB is reclaimable (pauses the server/agents during repair).

For manually started servers (or CLI use), stop any hand-started server or desktop app and run:

```sh
ada doctor          # Interactive repair (auto-stops/restarts a background service)
ada doctor --dry-run
ada doctor --fix    # Non-interactive recommended repairs
```

- Needs free disk space of ~2× active data size (in `TMPDIR`/`/var/tmp` and beside the database). Large databases can take over an hour.
- `ada doctor` optionally offers to remove the legacy pre-0.1.0 `state.sqlite` backup only when all active projects and threads exist in the current database (`--fix` never deletes it automatically).
