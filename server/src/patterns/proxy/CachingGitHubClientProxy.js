import crypto from 'node:crypto';

/**
 * Proxy pattern (caching / smart proxy).
 *
 * Exposes exactly the same interface as GitHubApiClient, so callers cannot tell whether
 * they talk to the real subject or to the proxy. The dashboard polls every 30 seconds for
 * every project of every signed-in user; without the proxy each poll costs N GitHub API
 * calls and the 5000 requests/hour limit is quickly exhausted. The proxy:
 *  - caches read operations for a short TTL, separately per access token (users may see
 *    different repositories);
 *  - coalesces concurrent identical requests into one in-flight promise;
 *  - forwards write operations unchanged and invalidates the cached reads of that repository.
 */
export class CachingGitHubClientProxy {
    constructor(subject, {ttlMs = 15_000, maxEntries = 500, now = () => Date.now()} = {}) {
        this.subject = subject;
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.now = now;
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    static #tokenFingerprint(token) {
        return token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 16) : 'anonymous';
    }

    #key(method, repository, args, token) {
        return JSON.stringify([method, repository, args, CachingGitHubClientProxy.#tokenFingerprint(token)]);
    }

    #cached(method, repository, args, token, load) {
        const key = this.#key(method, repository, args, token);
        const entry = this.cache.get(key);
        if (entry && entry.expiresAt > this.now()) {
            this.hits += 1;
            return entry.promise;
        }

        this.misses += 1;
        const promise = load().catch((error) => {
            if (this.cache.get(key)?.promise === promise) {
                this.cache.delete(key);
            }
            throw error;
        });
        this.cache.set(key, {repository, promise, expiresAt: this.now() + this.ttlMs});
        if (this.cache.size > this.maxEntries) {
            this.cache.delete(this.cache.keys().next().value);
        }
        return promise;
    }

    invalidate(repository) {
        for (const [key, entry] of this.cache) {
            if (entry.repository === repository) {
                this.cache.delete(key);
            }
        }
    }

    stats() {
        return {entries: this.cache.size, hits: this.hits, misses: this.misses};
    }

    async #write(repository, operation) {
        try {
            return await operation();
        } finally {
            this.invalidate(repository);
        }
    }

    listWorkflowRuns(repository, {workflowId, perPage, token} = {}) {
        return this.#cached('listWorkflowRuns', repository, {workflowId, perPage}, token,
            () => this.subject.listWorkflowRuns(repository, {workflowId, perPage, token}));
    }

    getWorkflowRun(repository, runId, {token} = {}) {
        return this.#cached('getWorkflowRun', repository, {runId}, token,
            () => this.subject.getWorkflowRun(repository, runId, {token}));
    }

    listWorkflows(repository, {token} = {}) {
        return this.#cached('listWorkflows', repository, {}, token,
            () => this.subject.listWorkflows(repository, {token}));
    }

    listBranches(repository, {token} = {}) {
        return this.#cached('listBranches', repository, {}, token,
            () => this.subject.listBranches(repository, {token}));
    }

    listTags(repository, {token} = {}) {
        return this.#cached('listTags', repository, {}, token,
            () => this.subject.listTags(repository, {token}));
    }

    getBranchHeadSha(repository, branch, options) {
        return this.subject.getBranchHeadSha(repository, branch, options);
    }

    createTagRef(repository, tagName, sha, options) {
        return this.#write(repository, () => this.subject.createTagRef(repository, tagName, sha, options));
    }

    dispatchWorkflow(repository, workflowId, ref, options) {
        return this.#write(repository, () => this.subject.dispatchWorkflow(repository, workflowId, ref, options));
    }

    cancelWorkflowRun(repository, runId, options) {
        return this.#write(repository, () => this.subject.cancelWorkflowRun(repository, runId, options));
    }

    rerunWorkflowRun(repository, runId, options) {
        return this.#write(repository, () => this.subject.rerunWorkflowRun(repository, runId, options));
    }
}

export default CachingGitHubClientProxy;
