# Tech Context

## Stack
- Language: **TypeScript** (strict mode, Node.js >= 20 LTS)
- Package manager: **pnpm**
- CLI framework: **Commander.js**
- Git operations: **simple-git**
- GitHub API: **@octokit/rest**
- AI agent: **Vercel AI SDK** (BYOK) + **Claude CLI** subprocess (hybrid)
- Config: **cosmiconfig** + **Zod** (v4)
- Testing: **vitest**
- Lint/format: **Biome**
- Build: **tsup** (esbuild-based)
- Terminal UI: **ora** (spinners), **cli-table3** (tables), **consola/utils** (box, tree, colors)
- Distribution: npm package (`npx stacksmith`)

## Key Technical Decisions
- Hybrid LLM: detect Claude CLI first (leverages existing subscriptions), fall back to BYOK API keys
- Self-contained plan: stack.plan.json includes inline file contents for dissected files
- Mechanical apply: `apply` command requires zero AI — just writes files from plan
- Build from scratch: stack branches are built from main, user's commits are never reused
- Rich CLI output: all formatting lives in `src/utils/display.ts` as pure functions returning styled strings
- Verification data stored in plan metadata: per-slice check results persist from split through apply
- Tests colocated: AI prompt requires test files in the same slice as the code they test

## Architecture
- `src/cli/` — Command handlers (split, apply, push)
- `src/core/` — Pure logic (diff parser, dep graph, slicer, plan schema)
- `src/ai/` — LLM integration (adapter interface, Claude CLI, AI SDK, prompts, planner)
- `src/git/` — Git operations (operations, branch manager, plan applier)
- `src/github/` — GitHub API (PR manager)
- `src/config/` — Config loading and validation
- `src/types/` — Shared types and Zod schemas
- `src/utils/` — Logger, error types, display formatting, spinner
- `demo/` — Interactive CLI demo (pure bash, zero external deps)

## Target Platforms
- GitHub repos (MVP)
- TypeScript and Python repos as splitting targets
- macOS + Linux
