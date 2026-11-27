# Updating Ada

Ada clients and servers can run on different machines and must share a compatible orchestration protocol. When a server or provider is behind, the sidebar update button and **Settings → Environments** handle updates.

## Check for updates

Checking for updates from the sidebar's update button, **Settings → About**, or the desktop app menu checks the desktop app you are using, every connected server, and every provider on those servers. On your phone, use **Settings → About → Check for Updates**. Ada then lists each result: up to date, the version available, or why it could not check. When updates are already waiting, the sidebar button opens them and checks again while the list is open.

## Update everything at once

Click the **Update** button at the bottom of the sidebar (web or desktop) to update outdated providers, behind servers, and the desktop app in one step.

- Servers move to the version your desktop app is installing, or to your web app's version. A remote desktop app installs the latest nightly.
- Hover to preview what will update; click while running to view per-machine progress or retry failures.
- Confirmation dialogs show which machines are skipped (offline or manual-only) and how many active threads will pause/resume.
- Choose **Later** on the desktop restart countdown to restart when ready.

## Release channel

Every Ada release is a nightly, published on [GitHub Releases](https://github.com/jayleaton/ada/releases). There is no stable track to switch to. Do not update with T3 Code's installers or its npm package: they replace Ada's server with T3 Code's.

## Continue threads after restarts

**Settings → Maintenance → Continue threads after restarts** is enabled by default. After an update, crash, or reboot (once Ada starts again), supported active threads automatically resume—and threads waiting on subagents or monitors are woken and notified that background work stopped.

- Threads waiting for your approval/answer/secret—or archived, snoozed, or settled—are not auto-resumed.
- After 3 consecutive crash recoveries of an unfinished turn, the thread waits for your next message.
- Updating from V1? Read [Threads from older Ada versions](./thread-migration.md).

## Update a connected server manually

| Situation                           | Action                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background service / desktop server | Click **Update server** in **Settings → Environments** (desktop hosts relaunch automatically).                                                                    |
| Installed `ada` CLI                 | Run `ada update <version>` on the host (then `ada service restart` if you declined the restart prompt). `ada update` with no version moves to the newest release. |
| AppImage headless unit              | Run `t3-headless-update install <version>`; see [Headless Linux host](../operations/headless-linux.md).                                                           |
| Package manager (Nix, AUR)          | Update via your package manager.                                                                                                                                  |

Each server checks npm/Homebrew/pnpm using its own local registry and proxy settings. To download Ada releases through a mirror of [GitHub Releases](https://github.com/jayleaton/ada/releases), set `T3CODE_RELEASE_BASE_URL` for the installer and in the server's environment.

## Update providers

Open **Settings → Providers** and click **Update now** on individual providers or **Update all** across connected environments. Running chats keep using their current CLI until they end; new sessions and model catalogs refresh automatically. (Provider update checks in **Settings → Maintenance** must be enabled to fetch model catalog updates.)

## Mobile updates

- Update connected environments and providers from **Settings → Environments** on mobile.
- Ada's mobile app is not in the App Store or Google Play yet, so install test builds as described in [Mobile app](./install.md#mobile-app). Test builds also download updates in the background; they apply on the next app switch and preserve drafts/queued messages.

## Troubleshooting

- **Version mismatch**: Update whichever side (app or server) the connection notice names.
- **Failed update**: Retry once; confirm you updated the host machine (not just the client) and that only one server owns the Ada home directory.
- **macOS Alpha → Beta**: Open `/Applications/T3 Code (Beta).app` manually and re-pin it to the Dock.
- **Desktop won't start**: Use the recovery window's **Update** button, install the linked last-working version, or **Copy details** for a bug report.
