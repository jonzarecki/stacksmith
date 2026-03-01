# Stacksmith - Vibe Coding PR Tool

## Core Concept

**"Stacked PRs, but generated and maintained automatically from a big vibe-coded blob."**

Take a messy, large diff produced by AI-assisted ("vibe") coding and automatically split it into a clean, ordered stack of reviewable PRs -- then keep that stack consistent as reviews come in.

## The Problem

Stacked PR workflows already exist (Graphite, Meta's Sapling, Gerrit, Phabricator), but they assume the developer *already* produced a sensible commit stack. In vibe coding, you typically end up with one giant diff. The gap is: **take that messy reality and turn it into a clean stack, then keep it consistent as reviews come in.**

## What the Tool Does

### 1) Input: "Vibe Artifact"

- Takes a branch/PR with a large diff (and optionally the chat transcript / prompts / plan)
- Builds a dependency graph of changes: files, symbols, tests, migrations, config, UI, API, docs

### 2) Dissect: Ordered PR Stack

Generates a stack like:

1. **Prep PR**: formatting, dead code removal, trivial refactors (optional)
2. **Scaffolding PR**: interfaces/types/schemas, empty endpoints, feature flags
3. **Core Logic PR**: implementation behind interfaces
4. **Integration PR**: wiring, routes, DI, config
5. **Tests PR**: unit + integration + smoke tests
6. **Docs PR**: README, usage, changelog

### 3) Maintain: Stack Lifecycle

After initial split, keeps the stack healthy through review cycles, rebases, and merges.

---

## Key Design Decisions

### Constraint: Never Change Semantics

The tool must only do **mechanical operations**:
- Move hunks between commits
- Reorder commits
- Rebase + conflict resolution (only straightforward textual conflicts)
- If conflict is non-trivial, stop and ask the coder to resolve

### AI Agent with Two-Phase Loop

1. **Planner agent** -- outputs a deterministic JSON plan
2. **Validator loop** -- applies plan locally, runs checks, feeds failures back to the agent, agent revises (usually merges PRs or moves hunks)

This prevents hand-wavy "AI split" that doesn't compile.

### Layered Stacks (MVP Default)

Contracts -> core -> wiring -> tests. Works great for backend/libs. Start with **layered** for MVP, add "vertical slicing mode" later for strict cultures.

### PR Workflow: Linear Review

- PR1 = Ready for review, PR2..PRn = Draft
- When PR1 merges, PR2 flips to Ready, PR3..n stay Draft
- Avoids reviewers looking at code that might churn

### CI Must Pass

- Every PR must be **independently coherent** and pass CI
- Max stack size is **dynamic**: as many PRs as possible *while staying green*
- If a slice can't stay green, auto-merge adjacent slices until green
- If entire stack collapses to 1 PR: "CI structure doesn't allow splitting safely"

### "Tiny" Diff Heuristic

If diff is < 300 LOC changed and <= 5 files (configurable), produce a single PR instead of a stack.

### Stack Size Defaults

- Target: **5 PRs**, soft cap **6**, hard cap **10**
- Verification will collapse boundaries as needed anyway

---

## Target Market & Wedge

Easiest to hardest:

1. **Backend services / libraries (best wedge)** -- Clear layering, less CSS/UI noise, tests work as acceptance gates
2. **Infra (Terraform/K8s)** -- Sliceable by modules/envs, but reviewers demand "atomic safety"
3. **Full-stack web apps (hardest)** -- UI churn, file scatter, "touch everything" changes

**Start with backend + libs on GitHub.** Keep "web app" as a later vertical.

### Language Support (MVP)

- **TypeScript** and **Python**

---

## CLI Design

### Commands

| Command | Description |
|---------|-------------|
| `stacksmith split` | Analyze diff + transcript, propose stack (JSON plan) |
| `stacksmith apply` | Create commits/branches for each slice locally |
| `stacksmith verify` | Run representative CI lane locally per PR boundary |
| `stacksmith push` | Push branches + open GitHub PRs (top = Ready, rest = Draft) |
| `stacksmith sync` | After fixing PR1 from review: rebase PR2..n, re-verify, force-push downstream |
| `stacksmith next` | After PR1 merged: rebase on main, flip PR2 to Ready |

### `split` -- Inputs & Outputs

**Inputs:**
- Current branch (the big vibe diff)
- Optional chat transcript (only for PR titles/descriptions)

**Outputs:**
- `stack.plan.json` (machine-applicable plan)

**Plan structure:**
- PR list in order
- For each PR: selected files + (optionally) hunk ranges + title + rationale + required checks + safety notes

### `apply`

- Creates **new commits** from scratch according to the plan (don't preserve old commits)
- Creates local branches: `stack/01-...`, `stack/02-...`, etc.

### `verify`

- Parses `.github/workflows/*.yml`
- Chooses a **representative lane** (ubuntu-latest, highest stable language version)
- Extracts runnable commands when possible
- Runs them per PR boundary
- If PR k fails: auto-merge PR k + PR k+1, re-run, repeat until green or collapsed to 1

### `push`

- Pushes stack branches
- Opens PRs on GitHub: PR1 **Ready**, PR2..n **Draft**
- Each PR body includes: depends-on link, what CI was run locally, "All lanes enforced on GitHub Actions"

### `sync` (after review edits on PR1)

- Rebases PR2..n onto updated PR1
- Re-runs verify for affected boundaries
- Force-pushes downstream branches
- Updates PR bodies with "updated due to changes in PR1"

### `next` (after PR1 merge)

- Rebases stack onto `main`
- Converts PR2 draft -> ready
- Leaves PR3..n draft

---

## AI Agent: Splitting Heuristics

### Inputs to the Agent

- Full git diff (or patch)
- Repo tree + key files (package.json/pyproject, test configs, CI workflow)
- Dependency signals (imports graph)
- (Optional) chat transcript for "intent labels" only

### Agent Optimization Goals

1. Boundaries that are likely to stay green (compile/lint/tests)
2. Minimal cross-PR dependencies
3. Reviewable slices

### Heuristic Slicing Rules (TS + Python)

**Buckets** (merge/collapse as needed to keep CI green):

1. **Additive foundations**: new modules/types/helpers that don't break lint
2. **Core behavior**: logic changes + unit tests
3. **Wiring**: routes/DI/config + integration tests
4. **Docs/examples**

**Splitting Signals:**
- **Import dependency**: don't put a file in PR2 if PR1 imports it
- **Test ownership**: tests should sit with the behavior they validate
- **Entrypoints**: wiring changes last unless required for lint
- **Migrations/schema**: isolate only if compatible; otherwise bundle with minimal app changes that make tests pass

**Don'ts:**
- Don't split within a single small function unless forced
- Don't create "refactor PR" + "feature PR" if it risks CI failures
- If TS lint complains about unused exports: keep the first usage in the same PR, or collapse PRs (don't add dummy usage)

### File Classification by Role

- `types/schemas` (proto/openapi/types)
- `core` (lib, domain)
- `integration` (routes/controllers/DI)
- `tests`
- `docs`

Then order by dependency (imports/symbol references) and cap to 5-8 PRs by merging adjacent buckets when small.

---

## CI Inference from GitHub Actions

### What You Can Infer

From `.github/workflows/*.yml`:
- Which workflows run on `pull_request` / `pull_request_target`
- Job matrix (node/python versions, OS)
- The actual `run:` commands (npm/pnpm/yarn, pytest, ruff, mypy, etc.)
- Required status checks (implicitly)

### Two Enforcement Modes

**Mode A -- "Local equivalent" (fast, best dev UX):**
- Parse workflows, identify test commands
- Run them locally **before** creating PRs
- If it fails, merge slices and retry

**Mode B -- "CI is the source of truth" (always correct, slower):**
- Generate stack PRs as Draft
- Let GitHub Actions run
- Only promote to Ready when green
- If PRk fails, revise slicing and force-push

**Default:** Mode A. Auto-fallback to Mode B when workflows are non-local (secrets/services/composite actions).

### Representative Lane Selection

- Pick the first job that runs on `pull_request` and contains test steps
- Choose `ubuntu-latest`
- Pick one matrix combination:
  - Node: repo's `.nvmrc` / `engines.node` / otherwise latest in matrix
  - Python: `python-version` default / otherwise highest in matrix

---

## Feature Flags: When They Help (and When They're Poison)

Feature flags help split "scaffolding" from "behavior change" without breaking main:
- PR1 adds plumbing + flag default OFF (low-risk structure)
- PR2 implements behavior behind the flag (logic focus)
- PR3 flips flag or enables in config

**But in strict cultures, flags are hated if:**
- They add permanent complexity
- They're used to smuggle half-baked behavior
- No cleanup plan exists

**Tool policy:** Don't decide globally. Detect repo policy (config), propose flag use only when needed to keep PRs mergeable, and enforce "flag removal PR" if flags are allowed.

---

## Force-Push Policy

- Only ever force-push **stack branches** (`stack/*`)
- Never force-push the user's original branch
- Include a PR footer: "This PR is part of an auto-maintained stack; history may be rewritten."

---

## GitHub App (Future)

CLI wins for MVP + early adopters. GitHub App becomes necessary for:
- **Automatic reaction** to review comments (triggers stack rebase + downstream updates)
- **Team-wide consistency** (everyone sees the same stack status without running CLI)
- **Enterprise-friendly auth + governance**

Early on, 80% of value can be simulated with CLI (`sync` after review, `next` after merge).

---

## Demo Script

Pick one TS repo and one Python repo that has GitHub Actions, runs locally without secrets, and has at least lint + unit tests.

1. Show huge diff on a branch
2. Run `split -> apply -> verify -> push`
3. Show PR stack created (top ready, rest draft)
4. Make a small fix in PR1
5. Run `sync` and show downstream rebased cleanly

---

## Naming

**Stacksmith** was chosen as the product name. "Forging clean stacks from messy code."

- Memorable, dev-native
- Works for enterprise + OSS
- Implies transformation, not automation gimmick
- "VibeStack" was rejected because the name is already taken by multiple products (merchant software, AI app builder, LinkedIn company, GitHub repos/orgs)

### Prior Art / Related Tools

- Graphite (stacked diffs guide)
- Meta's Sapling (stack workflow)
- Gerrit / Phabricator (dependent changes model)
