import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { collapseSlice } from "../ci/auto-collapse.js";
import {
  type BoundaryCheckOptions,
  type BoundaryResult,
  checkBoundary,
  detectRepoLanguage,
  installDependencies,
} from "../ci/boundary-checker.js";
import type { Config, VerifyConfig } from "../config/schema.js";
import { checkoutBranch } from "../git/operations.js";
import { applyPlan } from "../git/plan-applier.js";
import type { StackPlan } from "../types/index.js";
import { LlmAdapterError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { ProgressSpinner, withSpinner } from "../utils/spinner.js";
import type { LlmAdapter, PlanContext } from "./adapter.js";
import { AiSdkAdapter } from "./ai-sdk.js";
import { ClaudeCliAdapter, isClaudeCliAvailable } from "./claude-cli.js";

const MAX_GENERATE_RETRIES = 3;
const MAX_AI_REVISION_ROUNDS = 2;
const MAX_COLLAPSE_ROUNDS = 2;

export async function resolveAdapter(config: Config): Promise<LlmAdapter> {
  const llmConfig = config.llm;

  if (llmConfig.provider === "claude-cli") {
    return new ClaudeCliAdapter(llmConfig.model);
  }

  if (llmConfig.provider === "auto") {
    const claudeAvailable = await isClaudeCliAvailable();
    if (claudeAvailable) {
      logger.info("Detected Claude CLI, using existing subscription");
      return new ClaudeCliAdapter(llmConfig.model);
    }
    if (llmConfig.apiKey) {
      logger.info("Using AI SDK with configured API key");
      return new AiSdkAdapter(llmConfig);
    }
    throw new LlmAdapterError(
      "No LLM provider available. Either install Claude Code (claude CLI) or configure an API key in .stacksmithrc",
    );
  }

  return new AiSdkAdapter(llmConfig);
}

/**
 * The full split pipeline:
 * 1. Generate a plan from the AI
 * 2. Apply it to a temp copy of the repo
 * 3. Check each boundary (typecheck/lint)
 * 4. If a boundary fails: auto-collapse slices, or ask AI to revise
 * 5. Repeat until all boundaries pass or we've exhausted retries
 */
export async function generateValidatedPlan(
  adapter: LlmAdapter,
  context: PlanContext,
  repoDir: string,
  verifyConfig?: VerifyConfig,
): Promise<StackPlan> {
  const plan = await generatePlanWithRetries(adapter, context);

  const language = await detectRepoLanguage(repoDir);
  if (language === "unknown") {
    logger.warn("Could not detect repo language — skipping boundary verification");
    return plan;
  }

  logger.info(`Detected repo language: ${language}`);
  return validateAndRepairPlan(adapter, plan, context, repoDir, language, verifyConfig);
}

export async function generatePlanWithRetries(
  adapter: LlmAdapter,
  context: PlanContext,
): Promise<StackPlan> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_GENERATE_RETRIES; attempt++) {
    try {
      const plan = await withSpinner(
        `Generating plan (attempt ${attempt}/${MAX_GENERATE_RETRIES})`,
        () => adapter.generatePlan(context),
      );

      const { errors: validationErrors, warnings: validationWarnings } = validatePlanInvariants(
        plan,
        context,
      );
      if (validationWarnings.length > 0) {
        logger.warn(`Plan validation warnings: ${validationWarnings.join("; ")}`);
      }
      if (validationErrors.length > 0) {
        logger.warn(`Plan validation errors: ${validationErrors.join("; ")}`);
        if (attempt < MAX_GENERATE_RETRIES) {
          continue;
        }
        logger.warn("Proceeding with plan despite validation errors");
      }

      return plan;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Attempt ${attempt} failed: ${lastError.message}`);
    }
  }

  throw lastError ?? new LlmAdapterError("Failed to generate plan after all retries");
}

/**
 * Validate a plan by applying it and checking boundaries, then repair if needed.
 * Strategy: AI revision first (up to MAX_AI_REVISION_ROUNDS), then mechanical collapse as fallback.
 */
async function validateAndRepairPlan(
  adapter: LlmAdapter,
  initialPlan: StackPlan,
  _context: PlanContext,
  repoDir: string,
  language: "typescript" | "python",
  verifyConfig?: VerifyConfig,
): Promise<StackPlan> {
  let plan = initialPlan;

  const checkOptions: BoundaryCheckOptions | undefined = verifyConfig?.testCommand
    ? { testCommand: verifyConfig.testCommand, testTimeout: verifyConfig.testTimeout }
    : undefined;

  if (checkOptions) {
    logger.info(`Test command configured: "${checkOptions.testCommand}"`);
  }

  // Phase 1: AI-driven revision (same conversation context)
  for (let round = 1; round <= MAX_AI_REVISION_ROUNDS; round++) {
    const progress = new ProgressSpinner(`Verifying boundaries (round ${round}/${MAX_AI_REVISION_ROUNDS})`);
    const results = await applyAndCheckBoundaries(plan, repoDir, language, checkOptions, (step) => progress.update(step));
    if (results.failures.length === 0) {
      progress.succeed();
      logger.success("All boundaries passed verification");
      return attachVerification(plan, results.all);
    }
    progress.fail();
    logFailures(results.failures);
    const firstFailure = results.failures[0];
    if (!firstFailure) break;

    try {
      plan = await withSpinner("AI revising plan", () => adapter.revisePlan(plan, {
        sliceOrder: firstFailure.sliceOrder,
        errorOutput: firstFailure.errorOutput,
        failedCheck: firstFailure.check,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`AI revision failed: ${msg} — falling back to mechanical collapse`);
      break;
    }
  }

  // Phase 2: Mechanical collapse as fallback
  for (let round = 1; round <= MAX_COLLAPSE_ROUNDS; round++) {
    const progress = new ProgressSpinner(`Verifying after collapse (round ${round}/${MAX_COLLAPSE_ROUNDS})`);
    const results = await applyAndCheckBoundaries(plan, repoDir, language, checkOptions, (step) => progress.update(step));
    if (results.failures.length === 0) {
      progress.succeed();
      logger.success("All boundaries passed verification after collapse");
      return attachVerification(plan, results.all);
    }
    progress.fail();

    logFailures(results.failures);

    if (plan.slices.length <= 1) {
      logger.warn("Only one slice remaining — cannot collapse further");
      return attachVerification(plan, results.all);
    }

    const firstFailure = results.failures[0];
    if (!firstFailure) break;

    plan = collapseSlice(plan, firstFailure.sliceOrder);
    logger.info(`Collapsed to ${plan.slices.length} slices, will re-verify`);
  }

  logger.warn("Exhausted all repair strategies — returning best plan so far");
  return plan;
}

function attachVerification(plan: StackPlan, results: BoundaryResult[]): StackPlan {
  return {
    ...plan,
    metadata: {
      ...plan.metadata,
      verification: results.map((r) => ({
        sliceOrder: r.sliceOrder,
        check: r.check,
        passed: r.passed,
        testsRun: r.testsRun,
        testsPassed: r.testsPassed,
      })),
    },
  };
}

function logFailures(failures: BoundaryResult[]): void {
  logger.warn(`${failures.length} boundary failures found`);
  for (const f of failures) {
    logger.warn(`  Slice ${f.sliceOrder} (${f.branch}): ${f.check} failed`);
  }
}

interface CheckResults {
  all: BoundaryResult[];
  failures: BoundaryResult[];
}

async function applyAndCheckBoundaries(
  plan: StackPlan,
  repoDir: string,
  language: "typescript" | "python",
  checkOptions?: BoundaryCheckOptions,
  onProgress?: (step: string) => void,
): Promise<CheckResults> {
  const tmpDir = await mkdtemp(join(tmpdir(), "stacksmith-verify-"));

  try {
    onProgress?.("cloning repo...");
    const tmpGit = simpleGit(tmpDir);
    await tmpGit.clone(repoDir, ".", ["--local", "--no-hardlinks"]);
    await tmpGit.fetch(["origin", plan.sourceBranch]);

    onProgress?.("installing dependencies...");
    await installDependencies(tmpDir, language);

    onProgress?.("applying plan to temp repo...");
    const branches = await applyPlan(tmpGit, plan, tmpDir);
    const all: BoundaryResult[] = [];
    const failures: BoundaryResult[] = [];
    const total = branches.length;

    for (let i = 0; i < total; i++) {
      const branch = branches[i];
      if (!branch) continue;

      const slice = plan.slices.find((s) => s.branch === branch);
      if (!slice) continue;

      onProgress?.(`checking slice ${slice.order}/${total}: ${slice.title}`);
      await checkoutBranch(tmpGit, branch);
      const result = await checkBoundary(tmpDir, language, slice.order, branch, checkOptions);
      all.push(result);

      if (!result.passed) {
        failures.push(result);
      }
    }

    return { all, failures };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function computeSliceLoc(plan: StackPlan, context: PlanContext): Map<number, number> {
  const result = new Map<number, number>();

  for (const slice of plan.slices) {
    result.set(slice.order, 0);
  }

  for (const fa of plan.fileAssignments) {
    if (fa.splitStrategy === "whole" && fa.targetSlice !== undefined) {
      const diffFile = context.preAnalysis.files.find((f) => f.path === fa.path);
      const loc = diffFile ? diffFile.additions + diffFile.deletions : 0;
      result.set(fa.targetSlice, (result.get(fa.targetSlice) ?? 0) + loc);
    }
    if (fa.splitStrategy === "dissect" && fa.sliceContents) {
      for (const sc of fa.sliceContents) {
        const loc = sc.content.split("\n").length;
        result.set(sc.slice, (result.get(sc.slice) ?? 0) + loc);
      }
    }
  }

  return result;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

function validatePlanInvariants(plan: StackPlan, context: PlanContext): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const changedFiles = new Set(context.preAnalysis.files.map((f) => f.path));
  const assignedFiles = new Set(plan.fileAssignments.map((fa) => fa.path));

  for (const file of changedFiles) {
    if (!assignedFiles.has(file)) {
      errors.push(`Changed file not assigned to any slice: ${file}`);
    }
  }

  const sliceOrders = plan.slices.map((s) => s.order);
  const uniqueOrders = new Set(sliceOrders);
  if (uniqueOrders.size !== sliceOrders.length) {
    errors.push("Duplicate slice order numbers");
  }

  for (const fa of plan.fileAssignments) {
    if (fa.splitStrategy === "dissect" && (!fa.sliceContents || fa.sliceContents.length === 0)) {
      errors.push(`Dissected file ${fa.path} has no slice contents`);
    }
    if (fa.splitStrategy === "whole" && fa.targetSlice === undefined) {
      errors.push(`Whole file ${fa.path} has no target slice`);
    }
    if (fa.splitStrategy === "delete" && fa.targetSlice === undefined) {
      errors.push(`Deleted file ${fa.path} has no target slice`);
    }
  }

  // Warn if any slice exceeds 400 LOC
  const sliceLoc = computeSliceLoc(plan, context);
  for (const [order, loc] of sliceLoc) {
    if (loc > 400) {
      warnings.push(
        `Slice ${order} has ~${loc} LOC — consider splitting further (target: 200-400)`,
      );
    }
  }

  return { errors, warnings };
}
