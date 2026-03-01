import type { FileRole, StackPlan } from "../types/index.js";
import type { CIFailure, PlanContext } from "./adapter.js";

export const SYSTEM_PROMPT = `You are a code architecture expert. Your job is to take a large git diff and split it into a clean, ordered stack of reviewable PRs.

<constraints>
- Never change the semantics of the code. Only mechanical operations: moving changes between slices.
- Each slice MUST produce a valid, compilable state of the codebase when applied on top of all preceding slices.
- Dependencies must be ordered correctly: if file A imports from file B, file B's changes must come in an earlier or same slice.
- The final slice's cumulative state must exactly reproduce the full diff vs the base branch.
- Aim for 200-400 lines of diff per slice. Fewer is fine; more than 400 should be split further.
- CRITICAL for dissected files: each intermediate slice content must be an exact subset of the final file on the source branch. Copy lines verbatim from the diff — do not add, remove, rewrite, or reformat any code. The only difference between intermediate slices should be which lines are present, not what those lines say.
- IMPORTANT: Tests MUST be colocated with the code they test. When a slice adds a service or feature, include its tests in the SAME slice. Never create a standalone "tests only" slice. Each PR should be self-contained and reviewable with its own tests.
</constraints>

<analysis_instructions>
Before producing the JSON plan, reason through these steps inside <analysis> tags:
1. Group files by functional concern (what feature/module do they belong to?).
2. Identify dependency chains (which files import from which changed files?).
3. Determine natural split boundaries — types/interfaces first, then core logic, then integration layers.
4. Assign each test file to the SAME slice as the code it tests — never a separate "tests" slice.
5. For files that span multiple slices, plan what each intermediate state looks like.
6. Verify mentally: does each slice compile independently given only the slices before it?
</analysis_instructions>

<output_schema>
After the <analysis> block, return a single JSON object (no markdown fences, no extra text) with EXACTLY these fields:

{
  "version": 1,
  "baseBranch": "main",
  "sourceBranch": "feat/example",
  "slices": [
    {
      "order": 1,
      "title": "Add foundation types",
      "rationale": "Types needed by later slices",
      "branch": "stack/01-types",
      "confidence": 0.95
    }
  ],
  "fileAssignments": [
    {
      "path": "src/types.ts",
      "splitStrategy": "whole",
      "targetSlice": 1
    },
    {
      "path": "src/old-file.ts",
      "splitStrategy": "delete",
      "targetSlice": 1
    },
    {
      "path": "src/app.ts",
      "splitStrategy": "dissect",
      "sliceContents": [
        {
          "slice": 1,
          "content": "// exact FULL file content at this slice boundary",
          "description": "What changed vs previous slice"
        }
      ]
    }
  ],
  "metadata": {
    "totalFiles": 3,
    "totalLoc": 50,
    "generatedAt": "2026-03-01T00:00:00Z",
    "model": "sonnet",
    "provider": "claude-cli"
  }
}
</output_schema>

<field_rules>
- Slices MUST have: "order" (number), "title" (string), "rationale" (string), "branch" (string like "stack/NN-kebab-name"), "confidence" (number 0-1)
- File assignments MUST have: "path", "splitStrategy" ("whole" | "dissect" | "delete")
- "whole": all changes belong in one slice — set "targetSlice" to the slice order number
- "dissect": changes span multiple slices — provide "sliceContents" array, each with "slice" (number), "content" (the COMPLETE file text at that slice boundary), "description" (string)
- "delete": file is removed — set "targetSlice" to the slice where the deletion occurs
- Renamed files: use "delete" for the old path and "whole" for the new path in the same or adjacent slice
</field_rules>

<example>
Given a diff that adds a User type, a UserService with tests, and a UserController with tests:

<analysis>
1. Functional groups: {types: [user.ts], core: [user-service.ts, user-service.test.ts], integration: [user-controller.ts, user-controller.test.ts]}
2. Dependencies: user-controller.ts -> user-service.ts -> user.ts
3. Natural split: slice 1 = types + service + service tests, slice 2 = controller + controller tests
4. Tests colocated: user-service.test.ts goes with user-service.ts in slice 1, user-controller.test.ts goes with user-controller.ts in slice 2.
5. No dissection needed — each file belongs entirely to one slice.
6. Slice 1 compiles alone (no external deps). Slice 2 imports from slice 1 — valid.
</analysis>

{
  "version": 1,
  "baseBranch": "main",
  "sourceBranch": "feat/users",
  "slices": [
    { "order": 1, "title": "Add User type, service, and tests", "rationale": "Foundation types and business logic with tests", "branch": "stack/01-user-service", "confidence": 0.95 },
    { "order": 2, "title": "Add UserController and tests", "rationale": "HTTP integration layer with tests", "branch": "stack/02-user-controller", "confidence": 0.9 }
  ],
  "fileAssignments": [
    { "path": "src/user.ts", "splitStrategy": "whole", "targetSlice": 1 },
    { "path": "src/user-service.ts", "splitStrategy": "whole", "targetSlice": 1 },
    { "path": "tests/user-service.test.ts", "splitStrategy": "whole", "targetSlice": 1 },
    { "path": "src/user-controller.ts", "splitStrategy": "whole", "targetSlice": 2 },
    { "path": "tests/user-controller.test.ts", "splitStrategy": "whole", "targetSlice": 2 }
  ],
  "metadata": { "totalFiles": 5, "totalLoc": 200, "generatedAt": "2026-01-15T10:00:00Z", "model": "sonnet", "provider": "claude-cli" }
}
</example>`;

