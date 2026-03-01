/**
 * Live integration test that calls the real `claude` CLI.
 *
 * Skipped automatically when:
 *  - `claude` is not installed / not authenticated
 *  - The env var SKIP_LIVE_TESTS=1 is set
 *
 * Run explicitly with:
 *   pnpm test -- tests/e2e/live-claude.test.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlanContext } from "../../src/ai/adapter.js";
import { isClaudeCliAvailable } from "../../src/ai/claude-cli.js";
import { generatePlanWithRetries, resolveAdapter } from "../../src/ai/planner.js";
import type { Config } from "../../src/config/schema.js";
import { parseDiffString } from "../../src/core/diff-parser.js";
import { buildPreAnalysis } from "../../src/core/slicer.js";
import { applyPlan } from "../../src/git/plan-applier.js";
import type { StackPlan } from "../../src/types/index.js";
import { cleanupTestRepo, createTestRepo, setupTsApiFixture, type TestRepo } from "./helpers.js";

let shouldSkip = false;

beforeAll(async () => {
  if (process.env.SKIP_LIVE_TESTS === "1") {
    shouldSkip = true;
    return;
  }
  const available = await isClaudeCliAvailable();
  if (!available) {
    shouldSkip = true;
  }
});

describe("Live Claude CLI: split → apply", () => {
  let repo: TestRepo;

  beforeEach(async (ctx) => {
    if (shouldSkip) {
      ctx.skip();
      return;
    }
    repo = await createTestRepo();
    await setupTsApiFixture(repo);
  });

  afterEach(async () => {
    if (repo) {
      await cleanupTestRepo(repo);
    }
  });

  it("generates a valid plan from a real diff using Claude CLI", { timeout: 300_000 }, async () => {
    // ---- Arrange: get the diff from the fixture repo ----
    await repo.git.checkout("feat/user-api");
    const diffText = await repo.git.diff(["main...feat/user-api"]);
    const files = parseDiffString(diffText);
    const preAnalysis = buildPreAnalysis(files);

    const fileTree = (await repo.git.raw(["ls-tree", "-r", "--name-only", "HEAD"]))
      .split("\n")
      .filter((l) => l.trim().length > 0);

    const config: Config = {
      llm: { provider: "claude-cli" },
      stack: { targetPrs: 3, softCap: 4, hardCap: 10, branchPrefix: "stack/" },
      github: { remote: "origin" },
    };

    const context: PlanContext = {
      diffText,
      preAnalysis,
      fileTree,
      baseBranch: "main",
      sourceBranch: "feat/user-api",
      targetSlices: 3,
    };

    // ---- Act: call real Claude CLI ----
    const adapter = await resolveAdapter(config);
    const plan = await generatePlanWithRetries(adapter, context);

    // ---- Assert: plan schema + quality checks ----
    assertPlanSchema(plan);
    assertPlanQuality(
      plan,
      files.map((f) => f.path),
    );
    assertDependencyOrdering(plan);

    console.log("\n=== Generated Plan ===");
    console.log(`Slices: ${plan.slices.length}`);
    for (const slice of plan.slices) {
      const fileCount = plan.fileAssignments.filter(
        (fa) =>
          fa.targetSlice === slice.order ||
          fa.sliceContents?.some((sc) => sc.slice === slice.order) === true,
      ).length;
      console.log(
        `  ${slice.order}. ${slice.title} (${fileCount} files, confidence: ${slice.confidence})`,
      );
    }
    console.log(`File assignments: ${plan.fileAssignments.length}`);
    for (const fa of plan.fileAssignments) {
      const strategy =
        fa.splitStrategy === "dissect"
          ? `dissect (${fa.sliceContents?.length ?? 0} versions)`
          : `whole → slice ${fa.targetSlice}`;
      console.log(`  ${fa.path}: ${strategy}`);
    }

    // ---- Act: apply the plan ----
    await repo.git.checkout("main");
    const branches = await applyPlan(repo.git, plan, repo.dir);

    // ---- Assert: branches created and have content ----
    expect(branches.length).toBeGreaterThanOrEqual(1);
    expect(branches.length).toBeLessThanOrEqual(10);

    console.log(`\nBranches created: ${branches.join(", ")}`);

    // Verify each branch has at least one file changed vs its parent
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i] ?? "";
      const parentBranch = i === 0 ? "main" : (branches[i - 1] ?? "main");
      await repo.git.checkout(branch);

      const diffVsParent = await repo.git.diff([`${parentBranch}...${branch}`]);
      expect(diffVsParent.length).toBeGreaterThan(0);
    }

    // Verify final branch reproduces the full diff
    const lastBranch = branches[branches.length - 1] ?? "";
    await repo.git.checkout(lastBranch);

    // All source files from the feature branch should exist
    for (const filePath of [
      "src/types/user.ts",
      "src/services/user-service.ts",
      "src/routes/users.ts",
    ]) {
      const content = await readFile(join(repo.dir, filePath), "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }

    // The final app.ts should have the user routes wired in
    const finalApp = await readFile(join(repo.dir, "src/app.ts"), "utf-8");
    expect(finalApp).toContain("userRouter");

    console.log("\n✅ Live Claude CLI test passed — plan is valid and branches are correct");
  });
});

// ---- Quality assertion helpers ----

function assertPlanSchema(plan: StackPlan): void {
  expect(plan.version).toBe(1);
  expect(plan.baseBranch).toBe("main");
  expect(plan.sourceBranch).toBe("feat/user-api");
  expect(plan.slices.length).toBeGreaterThanOrEqual(1);
  expect(plan.slices.length).toBeLessThanOrEqual(10);
  expect(plan.fileAssignments.length).toBeGreaterThanOrEqual(1);
  expect(plan.metadata.model).toBeTruthy();
  expect(plan.metadata.provider).toBeTruthy();
}

function assertPlanQuality(plan: StackPlan, changedFiles: string[]): void {
  // Every changed file must be assigned
  const assignedPaths = new Set(plan.fileAssignments.map((fa) => fa.path));
  for (const file of changedFiles) {
    expect(assignedPaths.has(file), `Changed file ${file} not assigned to any slice`).toBe(true);
  }

  // No duplicate slice orders
  const orders = plan.slices.map((s) => s.order);
  expect(new Set(orders).size).toBe(orders.length);

  // Slice orders should be sequential starting from 1
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    expect(sorted[i]).toBe(i + 1);
  }

  // Every slice should have a non-empty title and rationale
  for (const slice of plan.slices) {
    expect(slice.title.length).toBeGreaterThan(0);
    expect(slice.rationale.length).toBeGreaterThan(0);
    expect(slice.branch.length).toBeGreaterThan(0);
    expect(slice.confidence).toBeGreaterThanOrEqual(0);
    expect(slice.confidence).toBeLessThanOrEqual(1);
  }

  // Whole files must have targetSlice, dissected files must have sliceContents
  for (const fa of plan.fileAssignments) {
    if (fa.splitStrategy === "whole") {
      expect(fa.targetSlice, `Whole file ${fa.path} missing targetSlice`).toBeDefined();
      expect(fa.targetSlice).toBeGreaterThanOrEqual(1);
      expect(fa.targetSlice).toBeLessThanOrEqual(plan.slices.length);
    }
    if (fa.splitStrategy === "dissect") {
      expect(
        fa.sliceContents?.length,
        `Dissected file ${fa.path} must have at least 1 slice content`,
      ).toBeGreaterThanOrEqual(1);
      for (const sc of fa.sliceContents ?? []) {
        expect(
          sc.content.length,
          `Empty content for ${fa.path} at slice ${sc.slice}`,
        ).toBeGreaterThan(0);
        expect(sc.description.length).toBeGreaterThan(0);
      }
    }
  }
}

function assertDependencyOrdering(plan: StackPlan): void {
  // Types/schemas should appear in earlier slices than routes/integration
  const typeSlices: number[] = [];
  const integrationSlices: number[] = [];

  for (const fa of plan.fileAssignments) {
    const targetSlice = fa.targetSlice ?? fa.sliceContents?.[0]?.slice;
    if (!targetSlice) continue;

    if (/types?[/.]/.test(fa.path) || /schemas?[/.]/.test(fa.path)) {
      typeSlices.push(targetSlice);
    }
    if (/routes?[/.]/.test(fa.path) || /controllers?[/.]/.test(fa.path)) {
      integrationSlices.push(targetSlice);
    }
  }

  if (typeSlices.length > 0 && integrationSlices.length > 0) {
    const earliestType = Math.min(...typeSlices);
    const earliestIntegration = Math.min(...integrationSlices);
    expect(
      earliestType,
      "Types/schemas should appear in an earlier or equal slice than routes/integration",
    ).toBeLessThanOrEqual(earliestIntegration);
  }
}
