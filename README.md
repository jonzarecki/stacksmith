# Stacksmith

**Split vibe-coded diffs into clean, ordered PR stacks.**

[![CI](https://github.com/jonzarecki/stacksmith/actions/workflows/ci.yml/badge.svg)](https://github.com/jonzarecki/stacksmith/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

![demo](demo/demo.gif)

---

When you vibe-code with AI, it dumps everything into one branch — types, services, routes, middleware, tests — all tangled together. Nobody wants to review a 400-line PR with 14 files.

Stacksmith takes that messy diff, uses AI to analyze the dependency graph, and splits it into a clean stack of small, focused PRs. Each one passes lint and tests independently. The final result is byte-identical to your original code.

```
Before: 1 PR · 14 files · 422 lines · mixed concerns
After:  5 PRs · each focused · lint passing · tests passing
```

## Quick Start

```bash
npm install -g stacksmith

# On your feature branch with a large diff:
stacksmith split    # AI analyzes diff → generates stack plan
stacksmith apply    # Creates ordered branch stack
stacksmith push     # Pushes branches → opens GitHub PRs
```

### LLM Configuration

Stacksmith uses AI to analyze your diff. Configure one of:

- **Claude CLI** (recommended): Install [Claude Code](https://docs.anthropic.com/en/docs/claude-cli) — Stacksmith detects it automatically
- **API Key**: Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_GENERATIVE_AI_KEY`

## Commands

| Command | What it does |
|---------|-------------|
| `stacksmith split` | Analyze diff, build dependency graph, generate a stack plan with AI. Verifies each slice passes lint + tests. |
| `stacksmith apply` | Create one branch per slice. Each builds on the previous, forming an ordered stack. Verifies final state matches original. |
| `stacksmith push` | Push branches and open GitHub PRs. PR #1 is Ready; the rest are Drafts with dependency links. |

## How It Works

```
Feature branch (messy)     →  stacksmith split  →  stacksmith apply  →  stacksmith push
┌──────────────────────┐      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 14 files, 422 lines  │  →   │ AI planner   │  →  │ 5 branches   │  →  │ 5 GitHub PRs │
│ types + services +   │      │ dep graph    │     │ stack/01-... │     │ #1 Ready     │
│ routes + middleware + │      │ lint + test  │     │ stack/02-... │     │ #2 Draft     │
│ tests — all mixed    │      │ per slice    │     │ ...          │     │ ...          │
└──────────────────────┘      └──────────────┘     └──────────────┘     └──────────────┘
```

Key guarantees:
- **Byte-identical**: the final stacked branch matches your original code exactly
- **Each slice compiles**: lint and typecheck pass at every boundary
- **Tests colocated**: test files ship in the same PR as the code they test
- **Tests run per slice**: if configured, tests pass at each boundary with progressive counts

## Development

```bash
git clone https://github.com/jonzarecki/stacksmith.git
cd stacksmith
pnpm install
pnpm build

# Run
pnpm test         # 162 tests across 18 files
pnpm lint         # biome check
pnpm typecheck    # tsc --noEmit

# Demo
pnpm demo              # full demo (real AI call, ~90s)
pnpm demo --replay     # replay with cached plan (no AI, ~10s)
pnpm demo:record       # record demo video (requires VHS)
```

## Architecture

See [ARCH.md](ARCH.md) for the full architecture, file tree, and data model.

```
src/
├── cli/        Command handlers (split, apply, push)
├── ai/         LLM adapters (Claude CLI, Vercel AI SDK), prompts, planner
├── core/       Diff parser, dependency graph, heuristic slicer
├── git/        Git operations, branch manager, plan applier
├── github/     PR manager (Octokit)
├── ci/         Boundary checker, test runner, auto-collapse
└── utils/      Display formatting, spinners, logger
```

## License

[MIT](LICENSE)
