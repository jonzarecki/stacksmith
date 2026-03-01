import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readPlan, validatePlan, writePlan } from "../../src/core/plan.js";
import { applyPlan } from "../../src/git/plan-applier.js";
import type { StackPlan } from "../../src/types/index.js";
import { cleanupTestRepo, createTestRepo, setupTsApiFixture, type TestRepo } from "./helpers.js";

const GOLDEN_PLAN_PATH = resolve(import.meta.dirname, "../fixtures/plans/ts-api-plan.json");

async function loadGoldenPlan(): Promise<StackPlan> {
  const raw = await readFile(GOLDEN_PLAN_PATH, "utf-8");
  return validatePlan(JSON.parse(raw));
}

describe("E2E: split → apply pipeline", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
    await setupTsApiFixture(repo);
  });

  afterEach(async () => {
    await cleanupTestRepo(repo);
  });

  it("applies a golden plan and creates correct branch stack", { timeout: 30_000 }, async () => {
    const plan = await loadGoldenPlan();

    const branches = await applyPlan(repo.git, plan, repo.dir);

    expect(branches).toEqual([
      "stack/01-user-types",
      "stack/02-user-service",
      "stack/03-user-routes",
    ]);

    // Branch 1: only types + dissected app (no userRouter)
    await repo.git.checkout("stack/01-user-types");
    const typesContent = await readFile(join(repo.dir, "src/types/user.ts"), "utf-8");
    expect(typesContent).toContain("interface User");
    expect(typesContent).toContain("interface CreateUserInput");

    const app1Content = await readFile(join(repo.dir, "src/app.ts"), "utf-8");
    expect(app1Content).toContain("health");
    expect(app1Content).not.toContain("userRouter");

    // Branch 2: adds service on top of branch 1
    await repo.git.checkout("stack/02-user-service");
    const serviceContent = await readFile(join(repo.dir, "src/services/user-service.ts"), "utf-8");
    expect(serviceContent).toContain("getUsers");
    expect(serviceContent).toContain("createUser");
    const typesStill = await readFile(join(repo.dir, "src/types/user.ts"), "utf-8");
    expect(typesStill).toContain("interface User");

    // Branch 3: adds routes, wires app, adds tests
    await repo.git.checkout("stack/03-user-routes");
    const routesContent = await readFile(join(repo.dir, "src/routes/users.ts"), "utf-8");
    expect(routesContent).toContain("userRouter");
    const app3Content = await readFile(join(repo.dir, "src/app.ts"), "utf-8");
    expect(app3Content).toContain("userRouter");
    const testContent = await readFile(join(repo.dir, "tests/user.test.ts"), "utf-8");
    expect(testContent).toContain("creates a user");
  });

  it("plan serialization roundtrip works", async () => {
    const plan = await loadGoldenPlan();

    await writePlan(plan, repo.dir);

    const loaded = await readPlan(repo.dir);
    expect(loaded.version).toBe(1);
    expect(loaded.slices).toHaveLength(3);
    expect(loaded.fileAssignments).toHaveLength(5);
  });

  it("final stack branch is identical to source branch", { timeout: 30_000 }, async () => {
    const plan = await loadGoldenPlan();

    const branches = await applyPlan(repo.git, plan, repo.dir);

    const lastBranch = branches[branches.length - 1];
    expect(lastBranch).toBeDefined();

    const diff = await repo.git.diff([`${lastBranch}..${plan.sourceBranch}`]);
    expect(diff.trim()).toBe("");
  });

  it("detects divergence when stack doesn't match source", { timeout: 30_000 }, async () => {
    const plan = await loadGoldenPlan();

    // Remove last file assignment to create an intentional divergence
    const modifiedPlan: StackPlan = {
      ...plan,
      fileAssignments: plan.fileAssignments.filter((fa) => fa.path !== "tests/user.test.ts"),
    };

    await applyPlan(repo.git, modifiedPlan, repo.dir);

    const lastBranch = modifiedPlan.slices.sort((a, b) => a.order - b.order).at(-1)?.branch;
    expect(lastBranch).toBeDefined();

    const diff = await repo.git.diff([`${lastBranch}..${plan.sourceBranch}`]);
    expect(diff.trim().length).toBeGreaterThan(0);
    expect(diff).toContain("user.test.ts");
  });
});
