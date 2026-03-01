import { describe, expect, it } from "vitest";
import {
  FileAssignmentSchema,
  SliceContentSchema,
  SliceSchema,
  StackPlanSchema,
} from "../../src/types/index.js";

function makeValidPlan() {
  return {
    version: 1 as const,
    baseBranch: "main",
    sourceBranch: "feat/big-change",
    slices: [
      {
        order: 1,
        title: "Add types",
        rationale: "Foundation",
        branch: "stack/01-types",
        confidence: 0.95,
      },
      {
        order: 2,
        title: "Add core logic",
        rationale: "Implementation",
        branch: "stack/02-core",
        confidence: 0.9,
      },
    ],
    fileAssignments: [
      { path: "src/types.ts", splitStrategy: "whole" as const, targetSlice: 1 },
      {
        path: "src/api.ts",
        splitStrategy: "dissect" as const,
        sliceContents: [
          {
            slice: 1,
            content: "export interface User {}",
            description: "Add User type",
          },
          {
            slice: 2,
            content: "export interface User {}\nexport function getUser() {}",
            description: "Add getUser",
          },
        ],
      },
    ],
    metadata: {
      totalFiles: 2,
      totalLoc: 50,
      generatedAt: "2026-03-01T00:00:00Z",
      model: "claude-sonnet-4-20250514",
      provider: "claude-cli",
    },
  };
}

describe("StackPlanSchema", () => {
  it("parses a valid plan", () => {
    const plan = StackPlanSchema.parse(makeValidPlan());
    expect(plan.slices).toHaveLength(2);
    expect(plan.fileAssignments).toHaveLength(2);
    expect(plan.version).toBe(1);
  });

  it("rejects empty slices", () => {
    const plan = makeValidPlan();
    plan.slices = [];
    expect(() => StackPlanSchema.parse(plan)).toThrow();
  });

  it("rejects more than 10 slices", () => {
    const plan = makeValidPlan();
    plan.slices = Array.from({ length: 11 }, (_, i) => ({
      order: i + 1,
      title: `Slice ${i + 1}`,
      rationale: "test",
      branch: `stack/${String(i + 1).padStart(2, "0")}`,
      confidence: 0.8,
    }));
    expect(() => StackPlanSchema.parse(plan)).toThrow();
  });

  it("rejects confidence outside 0-1", () => {
    const plan = makeValidPlan();
    const slice = plan.slices[0];
    if (slice) slice.confidence = 1.5;
    expect(() => StackPlanSchema.parse(plan)).toThrow();
  });

  it("rejects empty fileAssignments", () => {
    const plan = makeValidPlan();
    plan.fileAssignments = [];
    expect(() => StackPlanSchema.parse(plan)).toThrow();
  });
});

describe("FileAssignmentSchema", () => {
  it("parses whole file assignment", () => {
    const fa = FileAssignmentSchema.parse({
      path: "src/types.ts",
      splitStrategy: "whole",
      targetSlice: 1,
    });
    expect(fa.splitStrategy).toBe("whole");
    expect(fa.targetSlice).toBe(1);
  });

  it("parses dissect file assignment", () => {
    const fa = FileAssignmentSchema.parse({
      path: "src/api.ts",
      splitStrategy: "dissect",
      sliceContents: [
        { slice: 1, content: "line1", description: "desc1" },
        { slice: 2, content: "line1\nline2", description: "desc2" },
      ],
    });
    expect(fa.splitStrategy).toBe("dissect");
    expect(fa.sliceContents).toHaveLength(2);
  });

  it("parses delete file assignment", () => {
    const fa = FileAssignmentSchema.parse({
      path: "src/old-file.ts",
      splitStrategy: "delete",
      targetSlice: 1,
    });
    expect(fa.splitStrategy).toBe("delete");
    expect(fa.targetSlice).toBe(1);
  });

  it("rejects empty path", () => {
    expect(() =>
      FileAssignmentSchema.parse({
        path: "",
        splitStrategy: "whole",
        targetSlice: 1,
      }),
    ).toThrow();
  });
});

describe("SliceSchema", () => {
  it("parses a valid slice", () => {
    const slice = SliceSchema.parse({
      order: 1,
      title: "Add types",
      rationale: "Foundation",
      branch: "stack/01-types",
      confidence: 0.95,
    });
    expect(slice.order).toBe(1);
  });

  it("rejects non-positive order", () => {
    expect(() =>
      SliceSchema.parse({
        order: 0,
        title: "X",
        rationale: "X",
        branch: "b",
        confidence: 0.5,
      }),
    ).toThrow();
  });
});

describe("SliceContentSchema", () => {
  it("parses valid slice content", () => {
    const sc = SliceContentSchema.parse({
      slice: 1,
      content: "code",
      description: "desc",
    });
    expect(sc.slice).toBe(1);
  });
});
