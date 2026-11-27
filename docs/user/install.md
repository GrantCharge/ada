# Install Ada

Ada runs coding agents on your computer (or server) and lets you control them from the desktop app, web app, or mobile app. Install Ada on the machine where your agents will run first.

## Requirements

You need at least one installed, authenticated coding agent (provider) before starting a thread. You can launch Ada first and set up providers from the [Welcome page](./welcome-page.md) or **Settings → Providers**.

## Command line

Install the `ada` command (and `t3` beside it for existing scripts) to `~/.local/bin`:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/jayleaton/ada/main/scripts/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/jayleaton/ada/main/scripts/install.ps1 | iex
```

If `~/.local/bin` is not on your `PATH`, the installer says so and prints a command to add it. An `ada` or `t3` that the installer or desktop app did not create is left alone.

Every Ada release is a nightly, so the installer follows the nightly channel. Set `T3CODE_VERSION=<version>` to pin an exact version. Each [release](https://github.com/jayleaton/ada/releases) also carries `install.sh` and `install.ps1`. Use only these scripts: T3 Code's installers and its npm package install T3 Code's server and replace Ada's.

For a headless host, run the installer and then `ada service install`. The background service is the only headless setup that the app's **Update** button can update ([details](./background-service.md)). Hosts that already run the AppImage-based systemd unit can keep following [Headless Linux host](../operations/headless-linux.md).

| Task                          | Command                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| Start server and open web app | `ada` (or `ada ./my-project`)                                            |
| Start server without browser  | `ada serve`                                                              |
| Set up remote access          | `ada up` ([Remote access](./remote-access.md))                           |
| Run in the background         | `ada service install` ([Background service](./background-service.md))    |
| Update                        | `ada update`, or `ada update <version>`                                  |
| Reclaim database space        | `ada doctor` ([Details](./background-service.md#reclaim-database-space)) |
| Uninstall                     | `ada uninstall`                                                          |

If `ada` reports a server is already running, connect with the `ada pair` command it names or pass a separate `--base-dir`. Run `ada --help` for all commands.

### Intel Macs

There is no `ada` executable for Intel Macs—use the desktop app, or build a server from source with `vp` ([development runbook](../operations/00_development.md#first-checkout)):

```bash
git clone https://github.com/jayleaton/ada
cd ada && vp i && vp run build:desktop
node apps/server/dist/bin.mjs
```

`ada update` and the background service do not apply to a server run this way; update it with `git pull` and a rebuild.

## Desktop app

Download a release from [GitHub Releases](https://github.com/jayleaton/ada/releases): a `.dmg` for macOS, an `.exe` for Windows, and an AppImage or `.deb` for Linux (x86_64 and ARM64; on Debian or Ubuntu, `sudo apt install ./Ada-*.deb`). Package managers such as winget, Homebrew, the AUR, and Nix install T3 Code, not Ada.

- **Linux AppImage**: `chmod +x ./Ada.AppImage && ./Ada.AppImage`, using the exact filename you downloaded. The `.deb` self-updates with a password prompt; if your desktop has no prompt, the update fails, so download and install the new `.deb`.

### The `ada` command

The desktop app bundles `ada` and sets it up on first launch (manage anytime under **Settings → About → ada command**). On macOS and Linux it adds `ada` and `t3` links in `~/.local/bin` (or `~/bin`); on Windows it adds the app's command folder to your `PATH`. Use **Add to PATH** if needed, then open a new terminal. **Remove** takes it off and the app does not add it again. An existing `ada` or `t3` stays as it is.

- **Open a folder in the running desktop app**: Run `ada app` (or `ada app ../my-project`) from a terminal, or drag folders from your file manager onto the desktop sidebar.

### Windows Subsystem for Linux

Select a WSL distro in **Settings → Environments** to run agents and projects inside WSL (install provider CLIs inside that distro). Ada manages its own server runtime inside WSL automatically.

## Mobile app

Ada's mobile app is not in the App Store or Google Play yet. The phone connects to an Ada server on another machine: follow [remote access](./remote-access.md) to pair it with a pairing URL or QR code. Until it is listed, iPhone and iPad test builds are available through TestFlight by invitation. There is no public Android build yet.

- If the mobile app crashes on launch, open **Settings → Diagnostics** on the next launch to copy recent startup crash reports.

## Providers

Open **Settings → Providers** (web or desktop), select the environment, and enable the providers you use. Installation and sign-in always happen on the **environment's machine**.

| Provider         | Install and authenticate                                                                                                 | Guide                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Codex**        | Connect with ChatGPT in Settings, or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. | [Codex](./providers-codex.md)              |
| **Claude**       | Install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`.                               | [Claude](./providers-claude.md)            |
| **Cursor**       | Sign in in Settings or install [Cursor CLI](https://cursor.com/cli) and run `agent login`.                               | [Cursor](./cursor.md)                      |
| **Grok Build**   | Install [Grok Build CLI](https://x.ai/cli) and run `grok login`.                                                         | [Grok](./providers-grok.md)                |
| **Antigravity**  | Install managed runtime and sign in with Google in Settings.                                                             | [Antigravity](./providers-antigravity.md)  |
| **OpenCode**     | Install [OpenCode](https://opencode.ai) and run `opencode auth login`.                                                   | [OpenCode](./providers-opencode.md)        |
| **Kiro**         | Install [Kiro CLI](https://kiro.dev/docs/cli/) and run `kiro-cli login`.                                                 | [Kiro](./providers-kiro.md)                |
| **Pi**           | Install [Pi](./providers-pi.md) (Node.js 22.19+) and run `pi` → `/login`.                                                | [Pi](./providers-pi.md)                    |
| **Muse Code**    | Install [Muse Code](https://dev.meta.ai/docs/muse-code) and run `muse login`.                                            | [Muse Code](./providers-muse.md)           |
| **fx**           | Install [fx](https://fx.sh) and run `fx login`.                                                                          | [fx](./providers-fx.md)                    |
| **Command Code** | Install [Command Code](./providers-commandcode.md) with `npm install -g command-code` and run `commandcode login`.       | [Command Code](./providers-commandcode.md) |
| **ACP Registry** | Add GitHub Copilot and other agents in **Settings → Providers → Add provider → Show more**.                              | [ACP](./providers-acp.md)                  |

- **Binary path**: If a CLI isn't on the server's `PATH` (common with version managers), set **Binary path** in the provider's settings.
- **Updates**: Click **Update now** on outdated provider cards (supports Homebrew, mise `latest`, npm/pnpm/Yarn/Bun/Volta/Vite+, or the CLI's own updater; update Nix, Chocolatey, or pinned mise installs manually).
- **Multiple instances**: Add extra provider instances for separate accounts, API keys, or custom endpoints (mark secret env vars as sensitive).

### Provider check timeouts

If a working CLI times out during Ada's readiness check, increase its probe deadline (in milliseconds) in the server's environment (or systemd override / `service.env`) and restart:

```bash
T3CODE_CODEX_PROBE_TIMEOUT_MS=60000 T3CODE_CLAUDE_PROBE_TIMEOUT_MS=60000 ada serve
```

| Provider     | Environment variable                   |
| ------------ | -------------------------------------- |
| Codex        | `T3CODE_CODEX_PROBE_TIMEOUT_MS`        |
| Claude       | `T3CODE_CLAUDE_PROBE_TIMEOUT_MS`       |
| Cursor       | `T3CODE_CURSOR_PROBE_TIMEOUT_MS`       |
| Antigravity  | `T3CODE_ANTIGRAVITY_PROBE_TIMEOUT_MS`  |
| Grok         | `T3CODE_GROK_PROBE_TIMEOUT_MS`         |
| Kiro         | `T3CODE_KIRO_PROBE_TIMEOUT_MS`         |
| fx           | `T3CODE_FX_PROBE_TIMEOUT_MS`           |
| Pi           | `T3CODE_PI_PROBE_TIMEOUT_MS`           |
| Muse Code    | `T3CODE_MUSE_PROBE_TIMEOUT_MS`         |
| OpenCode     | `T3CODE_OPENCODE_PROBE_TIMEOUT_MS`     |
| ACP Registry | `T3CODE_ACP_REGISTRY_PROBE_TIMEOUT_MS` |

## Next steps

- [User guide index](./README.md): overview of how Ada works.
- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): control when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Updating Ada](./updating.md): keep apps, servers, and providers up to date.
- [Managed policy](./managed-policy.md): configure Ada for everyone on a machine.
