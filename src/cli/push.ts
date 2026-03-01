import { simpleGit } from "simple-git";
import { loadConfig } from "../config/loader.js";
import { readPlan } from "../core/plan.js";
import { getStackBranchNames } from "../git/branch-manager.js";
import {
  backfillPrBodies,
  createOctokit,
  createStackPrs,
  getRepoInfo,
} from "../github/pr-manager.js";
import { formatPrCards } from "../utils/display.js";
import { logger } from "../utils/logger.js";
import { withSpinner } from "../utils/spinner.js";

export async function pushCommand(): Promise<void> {
  const cwd = process.cwd();
  const git = simpleGit(cwd);

  const plan = await withSpinner("Reading stack plan", () => readPlan(cwd));
  const config = await loadConfig(cwd);

  const branches = getStackBranchNames(plan);
  const remote = config.github.remote;

  await withSpinner(`Pushing ${branches.length} branches to ${remote}`, async () => {
    for (const branch of branches) {
      await git.push(remote, branch, ["--force-with-lease"]);
    }
  });

  const remotes = await git.getRemotes(true);
  const originRemote = remotes.find((r) => r.name === remote);
  if (!originRemote?.refs.push) {
    throw new Error(`Remote '${remote}' not found or has no push URL`);
  }
  const repoInfo = await getRepoInfo(originRemote.refs.push);
  logger.info(`Repository: ${repoInfo.owner}/${repoInfo.repo}`);

  const octokit = createOctokit();
  const prs = await withSpinner("Creating pull requests", () =>
    createStackPrs(octokit, repoInfo, plan),
  );

  await withSpinner("Updating PR bodies with stack links", () =>
    backfillPrBodies(octokit, repoInfo, plan, prs),
  );

  console.log(formatPrCards(plan, prs));
}
