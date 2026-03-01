import { describe, expect, it } from "vitest";
import type { PrResult } from "../../src/github/pr-manager.js";
import { generatePrBody, getRepoInfo } from "../../src/github/pr-manager.js";
import type { StackPlan } from "../../src/types/index.js";

describe("getRepoInfo", () => {
  it("parses HTTPS remote URL", async () => {
    const info = await getRepoInfo("https://github.com/user/repo.git");
    expect(info.owner).toBe("user");
    expect(info.repo).toBe("repo");
  });

  it("parses SSH remote URL", async () => {
    const info = await getRepoInfo("git@github.com:user/repo.git");
    expect(info.owner).toBe("user");
    expect(info.repo).toBe("repo");
  });

  it("handles URL without .git suffix", async () => {
    const info = await getRepoInfo("https://github.com/user/repo");
    expect(info.owner).toBe("user");
    expect(info.repo).toBe("repo");
  });

  it("throws for non-GitHub URL", async () => {
    await expect(getRepoInfo("https://gitlab.com/user/repo")).rejects.toThrow();
  });
});

describe("generatePrBody", () => {
  const plan: StackPlan = {
    version: 1,
    baseBranch: "main",
    sourceBranch: "feat/x",
    slices: [
      {
        order: 1,
        title: "Types",
        rationale: "Foundation types",
        branch: "stack/01",
        confidence: 0.9,
      },
      {
        order: 2,
        title: "Core",
        rationale: "Core logic",
        branch: "stack/02",
        confidence: 0.85,
      },
      {
        order: 3,
        title: "Tests",
        rationale: "Test suite",
        branch: "stack/03",
        confidence: 0.8,
      },
    ],
    fileAssignments: [
      {
        path: "src/types.ts",
        splitStrategy: "whole",
        targetSlice: 1,
      },
    ],
    metadata: {
      totalFiles: 5,
      totalLoc: 100,
      generatedAt: "2026-03-01T00:00:00Z",
      model: "test",
      provider: "test",
    },
  };

  it("generates body with stack TOC", () => {
    const slice = plan.slices[0];
    if (!slice) throw new Error("Expected slice at index 0");
    const body = generatePrBody(slice, plan, []);
    expect(body).toContain("Types");
    expect(body).toContain("Stack");
    expect(body).toContain("auto-maintained stack");
  });

  it("includes depends-on link for non-first slices", () => {
    const prResults: PrResult[] = [
      {
        number: 42,
        url: "https://github.com/user/repo/pull/42",
        title: "[1/3] Types",
        draft: false,
      },
    ];
    const slice = plan.slices[1];
    if (!slice) throw new Error("Expected slice at index 1");
    const body = generatePrBody(slice, plan, prResults);
    expect(body).toContain("Depends on");
    expect(body).toContain("#42");
  });

  it("marks current slice in TOC", () => {
    const slice = plan.slices[1];
    if (!slice) throw new Error("Expected slice at index 1");
    const body = generatePrBody(slice, plan, []);
    expect(body).toContain("**>>**");
  });

  it("includes files changed list", () => {
    const planWithFiles: StackPlan = {
      ...plan,
      fileAssignments: [
        { path: "src/types.ts", splitStrategy: "whole", targetSlice: 1 },
        { path: "src/api.ts", splitStrategy: "whole", targetSlice: 2 },
      ],
    };
    const slice = planWithFiles.slices[0];
    if (!slice) throw new Error("Expected slice at index 0");
    const body = generatePrBody(slice, planWithFiles, []);
    expect(body).toContain("Files Changed");
    expect(body).toContain("src/types.ts");
    expect(body).not.toContain("src/api.ts");
  });
});
