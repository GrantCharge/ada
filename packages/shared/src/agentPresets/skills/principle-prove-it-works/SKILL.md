---
name: principle-prove-it-works
description: "Before declaring done, verify the real artifact directly (run it, read actual values, inspect diff)—never proxies or 'it compiles.'"
disable-model-invocation: true
---

# Prove It Works

Verify task outputs against the real artifact directly—never infer from proxies, file mtimes, self-reports, or "it compiles."

- Check live process/runtime state and actual values directly.
- When verification fails, suspect your observation method before the system.
- Prefer a deterministic script, test, or lint over a one-time eyeball; show command + output as evidence. Land lasting checks in repo test/lint targets; keep one-off scripts out of the repo.
- Do not write explanatory docs/ADRs/READMEs or commit generated logs/screenshots unless asked.
