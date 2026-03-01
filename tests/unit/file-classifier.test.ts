import { describe, expect, it } from "vitest";
import { classifyFile, classifyFiles } from "../../src/core/file-classifier.js";

describe("classifyFile", () => {
  it("classifies test files", () => {
    expect(classifyFile("src/api.test.ts")).toBe("tests");
    expect(classifyFile("tests/unit/foo.test.ts")).toBe("tests");
    expect(classifyFile("test_api.py")).toBe("tests");
    expect(classifyFile("conftest.py")).toBe("tests");
  });

  it("classifies docs", () => {
    expect(classifyFile("README.md")).toBe("docs");
    expect(classifyFile("docs/usage.md")).toBe("docs");
    expect(classifyFile("CHANGELOG.md")).toBe("docs");
  });

  it("classifies config", () => {
    expect(classifyFile("tsconfig.json")).toBe("config");
    expect(classifyFile("package.json")).toBe("config");
    expect(classifyFile(".github/workflows/ci.yml")).toBe("config");
    expect(classifyFile("Dockerfile")).toBe("config");
    expect(classifyFile("pyproject.toml")).toBe("config");
  });

  it("classifies types/schemas", () => {
    expect(classifyFile("src/types.ts")).toBe("types");
    expect(classifyFile("src/types/user.ts")).toBe("types");
    expect(classifyFile("src/schemas/auth.ts")).toBe("types");
    expect(classifyFile("src/models/user.ts")).toBe("types");
    expect(classifyFile("src/interfaces.ts")).toBe("types");
  });

  it("classifies integration/wiring", () => {
    expect(classifyFile("src/routes.ts")).toBe("integration");
    expect(classifyFile("src/controllers/user.ts")).toBe("integration");
    expect(classifyFile("src/middleware.ts")).toBe("integration");
    expect(classifyFile("src/app.ts")).toBe("integration");
    expect(classifyFile("src/server.ts")).toBe("integration");
  });

  it("classifies core source files", () => {
    expect(classifyFile("src/utils/helpers.ts")).toBe("core");
    expect(classifyFile("src/services/auth.ts")).toBe("core");
    expect(classifyFile("lib/parser.py")).toBe("core");
  });

  it("returns unknown for unrecognized files", () => {
    expect(classifyFile("Makefile.bak")).toBe("unknown");
    expect(classifyFile("data.csv")).toBe("unknown");
  });
});

describe("classifyFiles", () => {
  it("classifies multiple files", () => {
    const roles = classifyFiles(["src/types.ts", "src/api.test.ts", "README.md"]);
    expect(roles.get("src/types.ts")).toBe("types");
    expect(roles.get("src/api.test.ts")).toBe("tests");
    expect(roles.get("README.md")).toBe("docs");
  });
});
