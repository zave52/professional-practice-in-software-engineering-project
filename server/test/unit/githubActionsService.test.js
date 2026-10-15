import {afterEach, describe, expect, it, vi} from 'vitest';
import * as github from '../../src/services/githubActionsService.js';

afterEach(() => vi.restoreAllMocks());

describe('githubActionsService', () => {
    it('maps workflow runs to dashboard deployment statuses', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            workflow_runs: [
                {
                    id: 1,
                    name: 'Deploy',
                    status: 'completed',
                    conclusion: 'success',
                    head_branch: 'main',
                    head_sha: 'abc',
                    created_at: 'now',
                    actor: {login: 'bot'}
                },
                {
                    id: 2,
                    name: 'Deploy',
                    status: 'completed',
                    conclusion: 'cancelled',
                    head_branch: 'dev',
                    head_sha: 'def'
                },
                {id: 3, name: 'Deploy', status: 'in_progress', head_branch: 'dev', head_sha: 'ghi'},
            ],
        }), {status: 200}));
        const result = await github.getWorkflowRuns('acme/app');
        expect(result.map((item) => item.deploy_status)).toEqual(['SUCCESS', 'CANCELED', 'RUNNING']);
        expect(result[0]).toMatchObject({repository: 'acme/app', triggered_by: 'bot'});
    });

    it('maps workflows and refs and validates dispatch input', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({
                workflows: [{
                    id: 7,
                    name: 'Build',
                    path: 'build.yml',
                    state: 'active'
                }]
            }), {status: 200}))
            .mockResolvedValueOnce(new Response(JSON.stringify([{name: 'main'}]), {status: 200}))
            .mockResolvedValueOnce(new Response(JSON.stringify([{name: 'v1'}]), {status: 200}));
        await expect(github.getRepositoryWorkflows('acme/app')).resolves.toEqual([{
            id: 7,
            name: 'Build',
            path: 'build.yml',
            state: 'active'
        }]);
        await expect(github.getRepositoryRefs('acme/app')).resolves.toEqual({branches: ['main'], tags: ['v1']});
        await expect(github.dispatchDeployment({
            repository: 'acme/app',
            workflowId: 0,
            ref: 'main'
        })).rejects.toMatchObject({status: 400});
    });

    it('converts GitHub failures to API-safe errors', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', {status: 404}));
        await expect(github.getRepositoryWorkflows('acme/app')).rejects.toMatchObject({status: 404});
        await expect(github.cancelWorkflowRun('bad', 'acme/app')).rejects.toMatchObject({status: 400});
    });
});
