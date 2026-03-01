# Tasks

## Completed
- [x] Create VISION.md with full product spec
- [x] Scaffold AI-native tooling (.context, .claude, .cursor, project docs)
- [x] Decide implementation language → TypeScript + Node.js 20 LTS
- [x] Set up project config (pnpm, tsup, vitest, biome, strict TS)
- [x] Implement CLI skeleton with 3 MVP commands (split, apply, push)
- [x] Config module (cosmiconfig + Zod schema for .stacksmithrc)
- [x] Core types + StackPlan Zod schemas (whole/dissect/delete with inline SliceContent)
- [x] Build diff parser (parse-diff wrapper → DiffFile/DiffHunk)
- [x] Build dependency graph from import analysis (TS + Python)
- [x] Implement file classifier (7 roles: types/core/integration/tests/docs/config/unknown)
- [x] Implement heuristic slicer (bucket by role, topological sort by dependency)
- [x] LLM adapter interface + Claude CLI adapter + AI SDK adapter (BYOK)
- [x] Implement AI planner (prompt builder, structured output, retry loop)
- [x] Implement boundary verification (tsc/py_compile per slice, integrated into split)
- [x] Implement auto-collapse (merge failing slices, renumber, retry)
- [x] Wire `split` end-to-end with validation loop
- [x] Implement `apply` (plan applier: whole/dissect/delete, git branch per slice)
- [x] Implement `push` (force-with-lease, GitHub PRs ready/draft, stack TOC, backfill links)
- [x] Add "tiny diff" bypass (< 300 LOC + ≤ 5 files → single PR, skip AI)
- [x] Add 400 LOC per-slice warning
- [x] Add per-slice file list in PR body
- [x] Handle file deletions and renames in plan applier
- [x] E2E test suite (golden plans, fixture repos, live Claude CLI test)
- [x] 82 tests across 15 test files, all passing

## In Progress

## Backlog

See [docs/ROADMAP.md](docs/ROADMAP.md) for full rationale and competitive context.

### Phase 1: Stack Lifecycle
- [ ] Implement `sync` (rebase downstream PRs after review edits using `git rebase --update-refs`, re-verify, force-push)
- [ ] Implement `next` (rebase on main after PR1 merge, flip PR2 to Ready)

### Phase 2: CI & GitHub Intelligence
- [ ] Query branch protection API before push (detect required checks, force-push restrictions, reviewer counts)
- [ ] Add representative CI lane selector (parse `.github/workflows/*.yml`, pick one matrix combo)
- [ ] Full CI verification mode (run extracted CI commands locally)
- [ ] Remote CI fallback: push drafts early, poll check runs, promote when green (`push --watch`)
- [ ] Thread verification metadata into PR bodies (which checks ran, pass/fail per slice)

### Phase 3: Enterprise Readiness
- [ ] No force-push mode (ghstack-style synthetic branches for strict-ruleset repos)
- [ ] GHES support (custom API base URL, auth flow)
- [ ] Audit logging (structured log of all git/GitHub operations)

### Phase 4: Agent & IDE Integration
- [ ] MCP server (expose split/apply/push as tools for Copilot/VS Code/Cursor/Claude Code)
- [ ] Named splitting strategies (`--strategy layer|feature|module`)
- [ ] Parallel (DAG) stacks (multiple PRs depending on a shared foundation PR)

### Phase 5: Distribution
- [ ] GitHub Marketplace listing
- [ ] GitHub App for automatic reaction to review comments (auto-sync, auto-next)

### Other
- [ ] Real-world smoke test on a non-trivial repo
- [ ] Python fixture repo for broader E2E coverage
- [ ] Add feature flag detection heuristic
- [ ] Support for GitLab / Bitbucket
