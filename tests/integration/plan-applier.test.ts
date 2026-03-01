import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPlan } from "../../src/git/plan-applier.js";
import type { StackPlan } from "../../src/types/index.js";

describe("applyPlan", () => {
  let tmpDir: string;
  let git: SimpleGit;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "stacksmith-test-"));
    git = simpleGit(tmpDir);
    await git.init();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");

    await writeFile(join(tmpDir, "README.md"), "# Test\n", "utf-8");
    await git.add(".");
    await git.commit("initial");
    await git.branch(["-M", "main"]);

    await git.checkoutLocalBranch("feat/big-change");
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, "src/types.ts"), "export type User = { id: string };\n", "utf-8");
    await writeFile(
      join(tmpDir, "src/api.ts"),
      "import { User } from './types.js';\nexport function getUser(): User { return { id: '1' }; }\n",
      "utf-8",
    );
    await git.add(".");
    await git.commit("big change");

    await git.checkout("main");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates branches from a whole-file plan", async () => {
    const plan: StackPlan = {
      version: 1,
      baseBranch: "main",
      sourceBranch: "feat/big-change",
      slices: [
        {
          order: 1,
          title: "Add types",
          rationale: "Foundation types",
          branch: "stack/01-types",
          confidence: 0.9,
        },
        {
          order: 2,
          title: "Add API",
          rationale: "API layer",
          branch: "stack/02-api",
          confidence: 0.85,
        },
      ],
      fileAssignments: [
        { path: "src/types.ts", splitStrategy: "whole", targetSlice: 1 },
        { path: "src/api.ts", splitStrategy: "whole", targetSlice: 2 },
      ],
      metadata: {
        totalFiles: 2,
        totalLoc: 3,
        generatedAt: new Date().toISOString(),
        model: "test",
        provider: "test",
      },
    };

    const branches = await applyPlan(git, plan, tmpDir);
    expect(branches).toEqual(["stack/01-types", "stack/02-api"]);

    await git.checkout("stack/01-types");
    const typesContent = await readFile(join(tmpDir, "src/types.ts"), "utf-8");
    expect(typesContent).toContain("User");

    await git.checkout("stack/02-api");
    const apiContent = await readFile(join(tmpDir, "src/api.ts"), "utf-8");
    expect(apiContent).toContain("getUser");
  });

  it("creates branches from a dissect plan", async () => {
    const plan: StackPlan = {
      version: 1,
      baseBranch: "main",
      sourceBranch: "feat/big-change",
      slices: [
        {
          order: 1,
          title: "Add type",
          rationale: "Type only",
          branch: "stack/01-type",
          confidence: 0.9,
        },
        {
          order: 2,
          title: "Add function",
          rationale: "Logic",
          branch: "stack/02-fn",
          confidence: 0.85,
        },
      ],
      fileAssignments: [
        { path: "src/types.ts", splitStrategy: "whole", targetSlice: 1 },
        {
          path: "src/api.ts",
          splitStrategy: "dissect",
          sliceContents: [
            {
              slice: 1,
              content: "// placeholder\n",
              description: "Empty placeholder",
            },
            {
              slice: 2,
              content:
                "import { User } from './types.js';\nexport function getUser(): User { return { id: '1' }; }\n",
              description: "Full implementation",
            },
          ],
        },
      ],
      metadata: {
        totalFiles: 2,
        totalLoc: 3,
        generatedAt: new Date().toISOString(),
        model: "test",
        provider: "test",
      },
    };

    const branches = await applyPlan(git, plan, tmpDir);
    expect(branches).toHaveLength(2);

    await git.checkout("stack/01-type");
    const slice1Content = await readFile(join(tmpDir, "src/api.ts"), "utf-8");
    expect(slice1Content).toBe("// placeholder\n");

    await git.checkout("stack/02-fn");
    const slice2Content = await readFile(join(tmpDir, "src/api.ts"), "utf-8");
    expect(slice2Content).toContain("getUser");
  });

  it("deletes files with delete strategy", async () => {
    await git.checkout("main");
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, "src/deprecated.ts"), "// to be removed\n", "utf-8");
    await git.add(".");
    await git.commit("add deprecated");
    await git.checkout("feat/big-change");

    const plan: StackPlan = {
      version: 1,
      baseBranch: "main",
      sourceBranch: "feat/big-change",
      slices: [
        {
          order: 1,
          title: "Remove deprecated",
          rationale: "Cleanup",
          branch: "stack/01-cleanup",
          confidence: 0.9,
        },
        {
          order: 2,
          title: "Add types",
          rationale: "Foundation",
          branch: "stack/02-types",
          confidence: 0.9,
        },
      ],
      fileAssignments: [
        { path: "src/deprecated.ts", splitStrategy: "delete", targetSlice: 1 },
        { path: "src/types.ts", splitStrategy: "whole", targetSlice: 2 },
        { path: "src/api.ts", splitStrategy: "whole", targetSlice: 2 },
      ],
      metadata: {
        totalFiles: 3,
        totalLoc: 5,
        generatedAt: new Date().toISOString(),
        model: "test",
        provider: "test",
      },
    };

    const branches = await applyPlan(git, plan, tmpDir);
    expect(branches).toEqual(["stack/01-cleanup", "stack/02-types"]);

    await git.checkout("stack/01-cleanup");
    await expect(stat(join(tmpDir, "src/deprecated.ts"))).rejects.toThrow();

    await git.checkout("stack/02-types");
    const typesContent = await readFile(join(tmpDir, "src/types.ts"), "utf-8");
    expect(typesContent).toContain("User");
  });
});
