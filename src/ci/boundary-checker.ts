import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

export interface BoundaryResult {
  sliceOrder: number;
  branch: string;
  passed: boolean;
  errorOutput: string;
  check: string;
  testsRun?: number;
  testsPassed?: number;
}

export type RepoLanguage = "typescript" | "python" | "unknown";

export async function detectRepoLanguage(repoDir: string): Promise<RepoLanguage> {
  const checks: Array<{ file: string; lang: RepoLanguage }> = [
    { file: "tsconfig.json", lang: "typescript" },
    { file: "package.json", lang: "typescript" },
    { file: "pyproject.toml", lang: "python" },
    { file: "setup.py", lang: "python" },
    { file: "requirements.txt", lang: "python" },
  ];

  for (const { file, lang } of checks) {
    try {
      await access(join(repoDir, file));
      return lang;
    } catch {
      // file doesn't exist, try next
    }
  }

  return "unknown";
}

export async function installDependencies(repoDir: string, language: RepoLanguage): Promise<void> {
  if (language === "typescript") {
    try {
      await access(join(repoDir, "node_modules"));
      return;
    } catch {
      // node_modules doesn't exist, install
    }

    const lockFiles: Array<{ file: string; cmd: string; args: string[] }> = [
      { file: "pnpm-lock.yaml", cmd: "pnpm", args: ["install", "--frozen-lockfile"] },
      { file: "yarn.lock", cmd: "yarn", args: ["install", "--frozen-lockfile"] },
      { file: "package-lock.json", cmd: "npm", args: ["ci"] },
      { file: "package.json", cmd: "npm", args: ["install"] },
    ];

    for (const { file, cmd, args } of lockFiles) {
      try {
        await access(join(repoDir, file));
        logger.info(`Installing dependencies with ${cmd}...`);
        await execFileAsync(cmd, args, { cwd: repoDir, timeout: 120_000 });
        return;
      } catch {
        // lockfile doesn't exist or install failed, try next
      }
    }
    logger.warn("Could not install Node.js dependencies — tsc may fail");
  }

  if (language === "python") {
    const reqFile = join(repoDir, "requirements.txt");
    try {
      await access(reqFile);
      logger.info("Installing Python dependencies...");
      await execFileAsync("pip3", ["install", "-r", reqFile, "-q"], {
        cwd: repoDir,
        timeout: 120_000,
      });
    } catch {
      // no requirements.txt or install failed
    }
  }
}

export interface BoundaryCheckOptions {
  testCommand?: string;
  testTimeout?: number;
}

export async function checkBoundary(
  repoDir: string,
  language: RepoLanguage,
  sliceOrder: number,
  branch: string,
  options?: BoundaryCheckOptions,
): Promise<BoundaryResult> {
  const baseResult: Pick<BoundaryResult, "sliceOrder" | "branch"> = { sliceOrder, branch };

  let typecheckResult: BoundaryResult;
  if (language === "typescript") {
    typecheckResult = await checkTypescript(repoDir, baseResult);
  } else if (language === "python") {
    typecheckResult = await checkPython(repoDir, baseResult);
  } else {
    typecheckResult = { ...baseResult, passed: true, errorOutput: "", check: "none" };
  }

  if (!typecheckResult.passed) {
    return typecheckResult;
  }

  if (options?.testCommand) {
    const testResult = await checkTests(
      repoDir,
      options.testCommand,
      options.testTimeout ?? 300_000,
      baseResult,
    );
    if (!testResult.passed) {
      return testResult;
    }
    return {
      ...baseResult,
      passed: true,
      errorOutput: "",
      check: typecheckResult.check,
      testsRun: testResult.testsRun,
      testsPassed: testResult.testsPassed,
    };
  }

  return typecheckResult;
}

export async function checkTests(
  repoDir: string,
  testCommand: string,
  timeout: number,
  base: Pick<BoundaryResult, "sliceOrder" | "branch">,
): Promise<BoundaryResult> {
  try {
    const { stdout } = await execFileAsync("sh", ["-c", testCommand], {
      cwd: repoDir,
      timeout,
      env: { ...process.env, CI: "true" },
    });
    const counts = parseTestCounts(stdout);
    return { ...base, passed: true, errorOutput: "", check: "tests", ...counts };
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error
        ? String((error as NodeJS.ErrnoException & { stderr: string }).stderr)
        : "";
    const stdout =
      error instanceof Error && "stdout" in error
        ? String((error as NodeJS.ErrnoException & { stdout: string }).stdout)
        : "";
    const errorOutput =
      stdout || stderr || (error instanceof Error ? error.message : String(error));
    return { ...base, passed: false, errorOutput, check: "test" };
  }
}

