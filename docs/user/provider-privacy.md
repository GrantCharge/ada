# Provider privacy

Ada collects no [usage data](./telemetry.md), but the provider CLIs it
runs (Claude Code, Codex, Grok Build and the rest) may send usage analytics, error reports and
feedback to their vendors. **Settings > Privacy** turns that traffic off.

## What the page does

- **Block provider telemetry** blocks usage analytics, error reports and feedback uploads for
  every provider at once. It is on by default. When you change a single provider, the switch
  shows **Custom**.
- **Block non-essential traffic** also stops update checks and other optional calls. It is off by
  default because it can break auto-update, cloud features and model lists.
- Each provider has its own row listing what its CLI sends and a switch for each kind of traffic
  Ada can turn off. A switch that is on blocks that traffic.

The choice applies to every machine you're connected to. A machine that was offline when you saved
picks it up the next time a client connects to it. A machine whose server is too old to apply it
is marked **Not applied**; update Ada on that machine.

Changes reach provider processes Ada starts next. Running sessions keep the settings they started
with until they restart.

If you set one of these variables yourself in a provider's environment (for example
`DISABLE_TELEMETRY` in the Claude instance's environment variables), your value wins.

## Best effort

Some CLIs have no switch Ada can set, so Ada sets `DO_NOT_TRACK` and relies on the CLI honoring it:
Kiro, Muse Code, Pi's analytics, and ACP Registry agents. Turn telemetry off in those tools' own
settings too. Cursor documents no client switch at all; use Privacy Mode on your Cursor account.

Some switches have side effects. Blocking Claude's usage analytics also turns off Claude Remote
Control and features Anthropic delivers through flags. Blocking OpenCode's feedback turns off
session sharing.

## Training and retention are account settings

Whether your prompts are used to train models, and how long they are kept, is set on your account
with each vendor, not in the CLI. No client can change it. Each provider row links to its vendor's
account setting where one exists.
