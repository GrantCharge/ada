# Outside agents

Connect external agents (Claude Code or Codex in your terminal, or other OAuth-capable MCP clients on your own devices) to your Ada environment over MCP to read projects/threads, launch and message threads, and monitor events.

## Quick setup

Open the command palette (`Cmd/Ctrl+K`) and run **Use Ada in another app (MCP)** (or open **Settings → Sharing & access**), pick your app, and follow the prompts.

- The dialog shows the environment's Tailscale `/mcp` address, which only devices on your tailnet can reach. Assistants that run in the cloud, such as ChatGPT, claude.ai, or Poke, cannot reach it.
- To also reach other machines through the same connection, keep its agent links on (not paused from the machine's **…** menu in **Settings → Environments → Machines**) and [link them](./remote-access.md#link-another-environment).
- To copy the raw MCP endpoint (`https://<environment-address>/mcp`), open an environment's menu in **Settings → Environments → Copy MCP URL**. OAuth requires `https://` or `localhost` (plain `http://` LAN/Tailscale addresses cannot complete OAuth).

### CLI clients

- **Claude Code**:
  ```sh
  claude mcp add --transport http t3 https://<environment-address>/mcp
  claude mcp login t3   # add --no-browser on headless hosts
  ```
- **Codex**:
  ```sh
  codex mcp add t3 --url https://<environment-address>/mcp
  codex mcp login t3    # add --no-browser on headless hosts
  ```
- **Other OAuth MCP clients on a device that can reach the environment**: Add a custom remote MCP server pointing to `https://<environment-address>/mcp` with **OAuth** authentication (no client ID or secret needed).

## Approve access and permissions

The first time an outside agent connects, approve its sign-in page with a code from **Use Ada in another app (MCP)**, **Settings → Environments**, or `ada auth pairing create` on the host, or from a browser already signed in with permission to manage access. Cloud-hosted agents cannot reach the environment; a Tailscale address works only from devices on your own tailnet.

- **Read only**: Inspect projects, threads, providers, and models.
- **Supervised → Full access**: Also launch, message, and stop threads up to the granted permission mode. Managing [workflow runs](./workflows.md) or using approval-skipping agent modes requires **Full access** (or your policy's maximum mode).
- Sign-ins last **30 days**; revoke anytime in **Settings → Environments**.

## Available tools and limits

Tools that act as a running Ada thread (`delegate_task`, `create_threads`, `request_secret`, `html_render`, `preview_*`, `device_*`, `t3_worktree_handoff`) only work for agents running **inside** Ada.

- Use `t3_thread_launch` + `t3_thread_wait` / `t3_thread_read` to run and follow work.
- Pass `projectId` or `threadId` explicitly (or `allProjects: true` on `t3_thread_list`).
- **MCP Events (`io.modelcontextprotocol/events`)**: Bots can poll, stream, or subscribe via HTTPS webhooks (up to 1-hour leases; latest 1,000 milestones buffered in memory) for turn, approval, PR watch, and workflow events. For local webhook testing, set `T3CODE_MCP_WEBHOOK_ALLOWED_HOSTS=localhost,127.0.0.1` on the server.

## Host scripts (`ada thread`)

On the server machine itself, drive threads directly without OAuth:

```sh
id=$(ada thread start . "Find why the tests are slow")
ada thread send "$id" "Now fix it" --wait
ada thread show "$id"
ada thread list
```

- Pass `--worktree <base-branch>`, `--title` / `--generate-title`, `--provider <id> --model <slug>`, `--option id=value` (e.g. `reasoningEffort=high` for Codex, `effort=high` for Claude), or `-` to read the prompt from stdin.
- `--wait` prints the reply and exits `1` on failure/stop or `2` when waiting for user input. Add `--json` for structured output including the thread ID.