async function checkTypescript(
  repoDir: string,
  base: Pick<BoundaryResult, "sliceOrder" | "branch">,
): Promise<BoundaryResult> {
  // Try tsc --noEmit first (best check), fall back to finding syntax errors
  try {
    await access(join(repoDir, "tsconfig.json"));
  } catch {
    return { ...base, passed: true, errorOutput: "", check: "skip:no-tsconfig" };
  }

  try {
    await execFileAsync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
      cwd: repoDir,
      timeout: 60_000,
      env: { ...process.env, NODE_ENV: "development" },
    });
    return { ...base, passed: true, errorOutput: "", check: "tsc" };
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error
        ? String((error as NodeJS.ErrnoException & { stderr: string }).stderr)
        : "";
    const stdout =
      error instanceof Error && "stdout" in error
        ? String((error as NodeJS.ErrnoException & { stdout: string }).stdout)
        : "";
    const errorOutput =
      stdout || stderr || (error instanceof Error ? error.message : String(error));
    return { ...base, passed: false, errorOutput, check: "tsc" };
  }
}

async function checkPython(
  repoDir: string,
  base: Pick<BoundaryResult, "sliceOrder" | "branch">,
): Promise<BoundaryResult> {
  try {
    await execFileAsync("python3", ["-m", "py_compile", "--help"], { timeout: 5000 });
  } catch {
    return { ...base, passed: true, errorOutput: "", check: "skip:no-python" };
  }

  // Find all .py files and compile-check them
  try {
    const { stdout: findResult } = await execFileAsync(
      "find",
      [repoDir, "-name", "*.py", "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.venv/*"],
      { timeout: 10_000 },
    );
    const pyFiles = findResult.split("\n").filter((f) => f.trim().length > 0);

    if (pyFiles.length === 0) {
      return { ...base, passed: true, errorOutput: "", check: "skip:no-py-files" };
    }

    const errors: string[] = [];
    for (const pyFile of pyFiles) {
      try {
        await execFileAsync("python3", ["-m", "py_compile", pyFile], { timeout: 10_000 });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${pyFile}: ${msg}`);
      }
    }

    if (errors.length > 0) {
      return { ...base, passed: false, errorOutput: errors.join("\n"), check: "py_compile" };
    }
    return { ...base, passed: true, errorOutput: "", check: "py_compile" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ...base, passed: false, errorOutput: msg, check: "py_compile" };
  }
}

export function parseTestCounts(output: string): { testsRun?: number; testsPassed?: number } {
  // vitest: "Tests  7 passed (7)" or "Tests  5 passed | 2 failed (7)"
  const vitestMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*\d+\s+failed)?\s*\((\d+)\)/);
  if (vitestMatch?.[1] && vitestMatch[2]) {
    return {
      testsPassed: Number.parseInt(vitestMatch[1], 10),
      testsRun: Number.parseInt(vitestMatch[2], 10),
    };
  }

  // jest: "Tests:  5 passed, 5 total" or "Tests:  3 passed, 2 failed, 5 total"
  const jestMatch = output.match(/Tests:\s+(\d+)\s+passed.*?(\d+)\s+total/);
  if (jestMatch?.[1] && jestMatch[2]) {
    return {
      testsPassed: Number.parseInt(jestMatch[1], 10),
      testsRun: Number.parseInt(jestMatch[2], 10),
    };
  }

  // pytest: "5 passed" or "3 passed, 2 failed"
  const pytestMatch = output.match(/(\d+)\s+passed/);
  const pytestTotal = output.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/);
  if (pytestMatch?.[1] && pytestTotal) {
    const passed = Number.parseInt(pytestMatch[1], 10);
    const failed = pytestTotal[2] ? Number.parseInt(pytestTotal[2], 10) : 0;
    return { testsPassed: passed, testsRun: passed + failed };
  }

  return {};
}
