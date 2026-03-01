import { Octokit } from "@octokit/rest";
import type { Slice, StackPlan } from "../types/index.js";
import { GithubApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface PrResult {
  number: number;
  url: string;
  title: string;
  draft: boolean;
}

export interface RepoInfo {
  owner: string;
  repo: string;
}

export function createOctokit(token?: string): Octokit {
  const auth = token ?? process.env.GITHUB_TOKEN;
  if (!auth) {
    throw new GithubApiError("No GitHub token found. Set GITHUB_TOKEN env var or pass --token.");
  }
  return new Octokit({ auth });
}

export async function getRepoInfo(remoteUrl: string): Promise<RepoInfo> {
  const httpsMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  throw new GithubApiError(`Cannot parse GitHub repo from remote URL: ${remoteUrl}`);
}

export function generatePrBody(slice: Slice, plan: StackPlan, prResults: PrResult[]): string {
  const lines: string[] = [];

  lines.push(`## ${slice.title}`);
  lines.push("");
  lines.push(slice.rationale);
  lines.push("");

  const sliceFiles = plan.fileAssignments.filter(
    (fa) =>
      fa.targetSlice === slice.order ||
      fa.sliceContents?.some((sc) => sc.slice === slice.order) === true,
  );
  if (sliceFiles.length > 0) {
    lines.push("### Files Changed");
    lines.push("");
    for (const fa of sliceFiles) {
      const strategy =
        fa.splitStrategy === "dissect"
          ? " *(partial)*"
          : fa.splitStrategy === "delete"
            ? " *(deleted)*"
            : "";
      lines.push(`- \`${fa.path}\`${strategy}`);
    }
    lines.push("");
  }

  lines.push("### Stack");
  lines.push("");
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);
  for (const s of sortedSlices) {
    const existingPr = prResults.find((pr) => pr.title.includes(s.title));
    const marker = s.order === slice.order ? "**>>**" : "";
    const prLink = existingPr ? `[#${existingPr.number}](${existingPr.url})` : "(pending)";
    lines.push(`${marker} ${s.order}. ${s.title} ${prLink}`);
  }
  lines.push("");

  if (slice.order > 1) {
    const prevSlice = sortedSlices.find((s) => s.order === slice.order - 1);
    const prevPr = prResults.find(
      (pr) => prevSlice !== undefined && pr.title.includes(prevSlice.title),
    );
    if (prevPr) {
      lines.push(`**Depends on:** #${prevPr.number}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*This PR is part of an auto-maintained stack; history may be rewritten.*");

  return lines.join("\n");
}

export async function createStackPrs(
  octokit: Octokit,
  repoInfo: RepoInfo,
  plan: StackPlan,
): Promise<PrResult[]> {
  const results: PrResult[] = [];
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);

  for (let i = 0; i < sortedSlices.length; i++) {
    const slice = sortedSlices[i];
    if (!slice) continue;

    const isFirst = i === 0;
    const baseBranch = isFirst ? plan.baseBranch : sortedSlices[i - 1]?.branch;
    if (!baseBranch) {
      throw new GithubApiError(`Cannot determine base branch for slice ${String(slice.order)}`);
    }

    const body = generatePrBody(slice, plan, results);

    try {
      logger.info(`Creating PR for slice ${String(slice.order)}: ${slice.title}...`);
      const response = await octokit.pulls.create({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        title: `[${String(slice.order)}/${String(sortedSlices.length)}] ${slice.title}`,
        body,
        head: slice.branch,
        base: baseBranch,
        draft: !isFirst,
      });

      const result: PrResult = {
        number: response.data.number,
        url: response.data.html_url,
        title: response.data.title,
        draft: response.data.draft ?? !isFirst,
      };

      results.push(result);
      logger.success(
        `  #${String(result.number)}: ${result.title} ${result.draft ? "(draft)" : "(ready)"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GithubApiError(`Failed to create PR for slice ${String(slice.order)}: ${message}`);
    }
  }

  return results;
}

export async function backfillPrBodies(
  octokit: Octokit,
  repoInfo: RepoInfo,
  plan: StackPlan,
  prResults: PrResult[],
): Promise<void> {
  const sortedSlices = [...plan.slices].sort((a, b) => a.order - b.order);

  for (let i = 0; i < sortedSlices.length; i++) {
    const slice = sortedSlices[i];
    if (!slice) continue;

    const pr = prResults[i];
    if (!pr) continue;

    const updatedBody = generatePrBody(slice, plan, prResults);

    await octokit.pulls.update({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      pull_number: pr.number,
      body: updatedBody,
    });
  }
}
