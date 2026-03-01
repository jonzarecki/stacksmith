import type { PreAnalysis, StackPlan } from "../types/index.js";

export interface PlanContext {
  diffText: string;
  preAnalysis: PreAnalysis;
  fileTree: string[];
  baseBranch: string;
  sourceBranch: string;
  targetSlices: number;
}

export interface CIFailure {
  sliceOrder: number;
  errorOutput: string;
  failedCheck: string;
}

/**
 * LLM adapter supporting multi-turn conversation.
 * generatePlan starts a new session; revisePlan continues the existing one.
 */
export interface LlmAdapter {
  generatePlan(context: PlanContext): Promise<StackPlan>;
  revisePlan(plan: StackPlan, failure: CIFailure): Promise<StackPlan>;
}
