import { z } from "zod/v4";

export const LlmConfigSchema = z.object({
  provider: z
    .enum(["auto", "claude-cli", "anthropic", "openai", "google", "ollama"])
    .default("auto"),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.url().optional(),
});

export const StackConfigSchema = z.object({
  targetPrs: z.number().int().positive().default(5),
  softCap: z.number().int().positive().default(6),
  hardCap: z.number().int().positive().default(10),
  branchPrefix: z.string().default("stack/"),
});

export const GithubConfigSchema = z.object({
  remote: z.string().default("origin"),
});

export const VerifyConfigSchema = z.object({
  testCommand: z.string().optional(),
  testTimeout: z.number().int().positive().default(300_000),
});

export const ConfigSchema = z.object({
  llm: LlmConfigSchema.default(LlmConfigSchema.parse({})),
  stack: StackConfigSchema.default(StackConfigSchema.parse({})),
  github: GithubConfigSchema.default(GithubConfigSchema.parse({})),
  verify: VerifyConfigSchema.default(VerifyConfigSchema.parse({})),
});

export type Config = z.infer<typeof ConfigSchema>;
export type LlmConfig = z.infer<typeof LlmConfigSchema>;
export type StackConfig = z.infer<typeof StackConfigSchema>;
export type GithubConfig = z.infer<typeof GithubConfigSchema>;
export type VerifyConfig = z.infer<typeof VerifyConfigSchema>;
