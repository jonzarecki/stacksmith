import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validatePlan, writePlan } from "../../src/core/plan.js";
import { applyPlan } from "../../src/git/plan-applier.js";
import type { StackPlan } from "../../src/types/index.js";

const execFileAsync = promisify(execFile);
const SETUP_SCRIPT = resolve(import.meta.dirname, "../../demo/setup-fixture.sh");
const GOLDEN_PLAN = resolve(import.meta.dirname, "../fixtures/plans/demo-golden-plan.json");

describe("demo E2E with cached AI response", () => {
  let demoDir: string;
  let git: SimpleGit;
  let plan: StackPlan;

  beforeEach(async () => {
    const { stdout } = await execFileAsync("bash", [SETUP_SCRIPT], { timeout: 10_000 });
    demoDir = stdout.trim();
    git = simpleGit(demoDir);

    const raw = await readFile(GOLDEN_PLAN, "utf-8");
    plan = validatePlan(JSON.parse(raw));
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(demoDir, { recursive: true, force: true }).catch(() => {});
  });

  it("applies the golden plan and creates 5 stack branches", { timeout: 30_000 }, async () => {
    await git.checkout("feat/full-rest-api");
    await writePlan(plan, demoDir);

    const branches = await applyPlan(git, plan, demoDir);

    expect(branches).toHaveLength(5);
    expect(branches).toEqual([
      "stack/01-middleware",
      "stack/02-user-service",
      "stack/03-user-routes",
      "stack/04-post-service",
      "stack/05-post-routes",
    ]);
  });

  it("each branch builds incrementally on the previous", { timeout: 30_000 }, async () => {
    await git.checkout("feat/full-rest-api");
    await writePlan(plan, demoDir);
    await applyPlan(git, plan, demoDir);

    // Slice 1: middleware only — no routes, no services
    await git.checkout("stack/01-middleware");
    const files1 = await git.raw(["ls-tree", "-r", "--name-only", "HEAD"]);
    expect(files1).toContain("src/middleware/error-handler.ts");
    expect(files1).toContain("src/middleware/validate.ts");
    expect(files1).toContain("tests/middleware.test.ts");
    expect(files1).not.toContain("src/services/user-service.ts");

    // Slice 2: user service + types added
    await git.checkout("stack/02-user-service");
    const files2 = await git.raw(["ls-tree", "-r", "--name-only", "HEAD"]);
    expect(files2).toContain("src/types/user.ts");
    expect(files2).toContain("src/services/user-service.ts");
    expect(files2).toContain("tests/user-service.test.ts");
    expect(files2).not.toContain("src/routes/users.ts");

    // Slice 3: user routes + app wiring added
    await git.checkout("stack/03-user-routes");
    const files3 = await git.raw(["ls-tree", "-r", "--name-only", "HEAD"]);
    expect(files3).toContain("src/routes/users.ts");
    const app3 = await readFile(join(demoDir, "src/app.ts"), "utf-8");
    expect(app3).toContain("userRouter");
    expect(app3).not.toContain("postRouter");

    // Slice 5: complete — has all post files
    await git.checkout("stack/05-post-routes");
    const files5 = await git.raw(["ls-tree", "-r", "--name-only", "HEAD"]);
    expect(files5).toContain("src/routes/posts.ts");
    expect(files5).toContain("src/services/post-service.ts");
    expect(files5).toContain("tests/post-service.test.ts");
    const app5 = await readFile(join(demoDir, "src/app.ts"), "utf-8");
    expect(app5).toContain("postRouter");
  });

  it(
    "tests are colocated with their code (not in separate slice)",
    { timeout: 30_000 },
    async () => {
      await git.checkout("feat/full-rest-api");
      await writePlan(plan, demoDir);
      await applyPlan(git, plan, demoDir);

      const testAssignments = plan.fileAssignments.filter(
        (fa) => fa.path.includes("test") || fa.path.includes("spec"),
      );

      for (const testFile of testAssignments) {
        const targetSlice = testFile.targetSlice ?? testFile.sliceContents?.[0]?.slice;
        expect(targetSlice, `${testFile.path} should have a slice assignment`).toBeDefined();

        // The test file's slice should also contain non-test code
        const sliceFiles = plan.fileAssignments.filter((fa) => {
          if (fa.targetSlice === targetSlice) return true;
          return fa.sliceContents?.some((sc) => sc.slice === targetSlice) ?? false;
        });
        const hasSourceCode = sliceFiles.some(
          (fa) => !fa.path.includes("test") && !fa.path.includes("spec"),
        );
        expect(
          hasSourceCode,
          `slice ${targetSlice} (with ${testFile.path}) should also have source code`,
        ).toBe(true);
      }
    },
  );

  it("verification data shows progressive test counts", () => {
    const verification = plan.metadata.verification;
    expect(verification).toBeDefined();
    expect(verification).toHaveLength(5);

    const testCounts = verification!.map((v) => v.testsRun ?? 0);
    // Each slice should run at least as many tests as the previous
    for (let i = 1; i < testCounts.length; i++) {
      expect(
        testCounts[i],
        `slice ${i + 1} should run >= tests than slice ${i}`,
      ).toBeGreaterThanOrEqual(testCounts[i - 1] ?? 0);
    }

    // All should pass
    for (const v of verification!) {
      expect(v.passed).toBe(true);
      expect(v.testsRun).toBe(v.testsPassed);
    }
  });

  it("final stack branch is byte-identical to source branch", { timeout: 30_000 }, async () => {
    await git.checkout("feat/full-rest-api");
    await writePlan(plan, demoDir);
    await applyPlan(git, plan, demoDir);

    const lastBranch = plan.slices.sort((a, b) => a.order - b.order).at(-1)?.branch;
    expect(lastBranch).toBeDefined();

    const diff = await git.diff([`${lastBranch}..feat/full-rest-api`]);
    expect(diff.trim(), "final stack branch should be identical to source branch").toBe("");
  });
});
