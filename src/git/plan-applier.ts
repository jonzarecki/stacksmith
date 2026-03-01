import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SimpleGit } from "simple-git";
import type { FileAssignment, StackPlan } from "../types/index.js";
import { GitOperationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { cleanupStackBranches, ensureOnBaseBranch } from "./branch-manager.js";
import { commitFiles, createBranch, getFileFromBranch } from "./operations.js";

export async function applyPlan(
  git: SimpleGit,
  plan: StackPlan,
  repoDir: string,
): Promise<string[]> {
  const createdBranches: string[] = [];

  await cleanupStackBranches(git, plan);
  await ensureOnBaseBranch(git, plan.baseBranch);

  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);

  for (const slice of sortedSlices) {
    logger.info(`Applying slice ${slice.order}: ${slice.title}`);

    await createBranch(git, slice.branch);

    const filesForSlice = getFilesForSlice(plan.fileAssignments, slice.order);

    for (const assignment of filesForSlice) {
      await writeFileForSlice(git, assignment, slice.order, plan.sourceBranch, repoDir);
    }

    if (filesForSlice.length > 0) {
      const filePaths = filesForSlice.map((fa) => fa.path);
      await commitFiles(git, filePaths, `${slice.title}\n\n${slice.rationale}`);
    }

    createdBranches.push(slice.branch);
    logger.success(`Created branch: ${slice.branch}`);
  }

  return createdBranches;
}

function getFilesForSlice(assignments: FileAssignment[], sliceOrder: number): FileAssignment[] {
  return assignments.filter((fa) => {
    if (fa.splitStrategy === "whole" || fa.splitStrategy === "delete") {
      return fa.targetSlice === sliceOrder;
    }
    return fa.sliceContents?.some((sc) => sc.slice === sliceOrder) ?? false;
  });
}

async function writeFileForSlice(
  git: SimpleGit,
  assignment: FileAssignment,
  sliceOrder: number,
  sourceBranch: string,
  repoDir: string,
): Promise<void> {
  const filePath = join(repoDir, assignment.path);

  if (assignment.splitStrategy === "delete") {
    try {
      await unlink(filePath);
    } catch {
      // File might not exist yet, that's fine
    }
    return;
  }

  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  if (assignment.splitStrategy === "whole") {
    try {
      const content = await getFileFromBranch(git, sourceBranch, assignment.path);
      await writeFile(filePath, content, "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitOperationError(
        `Failed to get file ${assignment.path} from ${sourceBranch}: ${message}`,
      );
    }
  } else {
    const sliceContent = assignment.sliceContents?.find((sc) => sc.slice === sliceOrder);
    if (!sliceContent) {
      throw new GitOperationError(
        `No content found for dissected file ${assignment.path} at slice ${sliceOrder}`,
      );
    }

    const isLastSlice = !assignment.sliceContents?.some((sc) => sc.slice > sliceOrder);
    if (isLastSlice) {
      try {
        const content = await getFileFromBranch(git, sourceBranch, assignment.path);
        await writeFile(filePath, content, "utf-8");
      } catch {
        await writeFile(filePath, sliceContent.content, "utf-8");
      }
    } else {
      await writeFile(filePath, sliceContent.content, "utf-8");
    }
  }
}
