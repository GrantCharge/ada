---
name: new-pattern-project
description: "Bootstrap a Go + Datastar project from Go Fast Stack and verify module paths, naming, repo, and checks."
---

# New Pattern Project

Use for new projects starting from [Go Fast Stack](https://github.com/jayleaton/go-fast-stack) (Go + Datastar + Postgres, not a Node web workspace; Node/pnpm applies only to optional `apps/mobile-app` Expo app). Default destination: `~/Documents/projects`.

- Read [setup.md](references/setup.md) and [bootstrap-go-fast-project.mjs](scripts/bootstrap-go-fast-project.mjs) first.
- Run the bootstrapper with requested slug/name/destination/visibility; pass `--skip-github` unless repo creation is authorized, and `--install --verify` (in Davit or another isolated compute environment if configured). Never overwrite an existing dir.
- Follow the scaffolded `AGENTS.md`, `CONTEXT.md`, `mise.toml`, and `Makefile` (keep pinned Go versions).
- Verify all Go module/import prefixes, display names, mobile IDs, and deploy names match, template remote is replaced/removed, and the new repo's verification checks pass. Do not run deploy targets just to verify a scaffold. Proceed directly to the first requested workflow without a mandatory interview.
