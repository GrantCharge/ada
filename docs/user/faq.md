# FAQ

## Is Ada a harness?

No. A harness turns an LLM into an agent (tools, execution loop, and results)—like Claude Code's Agent SDK or Codex App Server. Ada drives those harnesses through one fast interface; it does not work without at least one installed agent.

Bring your own: Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, Kiro, Pi, Muse Code, fx, or any [ACP agent](./providers-acp.md). See [Provider setup](./install.md#providers).

## Why use Ada instead of Claude Code or the Codex app?

- **Bring your own subscription**: Use Claude, Codex, and every other agent you already have installed in one place.
- **Remote-first**: Run `ada up` on any box and drive it from anywhere.
- **Native mobile app**: Approve steps, review PRs, and steer threads from iOS and Android.
- **Open source (MIT)**: Fork the source code under your own branding if you ever want something different.

## Can I use Ada with my Claude Code subscription?

Yes.

## How much does Ada cost?

Nothing. You pay your own model/agent providers. Ada itself is free and open source (MIT).

## Why is my Claude 5-hour limit draining so fast?

Current versions of Ada drain your 5-hour limit at the same rate as Claude Code directly (an earlier Anthropic Agent SDK discrepancy has been resolved). If you still see it, [update Ada](./updating.md) on the machine running your agents.

## How do I use Ada remotely?

Your agents run wherever the Ada server runs (desktop, server, or VPS). Run `ada up` on that machine, then pair over your LAN or Tailscale. See [Remote access](./remote-access.md).

## How do I use Ada on my phone?

Ada's mobile app is not in the App Store or Google Play yet. With a test build, connect it to your computer with a pairing link over your LAN or Tailscale. The phone is a remote control—your host computer runs the agents and must stay on. See [Mobile app](./install.md#mobile-app) and [Remote access](./remote-access.md).

## Will I get banned for using my subscription?

Ada runs each provider through its own official CLI, SDK, or ACP binding, the same way you would use it directly. Your provider's terms still apply, so check them if you are unsure.

## Can I add a bunch of accounts for one provider?

Ada intentionally does not include an automatic multi-account switcher to avoid risking provider TOS bans. Adding a separate work/personal account is supported ([Codex](./providers-codex.md#use-multiple-accounts), [Claude](./providers-claude.md#multiple-accounts-and-presets)). For larger pools managed externally (e.g. via [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)), Ada can display pooled limits under Usage ([Connect a hub](./usage.md#connect-a-cliproxyapi-hub)).

## Can I use an API key or OpenRouter instead of a subscription?

Yes. Add another provider instance in **Settings → Providers** with its own environment variables and endpoint (your subscription setup stays untouched). See [OpenRouter for Claude](./providers-claude.md#openrouter-and-local-routers) and [Providers](./install.md#providers).

## Does Ada support local models?

No. Ada focuses on frontier coding agents.

## Does my code go to Ada servers?

No. Your code and prompts go from your machine to your provider (Anthropic, OpenAI, etc.), not to us. Your devices connect straight to your machine over your LAN or Tailscale. Ada doesn't collect usage data. See [Usage data and diagnostics](./telemetry.md).

## Worktrees are eating my disk. How do I clean them up?

Enable automatic cleanup or run **Delete now** in **Settings → Worktrees → Cleanup**. See [Storage cleanup](./project-settings.md#storage-cleanup).

## Is there voice input?

Yes—on-device speech on iOS, Android, and macOS 26+ desktop, or via a paired environment on web/desktop/mobile. See [Voice input](./voice-input.md).

## Does it work on Windows, Mac, and Linux?

Yes, all three (desktop app and CLI). Note: there is no standalone `ada` binary for Intel Macs (use the desktop app there), and Windows users can also run agents inside WSL. See [Install](./install.md).

## Why is my provider not showing up?

Usually the provider CLI is not installed, not signed in, or not on the `PATH` of the **server machine** (especially with version managers). Authenticate on the server machine first (e.g. `codex login` or `claude auth login`) and set **Binary path** in **Settings → Providers** if needed.
