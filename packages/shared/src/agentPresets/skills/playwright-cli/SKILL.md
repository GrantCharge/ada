---
name: playwright-cli
description: "Automate Playwright browser checks/tests via playwright-cli when OpenCode Browse or Ada preview is not the target."
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)
---

# Playwright CLI

Check `native-first-tools` first: prefer **OpenCode Browse** for the user's Chrome or **Ada `preview_*`** for collaborative preview. Use `playwright-cli` for explicit Playwright test suites, CLI automation workflows, or when the preferred browser interface is unavailable.

- Read `playwright-cli --help` and [commands.md](references/commands.md). Open/select the target session, take a fresh snapshot, and refresh element refs after navigation or DOM changes.
- Verify real user-visible behavior, console/network errors, and screenshots when layout matters—a click succeeding is not proof of completion. Preserve unrelated sessions and close only task-owned resources.
- Load references only as needed: [tests](references/playwright-tests.md), [request mocking](references/request-mocking.md), [running code](references/running-code.md), [sessions](references/session-management.md), [storage](references/storage-state.md), [test generation](references/test-generation.md), [tracing](references/tracing.md), [video](references/video-recording.md), [element attributes](references/element-attributes.md).
- Inspecting a form does not authorize external submissions; keep auth/storage artifacts private.
