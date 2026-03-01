import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { type StackPlan, StackPlanSchema } from "../types/index.js";
import { LlmAdapterError } from "../utils/errors.js";
import type { CIFailure, LlmAdapter, PlanContext } from "./adapter.js";
import {
  buildRevisionUserPrompt,
  buildUserPrompt,
  extractJsonFromResponse,
  SYSTEM_PROMPT,
} from "./prompts.js";

const execFileAsync = promisify(execFile);

export async function isClaudeCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync("claude", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export class ClaudeCliAdapter implements LlmAdapter {
  private readonly model: string;
  private hasActiveSession = false;

  constructor(model?: string) {
    this.model = model ?? "sonnet";
  }

  async generatePlan(context: PlanContext): Promise<StackPlan> {
    this.hasActiveSession = false;
    const prompt = buildUserPrompt(context);
    const raw = await this.callClaude(prompt, false);
    this.hasActiveSession = true;
    return this.parsePlanResponse(raw);
  }

  async revisePlan(plan: StackPlan, failure: CIFailure): Promise<StackPlan> {
    const prompt = buildRevisionUserPrompt(plan, failure);
    const continueSession = this.hasActiveSession;
    const raw = await this.callClaude(prompt, continueSession);
    this.hasActiveSession = true;
    return this.parsePlanResponse(raw);
  }

  private callClaude(prompt: string, continueSession: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ["-p", "--output-format", "json", "--model", this.model];

      if (continueSession) {
        args.push("--continue");
      } else {
        args.push("--system-prompt", SYSTEM_PROMPT);
      }

      const proc = spawn("claude", args, {
        timeout: 300_000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      proc.stdout.on("data", (data: Buffer) => chunks.push(data));
      proc.stderr.on("data", (data: Buffer) => errChunks.push(data));

      proc.on("error", (err) => {
        reject(new LlmAdapterError(`Claude CLI call failed: ${err.message}`));
      });

      proc.on("close", (code) => {
        const stdout = Buffer.concat(chunks).toString("utf-8");
        if (code !== 0) {
          const friendlyMsg = extractErrorFromJson(stdout);
          const stderr = Buffer.concat(errChunks).toString("utf-8");
          reject(new LlmAdapterError(`Claude CLI failed: ${friendlyMsg ?? (stderr || stdout)}`));
          return;
        }
        resolve(stdout);
      });

      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  private parsePlanResponse(raw: string): StackPlan {
    const envelope = parseJsonEnvelope(raw);
    if (envelope.isError) {
      throw new LlmAdapterError(`Claude returned an error: ${envelope.text}`);
    }

    try {
      const jsonStr = extractJsonFromResponse(envelope.text);
      const parsed: unknown = JSON.parse(jsonStr);
      return StackPlanSchema.parse(parsed);
    } catch (error) {
      if (error instanceof LlmAdapterError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new LlmAdapterError(`Failed to parse Claude CLI response: ${message}`);
    }
  }
}

interface Envelope {
  text: string;
  isError: boolean;
}

/** Parse the Claude CLI JSON envelope, extracting the result text. */
function parseJsonEnvelope(raw: string): Envelope {
  try {
    const obj: unknown = JSON.parse(raw);
    if (typeof obj === "object" && obj !== null && "result" in obj) {
      const rec = obj as Record<string, unknown>;
      return {
        text: typeof rec.result === "string" ? rec.result : JSON.stringify(rec.result),
        isError: rec.is_error === true,
      };
    }
    return { text: raw, isError: false };
  } catch {
    return { text: raw, isError: false };
  }
}

/** Try to extract a friendly error message from Claude CLI JSON output. */
function extractErrorFromJson(stdout: string): string | undefined {
  try {
    const obj: unknown = JSON.parse(stdout);
    if (typeof obj === "object" && obj !== null && "result" in obj) {
      const result = (obj as Record<string, unknown>).result;
      if (typeof result === "string") return result;
    }
  } catch {
    // not JSON, return undefined
  }
  return undefined;
}
