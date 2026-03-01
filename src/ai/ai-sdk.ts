import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel, type ModelMessage } from "ai";
import type { LlmConfig } from "../config/schema.js";
import { type StackPlan, StackPlanSchema } from "../types/index.js";
import { LlmAdapterError } from "../utils/errors.js";
import type { CIFailure, LlmAdapter, PlanContext } from "./adapter.js";
import { buildRevisionUserPrompt, buildUserPrompt, SYSTEM_PROMPT } from "./prompts.js";

function createModel(config: LlmConfig): LanguageModel {
  const provider = config.provider === "auto" ? "anthropic" : config.provider;

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model ?? "claude-sonnet-4-20250514");
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model ?? "gpt-4o");
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return google(config.model ?? "gemini-2.0-flash");
    }
    case "ollama": {
      const ollama = createOpenAI({
        baseURL: config.baseUrl ?? "http://localhost:11434/v1",
        apiKey: "ollama",
      });
      return ollama(config.model ?? "llama3.1");
    }
    default:
      throw new LlmAdapterError(`Unsupported LLM provider: ${String(provider)}`);
  }
}

export class AiSdkAdapter implements LlmAdapter {
  private readonly model: LanguageModel;
  private conversationHistory: ModelMessage[] = [];

  constructor(config: LlmConfig) {
    this.model = createModel(config);
  }

  async generatePlan(context: PlanContext): Promise<StackPlan> {
    this.conversationHistory = [];
    const userPrompt = buildUserPrompt(context);
    return this.callModelStructured(userPrompt);
  }

  async revisePlan(plan: StackPlan, failure: CIFailure): Promise<StackPlan> {
    const userPrompt = buildRevisionUserPrompt(plan, failure);
    return this.callModelStructured(userPrompt);
  }

  private async callModelStructured(userPrompt: string): Promise<StackPlan> {
    this.conversationHistory.push({ role: "user", content: userPrompt });

    try {
      const result = await generateObject({
        model: this.model,
        system: SYSTEM_PROMPT,
        messages: this.conversationHistory,
        schema: StackPlanSchema,
        schemaName: "StackPlan",
        schemaDescription: "A plan for splitting a diff into ordered PR slices",
        maxOutputTokens: 16384,
      });

      this.conversationHistory.push({
        role: "assistant",
        content: JSON.stringify(result.object),
      });

      return result.object as StackPlan;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LlmAdapterError(`AI SDK call failed: ${message}`);
    }
  }
}
