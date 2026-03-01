import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPlan } from "../../src/git/plan-applier.js";
import type { StackPlan } from "../../src/types/index.js";
import { cleanupTestRepo, createTestRepo, setupTsApiFixture, type TestRepo } from "./helpers.js";

describe("E2E: dissected file handling", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
    await setupTsApiFixture(repo);
  });

  afterEach(async () => {
    await cleanupTestRepo(repo);
  });

  it("dissected files have correct intermediate states", async () => {
    const plan: StackPlan = {
      version: 1,
      baseBranch: "main",
      sourceBranch: "feat/user-api",
      slices: [
        {
          order: 1,
          title: "Foundation",
          rationale: "Base setup",
          branch: "stack/01-foundation",
          confidence: 0.9,
        },
        {
          order: 2,
          title: "Full feature",
          rationale: "Complete implementation",
          branch: "stack/02-feature",
          confidence: 0.85,
        },
      ],
      fileAssignments: [
        { path: "src/types/user.ts", splitStrategy: "whole", targetSlice: 1 },
        {
          path: "src/app.ts",
          splitStrategy: "dissect",
          sliceContents: [
            {
              slice: 1,
              content:
                'import express from "express";\n\nconst app = express();\napp.get("/health", (_req, res) => res.json({ status: "ok" }));\nexport default app;\n',
              description: "Unchanged app with health endpoint",
            },
            {
              slice: 2,
              content:
                'import express from "express";\nimport { userRouter } from "./routes/users.js";\n\nconst app = express();\napp.get("/health", (_req, res) => res.json({ status: "ok" }));\napp.use("/users", userRouter);\nexport default app;\n',
              description: "Wire user routes",
            },
          ],
        },
        { path: "src/services/user-service.ts", splitStrategy: "whole", targetSlice: 2 },
        { path: "src/routes/users.ts", splitStrategy: "whole", targetSlice: 2 },
        { path: "tests/user.test.ts", splitStrategy: "whole", targetSlice: 2 },
      ],
      metadata: {
        totalFiles: 5,
        totalLoc: 85,
        generatedAt: "2026-03-01T00:00:00Z",
        model: "test",
        provider: "test",
      },
    };

    await applyPlan(repo.git, plan, repo.dir);

    // Branch 1: app.ts should NOT have userRouter
    await repo.git.checkout("stack/01-foundation");
    const app1 = await readFile(join(repo.dir, "src/app.ts"), "utf-8");
    expect(app1).toContain("health");
    expect(app1).not.toContain("userRouter");
    expect(app1).not.toContain("routes/users");

    // Branch 2: app.ts SHOULD have userRouter
    await repo.git.checkout("stack/02-feature");
    const app2 = await readFile(join(repo.dir, "src/app.ts"), "utf-8");
    expect(app2).toContain("userRouter");
    expect(app2).toContain("routes/users");
  });

  it("final branch state matches source branch for whole files", async () => {
    const plan: StackPlan = {
      version: 1,
      baseBranch: "main",
      sourceBranch: "feat/user-api",
      slices: [
        {
          order: 1,
          title: "All changes",
          rationale: "Everything",
          branch: "stack/01-all",
          confidence: 1.0,
        },
      ],
      fileAssignments: [
        { path: "src/types/user.ts", splitStrategy: "whole", targetSlice: 1 },
        { path: "src/services/user-service.ts", splitStrategy: "whole", targetSlice: 1 },
        { path: "src/routes/users.ts", splitStrategy: "whole", targetSlice: 1 },
        { path: "src/app.ts", splitStrategy: "whole", targetSlice: 1 },
        { path: "tests/user.test.ts", splitStrategy: "whole", targetSlice: 1 },
      ],
      metadata: {
        totalFiles: 5,
        totalLoc: 85,
        generatedAt: "2026-03-01T00:00:00Z",
        model: "test",
        provider: "test",
      },
    };

    await applyPlan(repo.git, plan, repo.dir);

    await repo.git.checkout("stack/01-all");
    const appContent = await readFile(join(repo.dir, "src/app.ts"), "utf-8");
    expect(appContent).toContain("userRouter");

    // Compare with source branch
    await repo.git.checkout("feat/user-api");
    const sourceAppContent = await readFile(join(repo.dir, "src/app.ts"), "utf-8");
    expect(appContent).toBe(sourceAppContent);
  });
});
