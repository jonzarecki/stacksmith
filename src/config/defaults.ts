import type { Config } from "./schema.js";

export const DEFAULT_CONFIG: Config = {
  llm: {
    provider: "auto",
  },
  stack: {
    targetPrs: 5,
    softCap: 6,
    hardCap: 10,
    branchPrefix: "stack/",
  },
  github: {
    remote: "origin",
  },
  verify: {
    testTimeout: 300_000,
  },
};
