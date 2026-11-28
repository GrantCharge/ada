---
name: github-git
description: "Git/GitHub rules (repo AGENTS.md/PR skills override): branch + PR-only, merge once local CI passes unless repo requires human review/merge, no AI trailers, never bypass hooks/checks."
---

# GitHub and git

**Repo wins.** A repo's `AGENTS.md`/`CLAUDE.md`, PR skill, and active ruleset control merge authority and method.

## Workflow

1. Branch first (`git switch -c <topic>`). Never commit, push, force-push, or delete the default branch (`main`/`master`).
2. Commit with the user's configured git identity and **no AI attribution** (`Co-Authored-By:`, `Generated with`, `Assisted-by:`).
3. Run fast checks before every commit and full local CI (e.g. `make check-full`, `scripts/ci-local.sh`) on the exact PR head SHA before opening/merging. Push (`git push -u origin <topic>`), open PR (`gh pr create --base <default>`). Topic-branch rewrites use `--force-with-lease` only.
4. **Who merges (repo-driven):**
   - **Human-merge repo** (repo `AGENTS.md` says a maintainer or the user merges, or ruleset has `required_approving_review_count >= 1`): stop once local/GitHub checks are green and report PR URL + head SHA. Never bypass with `--admin`.
   - **Auto-merge repo** (default for solo repos with 0 required approvals): merge via PR once full local CI (and any GitHub checks) passes: `gh pr merge <n> --squash --match-head-commit <head-sha>` (or `--merge` per repo). Merge independent PRs immediately and dependent stacks bottom-up; re-run full local CI on `main` after landing a stack.
5. **PR watches:** Never call `watch_pull_request` as a delegated child or on local-CI-only repos (no `.github/workflows`).

## Never

- Skip hooks (`--no-verify`, `-n`, `hook.*.enabled=false`, `core.hooksPath`) or CI (`[skip ci]`), or weaken workflows/checks.
- Bypass red checks or a human-merge ruleset with `gh pr merge --admin`.
- Edit/delete existing rulesets without the user's go, or set `ALLOW_DEFAULT_COMMIT=1` / `ALLOW_DEFAULT_PUSH=1`.
- Push release commits directly to default. The user's "publish" approves the release, never direct push.

## Releases

Cut releases ONLY from the merged commit:

```bash
gh pr view <n> --json state,mergeCommit -q '.state + " " + .mergeCommit.oid'   # MERGED <sha>
gh release create <tag> --target <merge-sha> --title <title> --notes-file <notes>
```

## New Repo Bootstrap

Create repo, push initial commit, and protect default branch. Use `required_approving_review_count: 0` for auto-merge repos (default) or `1` if the user asks for human-only merges:

```bash
gh repo create <owner>/<name> --private --source . --push
gh api -X POST repos/<owner>/<name>/rulesets --input - <<'JSON'
{
  "name": "Protect default branch",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false, "require_last_push_approval": false,
        "required_review_thread_resolution": false } }
  ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" } ]
}
JSON
```

Verify `enforcement: active` and `RepositoryRole` 5 with `bypass_mode: pull_request` (never `always`). Put any GitHub required status checks in a separate ruleset with no bypass actors.

## Hooks

Global or repo hooks may block default-branch commits/pushes, staged secrets, and AI trailers, or run the repo's pre-commit and local CI scripts. Fix what they report; never bypass them.
