import type { FileAssignment, Slice, StackPlan } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Collapse slice at `failedOrder` into the next slice.
 * If it's the last slice, merge into the previous one instead.
 * Returns a new plan with renumbered slices and merged file assignments.
 */
export function collapseSlice(plan: StackPlan, failedOrder: number): StackPlan {
  const sorted = [...plan.slices].sort((a, b) => a.order - b.order);

  if (sorted.length <= 1) {
    return plan;
  }

  const failedIdx = sorted.findIndex((s) => s.order === failedOrder);
  if (failedIdx === -1) {
    return plan;
  }

  // Merge into next slice, or into previous if this is the last
  const mergeIntoIdx = failedIdx < sorted.length - 1 ? failedIdx + 1 : failedIdx - 1;
  const failedSlice = sorted[failedIdx];
  const targetSlice = sorted[mergeIntoIdx];

  if (!failedSlice || !targetSlice) {
    return plan;
  }

  logger.info(
    `Collapsing slice ${failedSlice.order} ("${failedSlice.title}") into slice ${targetSlice.order} ("${targetSlice.title}")`,
  );

  // Merge the two slices into one
  const mergedSlice: Slice = {
    order: Math.min(failedSlice.order, targetSlice.order),
    title: `${targetSlice.title} + ${failedSlice.title}`,
    rationale: `${targetSlice.rationale}; ${failedSlice.rationale}`,
    branch: targetSlice.order < failedSlice.order ? targetSlice.branch : failedSlice.branch,
    confidence: Math.min(failedSlice.confidence, targetSlice.confidence),
  };

  // Build new slice list: remove both, add merged, renumber
  const remainingSlices = sorted.filter(
    (s) => s.order !== failedSlice.order && s.order !== targetSlice.order,
  );
  const allSlices = [...remainingSlices, mergedSlice].sort((a, b) => a.order - b.order);
  const renumbered = allSlices.map((s, i) => ({
    ...s,
    order: i + 1,
    branch: renameBranch(s.branch, i + 1),
  }));

  // Remap file assignments
  const removedOrder = failedSlice.order;
  const keptOrder = targetSlice.order;
  const mergedOrder = mergedSlice.order;

  const newAssignments = plan.fileAssignments.map((fa) =>
    remapFileAssignment(fa, removedOrder, keptOrder, mergedOrder, renumbered),
  );

  return {
    ...plan,
    slices: renumbered,
    fileAssignments: newAssignments,
  };
}

function renameBranch(branch: string, newOrder: number): string {
  const prefix = branch.substring(0, branch.indexOf("/") + 1);
  const namePart = branch.replace(/^[^/]*\/\d+-/, "");
  return `${prefix}${String(newOrder).padStart(2, "0")}-${namePart}`;
}

function remapFileAssignment(
  fa: FileAssignment,
  removedOrder: number,
  keptOrder: number,
  mergedOrder: number,
  renumberedSlices: Slice[],
): FileAssignment {
  const orderMap = buildOrderMap(removedOrder, keptOrder, mergedOrder, renumberedSlices);

  if (fa.splitStrategy === "whole" || fa.splitStrategy === "delete") {
    const oldTarget = fa.targetSlice ?? 1;
    const newTarget = orderMap.get(oldTarget) ?? oldTarget;
    return { ...fa, targetSlice: newTarget };
  }

  if (fa.sliceContents) {
    const mergedContents = fa.sliceContents.map((sc) => ({
      ...sc,
      slice: orderMap.get(sc.slice) ?? sc.slice,
    }));

    // Deduplicate: if two slice contents now map to the same slice, keep the later one
    const deduped = new Map<number, (typeof mergedContents)[number]>();
    for (const sc of mergedContents) {
      deduped.set(sc.slice, sc);
    }

    return { ...fa, sliceContents: [...deduped.values()].sort((a, b) => a.slice - b.slice) };
  }

  return fa;
}

function buildOrderMap(
  removedOrder: number,
  keptOrder: number,
  _mergedOrder: number,
  renumberedSlices: Slice[],
): Map<number, number> {
  const map = new Map<number, number>();
  const targetOrder = Math.min(removedOrder, keptOrder);
  map.set(removedOrder, targetOrder);
  map.set(keptOrder, targetOrder);

  // Renumber everything above the removed slice
  const maxOldOrder = Math.max(removedOrder, keptOrder);
  for (let old = 1; old <= maxOldOrder + renumberedSlices.length; old++) {
    if (!map.has(old)) {
      if (old < Math.min(removedOrder, keptOrder)) {
        map.set(old, old);
      } else if (old > Math.max(removedOrder, keptOrder)) {
        map.set(old, old - 1);
      }
    }
  }

  return map;
}
