# Architecture

## Overview

Stacksmith is a CLI tool with an AI-powered planner agent. It reads a large diff, proposes a split plan, applies it as a branch stack, verifies CI locally, and manages the stack lifecycle on GitHub.

## Core Pipeline

```
diff → split (AI planner) → stack.plan.json → apply → verify → push → sync/next
```

## Components

### CLI Layer (`src/cli/`)
- Command parser (split, apply, push — implemented; verify, sync, next — roadmap)
- Config resolution (.stacksmithrc, repo conventions)
- Rich output: plan tables, stack trees, branch stats, PR cards, spinners

### Planner Agent (`src/ai/`)
- LLM adapter interface with two implementations: Claude CLI + Vercel AI SDK (BYOK)
- Prompt builder with XML structure, chain-of-thought analysis, few-shot examples
- Planner orchestrator: generate → validate boundaries → AI revision → mechanical collapse
- Multi-turn conversation for plan revision

### Core Logic (`src/core/`)
- Diff parser (files, hunks, symbols)
- Dependency graph builder (imports, symbol references)
- Heuristic slicer (additive → core → wiring → tests → docs)
- Plan schema and I/O

### Stack Engine (`src/git/`)
- Git operations (branch, commit, rebase, cherry-pick)
- Branch manager (stack branch lifecycle, cleanup)
- Plan applier (write files from plan: whole, dissect, delete strategies)

### CI Verifier (`src/ci/`)
- Boundary checker: detect repo language, run tsc/py_compile per slice
- Test runner: optional user-configured test command per boundary
- Auto-collapse: merge adjacent slices when a boundary fails

### Display (`src/utils/`)
- `display.ts`: Pure formatting functions (plan table, stack tree, branch stats, PR cards, before/after box)
- `spinner.ts`: `withSpinner` for simple operations, `ProgressSpinner` for multi-step with live updates
- Uses consola/utils (box, formatTree, colors), cli-table3 (tables), ora (spinners)

### GitHub Integration (`src/github/`)
- PR creation (Ready for PR1, Draft for rest)
- PR body generation (depends-on links, CI summary, stack TOC)
- Stack lifecycle (sync after edits, next after merge — roadmap)

## File Tree

```
stacksmith/
├── CLAUDE.md              # AI working instructions
├── SPEC.md                # Product spec (canonical)
├── ARCH.md                # This file
├── TASKS.md               # Task tracking
├── .context/              # AI memory bank
│   ├── activeContext.md
│   ├── progress.md
│   ├── techContext.md
│   └── systemPatterns.md
├── .claude/               # Claude Code config
│   ├── settings.json
│   ├── hooks/
│   ├── commands/
│   └── skills/
├── .cursor/               # Cursor IDE config
│   └── rules/
├── demo/                  # Interactive CLI demo (pure bash, zero external deps)
│   ├── demo.sh            # Main demo script
│   └── setup-fixture.sh   # Creates temp git repo with Express API fixture
├── docs/
│   └── reference/         # Source materials (brainstorm transcript, original vision)
├── src/
│   ├── index.ts           # CLI entry point (Commander)
│   ├── cli/               # Command handlers (split, apply, push)
│   ├── ai/                # LLM adapters, prompts, planner
│   ├── core/              # Diff parser, dep graph, slicer, plan I/O
│   ├── git/               # Git operations, branch manager, plan applier
│   ├── github/            # PR manager (Octokit)
│   ├── ci/                # Boundary checker, auto-collapse
│   ├── config/            # Config loader, schema, defaults
│   ├── types/             # Zod schemas, shared types
│   └── utils/             # Logger, errors, display, spinner
└── tests/
    ├── unit/              # 12 unit test files
    ├── integration/       # Plan applier, PR manager
    ├── e2e/               # Split-apply pipeline, dissected files, demo fixture, live Claude
    └── fixtures/          # Golden plans, test data
```

## Data Model

### stack.plan.json
```json
{
  "version": 1,
  "baseBranch": "main",
  "sourceBranch": "feat/big-change",
  "slices": [
    {
      "order": 1,
      "title": "Add user types and schemas",
      "rationale": "Foundation types needed by all other PRs",
      "branch": "stack/01-user-types",
      "confidence": 0.95
    }
  ],
  "fileAssignments": [
    { "path": "src/types/user.ts", "splitStrategy": "whole", "targetSlice": 1 },
    { "path": "src/app.ts", "splitStrategy": "dissect", "sliceContents": [
      { "slice": 1, "content": "// full file at slice 1...", "description": "Base app" },
      { "slice": 2, "content": "// full file at slice 2...", "description": "Wire routes" }
    ]}
  ],
  "metadata": {
    "totalFiles": 5,
    "totalLoc": 200,
    "generatedAt": "2026-03-01T00:00:00Z",
    "model": "sonnet",
    "provider": "claude-cli",
    "verification": [
      { "sliceOrder": 1, "check": "tsc", "passed": true },
      { "sliceOrder": 2, "check": "tsc", "passed": true }
    ]
  }
}
```
