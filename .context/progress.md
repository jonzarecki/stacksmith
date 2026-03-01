# Progress

## Session 0 — Project Setup
- Created VISION.md with full product spec (CLI commands, AI agent design, CI inference, heuristics)
- Scaffolded AI-native tooling (.context, .claude, .cursor, CLAUDE.md, ARCH.md, TASKS.md)

## Session 1 — Architecture Planning
- Decided on TypeScript + Node.js 20 LTS
- Chose hybrid LLM strategy: Claude CLI (existing subscriptions) + BYOK via Vercel AI SDK
- Designed AI-driven file dissection with inline intermediate file contents in plan JSON
- Scoped MVP to 3 commands: split, apply, push
- Deferred verify, sync, next to roadmap

## Session 2 — MVP Implementation (all 17 tasks complete)

### Phase 1: Foundation
- Project scaffolding (pnpm, tsup, vitest, biome, strict TS)
- CLI skeleton with Commander (3 commands)
- Config module (cosmiconfig + Zod schema for .stacksmithrc)
- Core types + StackPlan Zod schemas (whole/dissect with inline SliceContent)
- Diff parser (parse-diff wrapper → DiffFile/DiffHunk)
- Dependency graph builder (TS + Python import analysis)
- File classifier (regex-based role detection: types/core/integration/tests/docs/config)
- Heuristic slicer (bucket by role, topological sort by dependency)

### Phase 2: AI Planner + Split
- LLM adapter interface + two implementations:
  - ClaudeCliAdapter (subprocess to `claude -p`, uses existing subscription)
  - AiSdkAdapter (Vercel AI SDK, BYOK for Anthropic/OpenAI/Google/Ollama)
- Prompt builder (system prompt + plan generation + revision prompts)
- Planner orchestrator (adapter resolution, retry loop with validation)
- Split command wired end-to-end

### Phase 3: Apply + Push
- Git operations module (simple-git wrappers)
- Branch manager (stack branch lifecycle)
- Plan applier (write files from plan, whole + dissect strategies)
- Apply command wired end-to-end
- GitHub PR manager (Octokit, ready/draft, stack TOC, depends-on links)
- Push command wired end-to-end

### Phase 4: Verification Loop (integrated into split)
- Boundary checker: detect repo language, run tsc --noEmit (TS) or py_compile (Python) per slice
- Auto-collapse: when a boundary fails, merge that slice into its neighbor, renumber, retry
- Rewired `split` to use `generateValidatedPlan`: AI generates plan → apply to temp clone → check boundaries → collapse if needed → repeat up to 3 rounds
- Verification is internal to `split` — by the time stack.plan.json is written, all boundaries have been checked

### Testing
- 78 tests across 15 test files
- Unit tests: diff parser, dep graph, file classifier, slicer, config, plan schema, planner, LLM adapters
- Integration tests: plan applier (real git repos), PR manager
- E2E tests: full split→apply pipeline with golden plan fixtures, dissected file verification

## Session N — Enhancements
- **400 LOC warning**: `validatePlanInvariants` now warns (non-blocking) when any slice exceeds 400 LOC; uses `computeSliceLoc` for whole/dissect file assignments
- **Tiny-diff bypass**: `split` command skips AI when diff has < 300 LOC and ≤ 5 files; creates single-slice plan directly with `createSingleSlicePlan`

