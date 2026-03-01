import Table from "cli-table3";
import { box, colorize, colors, formatTree } from "consola/utils";
import type { PrResult } from "../github/pr-manager.js";
import type { StackPlan } from "../types/index.js";

export interface BranchDiffStat {
  sliceOrder: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

function computeSliceLoc(plan: StackPlan, sliceOrder: number): number {
  let loc = 0;
  for (const fa of plan.fileAssignments) {
    if (fa.splitStrategy === "whole" && fa.targetSlice === sliceOrder) {
      loc += fa.sliceContents?.reduce((sum, sc) => sum + sc.content.split("\n").length, 0) ?? 0;
    }
    if (fa.splitStrategy === "dissect" && fa.sliceContents) {
      for (const sc of fa.sliceContents) {
        if (sc.slice === sliceOrder) {
          loc += sc.content.split("\n").length;
        }
      }
    }
  }
  return loc;
}

export function formatPlanSummary(plan: StackPlan): string {
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);
  const verification = plan.metadata.verification;
  const hasVerification = verification && verification.length > 0;
  const hasTests = hasVerification && verification.some((v) => v.testsRun !== undefined);

  const heads = ["#", "Title", "Files", "LOC"];
  const aligns: Array<"right" | "left" | "center"> = ["right", "left", "right", "right"];
  if (hasVerification) {
    heads.push("Lint");
    aligns.push("center");
  }
  if (hasTests) {
    heads.push("Tests");
    aligns.push("center");
  }

  const table = new Table({
    chars: {
      top: "─",
      "top-mid": "┬",
      "top-left": "┌",
      "top-right": "┐",
      bottom: "─",
      "bottom-mid": "┴",
      "bottom-left": "└",
      "bottom-right": "┘",
      left: "│",
      "left-mid": "├",
      mid: "─",
      "mid-mid": "┼",
      right: "│",
      "right-mid": "┤",
      middle: "│",
    },
    style: { head: ["cyan"], border: ["gray"], "padding-left": 1, "padding-right": 1 },
    head: heads,
    colAligns: aligns,
  });

  for (const slice of sortedSlices) {
    const sliceFiles = plan.fileAssignments.filter(
      (fa) =>
        fa.targetSlice === slice.order ||
        fa.sliceContents?.some((sc) => sc.slice === slice.order) === true,
    );

    const loc = computeSliceLoc(plan, slice.order);
    const locDisplay = loc > 0 ? `~${loc}` : `~${Math.round(plan.metadata.totalLoc / sortedSlices.length)}`;

    const row: Array<string | number> = [slice.order, slice.title, sliceFiles.length, locDisplay];

    if (hasVerification) {
      const v = verification.find((r) => r.sliceOrder === slice.order);
      if (v) {
        row.push(v.passed ? colorize("green", `✓ ${v.check}`) : colorize("red", `✗ ${v.check}`));
      } else {
        row.push(colors.gray("—"));
      }
    }

    if (hasTests) {
      const v = verification?.find((r) => r.sliceOrder === slice.order);
      if (v?.testsRun !== undefined && v.testsPassed !== undefined) {
        const allPassed = v.testsPassed === v.testsRun;
        const label = `${v.testsPassed}/${v.testsRun} passed`;
        row.push(allPassed ? colorize("green", `✓ ${label}`) : colorize("yellow", `⚠ ${label}`));
      } else {
        row.push(colors.gray("—"));
      }
    }

    table.push(row);
  }

  const header = colorize("greenBright", `✓ Stack Plan: ${sortedSlices.length} slices`);
  let summary = `\n${header}\n\n${table.toString()}`;

  if (hasVerification) {
    const parts: string[] = [];

    const lintPassed = verification.filter((r) => r.passed).length;
    const lintTotal = verification.length;
    const lintNames = [...new Set(verification.map((r) => r.check))].join(", ");
    const lintIcon = lintPassed === lintTotal ? colorize("green", "✓") : colorize("yellow", "⚠");
    parts.push(`${lintIcon} Lint: ${lintPassed}/${lintTotal} slices passed (${lintNames})`);

    if (hasTests) {
      const totalTests = verification.reduce((sum, v) => sum + (v.testsRun ?? 0), 0);
      const totalPassed = verification.reduce((sum, v) => sum + (v.testsPassed ?? 0), 0);
      const testIcon = totalPassed === totalTests ? colorize("green", "✓") : colorize("yellow", "⚠");
      parts.push(`${testIcon} Tests: ${totalPassed}/${totalTests} passed across ${lintTotal} slices`);
    }

    summary += `\n\n  ${parts.join("\n  ")}`;
  }

  return summary;
}

