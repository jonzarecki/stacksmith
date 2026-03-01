import type { SimpleGit } from "simple-git";
import type { StackPlan } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { branchExists, checkoutBranch, deleteBranch } from "./operations.js";

export function getStackBranchNames(plan: StackPlan): string[] {
  return plan.slices.sort((a, b) => a.order - b.order).map((slice) => slice.branch);
}

export async function cleanupStackBranches(git: SimpleGit, plan: StackPlan): Promise<void> {
  const branches = getStackBranchNames(plan);
  for (const branch of branches) {
    if (await branchExists(git, branch)) {
      logger.info(`Deleting existing branch: ${branch}`);
      await deleteBranch(git, branch);
    }
  }
}

export async function ensureOnBaseBranch(git: SimpleGit, baseBranch: string): Promise<void> {
  await checkoutBranch(git, baseBranch);
}
