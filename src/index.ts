import * as core from '@actions/core';
import * as github from '@actions/github';
import fs from 'fs';

interface Repo {
  name: string;
}

async function run() {
  try {
    const token: string = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const org: string = github.context.repo.owner;
    const sourceRepo: string = core.getInput('source-repo', { required: true });

    /**
     * Fetches the content of a file.
     * @param path - The path of the file.
     * @returns The content of the file, or null if the file does not exist.
     */
    async function fetchContent(path: string): Promise<string | null> {
        try {
          const content: string = fs.readFileSync(path, 'utf8');
          return content;
        } catch (error) {
          console.log(`Cannot find ${path} in ${sourceRepo}`);
          return null;
        }
    }

    /**
     * Checks if there are existing pull requests for a branch.
     * @param repo - The repository.
     * @param branchName - The name of the branch.
     * @returns True if there are existing pull requests, false otherwise.
     */
    async function checkExistingPulls(repo: Repo, branchName: string): Promise<boolean> {
        const existingPulls = await octokit.rest.pulls.list({
          owner: org,
          repo: repo.name,
          head: `${org}:${branchName}`
        });
        return existingPulls.data.length > 0;
    }

    /**
     * Gets the default branch of a repository.
     * @param repo - The repository.
     * @returns The name of the default branch.
     */
    async function getDefaultBranch(repo: Repo): Promise<string> {
        const { data: { default_branch } } = await octokit.rest.repos.get({
          owner: org,
          repo: repo.name,
        });
        return default_branch;
    }

    /**
     * Creates a new branch in a repository.
     * @param repo - The repository.
     * @param default_branch - The name of the default branch.
     * @param branchName - The name of the new branch.
     */
    async function createNewBranch(repo: Repo, default_branch: string, branchName: string): Promise<void> {
        const { data: ref } = await octokit.rest.git.getRef({
          owner: org,
          repo: repo.name,
          ref: `heads/${default_branch}`,
        });

        await octokit.rest.git.createRef({
          owner: org,
          repo: repo.name,
          ref: `refs/heads/${branchName}`,
          sha: ref.object.sha,
        });
    }

    /**
     * Creates a file in a branch.
     * @param repo - The repository.
     * @param decodedContent - The content of the file.
     * @param branchName - The name of the branch.
     */
    async function createFileInBranch(repo: Repo, decodedContent: string, branchName: string): Promise<void> {
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: org,
          repo: repo.name,
          path: 'CODEOWNERS',
          message: 'Created CODEOWNERS',
          content: Buffer.from(decodedContent).toString('base64'),
          branch: branchName,
        });
    }

    /**
     * Creates a pull request.
     * @param repo - The repository.
     * @param branchName - The name of the branch.
     * @param default_branch - The name of the default branch.
     */
    async function createPullRequest(repo: Repo, branchName: string, default_branch: string): Promise<void> {
        await octokit.rest.pulls.create({
          owner: org,
          repo: repo.name,
          title: `Add CODEOWNERS file to ${repo.name}`,
          head: branchName,
          base: default_branch,
        });
    }

    /**
     * Creates a branch and a pull request.
     * @param repo - The repository.
     * @param sourceContent - The content of the source file.
     */
    async function createBranchAndPR(repo: Repo, sourceContent: string): Promise<void> {
        const branchName = `codeowners-feature-${repo.name}`;

        if (await checkExistingPulls(repo, branchName)) {
          console.log(`Pull request already exists for repository ${repo.name}`);
          return;
        }

        const default_branch = await getDefaultBranch(repo);

        await createNewBranch(repo, default_branch, branchName);
        await createFileInBranch(repo, sourceContent, branchName);
        await createPullRequest(repo, branchName, default_branch);
    }

    const sourceContent = await fetchContent('CODEOWNERS');
    const settingsContent = await fetchContent('.github/codeowners_repos_config.json');

    if (!sourceContent || !settingsContent) {
        return;
    }

    const settings = JSON.parse(settingsContent);

    const repos: Repo[] = await octokit.paginate(octokit.rest.repos.listForOrg, {
        org,
        type: 'all',
    });

    for (const repo of repos) {
        if (repo.name !== sourceRepo && settings.include.includes(repo.name) && !settings.exclude.includes(repo.name)) {
          try {
            await octokit.rest.repos.getContent({
              owner: org,
              repo: repo.name,
              path: 'CODEOWNERS',
            });
          } catch (error: unknown) {
            if (error instanceof Error && error.message.includes('Not Found')) {
              await createBranchAndPR(repo, sourceContent);
            }
          }
        }
    }        

 } catch (error: unknown) {
  if (error instanceof Error) {
    core.setFailed(error.message);
  } else {
    core.setFailed('An unknown error occurred.');
  }
}
}

run();