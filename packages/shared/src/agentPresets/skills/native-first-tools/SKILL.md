---
name: native-first-tools
description: "Tool routing: Ada computer use for desktop/GUI, OpenCode Browse or Ada preview for browser, native image tools first; restrict third-party computer-use/image fallbacks to models lacking them."
---

# Native-first tool routing

Check the current thread's callable tools before desktop, browser, or image work.

- **Explicit user choice wins.** If unavailable, report the concrete limit; never silently substitute.
- **Desktop / GUI computer use:** Use **Ada's built-in computer-use tools** (`computer_status`, `computer_look`, `computer_act`, `computer_use`, `computer_control`) first—works across connected hosts. Never ask the user to fix a third-party tool's "Accessibility permission" unless the user explicitly chose that tool.
- **Browser work:** Use **OpenCode Browse** (Chrome extension/plugin) for the user's browser, or **Ada `preview_*`** collaborative preview tools for previewable pages. Use `playwright-cli` for explicit Playwright test/CLI workflows. Never invoke a third-party screen-control tool just to inspect a browser.
- **Images:** Use the provider's built-in image generation/editing tool when available (e.g., Codex `image_gen`, Antigravity `image-generator`). Deliver directly or save in project—don't upload to external storage by default.
- **Restricted fallback:** Third-party computer-use and image-generation tools (e.g. an MCP server's screen control or a local image router) are automatic fallbacks ONLY for models without Ada computer use or native image tools. Failed calls or cost do not unlock fallback.
- **Normal storage tools:** Ordinary file/artifact storage, sharing, clipboard, and device transfer tools remain normal tools. Use fallback image procedures only when fallback applies or the user chose them.
