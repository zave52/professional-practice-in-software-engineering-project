import {describe, expect, it, vi} from 'vitest';
import {AppConfig} from '../../src/config/AppConfig.js';
import {GitHubApiClient} from '../../src/integrations/github/GitHubApiClient.js';
import {CiProvider} from '../../src/patterns/adapter/CiProvider.js';
import {GitHubActionsAdapter} from '../../src/patterns/adapter/GitHubActionsAdapter.js';
import {RetryingHttpClient} from '../../src/patterns/decorator/RetryingHttpClient.js';
import {
    CiProviderFactory,
    createCiProviderFactory,
    GitHubActionsProviderFactory,
} from '../../src/patterns/factory/CiProviderFactory.js';
import {CachingGitHubClientProxy} from '../../src/patterns/proxy/CachingGitHubClientProxy.js';
import {silentLogger} from '../../src/logger.js';
import {jsonResponse} from '../helpers/fixtures.js';

const githubRun = (overrides = {}) => ({
    id: 11,
    run_number: 3,
    run_attempt: 2,
    workflow_id: 42,
    name: 'Deploy',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: 'f'.repeat(40),
    head_commit: {timestamp: '2026-11-01T09:00:00Z'},
    actor: {login: 'actor'},
    triggering_actor: {login: 'trigger'},
    event: 'push',
    html_url: 'https://github.com/acme/app/actions/runs/11',
    run_started_at: '2026-11-01T09:01:00Z',
    created_at: '2026-11-01T09:00:30Z',
    updated_at: '2026-11-01T09:03:00Z',
    ...overrides,
});

describe('GitHubApiClient', () => {
    const create = (...responses) => {
        const http = {request: vi.fn()};
        responses.forEach((response) => http.request.mockResolvedValueOnce(response));
        return {http, client: new GitHubApiClient({httpClient: http, baseUrl: 'https://api.github.test/'})};
    };

    it('builds GitHub REST URLs with API headers and the user token', async () => {
        const {http, client} = create(jsonResponse(200, {workflow_runs: [githubRun()]}), jsonResponse(200, {}));

        await expect(client.listWorkflowRuns('acme/app', {workflowId: 42, token: 'tok'})).resolves.toHaveLength(1);
        await client.listWorkflowRuns('acme/app');

        expect(http.request.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            url: 'https://api.github.test/repos/acme/app/actions/workflows/42/runs?per_page=50',
            token: 'tok',
            headers: {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
        });
        expect(http.request.mock.calls[1][0].url).toBe('https://api.github.test/repos/acme/app/actions/runs?per_page=50');
    });

    it('covers branches, tags, workflows, refs and write endpoints', async () => {
        const {http, client} = create(
            jsonResponse(200, {workflows: [{id: 1}]}),
            jsonResponse(200, [{name: 'main'}]),
            jsonResponse(200, [{name: 'v1'}]),
            jsonResponse(200, {object: {sha: 'abc'}}),
            jsonResponse(201, {}),
            jsonResponse(204, null),
            jsonResponse(202, null),
            jsonResponse(201, null),
            jsonResponse(200, githubRun()),
        );
        expect(await client.listWorkflows('acme/app')).toEqual([{id: 1}]);
        expect(await client.listBranches('acme/app')).toEqual([{name: 'main'}]);
        expect(await client.listTags('acme/app')).toEqual([{name: 'v1'}]);
        expect(await client.getBranchHeadSha('acme/app', 'feature/x y')).toBe('abc');
        await client.createTagRef('acme/app', 'v2', 'abc');
        await client.dispatchWorkflow('acme/app', 42, 'v2');
        await client.cancelWorkflowRun('acme/app', 9);
        await client.rerunWorkflowRun('acme/app', 9);
        await client.getWorkflowRun('acme/app', 9);

        const urls = http.request.mock.calls.map(([options]) => `${options.method} ${options.url}`);
        expect(urls).toContain('GET https://api.github.test/repos/acme/app/git/ref/heads/feature/x%20y');
        expect(urls).toContain('POST https://api.github.test/repos/acme/app/actions/workflows/42/dispatches');
        expect(urls).toContain('POST https://api.github.test/repos/acme/app/actions/runs/9/cancel');
        expect(http.request.mock.calls[4][0].body).toEqual({ref: 'refs/tags/v2', sha: 'abc'});
    });

    it('rejects malformed repositories before any request', async () => {
        const {http, client} = create();
        await expect(client.listWorkflows('../../etc')).rejects.toMatchObject({status: 400});
        expect(http.request).not.toHaveBeenCalled();
    });

    it.each([
        [401, 502], [403, 502], [404, 404], [422, 400], [409, 400], [500, 502],
    ])('maps GitHub %i to API status %i', async (githubStatus, apiStatus) => {
        const {client} = create(jsonResponse(githubStatus, {message: 'Reference already exists'}));
        await expect(client.listTags('acme/app')).rejects.toMatchObject({status: apiStatus});
    });
});

