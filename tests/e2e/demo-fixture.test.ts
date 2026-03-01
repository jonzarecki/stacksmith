import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const SETUP_SCRIPT = resolve(import.meta.dirname, "../../demo/setup-fixture.sh");

describe("demo fixture setup", () => {
  let demoDir: string | undefined;

  afterEach(async () => {
    if (demoDir) {
      const { rm } = await import("node:fs/promises");
      await rm(demoDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("creates a valid git repo with the expected diff", { timeout: 15_000 }, async () => {
    const { stdout } = await execFileAsync("bash", [SETUP_SCRIPT], { timeout: 10_000 });
    demoDir = stdout.trim();

    await access(demoDir);

    const git = simpleGit(demoDir);

    const branches = await git.branch();
    expect(branches.all).toContain("main");
    expect(branches.all).toContain("feat/full-rest-api");
    expect(branches.current).toBe("main");

    const diffStat = await git.diff(["--shortstat", "main..feat/full-rest-api"]);
    const filesMatch = diffStat.match(/(\d+) files? changed/);
    const insertionsMatch = diffStat.match(/(\d+) insertions?/);

    const filesChanged = filesMatch ? Number.parseInt(filesMatch[1] ?? "0", 10) : 0;
    const insertions = insertionsMatch ? Number.parseInt(insertionsMatch[1] ?? "0", 10) : 0;

    expect(filesChanged).toBeGreaterThanOrEqual(8);
    expect(insertions).toBeGreaterThan(300);
  });

  it("has existing tests on main branch", { timeout: 15_000 }, async () => {
    const { stdout } = await execFileAsync("bash", [SETUP_SCRIPT], { timeout: 10_000 });
    demoDir = stdout.trim();

    const git = simpleGit(demoDir);
    const files = await git.raw(["ls-tree", "-r", "--name-only", "main"]);
    const fileList = files.split("\n").filter((f) => f.trim().length > 0);

    expect(fileList).toContain("tests/health.test.ts");
    expect(fileList).toContain("tests/helpers.ts");
  });

  it("has correct file structure on the feature branch", { timeout: 15_000 }, async () => {
    const { stdout } = await execFileAsync("bash", [SETUP_SCRIPT], { timeout: 10_000 });
    demoDir = stdout.trim();

    const git = simpleGit(demoDir);
    await git.checkout("feat/full-rest-api");

    const files = await git.raw(["ls-tree", "-r", "--name-only", "HEAD"]);
    const fileList = files.split("\n").filter((f) => f.trim().length > 0);

    const expectedPaths = [
      "src/types/user.ts",
      "src/types/post.ts",
      "src/services/user-service.ts",
      "src/services/post-service.ts",
      "src/routes/users.ts",
      "src/routes/posts.ts",
      "src/middleware/validate.ts",
      "src/middleware/error-handler.ts",
      "src/app.ts",
      "tests/user-service.test.ts",
      "tests/user-routes.test.ts",
      "tests/post-service.test.ts",
      "tests/post-routes.test.ts",
      "tests/middleware.test.ts",
    ];

    for (const path of expectedPaths) {
      expect(fileList, `missing ${path}`).toContain(path);
    }
  });
});
