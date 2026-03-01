import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";

export interface TestRepo {
  dir: string;
  git: SimpleGit;
}

export async function createTestRepo(): Promise<TestRepo> {
  const dir = await mkdtemp(join(tmpdir(), "stacksmith-e2e-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "test@stacksmith.dev");
  await git.addConfig("user.name", "Stacksmith Test");
  return { dir, git };
}

export async function cleanupTestRepo(repo: TestRepo): Promise<void> {
  await rm(repo.dir, { recursive: true, force: true });
}

/**
 * Set up a TS API fixture repo with a main branch and a feature branch
 * containing a multi-file user API diff.
 */
export async function setupTsApiFixture(repo: TestRepo): Promise<void> {
  const { dir, git } = repo;

  // Main branch: minimal Express app
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify(
      { name: "test-api", type: "module", dependencies: { express: "^4.18.0" } },
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "src/app.ts"),
    'import express from "express";\n\nconst app = express();\n\napp.get("/health", (_req, res) => {\n  res.json({ status: "ok" });\n});\n\nexport default app;\n',
  );
  await git.add(".");
  await git.commit("initial: express app with health endpoint");
  await git.branch(["-M", "main"]);

  // Feature branch: add user types, service, routes, wire into app, add tests
  await git.checkoutLocalBranch("feat/user-api");

  await mkdir(join(dir, "src/types"), { recursive: true });
  await writeFile(
    join(dir, "src/types/user.ts"),
    "export interface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nexport interface CreateUserInput {\n  name: string;\n  email: string;\n}\n",
  );

  await mkdir(join(dir, "src/services"), { recursive: true });
  await writeFile(
    join(dir, "src/services/user-service.ts"),
    'import type { User, CreateUserInput } from "../types/user.js";\n\nconst users: User[] = [];\n\nexport function getUsers(): User[] {\n  return users;\n}\n\nexport function createUser(input: CreateUserInput): User {\n  const user: User = { id: String(users.length + 1), ...input };\n  users.push(user);\n  return user;\n}\n',
  );

  await mkdir(join(dir, "src/routes"), { recursive: true });
  await writeFile(
    join(dir, "src/routes/users.ts"),
    'import { Router } from "express";\nimport { getUsers, createUser } from "../services/user-service.js";\n\nexport const userRouter = Router();\n\nuserRouter.get("/", (_req, res) => {\n  res.json(getUsers());\n});\n\nuserRouter.post("/", (req, res) => {\n  const user = createUser(req.body);\n  res.status(201).json(user);\n});\n',
  );

  // Update app.ts to wire routes
  await writeFile(
    join(dir, "src/app.ts"),
    'import express from "express";\nimport { userRouter } from "./routes/users.js";\n\nconst app = express();\n\napp.get("/health", (_req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.use("/users", userRouter);\n\nexport default app;\n',
  );

  await mkdir(join(dir, "tests"), { recursive: true });
  await writeFile(
    join(dir, "tests/user.test.ts"),
    'import { describe, it, expect } from "vitest";\nimport { getUsers, createUser } from "../src/services/user-service.js";\n\ndescribe("user service", () => {\n  it("creates a user", () => {\n    const user = createUser({ name: "Alice", email: "alice@test.com" });\n    expect(user.name).toBe("Alice");\n  });\n});\n',
  );

  await git.add(".");
  await git.commit("feat: add user API with types, service, routes, and tests");

  // Go back to main for test setup
  await git.checkout("main");
}