/**
 * Build the user-facing prompt (without system prompt) containing repo context and diff.
 * The system prompt is provided separately via the adapter.
 */
export function buildUserPrompt(context: PlanContext): string {
  const rolesSummary = summarizeRoles(context.preAnalysis.fileRoles);
  const depsSummary = context.preAnalysis.depGraph.map((e) => `  ${e.from} -> ${e.to}`).join("\n");

  return `<repository_context>
Base branch: ${context.baseBranch}
Source branch: ${context.sourceBranch}
Target number of slices: ${context.targetSlices}

Changed Files by Role:
${rolesSummary}

Dependency Graph:
${depsSummary || "(no cross-file dependencies detected)"}

File Tree (top-level):
${context.fileTree.join("\n")}
</repository_context>

<diff>
${context.diffText}
</diff>

<task>
Produce a StackPlan JSON with:
- baseBranch: "${context.baseBranch}"
- sourceBranch: "${context.sourceBranch}"
- slices: target ~${context.targetSlices} slices (adjust if needed, min 1, max 10)
- fileAssignments: one entry per changed file
- metadata: totalFiles, totalLoc, generatedAt (ISO), model, provider

For each file, decide:
- "whole" if all its changes belong in one slice (set targetSlice)
- "dissect" if its changes span multiple slices (provide sliceContents with the COMPLETE file text at each boundary)
- "delete" if the file is removed (set targetSlice to the slice where the deletion occurs)

First write your <analysis>, then output the JSON.
</task>`;
}

/** @deprecated Use buildUserPrompt instead — kept for backward compat in tests */
export function buildPlanPrompt(context: PlanContext): string {
  return `${SYSTEM_PROMPT}\n\n${buildUserPrompt(context)}`;
}

/**
 * Build a revision follow-up message for the same conversation.
 * When used in multi-turn mode, the model already has the original plan in context.
 * When used standalone, includes the previous plan for reference.
 */
export function buildRevisionUserPrompt(plan: StackPlan, failure: CIFailure): string {
  return `<verification_failure>
The plan was applied and boundary-checked. Slice ${failure.sliceOrder} failed.

Check: ${failure.failedCheck}
Error output:
${failure.errorOutput}
</verification_failure>

<previous_plan>
${JSON.stringify(plan, null, 2)}
</previous_plan>

<task>
Revise the plan to fix the CI failure. Common fixes:
- Move missing dependencies (imports, type definitions) to an earlier slice
- For dissected files, adjust the intermediate file content to include missing declarations
- As a last resort, merge the failing slice with an adjacent one

First write your <analysis> explaining what went wrong and how to fix it, then output the revised JSON.
</task>`;
}

/** @deprecated Use buildRevisionUserPrompt instead — kept for backward compat in tests */
export function buildRevisionPrompt(plan: StackPlan, failure: CIFailure): string {
  return `${SYSTEM_PROMPT}\n\n${buildRevisionUserPrompt(plan, failure)}`;
}

/**
 * Extract JSON from a response that may contain <analysis> tags before the JSON object.
 * Strips the analysis block and returns just the JSON string.
 */
export function extractJsonFromResponse(raw: string): string {
  const withoutAnalysis = raw.replace(/<analysis>[\s\S]*?<\/analysis>/g, "").trim();
  const jsonMatch = withoutAnalysis.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `No JSON object found in response. Response (first 500 chars): ${raw.slice(0, 500)}`,
    );
  }
  return jsonMatch[0];
}

function summarizeRoles(roles: Map<string, FileRole>): string {
  const grouped = new Map<FileRole, string[]>();
  for (const [path, role] of roles) {
    const list = grouped.get(role) ?? [];
    list.push(path);
    grouped.set(role, list);
  }

  const lines: string[] = [];
  for (const [role, files] of grouped) {
    lines.push(`${role}: ${files.join(", ")}`);
  }
  return lines.join("\n");
}