## Prompting & Verification Loop Improvements
- **Chain-of-thought reasoning**: System prompt now instructs the model to produce `<analysis>` tags (file groupings, dependency chains, split boundaries, compilability check) before emitting JSON
- **Few-shot example**: Added a concrete 3-file, 2-slice example in the system prompt showing the exact analysis + JSON output format
- **XML-structured prompt**: System prompt uses `<constraints>`, `<analysis_instructions>`, `<output_schema>`, `<field_rules>`, `<example>` sections; user prompts use `<repository_context>`, `<diff>`, `<task>`
- **Separated system/user prompts**: New `buildUserPrompt()` and `buildRevisionUserPrompt()` functions produce user-only content; system prompt passed separately via `--system-prompt` (CLI) or `system` parameter (AI SDK)
- **Structured output (AI SDK)**: Switched from `generateText` + regex JSON extraction to `generateObject` with `StackPlanSchema` — eliminates JSON parse failures entirely
- **Multi-turn conversation (AI SDK)**: `AiSdkAdapter` maintains a `conversationHistory: ModelMessage[]` array; revision calls append to the same conversation
- **Multi-turn conversation (CLI)**: `ClaudeCliAdapter` uses `--continue` flag on revision calls to keep the same session context
- **AI revision in validation loop**: `validateAndRepairPlan` now calls `adapter.revisePlan()` first (up to 2 rounds), then falls back to mechanical `collapseSlice` (up to 2 rounds) — previously `revisePlan` was dead code
- **JSON extraction helper**: New `extractJsonFromResponse()` strips `<analysis>` tags before extracting JSON from Claude CLI responses
- **Test coverage**: 101 tests (up from 78), including new tests for chain-of-thought extraction, XML-structured prompts, revision user prompt, and adapter revision interface

## Test Command Verification Per Slice Boundary
- **Verify config**: New `VerifyConfigSchema` in config with optional `testCommand` and `testTimeout` (default 5 min); user sets via `.stacksmithrc` `{ "verify": { "testCommand": "pnpm test" } }`
- **`checkTests()`**: New function in `boundary-checker.ts` runs user-configured shell command per slice boundary, capturing stdout/stderr on failure
- **Integrated into `checkBoundary()`**: Typecheck runs first; if it passes and `testCommand` is configured, tests run next. First failure wins.
- **Threaded through planner**: `verifyConfig` flows from split command → `generateValidatedPlan` → `validateAndRepairPlan` → `applyAndCheckBoundaries` → `checkBoundary`. Test failures feed into the same AI revision + collapse loop.
- **Test coverage**: 123 tests (up from 101), including `checkTests()` pass/fail/stderr tests and verify config schema validation

## Rich CLI Output + Interactive Demo
- **Display module** (`src/utils/display.ts`): Pure formatting functions for plan summary table (`cli-table3`), stack tree (`consola formatTree`), per-branch diff stats, PR cards, before/after summary box. All use `consola/utils` (box, formatTree, colorize, colors).
- **Spinner module** (`src/utils/spinner.ts`): `withSpinner()` wrapper around `ora` with elapsed time display and rotating progress hints. `ProgressSpinner` class for controllable step-by-step updates during long operations.
- **CLI commands upgraded**: `split` uses spinners + `formatPlanSummary` table; `apply` shows stack tree + branch stats + before/after box + stack equivalence verification; `push` uses spinners + `formatPrCards`.
- **Verification data in plan**: `metadata.verification` stores per-slice check results (check name, pass/fail); displayed in plan table "Checks" column and branch stats badges.
- **Stack equivalence verification**: After `apply`, diffs the last stack branch against the source branch to confirm they're identical.
- **Progress spinners with step tracking**: Boundary verification shows real-time sub-steps (cloning, installing deps, checking each slice by name).
- **AI prompt: tests colocated with code**: System prompt now requires tests in the same slice as the code they test — no standalone "tests only" slices.
- **Interactive demo** (`demo/demo.sh`): Pure bash + ANSI codes, zero external dependencies. Sets up 11-file Express API fixture, runs real `split` (AI) and `apply` commands, shows full pipeline. Clear screen between acts. `--fast` flag for non-interactive/CI mode.
- **Demo fixture test** (`tests/e2e/demo-fixture.test.ts`): Smoke test validating fixture repo structure (11 files, 362+ LOC, correct branches).
- **New dependencies**: `ora` (spinners), `cli-table3` (tables)
- **Test coverage**: 130 tests across 17 test files
