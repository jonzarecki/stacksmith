import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkTests, detectRepoLanguage, parseTestCounts } from "../../src/ci/boundary-checker.js";

describe("detectRepoLanguage", () => {
  it("detects TypeScript from tsconfig.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lang-test-"));
    try {
      await writeFile(join(dir, "tsconfig.json"), "{}", "utf-8");
      const lang = await detectRepoLanguage(dir);
      expect(lang).toBe("typescript");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects Python from pyproject.toml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lang-test-"));
    try {
      await writeFile(join(dir, "pyproject.toml"), "[tool.poetry]", "utf-8");
      const lang = await detectRepoLanguage(dir);
      expect(lang).toBe("python");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns unknown for empty dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lang-test-"));
    try {
      const lang = await detectRepoLanguage(dir);
      expect(lang).toBe("unknown");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers TypeScript when both tsconfig and package.json exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lang-test-"));
    try {
      await writeFile(join(dir, "tsconfig.json"), "{}", "utf-8");
      await writeFile(join(dir, "package.json"), "{}", "utf-8");
      const lang = await detectRepoLanguage(dir);
      expect(lang).toBe("typescript");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("checkTests", () => {
  const base = { sliceOrder: 1, branch: "stack/01-test" };

  it("passes when test command exits 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-cmd-"));
    try {
      const result = await checkTests(dir, "true", 10_000, base);
      expect(result.passed).toBe(true);
      expect(result.check).toBe("tests");
      expect(result.errorOutput).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when test command exits non-zero", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-cmd-"));
    try {
      const result = await checkTests(dir, "echo 'FAIL: missing import' && exit 1", 10_000, base);
      expect(result.passed).toBe(false);
      expect(result.check).toBe("test");
      expect(result.errorOutput).toContain("FAIL: missing import");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("captures stderr on failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-cmd-"));
    try {
      const result = await checkTests(dir, "echo 'error detail' >&2 && exit 1", 10_000, base);
      expect(result.passed).toBe(false);
      expect(result.errorOutput).toContain("error detail");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves sliceOrder and branch in result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-cmd-"));
    const customBase = { sliceOrder: 3, branch: "stack/03-api" };
    try {
      const result = await checkTests(dir, "true", 10_000, customBase);
      expect(result.sliceOrder).toBe(3);
      expect(result.branch).toBe("stack/03-api");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs the command in the specified directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "test-cmd-"));
    try {
      await writeFile(join(dir, "marker.txt"), "found", "utf-8");
      const result = await checkTests(dir, "cat marker.txt", 10_000, base);
      expect(result.passed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("parseTestCounts", () => {
  it("parses vitest output", () => {
    const result = parseTestCounts(" Tests  7 passed (7)");
    expect(result).toEqual({ testsPassed: 7, testsRun: 7 });
  });

  it("parses vitest output with failures", () => {
    const result = parseTestCounts(" Tests  5 passed | 2 failed (7)");
    expect(result).toEqual({ testsPassed: 5, testsRun: 7 });
  });

  it("parses jest output", () => {
    const result = parseTestCounts("Tests:  12 passed, 12 total");
    expect(result).toEqual({ testsPassed: 12, testsRun: 12 });
  });

  it("parses jest output with failures", () => {
    const result = parseTestCounts("Tests:  8 passed, 2 failed, 10 total");
    expect(result).toEqual({ testsPassed: 8, testsRun: 10 });
  });

  it("parses pytest output", () => {
    const result = parseTestCounts("5 passed in 0.3s");
    expect(result).toEqual({ testsPassed: 5, testsRun: 5 });
  });

  it("parses pytest output with failures", () => {
    const result = parseTestCounts("3 passed, 1 failed in 0.5s");
    expect(result).toEqual({ testsPassed: 3, testsRun: 4 });
  });

  it("returns empty for unrecognized output", () => {
    const result = parseTestCounts("all good!");
    expect(result).toEqual({});
  });
});
