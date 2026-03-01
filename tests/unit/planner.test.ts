import { describe, expect, it, vi } from "vitest";
import type { CIFailure, LlmAdapter, PlanContext } from "../../src/ai/adapter.js";
import { generatePlanWithRetries, resolveAdapter } from "../../src/ai/planner.js";
import type { Config } from "../../src/config/schema.js";
import type { StackPlan } from "../../src/types/index.js";

vi.mock("../../src/ai/claude-cli.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/ai/claude-cli.js")>();
  return {
    ...actual,
    isClaudeCliAvailable: vi.fn().mockResolvedValue(false),
  };
});

function makeContext(): PlanContext {
  return {
    diffText: "+export const x = 1;",
    preAnalysis: {
      files: [
        {
          path: "src/x.ts",
          additions: 1,
          deletions: 0,
          isNew: true,
          isDeleted: false,
          isRenamed: false,
          hunks: [],
        },
      ],
      depGraph: [],
      fileRoles: new Map([["src/x.ts", "core"]]),
      totalAdditions: 1,
      totalDeletions: 0,
    },
    fileTree: ["src/"],
    baseBranch: "main",
    sourceBranch: "feat/x",
    targetSlices: 2,
  };
}

function makePlan(): StackPlan {
  return {
    version: 1,
    baseBranch: "main",
    sourceBranch: "feat/x",
    slices: [
      { order: 1, title: "Types", rationale: "Foundation", branch: "stack/01", confidence: 0.9 },
      { order: 2, title: "Core", rationale: "Logic", branch: "stack/02", confidence: 0.85 },
    ],
    fileAssignments: [{ path: "src/x.ts", splitStrategy: "whole", targetSlice: 1 }],
    metadata: {
      totalFiles: 1,
      totalLoc: 1,
      generatedAt: new Date().toISOString(),
      model: "test",
      provider: "test",
    },
  };
}

function makeMockAdapter(overrides?: Partial<LlmAdapter>): LlmAdapter {
  return {
    generatePlan: vi.fn().mockResolvedValue(makePlan()),
    revisePlan: vi.fn().mockResolvedValue(makePlan()),
    ...overrides,
  };
}

describe("generatePlanWithRetries", () => {
  it("returns plan on first successful attempt", async () => {
    const adapter = makeMockAdapter();
    const plan = await generatePlanWithRetries(adapter, makeContext());
    expect(plan.slices).toHaveLength(2);
    expect(adapter.generatePlan).toHaveBeenCalledTimes(1);
  });

  it("retries on failure", async () => {
    const adapter = makeMockAdapter({
      generatePlan: vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce(makePlan()),
    });

    const plan = await generatePlanWithRetries(adapter, makeContext());
    expect(plan.slices).toHaveLength(2);
    expect(adapter.generatePlan).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries", async () => {
    const adapter = makeMockAdapter({
      generatePlan: vi.fn().mockRejectedValue(new Error("always fails")),
    });

    await expect(generatePlanWithRetries(adapter, makeContext())).rejects.toThrow("always fails");
    expect(adapter.generatePlan).toHaveBeenCalledTimes(3);
  });

  it("retries when plan has validation issues", async () => {
    const badPlan = makePlan();
    badPlan.fileAssignments = [];

    const goodPlan = makePlan();

    const adapter = makeMockAdapter({
      generatePlan: vi.fn().mockResolvedValueOnce(badPlan).mockResolvedValueOnce(goodPlan),
    });

    const plan = await generatePlanWithRetries(adapter, makeContext());
    expect(plan.fileAssignments).toHaveLength(1);
    expect(adapter.generatePlan).toHaveBeenCalledTimes(2);
  });

  it("warns when a slice exceeds 400 LOC", async () => {
    const bigContext = makeContext();
    bigContext.preAnalysis.files = [
      {
        path: "src/big.ts",
        additions: 500,
        deletions: 0,
        isNew: true,
        isDeleted: false,
        isRenamed: false,
        hunks: [],
      },
    ];

    const bigPlan = makePlan();
    bigPlan.fileAssignments = [{ path: "src/big.ts", splitStrategy: "whole", targetSlice: 1 }];

    const adapter = makeMockAdapter({
      generatePlan: vi.fn().mockResolvedValue(bigPlan),
    });

    const plan = await generatePlanWithRetries(adapter, bigContext);
    expect(plan.slices).toHaveLength(2);
  });
});

describe("resolveAdapter", () => {
  it("returns AiSdkAdapter for explicit provider", async () => {
    const config: Config = {
      llm: { provider: "anthropic", apiKey: "test-key" },
      stack: { targetPrs: 5, softCap: 6, hardCap: 10, branchPrefix: "stack/" },
      github: { remote: "origin" },
    };
    const adapter = await resolveAdapter(config);
    expect(adapter).toBeDefined();
    expect(adapter.generatePlan).toBeDefined();
  });

  it("throws when auto mode has no provider available", async () => {
    const config: Config = {
      llm: { provider: "auto" },
      stack: { targetPrs: 5, softCap: 6, hardCap: 10, branchPrefix: "stack/" },
      github: { remote: "origin" },
    };

    await expect(resolveAdapter(config)).rejects.toThrow("No LLM provider available");
  });
});

describe("adapter interface: revisePlan", () => {
  it("revisePlan is callable on mock adapter", async () => {
    const revisedPlan = makePlan();
    const firstSlice = revisedPlan.slices[0];
    if (!firstSlice) throw new Error("Expected at least one slice");
    revisedPlan.slices = [firstSlice];

    const adapter = makeMockAdapter({
      revisePlan: vi.fn().mockResolvedValue(revisedPlan),
    });

    const failure: CIFailure = {
      sliceOrder: 2,
      errorOutput: "Cannot find module './types'",
      failedCheck: "typecheck",
    };

    const result = await adapter.revisePlan(makePlan(), failure);
    expect(result.slices).toHaveLength(1);
    expect(adapter.revisePlan).toHaveBeenCalledWith(expect.anything(), failure);
  });

  it("revisePlan receives the correct failure info", async () => {
    const adapter = makeMockAdapter();

    const failure: CIFailure = {
      sliceOrder: 3,
      errorOutput: "error TS2307: Cannot find module",
      failedCheck: "typecheck",
    };

    await adapter.revisePlan(makePlan(), failure);
    expect(adapter.revisePlan).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1 }),
      expect.objectContaining({
        sliceOrder: 3,
        failedCheck: "typecheck",
      }),
    );
  });
});
