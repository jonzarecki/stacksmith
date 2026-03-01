import { describe, expect, it } from "vitest";
import type { PrResult } from "../../src/github/pr-manager.js";
import type { StackPlan } from "../../src/types/index.js";
import {
  type BranchDiffStat,
  formatBeforeAfter,
  formatBranchStats,
  formatPlanSummary,
  formatPrCards,
  formatStackTree,
  parseShortStat,
} from "../../src/utils/display.js";

function makePlan(): StackPlan {
  return {
    version: 1,
    baseBranch: "main",
    sourceBranch: "feat/user-api",
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
        title: "Add service",
        rationale: "Core logic",
        branch: "stack/02-service",
        confidence: 0.9,
      },
      {
        order: 3,
        title: "Add routes",
        rationale: "HTTP layer",
        branch: "stack/03-routes",
        confidence: 0.85,
      },
    ],
    fileAssignments: [
      { path: "src/types/user.ts", splitStrategy: "whole", targetSlice: 1 },
      { path: "src/services/user.ts", splitStrategy: "whole", targetSlice: 2 },
      { path: "src/routes/users.ts", splitStrategy: "whole", targetSlice: 3 },
      { path: "tests/user.test.ts", splitStrategy: "whole", targetSlice: 3 },
    ],
    metadata: {
      totalFiles: 4,
      totalLoc: 120,
      generatedAt: "2026-03-01T00:00:00Z",
      model: "test",
      provider: "test",
    },
  };
}

function makePlanWithVerification(): StackPlan {
  const plan = makePlan();
  plan.metadata.verification = [
    { sliceOrder: 1, check: "tsc", passed: true },
    { sliceOrder: 2, check: "tsc", passed: true },
    { sliceOrder: 3, check: "tsc", passed: false },
  ];
  return plan;
}

function makePlanWithTests(): StackPlan {
  const plan = makePlan();
  plan.metadata.verification = [
    { sliceOrder: 1, check: "tsc", passed: true, testsRun: 2, testsPassed: 2 },
    { sliceOrder: 2, check: "tsc", passed: true, testsRun: 9, testsPassed: 9 },
    { sliceOrder: 3, check: "tsc", passed: true, testsRun: 15, testsPassed: 15 },
  ];
  return plan;
}

function makePlanWithDissect(): StackPlan {
  return {
    ...makePlan(),
    fileAssignments: [
      { path: "src/types/user.ts", splitStrategy: "whole", targetSlice: 1 },
      { path: "src/services/user.ts", splitStrategy: "whole", targetSlice: 2 },
      {
        path: "src/app.ts",
        splitStrategy: "dissect",
        sliceContents: [
          {
            slice: 1,
            content:
              "import express from 'express';\nconst app = express();\nexport default app;\n",
            description: "Base app",
          },
          {
            slice: 2,
            content:
              "import express from 'express';\nimport { userRouter } from './routes/users.js';\nconst app = express();\napp.use('/users', userRouter);\nexport default app;\n",
            description: "Wire routes",
          },
        ],
      },
    ],
    metadata: { ...makePlan().metadata, totalLoc: 100 },
  };
}

describe("formatPlanSummary", () => {
  it("includes slice count header", () => {
    const output = formatPlanSummary(makePlan());
    expect(output).toContain("3 slices");
  });

  it("includes all slice titles", () => {
    const output = formatPlanSummary(makePlan());
    expect(output).toContain("Add types");
    expect(output).toContain("Add service");
    expect(output).toContain("Add routes");
  });

  it("includes LOC column header", () => {
    const output = formatPlanSummary(makePlan());
    expect(output).toContain("LOC");
  });

  it("computes LOC from dissected file contents", () => {
    const output = formatPlanSummary(makePlanWithDissect());
    // Slice 1: dissected app.ts = 4 lines (3 lines + trailing newline split)
    // Slice 2: dissected app.ts = 6 lines (5 lines + trailing newline split)
    expect(output).toContain("~4");
    expect(output).toContain("~6");
  });

  it("estimates LOC when no slice contents available", () => {
    const output = formatPlanSummary(makePlan());
    expect(output).toContain("~40");
  });

  it("shows Lint column when verification data present", () => {
    const output = formatPlanSummary(makePlanWithVerification());
    expect(output).toContain("Lint");
    expect(output).toContain("tsc");
  });

  it("shows pass/fail markers in Lint column", () => {
    const output = formatPlanSummary(makePlanWithVerification());
    expect(output).toContain("✓");
    expect(output).toContain("✗");
  });

  it("shows lint summary line", () => {
    const output = formatPlanSummary(makePlanWithVerification());
    expect(output).toContain("2/3 slices passed");
    expect(output).toContain("tsc");
  });

  it("omits Lint column when no verification data", () => {
    const output = formatPlanSummary(makePlan());
    expect(output).not.toContain("Lint");
  });

  it("shows separate Tests column with counts when tests were run", () => {
    const output = formatPlanSummary(makePlanWithTests());
    expect(output).toContain("Tests");
    expect(output).toContain("2/2 passed");
    expect(output).toContain("9/9 passed");
    expect(output).toContain("15/15 passed");
  });

  it("shows test count progression across slices", () => {
    const output = formatPlanSummary(makePlanWithTests());
    expect(output).toContain("26/26 passed across 3 slices");
  });

  it("omits Tests column when no test data", () => {
    const output = formatPlanSummary(makePlanWithVerification());
    expect(output).not.toContain("Tests");
  });
});

