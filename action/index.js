const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

/**
 * The main function that runs the script.
 */
async function run() {
  try {
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const org = github.context.repo.owner;
    const sourceRepo = core.getInput('source-repo', { required: true });

    /**
     * Fetches the content of a file.
     * @param {string} path - The path of the file.
     * @returns {string} The content of the file.
     */
    async function fetchContent(path) {
        try {
          const content = fs.readFileSync(path, 'utf8');
          return content;
        } catch (error) {
          console.log(`Cannot find ${path} in ${sourceRepo}`);
          return null;
        }
    }

    /**
     * Checks if there are existing pull requests for a given repository and branch.
     * @param {Object} repo - The repository object.
     * @param {string} branchName - The name of the branch.
     * @returns {boolean} True if there are existing pull requests, false otherwise.
     */
    async function checkExistingPulls(repo, branchName) {
        const existingPulls = await octokit.rest.pulls.list({
          owner: org,
          repo: repo.name,
          head: `${org}:${branchName}`
        });
        return existingPulls.data.length > 0;
    }

    /**
     * Gets the default branch of a repository.
     * @param {Object} repo - The repository object.
     * @returns {string} The name of the default branch.
     */
    async function getDefaultBranch(repo) {
        const { data: { default_branch } } = await octokit.rest.repos.get({
          owner: org,
          repo: repo.name,
        });
        return default_branch;
    }

    /**
     * Creates a new branch in a repository.
     * @param {Object} repo - The repository object.
     * @param {string} default_branch - The name of the default branch.
     * @param {string} branchName - The name of the new branch.
     */
    async function createNewBranch(repo, default_branch, branchName) {
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
     * @param {Object} repo - The repository object.
     * @param {string} decodedContent - The content of the file.
     * @param {string} branchName - The name of the branch.
     */
    async function createFileInBranch(repo, decodedContent, branchName) {
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
     * @param {Object} repo - The repository object.
     * @param {string} branchName - The name of the branch.
     * @param {string} default_branch - The name of the default branch.
     */
    async function createPullRequest(repo, branchName, default_branch) {
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
     * @param {Object} repo - The repository object.
     * @param {string} sourceContent - The content of the source file.
     */
    async function createBranchAndPR(repo, sourceContent) {
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

    const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
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
          } catch (error) {
            if (error.message.includes('Not Found')) {
              await createBranchAndPR(repo, sourceContent);
            }
          }
        }
    }        

 } catch (error) {
    core.setFailed(error.message);
   }
}

run();