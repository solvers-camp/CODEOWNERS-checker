"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const fs_1 = __importDefault(require("fs"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const token = core.getInput('github-token', { required: true });
            const octokit = github.getOctokit(token);
            const org = github.context.repo.owner;
            const sourceRepo = core.getInput('source-repo', { required: true });
            /**
             * Fetches the content of a file.
             * @param path - The path of the file.
             * @returns The content of the file, or null if the file does not exist.
             */
            function fetchContent(path) {
                return __awaiter(this, void 0, void 0, function* () {
                    try {
                        const content = fs_1.default.readFileSync(path, 'utf8');
                        return content;
                    }
                    catch (error) {
                        console.log(`Cannot find ${path} in ${sourceRepo}`);
                        return null;
                    }
                });
            }
            /**
             * Checks if there are existing pull requests for a branch.
             * @param repo - The repository.
             * @param branchName - The name of the branch.
             * @returns True if there are existing pull requests, false otherwise.
             */
            function checkExistingPulls(repo, branchName) {
                return __awaiter(this, void 0, void 0, function* () {
                    const existingPulls = yield octokit.rest.pulls.list({
                        owner: org,
                        repo: repo.name,
                        head: `${org}:${branchName}`
                    });
                    return existingPulls.data.length > 0;
                });
            }
            /**
             * Gets the default branch of a repository.
             * @param repo - The repository.
             * @returns The name of the default branch.
             */
            function getDefaultBranch(repo) {
                return __awaiter(this, void 0, void 0, function* () {
                    const { data: { default_branch } } = yield octokit.rest.repos.get({
                        owner: org,
                        repo: repo.name,
                    });
                    return default_branch;
                });
            }
            /**
             * Creates a new branch in a repository.
             * @param repo - The repository.
             * @param default_branch - The name of the default branch.
             * @param branchName - The name of the new branch.
             */
            function createNewBranch(repo, default_branch, branchName) {
                return __awaiter(this, void 0, void 0, function* () {
                    const { data: ref } = yield octokit.rest.git.getRef({
                        owner: org,
                        repo: repo.name,
                        ref: `heads/${default_branch}`,
                    });
                    yield octokit.rest.git.createRef({
                        owner: org,
                        repo: repo.name,
                        ref: `refs/heads/${branchName}`,
                        sha: ref.object.sha,
                    });
                });
            }
            /**
             * Creates a file in a branch.
             * @param repo - The repository.
             * @param decodedContent - The content of the file.
             * @param branchName - The name of the branch.
             */
            function createFileInBranch(repo, decodedContent, branchName) {
                return __awaiter(this, void 0, void 0, function* () {
                    yield octokit.rest.repos.createOrUpdateFileContents({
                        owner: org,
                        repo: repo.name,
                        path: 'CODEOWNERS',
                        message: 'Created CODEOWNERS',
                        content: Buffer.from(decodedContent).toString('base64'),
                        branch: branchName,
                    });
                });
            }
            /**
             * Creates a pull request.
             * @param repo - The repository.
             * @param branchName - The name of the branch.
             * @param default_branch - The name of the default branch.
             */
            function createPullRequest(repo, branchName, default_branch) {
                return __awaiter(this, void 0, void 0, function* () {
                    yield octokit.rest.pulls.create({
                        owner: org,
                        repo: repo.name,
                        title: `Add CODEOWNERS file to ${repo.name}`,
                        head: branchName,
                        base: default_branch,
                    });
                });
            }
            /**
             * Creates a branch and a pull request.
             * @param repo - The repository.
             * @param sourceContent - The content of the source file.
             */
            function createBranchAndPR(repo, sourceContent) {
                return __awaiter(this, void 0, void 0, function* () {
                    const branchName = `codeowners-feature-${repo.name}`;
                    if (yield checkExistingPulls(repo, branchName)) {
                        console.log(`Pull request already exists for repository ${repo.name}`);
                        return;
                    }
                    const default_branch = yield getDefaultBranch(repo);
                    yield createNewBranch(repo, default_branch, branchName);
                    yield createFileInBranch(repo, sourceContent, branchName);
                    yield createPullRequest(repo, branchName, default_branch);
                });
            }
            const sourceContent = yield fetchContent('CODEOWNERS');
            const settingsContent = yield fetchContent('.github/codeowners_repos_config.json');
            if (!sourceContent || !settingsContent) {
                return;
            }
            const settings = JSON.parse(settingsContent);
            const repos = yield octokit.paginate(octokit.rest.repos.listForOrg, {
                org,
                type: 'all',
            });
            for (const repo of repos) {
                if (repo.name !== sourceRepo && settings.include.includes(repo.name) && !settings.exclude.includes(repo.name)) {
                    try {
                        yield octokit.rest.repos.getContent({
                            owner: org,
                            repo: repo.name,
                            path: 'CODEOWNERS',
                        });
                    }
                    catch (error) {
                        if (error instanceof Error && error.message.includes('Not Found')) {
                            yield createBranchAndPR(repo, sourceContent);
                        }
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof Error) {
                core.setFailed(error.message);
            }
            else {
                core.setFailed('An unknown error occurred.');
            }
        }
    });
}
run();
