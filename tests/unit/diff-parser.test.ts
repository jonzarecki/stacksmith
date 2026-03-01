import { describe, expect, it } from "vitest";
import { computeDiffStats, parseDiffString } from "../../src/core/diff-parser.js";

const SIMPLE_DIFF = `diff --git a/src/types.ts b/src/types.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/types.ts
@@ -0,0 +1,5 @@
+export interface User {
+  id: string;
+  name: string;
+  email: string;
+}
`;

const MODIFY_DIFF = `diff --git a/src/api.ts b/src/api.ts
index 1234567..abcdefg 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -1,3 +1,5 @@
 import express from "express";
+import { User } from "./types.js";

 const app = express();
+app.get("/users", (req, res) => res.json([]));
`;

const RENAME_DIFF = `diff --git a/old-name.ts b/new-name.ts
similarity index 90%
rename from old-name.ts
rename to new-name.ts
index 1234567..abcdefg 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,3 @@
-export const OLD = true;
+export const NEW = true;
`;

const DELETE_DIFF = `diff --git a/deprecated.ts b/deprecated.ts
deleted file mode 100644
index 1234567..0000000
--- a/deprecated.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export const DEPRECATED = true;
-export const OLD_THING = 42;
-export const REMOVE_ME = "gone";
`;

const MULTI_FILE_DIFF = `${SIMPLE_DIFF}${MODIFY_DIFF}`;

describe("parseDiffString", () => {
  it("parses a new file diff", () => {
    const files = parseDiffString(SIMPLE_DIFF);
    expect(files).toHaveLength(1);
    const file = files[0] ?? expect.fail("expected file");
    expect(file.path).toBe("src/types.ts");
    expect(file.isNew).toBe(true);
    expect(file.isDeleted).toBe(false);
    expect(file.additions).toBe(5);
    expect(file.deletions).toBe(0);
    expect(file.hunks).toHaveLength(1);
  });

  it("parses a modified file diff", () => {
    const files = parseDiffString(MODIFY_DIFF);
    expect(files).toHaveLength(1);
    const file = files[0] ?? expect.fail("expected file");
    expect(file.path).toBe("src/api.ts");
    expect(file.isNew).toBe(false);
    expect(file.additions).toBe(2);
    expect(file.deletions).toBe(0);
  });

  it("parses a renamed file diff", () => {
    const files = parseDiffString(RENAME_DIFF);
    expect(files).toHaveLength(1);
    const file = files[0] ?? expect.fail("expected file");
    expect(file.path).toBe("new-name.ts");
    expect(file.oldPath).toBe("old-name.ts");
    expect(file.isRenamed).toBe(true);
  });

  it("parses a deleted file diff", () => {
    const files = parseDiffString(DELETE_DIFF);
    expect(files).toHaveLength(1);
    const file = files[0] ?? expect.fail("expected file");
    expect(file.isDeleted).toBe(true);
    expect(file.deletions).toBe(3);
  });

  it("parses multi-file diffs", () => {
    const files = parseDiffString(MULTI_FILE_DIFF);
    expect(files).toHaveLength(2);
    expect(files[0]?.path).toBe("src/types.ts");
    expect(files[1]?.path).toBe("src/api.ts");
  });

  it("returns empty array for empty input", () => {
    expect(parseDiffString("")).toHaveLength(0);
  });
});

describe("computeDiffStats", () => {
  it("computes stats across files", () => {
    const files = parseDiffString(MULTI_FILE_DIFF);
    const stats = computeDiffStats(files);
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalAdditions).toBe(7);
    expect(stats.totalDeletions).toBe(0);
  });
});
