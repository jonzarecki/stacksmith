import { type SimpleGit, simpleGit } from "simple-git";

export function createGit(cwd: string): SimpleGit {
  return simpleGit(cwd);
}

export async function getCurrentBranch(git: SimpleGit): Promise<string> {
  const status = await git.status();
  return status.current ?? "HEAD";
}

export async function createBranch(git: SimpleGit, branchName: string): Promise<void> {
  await git.checkoutLocalBranch(branchName);
}

export async function checkoutBranch(git: SimpleGit, branchName: string): Promise<void> {
  await git.checkout(branchName);
}

export async function commitAll(git: SimpleGit, message: string): Promise<string> {
  await git.add(".");
  const result = await git.commit(message);
  return result.commit;
}

export async function commitFiles(
  git: SimpleGit,
  files: string[],
  message: string,
): Promise<string> {
  await git.add(files);
  const result = await git.commit(message);
  return result.commit;
}

export async function getFileFromBranch(
  git: SimpleGit,
  branch: string,
  filePath: string,
): Promise<string> {
  return git.show([`${branch}:${filePath}`]);
}

export async function branchExists(git: SimpleGit, branchName: string): Promise<boolean> {
  const branches = await git.branchLocal();
  return branches.all.includes(branchName);
}

export async function deleteBranch(git: SimpleGit, branchName: string): Promise<void> {
  await git.deleteLocalBranch(branchName, true);
}
