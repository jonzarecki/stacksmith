import type { SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";
import { colorize } from "consola/utils";
import { readPlan } from "../core/plan.js";
import { applyPlan } from "../git/plan-applier.js";
import type { StackPlan } from "../types/index.js";
import {
  type BranchDiffStat,
  formatBeforeAfter,
  formatBranchStats,
  formatStackTree,
  parseShortStat,
} from "../utils/display.js";
import { logger } from "../utils/logger.js";

export async function applyCommand(): Promise<void> {
  const cwd = process.cwd();
  const git = simpleGit(cwd);

  logger.info("Reading stack plan...");
  const plan = await readPlan(cwd);
  logger.info(`Plan has ${plan.slices.length} slices`);

  logger.info("Applying plan...");
  await applyPlan(git, plan, cwd);

  const diffStats = await getDiffStatsBySlice(git, plan);

  console.log(formatStackTree(plan));
  console.log(formatBranchStats(plan, diffStats));
  console.log(formatBeforeAfter(plan.metadata.totalFiles, plan.metadata.totalLoc, plan.slices.length));

  await verifyStackEquivalence(git, plan);
}

async function getDiffStatsBySlice(git: SimpleGit, plan: StackPlan): Promise<BranchDiffStat[]> {
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);
  const stats: BranchDiffStat[] = [];

  for (let i = 0; i < sortedSlices.length; i++) {
    const slice = sortedSlices[i];
    if (!slice) continue;

    const prevBranch = i === 0 ? plan.baseBranch : sortedSlices[i - 1]?.branch ?? plan.baseBranch;
    try {
      const diffOutput = await git.diff(["--shortstat", `${prevBranch}..${slice.branch}`]);
      stats.push({ sliceOrder: slice.order, ...parseShortStat(diffOutput) });
    } catch {
      stats.push({ sliceOrder: slice.order, filesChanged: 0, insertions: 0, deletions: 0 });
    }
  }

  return stats;
}

async function verifyStackEquivalence(git: SimpleGit, plan: StackPlan): Promise<void> {
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);
  const lastBranch = sortedSlices[sortedSlices.length - 1]?.branch;
  if (!lastBranch) return;

  const diff = await git.diff([`${lastBranch}..${plan.sourceBranch}`]);

  if (diff.trim().length === 0) {
    console.log(`\n  ${colorize("green", "✓ Stack verified:")} final branch ${lastBranch} is identical to ${plan.sourceBranch}`);
  } else {
    const lines = diff.split("\n").length;
    logger.warn(
      `Stack divergence: ${lastBranch} differs from ${plan.sourceBranch} by ${lines} lines`,
    );
    console.log(`\n  ${colorize("yellow", "⚠ Stack divergence:")} ${lastBranch} differs from ${plan.sourceBranch}`);
    console.log(`    ${lines} diff lines — some changes may have been lost or modified during splitting`);
  }
}
