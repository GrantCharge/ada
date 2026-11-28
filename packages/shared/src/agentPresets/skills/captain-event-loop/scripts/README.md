# watch-children

Blocks until a watched Ada thread needs attention, prints what happened, exits. Run it as a background Bash command.

    watch-children [--timeout <minutes>] <threadId>[@<environmentId>] ...   # default timeout 240

Output, one line per child with an event (exit 0):

- `APPROVAL <threadId> <approvalRequestId> <command>`: waiting on a command approval (answer with t3_respond_to_approval)
- `INPUT <threadId> <questionRequestId>`: waiting on a question (t3_get_pending_questions / t3_answer_question)
- `ENDED <threadId> <status>`: no active run, no pending background tasks, terminal status (confirmed twice, 5 s apart)
- `ERROR <threadId> <message>`: 6 failed reads in a row (~3 min of backoff), such as an unknown id or an unreachable environment
- `TIMEOUT` (exit 2): nothing happened; run it again. Exit 1 means the watcher could not start (`ERROR - ...`).

Omit `@env` for threads on this machine. A thread already in an event state is reported at once. Polls every 15 s, no LLM calls.
Transport: Ada's bundled Node runs `ada acp-mcp-call` (t3_thread_read, t3_get_pending_questions, t3_thread_wait). It uses `T3_ACP_MCP_ENDPOINT`/`T3_ACP_MCP_AUTHORIZATION` if set (ACP agents). Otherwise (Claude Code Bash has neither) it mints a read-only `ada auth session issue --subject mcp-client` token for its lifetime and revokes it on exit.
