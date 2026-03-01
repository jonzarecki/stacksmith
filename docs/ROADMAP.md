# Roadmap

Derived from competitive analysis ([market-analysis](reference/market-analysis-ai-for-stack-prs.md)), direct competitor research (Branchlet, GitHub Marketplace app, danielsinai/pr-splitter, Google splitbrain), and community patterns (Zenity Engineering, SeriousBen blog posts on AI-era PR splitting).

## Competitive Landscape (as of March 2026)

No competitor ships the full loop: **split + verify CI + maintain stack through reviews**.

| Competitor | Auto-split | CI verification | Stack maintenance | Status |
|---|---|---|---|---|
| Branchlet (branchlet.dev) | Marketed (AST + semantic) | No | No | Waitlist; shipped repo is just a worktree manager |
| GitHub Marketplace "Stacked PRs" | File-level, no AI planning | Merge gating only | No | Beta, ~133 installs |
| danielsinai/pr-splitter | Semi-automated via Claude Code | No | No | Shipped as `/split-pr` slash command |
| Google splitbrain | Unknown | Unknown | Unknown | Internal research, no public code |
| Graphite | Manual (`gt split`) | CI-aware merge queue | Restack only | Shipped, market leader for manual stacking |
| Aviator CLI | Manual | Merge queue | Restack only | Shipped, OSS |

Stacksmith's working split + boundary verification + apply pipeline is ahead of every entrant on automated decomposition. The **sync/next lifecycle** remains the biggest unclaimed differentiator.

---

## Phase 1: Stack Lifecycle (highest impact)

`sync` and `next` are what no competitor does. They turn Stacksmith from "a splitter" into "a stack manager."

### `sync` -- restack after review edits
- Rebase PR2..n onto updated PR1
- Use `git rebase --update-refs` (Git 2.38+) as the foundation -- automatically updates branch pointers during rebase instead of manual branch-by-branch work
- Re-run boundary verification for affected slices
- Force-push downstream branches
- Update PR bodies with "restacked due to changes in PRk"

### `next` -- advance after merge
- Rebase stack onto `main`
- Convert PR2 from draft to ready
- Leave PR3..n as draft
- Handle the case where PR1's merge commit diverges from the stack branch

---

## Phase 2: CI & GitHub Intelligence

### Query branch protection API
- Call `octokit.repos.getBranchProtection()` before pushing to detect:
  - Required status checks (feed into verification)
  - Force-push restrictions (switch push strategy automatically)
  - Required reviewer counts (surface in CLI output)
- Warn early if repo rulesets will block the stack workflow

### Representative CI lane selector
- Parse `.github/workflows/*.yml` for `pull_request`-triggered jobs
- Pick `ubuntu-latest` + one matrix combination (Node: `.nvmrc`/`engines.node`; Python: highest in matrix)
- Extract runnable `run:` commands
- Fall back to "push drafts + watch remote CI" when workflows need secrets/services

### Remote CI fallback (Mode B)
- Push all branches as drafts early
- Poll GitHub check runs for each PR
- Only promote top PR to "ready" when all layers are green
- Surface as `push --watch` or `push --ci-mode=remote`

### Verification metadata in PR body
- Thread `metadata.verification` results into `generatePrBody()`: which checks ran locally, pass/fail per slice
- Trust signal for reviewers: "Boundary verified: tsc passed, pnpm test passed"

---

## Phase 3: Enterprise Readiness

### No force-push mode
- Current `push` uses `--force-with-lease` unconditionally
- Enterprise repos with strict rulesets can block force pushes even on feature branches
- Implement ghstack-style synthetic branch approach as alternative:
  - Create `stack/01-xxx/orig` branches (never force-pushed)
  - Update via new commits instead of rewriting history
- Auto-detect restriction via branch protection API and switch strategy

### GHES support
- Different API base URL (`https://{hostname}/api/v3`)
- Potentially different auth flows
- Graphite only supports GHES for Enterprise customers; being CLI-only makes this easier

### Audit logging primitives
- Log all git operations performed (branches created, force-pushes, PR mutations)
- Write structured log to `.stacksmith/audit.log` or configurable path
- Foundation for enterprise "what did the tool do and when" requirement

---

## Phase 4: Agent & IDE Integration

### MCP server
- Both Graphite and GitHub are moving toward MCP-based agent interoperability
- Expose `stacksmith split`, `stacksmith apply`, `stacksmith push` as MCP tools
- Enables Copilot / VS Code / Cursor / Claude Code to call "split this diff into a PR stack" as a tool action
- danielsinai/pr-splitter as a Claude Code slash command validates this distribution surface

### Splitting strategies (learn from Branchlet's `--strategy` flag)
- `--strategy layer` (current default): contracts -> core -> wiring -> tests
- `--strategy feature`: vertical slices, one feature per PR
- `--strategy module`: split by package/directory boundaries
- User-configurable via `.stacksmithrc`

### Parallel (DAG) stacks
- Current model is strictly linear (PR1 -> PR2 -> PR3)
- Zenity guide discusses parallel PRs where multiple PRs depend on a single foundation PR
- DAG stacks allow independent features to be reviewed in parallel after a shared base
- Deferred because GitHub's PR model makes DAG stacks harder to manage, but worth building once linear stacks are battle-tested

---

## Phase 5: Distribution & Go-to-Market

### GitHub Marketplace listing
- GitHub supports free/flat/per-unit pricing plans
- Low friction distribution for GitHub-native users

### GitHub App (automatic stack reactions)
- Auto-trigger `sync` when review comments land on a stack PR
- Auto-trigger `next` when a stack PR merges
- Team-wide visibility without requiring everyone to install the CLI

### Open-core pricing model (from market analysis)
- **Free**: local CLI, BYOK LLM, basic split/apply/push, OSS
- **Teams**: policy packs (max PR size, enforced checks), shared templates, support
- **Enterprise**: GHES, audit logs, SSO, private model gateway / on-prem runner

---

## Validated Decisions (confirmed by analysis)

These choices are explicitly validated by competitor research and market dynamics:

- **Local-first CLI** -- strongest enterprise security posture; "no code leaves the machine" except LLM call
- **BYOK LLM** -- matches the strongest enterprise procurement trend across AI devtools
- **Linear review flow** (top = ready, rest = draft) -- matches Graphite's model and reviewer expectations
- **Auto-collapse on verification failure** -- no competitor does this
- **Tests colocated with code** -- prevents standalone "tests only" slices that break CI
- **Stack TOC + depends-on links** -- table stakes, all stack tools do this
- **"Never change semantics" constraint** -- differentiator vs. AI agents that may rewrite intent
- **Stack equivalence verification** -- diffs last stack branch against source to confirm no drift
