# Stacksmith

CLI tool that takes a messy, large diff produced by AI-assisted ("vibe") coding and automatically splits it into a clean, ordered stack of reviewable PRs — then keeps the stack consistent as reviews come in.

## Quick start
```bash
pnpm install
pnpm build
```

## Build & test
```bash
pnpm build        # tsup build → dist/index.js
pnpm test         # vitest (130 tests across 17 files)
pnpm lint         # biome check
pnpm typecheck    # tsc --noEmit
pnpm demo         # interactive CLI demo (requires LLM provider)
pnpm demo --fast  # non-interactive demo (CI/testing)
```

## Architecture
- CLI with 6 commands: `split`, `apply`, `push` (implemented); `verify`, `sync`, `next` (roadmap)
- AI agent: planner (JSON plan) + validator loop (apply → check → revise/collapse)
- Rich CLI output: tables (cli-table3), trees (consola), spinners (ora), colored boxes
- See `ARCH.md` for full architecture and file tree
- See `SPEC.md` for detailed product spec (original brainstorm in `docs/reference/`)

## Key commands
| Command | Purpose |
|---------|---------|
| `stacksmith split` | Analyze diff, propose stack plan (JSON) with AI |
| `stacksmith apply` | Create commits/branches per slice locally |
| `stacksmith push` | Push branches + open GitHub PRs |
| `stacksmith verify` | *(roadmap)* Run representative CI lane locally per PR boundary |
| `stacksmith sync` | *(roadmap)* Rebase downstream PRs after review edits |
| `stacksmith next` | *(roadmap)* After PR1 merge: rebase, flip PR2 to Ready |

## Non-negotiables
- Strict typing — no `any` (TS) or untyped functions (Python)
- Never change semantics — only mechanical operations (move hunks, reorder commits, rebase)
- Every new module must have tests
- Tests must be colocated with the code they test (no standalone test slices)
- Reference `SPEC.md` for product requirements

## How to work here
- Small incremental commits with conventional messages (`feat:`, `fix:`, `refactor:`, etc.)
- Update `.context/progress.md` after completing tasks
- Update `.context/activeContext.md` when switching focus
- Run `/status` to see current project state
- Run `/plan` to decide what to work on next
- Run `/review` before committing

## Forbidden patterns
- No `any` types (TS) or untyped functions (Python)
- No `console.log` in committed code (use proper logging)
- No new top-level folders without updating ARCH.md

## Learned User Preferences
- Prefers collaborative architecture discussions — ask questions and work through decisions together, don't just present a finished plan
- MVP-first scoping — defer non-essential features to a roadmap rather than building everything at once
- No artificial timelines for AI-implemented work — use dependency ordering instead of week estimates
- Cares about demo-readiness and "wow factor" — features should be presentable and impressive
- Prefers single-stage LLM calls over multi-stage pipelines when possible
- Maximize existing subscriptions (Claude Code CLI) before requiring new API keys
- Prefers targeted, file-scoped Cursor rules over generic ones that duplicate CLAUDE.md
- Dislikes redundancy between configuration files
- Wants rich CLI output natively in the tool, not bolted on by demo scripts
- Prefers zero external dependencies for demo/scripting (pure bash over gum/jq/demo-magic)
- Values progress transparency — spinners should show what step is happening, not just "working..."
- Tests should ship with the code they test, not in a separate PR

## Learned Workspace Facts
- Tech stack: TypeScript on Node.js >= 20, pnpm, Commander.js, Vitest, Biome, tsup
- Terminal UI: ora (spinners), cli-table3 (tables), consola/utils (box, tree, colors)
- LLM strategy: hybrid — detect local Claude CLI first, BYOK API keys via Vercel AI SDK as fallback
- Claude CLI uses model aliases (e.g., "sonnet") not full model IDs like "claude-sonnet-4-20250514"
- MVP scope: 3 commands (split, apply, push); verify/sync/next are deferred to roadmap
- Verification (boundary checking) is integrated inside `split`, not a separate command
- AI-driven file dissection produces actual intermediate file contents, not line-range annotations
- `apply` is purely mechanical — all intelligence lives in `split`
- `apply` verifies stack equivalence: diffs last stack branch against source to confirm they match
- E2E tests use real git repos in temp dirs with recorded LLM responses
- Original product brainstorm lives in `docs/reference/` as extracted ChatGPT transcript
- 130 tests across 17 test files (unit, integration, E2E)
- Demo is pure bash + ANSI codes with zero external deps; runs real AI calls