describe('Proxy pattern: CachingGitHubClientProxy', () => {
    const subject = () => ({
        listWorkflowRuns: vi.fn().mockResolvedValue(['run']),
        getWorkflowRun: vi.fn().mockResolvedValue({id: 1}),
        listWorkflows: vi.fn().mockResolvedValue([]),
        listBranches: vi.fn().mockResolvedValue([]),
        listTags: vi.fn().mockResolvedValue([]),
        getBranchHeadSha: vi.fn().mockResolvedValue('sha'),
        createTagRef: vi.fn().mockResolvedValue({}),
        dispatchWorkflow: vi.fn().mockResolvedValue(null),
        cancelWorkflowRun: vi.fn().mockResolvedValue(null),
        rerunWorkflowRun: vi.fn().mockResolvedValue(null),
    });

    it('serves repeated reads from cache and coalesces concurrent calls', async () => {
        const real = subject();
        const proxy = new CachingGitHubClientProxy(real, {ttlMs: 1000, now: () => 0});

        const results = await Promise.all([
            proxy.listWorkflowRuns('acme/app', {workflowId: 1, token: 'a'}),
            proxy.listWorkflowRuns('acme/app', {workflowId: 1, token: 'a'}),
        ]);
        await proxy.listWorkflowRuns('acme/app', {workflowId: 1, token: 'a'});

        expect(results).toEqual([['run'], ['run']]);
        expect(real.listWorkflowRuns).toHaveBeenCalledTimes(1);
        expect(proxy.stats()).toEqual({entries: 1, hits: 2, misses: 1});
    });

    it('separates cache entries per token and expires them after the TTL', async () => {
        let now = 0;
        const real = subject();
        const proxy = new CachingGitHubClientProxy(real, {ttlMs: 1000, now: () => now});
        await proxy.listWorkflows('acme/app', {token: 'alice'});
        await proxy.listWorkflows('acme/app', {token: 'bob'});
        now = 2000;
        await proxy.listWorkflows('acme/app', {token: 'alice'});
        expect(real.listWorkflows).toHaveBeenCalledTimes(3);
    });

    it('invalidates a repository after write operations and evicts failed loads', async () => {
        const real = subject();
        const proxy = new CachingGitHubClientProxy(real, {now: () => 0, maxEntries: 2});
        await proxy.listBranches('acme/app');
        await proxy.listTags('acme/app');
        await proxy.getWorkflowRun('acme/app', 5);
        expect(proxy.stats().entries).toBe(2);

        await proxy.dispatchWorkflow('acme/app', 1, 'main');
        await proxy.cancelWorkflowRun('acme/app', 1);
        await proxy.rerunWorkflowRun('acme/app', 1);
        await proxy.createTagRef('acme/app', 'v1', 'sha');
        await proxy.getBranchHeadSha('acme/app', 'main');
        expect(proxy.stats().entries).toBe(0);

        real.listTags.mockRejectedValueOnce(new Error('rate limited'));
        await expect(proxy.listTags('acme/app')).rejects.toThrow('rate limited');
        await expect(proxy.listTags('acme/app')).resolves.toEqual([]);
        expect(real.listTags).toHaveBeenCalledTimes(3);
    });
});

