import { describe, expect, it } from "vitest";
import { buildDepGraph, extractImports, resolveImportPath } from "../../src/core/dep-graph.js";
import type { DiffFile } from "../../src/types/index.js";

describe("extractImports", () => {
  it("extracts ES module imports from TS", () => {
    const code = `import { User } from "./types.js";\nimport express from "express";`;
    const imports = extractImports("src/api.ts", code);
    expect(imports).toContain("./types.js");
    expect(imports).not.toContain("express");
  });

  it("extracts require calls", () => {
    const code = `const fs = require("fs");\nconst utils = require("./utils");`;
    const imports = extractImports("src/index.ts", code);
    expect(imports).toContain("./utils");
    expect(imports).not.toContain("fs");
  });

  it("extracts Python imports", () => {
    const code = `from app.models import User\nimport os`;
    const imports = extractImports("src/api.py", code);
    expect(imports).toContain("app.models");
    expect(imports).not.toContain("os");
  });

  it("deduplicates imports", () => {
    const code = `import { A } from "./types.js";\nimport { B } from "./types.js";`;
    const imports = extractImports("src/api.ts", code);
    expect(imports.filter((i) => i === "./types.js")).toHaveLength(1);
  });
});

describe("resolveImportPath", () => {
  it("resolves relative imports", () => {
    expect(resolveImportPath("src/api.ts", "./types.js")).toBe("src/types");
    expect(resolveImportPath("src/api.ts", "./types")).toBe("src/types");
  });

  it("resolves parent directory imports", () => {
    expect(resolveImportPath("src/sub/api.ts", "../types")).toBe("src/types");
  });
});

describe("buildDepGraph", () => {
  it("builds edges from import analysis", () => {
    const files: DiffFile[] = [
      {
        path: "src/types.ts",
        additions: 5,
        deletions: 0,
        isNew: true,
        isDeleted: false,
        isRenamed: false,
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 5,
            content: "+export interface User {}",
          },
        ],
      },
      {
        path: "src/api.ts",
        additions: 2,
        deletions: 0,
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 5,
            content: '+import { User } from "./types.js";\n+app.get("/users", handler);',
          },
        ],
      },
    ];

    const edges = buildDepGraph(files);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "src/api.ts", to: "src/types.ts" });
  });

  it("returns empty for no dependencies", () => {
    const files: DiffFile[] = [
      {
        path: "src/a.ts",
        additions: 1,
        deletions: 0,
        isNew: true,
        isDeleted: false,
        isRenamed: false,
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            content: "+const x = 1;",
          },
        ],
      },
    ];
    expect(buildDepGraph(files)).toHaveLength(0);
  });
});
