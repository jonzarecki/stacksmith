import { simpleGit } from "simple-git";
import type { PlanContext } from "../ai/adapter.js";
import { generateValidatedPlan, resolveAdapter } from "../ai/planner.js";
import { loadConfig } from "../config/loader.js";
import { computeDiffStats, parseDiffString } from "../core/diff-parser.js";
import { writePlan } from "../core/plan.js";
import { buildPreAnalysis } from "../core/slicer.js";
import type { DiffFile, StackPlan } from "../types/index.js";
import { formatPlanSummary } from "../utils/display.js";
import { logger } from "../utils/logger.js";
import { withSpinner } from "../utils/spinner.js";

export async function splitCommand(): Promise<void> {
  const cwd = process.cwd();
  const git = simpleGit(cwd);

  const config = await withSpinner("Loading config", () => loadConfig(cwd));
  const adapter = await withSpinner("Resolving LLM adapter", () => resolveAdapter(config));

  const baseBranch = await getBaseBranch(git);
  const sourceBranch = await getCurrentBranch(git);
  const diffText = await withSpinner("Getting diff vs base branch", () =>
    git.diff([`${baseBranch}...${sourceBranch}`]),
  );

  if (!diffText.trim()) {
    logger.warn("No diff found between current branch and base branch. Nothing to split.");
    return;
  }

  const files = parseDiffString(diffText);
  logger.info(`Found ${files.length} changed files`);

  const preAnalysis = buildPreAnalysis(files);

  const stats = computeDiffStats(files);
  if (stats.totalFiles <= 5 && stats.totalAdditions + stats.totalDeletions < 300) {
    logger.info("Diff is small enough for a single PR (< 300 LOC, ≤ 5 files). Skipping AI split.");
    const singlePlan = createSingleSlicePlan(
      files,
      baseBranch,
      sourceBranch,
      config.stack.branchPrefix,
    );
    const planPath = await writePlan(singlePlan, cwd);
    logger.success(`Plan written to ${planPath}`);
    console.log(formatPlanSummary(singlePlan));
    return;
  }

  const fileTree = await getFileTree(git);

  const context: PlanContext = {
    diffText,
    preAnalysis,
    fileTree,
    baseBranch,
    sourceBranch,
    targetSlices: config.stack.targetPrs,
  };

  const plan = await generateValidatedPlan(adapter, context, cwd, config.verify);

  const planPath = await writePlan(plan, cwd);
  logger.success(`Plan written to ${planPath}`);
  console.log(formatPlanSummary(plan));
}

async function getBaseBranch(git: ReturnType<typeof simpleGit>): Promise<string> {
  const branches = await git.branch();
  if (branches.all.includes("main")) return "main";
  if (branches.all.includes("master")) return "master";
  return branches.all[0] ?? "main";
}

async function getCurrentBranch(git: ReturnType<typeof simpleGit>): Promise<string> {
  const status = await git.status();
  return status.current ?? "HEAD";
}

async function getFileTree(git: ReturnType<typeof simpleGit>): Promise<string[]> {
  const result = await git.raw(["ls-tree", "-r", "--name-only", "HEAD"]);
  return result
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, 200);
}

function createSingleSlicePlan(
  files: DiffFile[],
  baseBranch: string,
  sourceBranch: string,
  branchPrefix: string,
): StackPlan {
  const stats = computeDiffStats(files);
  return {
    version: 1,
    baseBranch,
    sourceBranch,
    slices: [
      {
        order: 1,
        title: "All changes",
        rationale: "Diff is small enough for a single reviewable PR",
        branch: `${branchPrefix}01-all-changes`,
        confidence: 1.0,
      },
    ],
    fileAssignments: files.map((f) => ({
      path: f.path,
      splitStrategy: f.isDeleted ? ("delete" as const) : ("whole" as const),
      targetSlice: 1,
    })),
    metadata: {
      totalFiles: stats.totalFiles,
      totalLoc: stats.totalAdditions + stats.totalDeletions,
      generatedAt: new Date().toISOString(),
      model: "none",
      provider: "tiny-diff-bypass",
    },
  };
}
