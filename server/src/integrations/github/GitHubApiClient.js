import {NotFoundError, UpstreamError, ValidationError} from '../../errors/AppError.js';

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const encodeRefPath = (ref) => String(ref).split('/').map(encodeURIComponent).join('/');

/**
 * Thin client of the GitHub REST API. It knows URLs, headers and HTTP error semantics but
 * returns raw GitHub payloads; translating them into the domain model is the job of
 * GitHubActionsAdapter.
 */
export class GitHubApiClient {
    constructor({httpClient, baseUrl = 'https://api.github.com'}) {
        this.http = httpClient;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    static assertRepository(repository) {
        if (!REPOSITORY_PATTERN.test(String(repository || ''))) {
            throw new ValidationError('Repository must use the owner/name format.');
        }
        return repository;
    }

    async #call(method, path, {token, body, query} = {}) {
        const url = new URL(`${this.baseUrl}${path}`);
        Object.entries(query || {})
            .filter(([, value]) => value !== undefined && value !== null)
            .forEach(([key, value]) => url.searchParams.set(key, String(value)));

        const response = await this.http.request({
            method,
            url: url.toString(),
            token,
            body,
            headers: {
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!response.ok) {
            throw GitHubApiClient.toError(response);
        }
        return response.data;
    }

    static toError({status, data}) {
        if (status === 401 || status === 403) {
            return new UpstreamError('GitHub rejected the request. Sign in again or check repository permissions.');
        }
        if (status === 404) {
            return new NotFoundError('GitHub repository, workflow or run was not found.');
        }
        if (status === 409 || status === 422) {
            const detail = typeof data?.message === 'string' ? ` ${data.message}` : '';
            return new ValidationError(`GitHub rejected the request.${detail}`);
        }
        return new UpstreamError(`GitHub API returned ${status}.`);
    }

    #repo(repository) {
        return `/repos/${GitHubApiClient.assertRepository(repository)}`;
    }

    async listWorkflowRuns(repository, {workflowId, perPage = 50, token} = {}) {
        const path = workflowId
            ? `${this.#repo(repository)}/actions/workflows/${encodeURIComponent(workflowId)}/runs`
            : `${this.#repo(repository)}/actions/runs`;
        const data = await this.#call('GET', path, {token, query: {per_page: perPage}});
        return data?.workflow_runs || [];
    }

    getWorkflowRun(repository, runId, {token} = {}) {
        return this.#call('GET', `${this.#repo(repository)}/actions/runs/${encodeURIComponent(runId)}`, {token});
    }

    async listWorkflows(repository, {token} = {}) {
        const data = await this.#call('GET', `${this.#repo(repository)}/actions/workflows`, {
            token,
            query: {per_page: 100},
        });
        return data?.workflows || [];
    }

    async listBranches(repository, {token} = {}) {
        return (await this.#call('GET', `${this.#repo(repository)}/branches`, {token, query: {per_page: 100}})) || [];
    }

    async listTags(repository, {token} = {}) {
        return (await this.#call('GET', `${this.#repo(repository)}/tags`, {token, query: {per_page: 100}})) || [];
    }

    async getBranchHeadSha(repository, branch, {token} = {}) {
        const data = await this.#call('GET', `${this.#repo(repository)}/git/ref/heads/${encodeRefPath(branch)}`, {token});
        return data.object.sha;
    }

    createTagRef(repository, tagName, sha, {token} = {}) {
        return this.#call('POST', `${this.#repo(repository)}/git/refs`, {
            token,
            body: {ref: `refs/tags/${tagName}`, sha},
        });
    }

    dispatchWorkflow(repository, workflowId, ref, {token} = {}) {
        return this.#call(
            'POST',
            `${this.#repo(repository)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`,
            {token, body: {ref}},
        );
    }

    cancelWorkflowRun(repository, runId, {token} = {}) {
        return this.#call('POST', `${this.#repo(repository)}/actions/runs/${encodeURIComponent(runId)}/cancel`, {token});
    }

    rerunWorkflowRun(repository, runId, {token} = {}) {
        return this.#call('POST', `${this.#repo(repository)}/actions/runs/${encodeURIComponent(runId)}/rerun`, {token});
    }
}

export default GitHubApiClient;