export function formatStackTree(plan: StackPlan): string {
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);

  function buildTreeItems(
    slices: typeof sortedSlices,
    index: number,
  ): Array<{ text: string; children?: Array<{ text: string; children?: ReturnType<typeof buildTreeItems> }> }> {
    if (index >= slices.length) return [];
    const slice = slices[index];
    if (!slice) return [];

    const isFirst = index === 0;
    const status = isFirst
      ? colorize("green", "Ready for Review")
      : colorize("yellow", "Draft");
    const label = `${colors.bold(slice.branch)}  ${colors.gray(`PR #${slice.order}`)} · ${status}`;

    return [
      {
        text: label,
        children: buildTreeItems(slices, index + 1),
      },
    ];
  }

  const tree = formatTree(
    [
      {
        text: colors.bold(plan.baseBranch),
        children: buildTreeItems(sortedSlices, 0),
      },
    ],
    { color: "cyan" },
  );

  return `\n${tree}`;
}

export function formatBranchStats(plan: StackPlan, stats: BranchDiffStat[]): string {
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);
  const verification = plan.metadata.verification;
  const lines: string[] = [""];

  for (const slice of sortedSlices) {
    const stat = stats.find((s) => s.sliceOrder === slice.order);
    const v = verification?.find((r) => r.sliceOrder === slice.order);

    const badges: string[] = [];
    if (v) {
      badges.push(v.passed ? colorize("green", `✓ ${v.check}`) : colorize("red", `✗ ${v.check}`));
      if (v.testsRun !== undefined && v.testsPassed !== undefined) {
        badges.push(colorize("green", `✓ ${v.testsPassed}/${v.testsRun} tests`));
      }
    }
    const badgeStr = badges.length > 0 ? ` ${badges.join("  ")}` : "";
    const title = colorize("cyan", `PR #${slice.order}: ${slice.title}`) + badgeStr;

    if (stat) {
      const parts: string[] = [];
      parts.push(`${stat.filesChanged} file${stat.filesChanged !== 1 ? "s" : ""} changed`);
      if (stat.insertions > 0) parts.push(colorize("green", `+${stat.insertions}`));
      if (stat.deletions > 0) parts.push(colorize("red", `-${stat.deletions}`));
      lines.push(`  ${title}`);
      lines.push(`    ${parts.join(", ")}`);
    } else {
      lines.push(`  ${title}`);
    }
  }

  return lines.join("\n");
}

export function formatBeforeAfter(
  totalFiles: number,
  totalLoc: number,
  sliceCount: number,
): string {
  const before = colorize("red", `Before: ${totalFiles} files, ${totalLoc} lines, mixed concerns`);
  const after = colorize("green", `After:  ${sliceCount} small, focused, reviewable PRs`);

  return box(`${before}\n${after}`, {
    title: "Result",
    style: { borderColor: "green", borderStyle: "rounded" },
  });
}

export function formatPrCards(plan: StackPlan, prs: PrResult[]): string {
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);
  const cards: string[] = [""];

  for (let i = 0; i < sortedSlices.length; i++) {
    const slice = sortedSlices[i];
    if (!slice) continue;

    const pr = prs.find((p) => p.title.includes(slice.title));
    if (!pr) continue;

    const isFirst = i === 0;
    const baseBranch = isFirst ? plan.baseBranch : sortedSlices[i - 1]?.branch ?? plan.baseBranch;
    const statusBadge = pr.draft
      ? colorize("yellow", "Draft")
      : colorize("green", "Ready for Review");

    const lines: string[] = [];
    lines.push(`${colors.bold(`PR #${pr.number}`)}: ${slice.title}  [${statusBadge}]`);
    lines.push("");
    lines.push(`${slice.branch} → ${baseBranch}`);

    if (i > 0) {
      const deps = sortedSlices
        .slice(0, i)
        .map((s) => {
          const depPr = prs.find((p) => p.title.includes(s.title));
          return depPr ? `#${depPr.number}` : `#${s.order}`;
        })
        .join(", ");
      lines.push(`Depends on: ${deps}`);
    }

    lines.push(colorize("cyan", pr.url));

    const borderColor = pr.draft ? "yellow" : "green";
    cards.push(
      box(lines.join("\n"), {
        style: {
          borderColor: borderColor as "yellow" | "green",
          borderStyle: "rounded",
        },
      }),
    );
  }

  return cards.join("\n");
}

export function parseShortStat(output: string): { filesChanged: number; insertions: number; deletions: number } {
  const filesMatch = output.match(/(\d+) files? changed/);
  const insertionsMatch = output.match(/(\d+) insertions?\(\+\)/);
  const deletionsMatch = output.match(/(\d+) deletions?\(-\)/);

  return {
    filesChanged: filesMatch ? Number.parseInt(filesMatch[1] ?? "0", 10) : 0,
    insertions: insertionsMatch ? Number.parseInt(insertionsMatch[1] ?? "0", 10) : 0,
    deletions: deletionsMatch ? Number.parseInt(deletionsMatch[1] ?? "0", 10) : 0,
  };
}
