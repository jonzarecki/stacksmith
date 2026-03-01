# System Patterns

## General Conventions
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- TypeScript strict mode, no `any` types
- Update `.context/progress.md` after completing tasks
- Update `.context/activeContext.md` when switching focus
- Reference `SPEC.md` (VISION.md) for product requirements

## CLI Naming
- Commands: `stacksmith split`, `stacksmith apply`, `stacksmith push` (MVP); `verify`, `sync`, `next` (roadmap)
- Stack branches: `stack/01-...`, `stack/02-...`
- Plan file: `stack.plan.json`

## Display Patterns
- All formatting logic in `src/utils/display.ts` as pure functions returning strings
- Use `consola/utils` for box drawing, tree formatting, and colors
- Use `cli-table3` for column-aligned tables
- Use `ora` for spinners via `withSpinner()` (simple) or `ProgressSpinner` (multi-step)
- CLI commands call display functions and `console.log()` the result
- Demo script is thin narrative — all rich output comes from the CLI itself

## AI Prompting
- System prompt uses XML structure: `<constraints>`, `<analysis_instructions>`, `<output_schema>`, `<field_rules>`, `<example>`
- Model produces `<analysis>` tags (chain-of-thought) before JSON output
- Tests must be colocated with the code they test — no standalone test slices
- Multi-turn conversation for revision: AI SDK uses message history, Claude CLI uses `--continue`

## Testing
- 130 tests across 17 files (unit, integration, E2E)
- E2E tests use real git repos in temp dirs
- Demo fixture test validates setup script output
- Live Claude test exercises real AI call (skipped in CI without keys)
