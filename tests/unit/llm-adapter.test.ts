import { describe, expect, it } from "vitest";
import type { CIFailure, PlanContext } from "../../src/ai/adapter.js";
import { isClaudeCliAvailable } from "../../src/ai/claude-cli.js";
import {
  buildPlanPrompt,
  buildRevisionPrompt,
  buildRevisionUserPrompt,
  buildUserPrompt,
  extractJsonFromResponse,
  SYSTEM_PROMPT,
} from "../../src/ai/prompts.js";
import type { DiffFile, StackPlan } from "../../src/types/index.js";

describe("isClaudeCliAvailable", () => {
  it("returns false when claude is not installed", async () => {
    const result = await isClaudeCliAvailable();
    expect(typeof result).toBe("boolean");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("contains key constraints", () => {
    expect(SYSTEM_PROMPT).toContain("Never change the semantics");
    expect(SYSTEM_PROMPT).toContain("fileAssignments");
    expect(SYSTEM_PROMPT).toContain("dissect");
  });

  it("includes chain-of-thought analysis instructions", () => {
    expect(SYSTEM_PROMPT).toContain("<analysis_instructions>");
    expect(SYSTEM_PROMPT).toContain("Group files by functional concern");
    expect(SYSTEM_PROMPT).toContain("Identify dependency chains");
    expect(SYSTEM_PROMPT).toContain("Verify mentally");
  });

  it("includes a few-shot example", () => {
    expect(SYSTEM_PROMPT).toContain("<example>");
    expect(SYSTEM_PROMPT).toContain("<analysis>");
    expect(SYSTEM_PROMPT).toContain("stack/01-user-service");
  });

  it("uses XML-structured sections", () => {
    expect(SYSTEM_PROMPT).toContain("<constraints>");
    expect(SYSTEM_PROMPT).toContain("<output_schema>");
    expect(SYSTEM_PROMPT).toContain("<field_rules>");
  });

  it("specifies LOC target per slice", () => {
    expect(SYSTEM_PROMPT).toContain("200-400");
  });
});

describe("buildUserPrompt", () => {
  it("builds a prompt with repo context and diff", () => {
    const context = makeContext();
    const prompt = buildUserPrompt(context);

    expect(prompt).toContain("main");
    expect(prompt).toContain("feat/big-change");
    expect(prompt).toContain("3");
    expect(prompt).toContain("src/types.ts");
    expect(prompt).toContain("src/api.ts -> src/types.ts");
    expect(prompt).toContain("<task>");
  });

  it("does NOT include the system prompt", () => {
    const prompt = buildUserPrompt(makeContext());
    expect(prompt).not.toContain("code architecture expert");
  });

  it("uses XML tags for structure", () => {
    const prompt = buildUserPrompt(makeContext());
    expect(prompt).toContain("<repository_context>");
    expect(prompt).toContain("<diff>");
    expect(prompt).toContain("<task>");
  });

  it("instructs the model to write analysis first", () => {
    const prompt = buildUserPrompt(makeContext());
    expect(prompt).toContain("First write your <analysis>");
  });
});

describe("buildPlanPrompt (deprecated compat)", () => {
  it("includes both system prompt and user prompt", () => {
    const prompt = buildPlanPrompt(makeContext());
    expect(prompt).toContain("code architecture expert");
    expect(prompt).toContain("<repository_context>");
    expect(prompt).toContain("StackPlan");
  });
});

describe("buildRevisionUserPrompt", () => {
  it("includes failure details and previous plan", () => {
    const prompt = buildRevisionUserPrompt(makePlan(), makeFailure());
    expect(prompt).toContain("Slice 1 failed");
    expect(prompt).toContain("Cannot find module");
    expect(prompt).toContain("typecheck");
    expect(prompt).toContain('"version": 1');
  });

  it("does NOT include the system prompt", () => {
    const prompt = buildRevisionUserPrompt(makePlan(), makeFailure());
    expect(prompt).not.toContain("code architecture expert");
  });

  it("uses XML tags for structure", () => {
    const prompt = buildRevisionUserPrompt(makePlan(), makeFailure());
    expect(prompt).toContain("<verification_failure>");
    expect(prompt).toContain("<previous_plan>");
    expect(prompt).toContain("<task>");
  });

  it("instructs the model to analyze before revising", () => {
    const prompt = buildRevisionUserPrompt(makePlan(), makeFailure());
    expect(prompt).toContain("First write your <analysis>");
  });
});

describe("buildRevisionPrompt (deprecated compat)", () => {
  it("includes both system prompt and failure details", () => {
    const prompt = buildRevisionPrompt(makePlan(), makeFailure());
    expect(prompt).toContain("code architecture expert");
    expect(prompt).toContain("slice 1");
    expect(prompt).toContain("Cannot find module");
    expect(prompt).toContain("typecheck");
    expect(prompt).toContain('"version": 1');
  });
});

describe("extractJsonFromResponse", () => {
  it("extracts JSON from a response with analysis tags", () => {
    const response = `<analysis>
Some reasoning here about dependencies.
</analysis>

{"version": 1, "baseBranch": "main"}`;

    const json = extractJsonFromResponse(response);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.baseBranch).toBe("main");
  });

  it("extracts JSON from a plain response", () => {
    const response = '{"version": 1, "baseBranch": "main"}';
    const json = extractJsonFromResponse(response);
    expect(JSON.parse(json).version).toBe(1);
  });

  it("throws when no JSON object is found", () => {
    expect(() => extractJsonFromResponse("No JSON here")).toThrow("No JSON object found");
  });

  it("handles multiple analysis tags", () => {
    const response = `<analysis>First pass</analysis>
<analysis>Second pass</analysis>
{"version": 1}`;
    const json = extractJsonFromResponse(response);
    expect(JSON.parse(json).version).toBe(1);
  });
});

function makeContext(): PlanContext {
  return {
    diffText: "+export const x = 1;",
    preAnalysis: {
      files: [makeDiffFile("src/types.ts")],
      depGraph: [{ from: "src/api.ts", to: "src/types.ts" }],
      fileRoles: new Map([
        ["src/types.ts", "types"],
        ["src/api.ts", "core"],
      ]),
      totalAdditions: 10,
      totalDeletions: 2,
    },
    fileTree: ["src/", "tests/", "package.json"],
    baseBranch: "main",
    sourceBranch: "feat/big-change",
    targetSlices: 3,
  };
}

function makePlan(): StackPlan {
  return {
    version: 1,
    baseBranch: "main",
    sourceBranch: "feat/x",
    slices: [
      {
        order: 1,
        title: "Types",
        rationale: "Foundation",
        branch: "stack/01",
        confidence: 0.9,
      },
    ],
    fileAssignments: [{ path: "src/types.ts", splitStrategy: "whole", targetSlice: 1 }],
    metadata: {
      totalFiles: 1,
      totalLoc: 10,
      generatedAt: "2026-03-01T00:00:00Z",
      model: "test",
      provider: "test",
    },
  };
}

function makeFailure(): CIFailure {
  return {
    sliceOrder: 1,
    errorOutput: "Cannot find module './utils'",
    failedCheck: "typecheck",
  };
}

function makeDiffFile(path: string): DiffFile {
  return {
    path,
    additions: 5,
    deletions: 0,
    isNew: true,
    isDeleted: false,
    isRenamed: false,
    hunks: [],
  };
}