describe("formatStackTree", () => {
  it("includes base branch", () => {
    const output = formatStackTree(makePlan());
    expect(output).toContain("main");
  });

  it("includes all stack branches", () => {
    const output = formatStackTree(makePlan());
    expect(output).toContain("stack/01-types");
    expect(output).toContain("stack/02-service");
    expect(output).toContain("stack/03-routes");
  });

  it("marks first PR as ready and rest as draft", () => {
    const output = formatStackTree(makePlan());
    expect(output).toContain("Ready for Review");
    expect(output).toContain("Draft");
  });
});

describe("formatBranchStats", () => {
  const stats: BranchDiffStat[] = [
    { sliceOrder: 1, filesChanged: 1, insertions: 20, deletions: 0 },
    { sliceOrder: 2, filesChanged: 1, insertions: 30, deletions: 5 },
    { sliceOrder: 3, filesChanged: 2, insertions: 40, deletions: 0 },
  ];

  it("includes slice titles", () => {
    const output = formatBranchStats(makePlan(), stats);
    expect(output).toContain("Add types");
    expect(output).toContain("Add service");
    expect(output).toContain("Add routes");
  });

  it("includes file change counts", () => {
    const output = formatBranchStats(makePlan(), stats);
    expect(output).toContain("1 file changed");
    expect(output).toContain("2 files changed");
  });

  it("includes insertions and deletions", () => {
    const output = formatBranchStats(makePlan(), stats);
    expect(output).toContain("+20");
    expect(output).toContain("+30");
    expect(output).toContain("-5");
  });

  it("shows lint badges when verification data present", () => {
    const output = formatBranchStats(makePlanWithVerification(), stats);
    expect(output).toContain("✓ tsc");
    expect(output).toContain("✗ tsc");
  });

  it("shows test count badges when test data present", () => {
    const output = formatBranchStats(makePlanWithTests(), stats);
    expect(output).toContain("2/2 tests");
    expect(output).toContain("9/9 tests");
    expect(output).toContain("15/15 tests");
  });

  it("omits badges when no verification data", () => {
    const output = formatBranchStats(makePlan(), stats);
    expect(output).not.toContain("✓ tsc");
    expect(output).not.toContain("tests");
  });
});

describe("formatBeforeAfter", () => {
  it("includes before and after info", () => {
    const output = formatBeforeAfter(4, 120, 3);
    expect(output).toContain("4 files");
    expect(output).toContain("120 lines");
    expect(output).toContain("3 small");
  });
});

describe("formatPrCards", () => {
  const prs: PrResult[] = [
    { number: 10, url: "https://github.com/o/r/pull/10", title: "[1/3] Add types", draft: false },
    { number: 11, url: "https://github.com/o/r/pull/11", title: "[2/3] Add service", draft: true },
    { number: 12, url: "https://github.com/o/r/pull/12", title: "[3/3] Add routes", draft: true },
  ];

  it("includes PR numbers and titles", () => {
    const output = formatPrCards(makePlan(), prs);
    expect(output).toContain("PR #10");
    expect(output).toContain("PR #11");
    expect(output).toContain("PR #12");
  });

  it("includes status badges", () => {
    const output = formatPrCards(makePlan(), prs);
    expect(output).toContain("Ready for Review");
    expect(output).toContain("Draft");
  });

  it("includes dependency info for non-first PRs", () => {
    const output = formatPrCards(makePlan(), prs);
    expect(output).toContain("Depends on: #10");
  });

  it("includes PR URLs", () => {
    const output = formatPrCards(makePlan(), prs);
    expect(output).toContain("https://github.com/o/r/pull/10");
    expect(output).toContain("https://github.com/o/r/pull/12");
  });

  it("includes base branch info", () => {
    const output = formatPrCards(makePlan(), prs);
    expect(output).toContain("stack/01-types → main");
    expect(output).toContain("stack/02-service → stack/01-types");
  });
});

describe("parseShortStat", () => {
  it("parses full shortstat with insertions and deletions", () => {
    const result = parseShortStat(" 3 files changed, 50 insertions(+), 10 deletions(-)");
    expect(result).toEqual({ filesChanged: 3, insertions: 50, deletions: 10 });
  });

  it("parses insertions only", () => {
    const result = parseShortStat(" 2 files changed, 100 insertions(+)");
    expect(result).toEqual({ filesChanged: 2, insertions: 100, deletions: 0 });
  });

  it("parses single file changed", () => {
    const result = parseShortStat(" 1 file changed, 5 insertions(+)");
    expect(result).toEqual({ filesChanged: 1, insertions: 5, deletions: 0 });
  });

  it("parses deletions only", () => {
    const result = parseShortStat(" 1 file changed, 20 deletions(-)");
    expect(result).toEqual({ filesChanged: 1, insertions: 0, deletions: 20 });
  });

  it("returns zeros for empty string", () => {
    const result = parseShortStat("");
    expect(result).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
  });
});
