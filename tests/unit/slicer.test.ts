import { describe, expect, it } from "vitest";
import { bucketByRole, buildPreAnalysis, topologicalSort } from "../../src/core/slicer.js";
import type { DepEdge, DiffFile, FileRole } from "../../src/types/index.js";

describe("bucketByRole", () => {
  it("groups files by role in correct order", () => {
    const roles = new Map<string, FileRole>([
      ["src/types.ts", "types"],
      ["src/api.test.ts", "tests"],
      ["src/service.ts", "core"],
      ["src/routes.ts", "integration"],
      ["README.md", "docs"],
    ]);

    const buckets = bucketByRole(roles);
    const roleOrder = buckets.map((b) => b.role);

    expect(roleOrder).toEqual(["types", "core", "integration", "tests", "docs"]);
    expect(buckets[0]?.files).toEqual(["src/types.ts"]);
  });

  it("omits empty buckets", () => {
    const roles = new Map<string, FileRole>([["src/a.ts", "core"]]);
    const buckets = bucketByRole(roles);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.role).toBe("core");
  });
});

describe("topologicalSort", () => {
  it("sorts files by dependency order", () => {
    const files = ["src/api.ts", "src/types.ts", "src/utils.ts"];
    const edges: DepEdge[] = [
      { from: "src/api.ts", to: "src/types.ts" },
      { from: "src/api.ts", to: "src/utils.ts" },
    ];

    const sorted = topologicalSort(files, edges);
    const typesIdx = sorted.indexOf("src/types.ts");
    const apiIdx = sorted.indexOf("src/api.ts");
    expect(typesIdx).toBeLessThan(apiIdx);
  });

  it("handles files with no dependencies", () => {
    const files = ["a.ts", "b.ts", "c.ts"];
    const sorted = topologicalSort(files, []);
    expect(sorted).toHaveLength(3);
    expect(sorted).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("handles cycles gracefully", () => {
    const files = ["a.ts", "b.ts"];
    const edges: DepEdge[] = [
      { from: "a.ts", to: "b.ts" },
      { from: "b.ts", to: "a.ts" },
    ];
    const sorted = topologicalSort(files, edges);
    expect(sorted).toHaveLength(2);
  });
});

describe("buildPreAnalysis", () => {
  it("produces a PreAnalysis from diff files", () => {
    const files: DiffFile[] = [
      {
        path: "src/types.ts",
        additions: 10,
        deletions: 0,
        isNew: true,
        isDeleted: false,
        isRenamed: false,
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 10,
            content: "+export type X = string;",
          },
        ],
      },
      {
        path: "src/api.ts",
        additions: 5,
        deletions: 2,
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 6,
            content: '+import { X } from "./types.js";',
          },
        ],
      },
    ];

    const analysis = buildPreAnalysis(files);
    expect(analysis.files).toHaveLength(2);
    expect(analysis.totalAdditions).toBe(15);
    expect(analysis.totalDeletions).toBe(2);
    expect(analysis.fileRoles.get("src/types.ts")).toBe("types");
    expect(analysis.depGraph.length).toBeGreaterThanOrEqual(0);
  });
});
