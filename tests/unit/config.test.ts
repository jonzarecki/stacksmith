import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { ConfigSchema, VerifyConfigSchema } from "../../src/config/schema.js";

describe("ConfigSchema", () => {
  it("parses a full config", () => {
    const raw = {
      llm: {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        apiKey: "sk-test",
      },
      stack: { targetPrs: 4, softCap: 5, hardCap: 8, branchPrefix: "pr/" },
      github: { remote: "upstream" },
    };
    const config = ConfigSchema.parse(raw);
    expect(config.llm.provider).toBe("anthropic");
    expect(config.stack.targetPrs).toBe(4);
    expect(config.github.remote).toBe("upstream");
  });

  it("applies defaults for missing fields", () => {
    const config = ConfigSchema.parse({});
    expect(config.llm.provider).toBe("auto");
    expect(config.stack.targetPrs).toBe(5);
    expect(config.stack.hardCap).toBe(10);
    expect(config.github.remote).toBe("origin");
  });

  it("rejects invalid provider", () => {
    expect(() => ConfigSchema.parse({ llm: { provider: "invalid" } })).toThrow();
  });

  it("rejects negative targetPrs", () => {
    expect(() => ConfigSchema.parse({ stack: { targetPrs: -1 } })).toThrow();
  });
});

describe("VerifyConfigSchema", () => {
  it("applies defaults when empty", () => {
    const config = VerifyConfigSchema.parse({});
    expect(config.testCommand).toBeUndefined();
    expect(config.testTimeout).toBe(300_000);
  });

  it("accepts a test command", () => {
    const config = VerifyConfigSchema.parse({ testCommand: "pnpm test" });
    expect(config.testCommand).toBe("pnpm test");
    expect(config.testTimeout).toBe(300_000);
  });

  it("accepts a custom timeout", () => {
    const config = VerifyConfigSchema.parse({ testCommand: "pytest", testTimeout: 60_000 });
    expect(config.testCommand).toBe("pytest");
    expect(config.testTimeout).toBe(60_000);
  });

  it("rejects non-positive timeout", () => {
    expect(() => VerifyConfigSchema.parse({ testTimeout: 0 })).toThrow();
    expect(() => VerifyConfigSchema.parse({ testTimeout: -1 })).toThrow();
  });

  it("is included in full config with defaults", () => {
    const config = ConfigSchema.parse({});
    expect(config.verify).toBeDefined();
    expect(config.verify.testCommand).toBeUndefined();
    expect(config.verify.testTimeout).toBe(300_000);
  });

  it("parses verify section from full config", () => {
    const config = ConfigSchema.parse({
      verify: { testCommand: "npm test", testTimeout: 120_000 },
    });
    expect(config.verify.testCommand).toBe("npm test");
    expect(config.verify.testTimeout).toBe(120_000);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("matches schema defaults", () => {
    const fromSchema = ConfigSchema.parse({});
    expect(fromSchema.llm.provider).toBe(DEFAULT_CONFIG.llm.provider);
    expect(fromSchema.stack.targetPrs).toBe(DEFAULT_CONFIG.stack.targetPrs);
    expect(fromSchema.stack.branchPrefix).toBe(DEFAULT_CONFIG.stack.branchPrefix);
  });

  it("has verify defaults", () => {
    expect(DEFAULT_CONFIG.verify.testCommand).toBeUndefined();
    expect(DEFAULT_CONFIG.verify.testTimeout).toBe(300_000);
  });
});
