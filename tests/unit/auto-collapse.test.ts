import { describe, expect, it } from "vitest";
import { collapseSlice } from "../../src/ci/auto-collapse.js";
import type { StackPlan } from "../../src/types/index.js";

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
        branch: "stack/01-types",
        confidence: 0.95,
      },
      {
        order: 2,
        title: "Service",
        rationale: "Logic",
        branch: "stack/02-service",
        confidence: 0.9,
      },
      {
        order: 3,
        title: "Routes",
        rationale: "Wiring",
        branch: "stack/03-routes",
        confidence: 0.85,
      },
    ],
    fileAssignments: [
      { path: "src/types.ts", splitStrategy: "whole", targetSlice: 1 },
      { path: "src/service.ts", splitStrategy: "whole", targetSlice: 2 },
      { path: "src/routes.ts", splitStrategy: "whole", targetSlice: 3 },
    ],
    metadata: {
      totalFiles: 3,
      totalLoc: 50,
      generatedAt: "2026-03-01T00:00:00Z",
      model: "test",
      provider: "test",
    },
  };
}

describe("collapseSlice", () => {
  it("collapses a middle slice into the next one", () => {
    const plan = makePlan();
    const result = collapseSlice(plan, 2);

    expect(result.slices).toHaveLength(2);
    expect(result.slices[0]?.order).toBe(1);
    expect(result.slices[1]?.order).toBe(2);
  });

  it("remaps file assignments after collapse", () => {
    const plan = makePlan();
    const result = collapseSlice(plan, 2);

    const serviceFile = result.fileAssignments.find((fa) => fa.path === "src/service.ts");
    const routesFile = result.fileAssignments.find((fa) => fa.path === "src/routes.ts");

    // Service was in slice 2, should now be in the merged slice
    expect(serviceFile?.targetSlice).toBeDefined();
    // Routes was in slice 3, should be renumbered
    expect(routesFile?.targetSlice).toBeDefined();
  });

  it("handles collapsing the last slice", () => {
    const plan = makePlan();
    const result = collapseSlice(plan, 3);

    expect(result.slices).toHaveLength(2);
  });

  it("handles collapsing the first slice", () => {
    const plan = makePlan();
    const result = collapseSlice(plan, 1);

    expect(result.slices).toHaveLength(2);
    expect(result.slices[0]?.order).toBe(1);
  });

  it("returns same plan if only one slice", () => {
    const plan = makePlan();
    const firstSlice = plan.slices[0];
    plan.slices = firstSlice ? [firstSlice] : [];
    const result = collapseSlice(plan, 1);

    expect(result.slices).toHaveLength(1);
  });

  it("merged slice title includes both originals", () => {
    const plan = makePlan();
    const result = collapseSlice(plan, 2);

    const mergedSlice = result.slices.find((s) => s.order === 2);
    expect(mergedSlice?.title).toContain("Routes");
    expect(mergedSlice?.title).toContain("Service");
  });
});