describe('Adapter pattern: GitHubActionsAdapter', () => {
    it.each([
        [{status: 'in_progress'}, 'RUNNING'],
        [{status: 'queued'}, 'RUNNING'],
        [{status: 'completed', conclusion: 'success'}, 'SUCCESS'],
        [{status: 'completed', conclusion: 'cancelled'}, 'CANCELED'],
        [{status: 'completed', conclusion: 'skipped'}, 'CANCELED'],
        [{status: 'completed', conclusion: 'failure'}, 'FAILED'],
        [{status: 'completed', conclusion: 'timed_out'}, 'FAILED'],
    ])('maps %o to %s', (run, status) => {
        expect(GitHubActionsAdapter.toDomainStatus(run)).toBe(status);
    });

    it('translates a GitHub run into the domain PipelineRun', () => {
        expect(GitHubActionsAdapter.toPipelineRun(githubRun())).toEqual({
            runId: 11,
            runNumber: 3,
            runAttempt: 2,
            workflowId: 42,
            workflowName: 'Deploy',
            status: 'SUCCESS',
            ref: 'main',
            commitSha: 'f'.repeat(40),
            commitAt: '2026-11-01T09:00:00Z',
            actorLogin: 'trigger',
            event: 'push',
            url: 'https://github.com/acme/app/actions/runs/11',
            startedAt: '2026-11-01T09:01:00Z',
            finishedAt: '2026-11-01T09:03:00Z',
        });
        const running = GitHubActionsAdapter.toPipelineRun({id: 1, status: 'queued', display_title: 'Manual'});
        expect(running).toMatchObject({finishedAt: null, ref: 'Manual', runAttempt: 1, actorLogin: null});
    });

    it('delegates every CiProvider operation to the GitHub client', async () => {
        const client = {
            listWorkflowRuns: vi.fn().mockResolvedValue([githubRun()]),
            getWorkflowRun: vi.fn().mockResolvedValue(githubRun({status: 'in_progress'})),
            listWorkflows: vi.fn().mockResolvedValue([{id: 1, name: 'CI', path: 'ci.yml', state: 'active', url: 'x'}]),
            listBranches: vi.fn().mockResolvedValue([{name: 'main'}]),
            listTags: vi.fn().mockResolvedValue([{name: 'v1'}]),
            getBranchHeadSha: vi.fn().mockResolvedValue('sha1'),
            createTagRef: vi.fn().mockResolvedValue({}),
            dispatchWorkflow: vi.fn().mockResolvedValue(null),
            cancelWorkflowRun: vi.fn().mockResolvedValue(null),
            rerunWorkflowRun: vi.fn().mockResolvedValue(null),
        };
        const now = new Date('2026-11-01T00:00:00Z');
        const adapter = new GitHubActionsAdapter(client, {now: () => now});
        const base = {repository: 'acme/app', accessToken: 'tok'};

        expect(adapter).toBeInstanceOf(CiProvider);
        expect((await adapter.listPipelineRuns({...base, workflowId: 0}))[0].status).toBe('SUCCESS');
        expect(client.listWorkflowRuns).toHaveBeenCalledWith('acme/app', {workflowId: undefined, token: 'tok'});
        expect((await adapter.getPipelineRun({...base, runId: 11})).status).toBe('RUNNING');
        expect(await adapter.listPipelines(base)).toEqual([{id: 1, name: 'CI', path: 'ci.yml', state: 'active'}]);
        expect(await adapter.listRefs(base)).toEqual({branches: ['main'], tags: ['v1']});

        const plain = await adapter.triggerPipeline({...base, workflowId: 42, ref: 'main'});
        expect(plain).toEqual({ref: 'main', tagCreated: false, dispatchedAt: now});
        expect(client.createTagRef).not.toHaveBeenCalled();

        const tagged = await adapter.triggerPipeline({...base, workflowId: 42, ref: 'main', createTag: true, tagName: 'v2'});
        expect(tagged.ref).toBe('v2');
        expect(client.createTagRef).toHaveBeenCalledWith('acme/app', 'v2', 'sha1', {token: 'tok'});
        expect(client.dispatchWorkflow).toHaveBeenLastCalledWith('acme/app', 42, 'v2', {token: 'tok'});

        expect(await adapter.cancelPipelineRun({...base, runId: '5'})).toEqual({runId: 5, cancelRequested: true});
        expect(await adapter.rerunPipelineRun({...base, runId: 5})).toEqual({runId: 5, rerunRequested: true});
    });

    it('declares the abstract CiProvider contract', () => {
        const provider = new CiProvider();
        ['listPipelineRuns', 'getPipelineRun', 'listPipelines', 'listRefs', 'triggerPipeline',
            'cancelPipelineRun', 'rerunPipelineRun'].forEach((method) => {
            expect(() => provider[method]({})).toThrow('must be implemented');
        });
    });
});

describe('Factory Method pattern: CiProviderFactory', () => {
    it('assembles transport decorators, caching proxy and adapter in a fixed order', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({workflows: []}), {status: 200}));
        const factory = createCiProviderFactory('github', {
            config: new AppConfig({GITHUB_CACHE_TTL_MS: '5000'}),
            logger: silentLogger,
            fetchImpl,
        });
        expect(factory).toBeInstanceOf(GitHubActionsProviderFactory);

        const provider = factory.createProvider();
        expect(provider).toBeInstanceOf(GitHubActionsAdapter);
        expect(provider.client).toBeInstanceOf(CachingGitHubClientProxy);
        expect(provider.client.subject.http).toBeInstanceOf(RetryingHttpClient);
        expect(provider.client.ttlMs).toBe(5000);

        await provider.listPipelines({repository: 'acme/app', accessToken: 'tok'});
        await provider.listPipelines({repository: 'acme/app', accessToken: 'tok'});
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('rejects unknown providers and enforces the abstract factory methods', () => {
        expect(() => createCiProviderFactory('jenkins', {})).toThrow('Unsupported CI provider');
        const abstract = new CiProviderFactory();
        expect(() => abstract.createProvider()).toThrow('must be implemented');
        expect(() => abstract.createApiClient()).toThrow('must be implemented');
        expect(() => abstract.createAdapter()).toThrow('must be implemented');
    });
});
