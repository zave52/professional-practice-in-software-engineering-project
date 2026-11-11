import {afterEach, describe, expect, it, vi} from 'vitest';
import * as api from '../src/services/api';

const respond = (status, body) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {status}),
);

afterEach(() => vi.restoreAllMocks());

describe('API client', () => {
    it('sends credentials and JSON to the new REST endpoints', async () => {
        const fetchMock = respond(201, {deployment: {id: 1}});
        await api.triggerDeployment(3, {ref: 'main', createTag: true, tagName: 'v1'});

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/deployments');
        expect(init).toMatchObject({method: 'POST', credentials: 'include'});
        expect(JSON.parse(init.body)).toEqual({project_id: 3, ref: 'main', create_tag: true, tag_name: 'v1'});
        expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('builds query strings and skips empty or "all" filters', async () => {
        const fetchMock = respond(200, {});
        await api.getMetrics({days: 7, projectId: 'all'});
        await api.getDeployments({projectId: 5});
        await api.getRepositoryWorkflows('https://github.com/acme/my app');
        await api.getAuditLog({limit: 10});
        await api.getDeployments();

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            '/api/metrics?days=7',
            '/api/deployments?project_id=5',
            '/api/repositories/workflows?repo_url=https%3A%2F%2Fgithub.com%2Facme%2Fmy+app',
            '/api/audit?limit=10',
            '/api/deployments',
        ]);
    });

    it('covers project and run operations', async () => {
        const fetchMock = respond(200, {});
        await api.getProjects();
        await api.createProject({name: 'App', repo_url: 'https://github.com/a/b', workflow_id: 2, extra: 'x'});
        await api.deleteProject(4);
        await api.getDeploymentRefs(4);
        await api.cancelDeployment(9);
        await api.rerunDeployment(9);
        await api.getSession();
        await api.logout();

        const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method || 'GET'} ${url}`);
        expect(calls).toEqual([
            'GET /api/projects', 'POST /api/projects', 'DELETE /api/projects/4', 'GET /api/projects/4/refs',
            'POST /api/deployments/9/cancel', 'POST /api/deployments/9/rerun', 'GET /api/auth/session', 'POST /api/auth/logout',
        ]);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({name: 'App', repo_url: 'https://github.com/a/b', workflow_id: 2});
        expect(api.getLoginUrl()).toBe('/api/auth/github');
    });

    it('raises ApiError with status and code from the server', async () => {
        respond(409, {code: 'INVALID_STATE_TRANSITION', message: 'Cannot cancel a deployment in SUCCESS state.'});
        await expect(api.cancelDeployment(1)).rejects.toMatchObject({
            name: 'ApiError', status: 409, code: 'INVALID_STATE_TRANSITION', message: 'Cannot cancel a deployment in SUCCESS state.',
        });
    });

    it('maps 401, empty error bodies and network failures to friendly messages', async () => {
        respond(401, {});
        await expect(api.getProjects()).rejects.toMatchObject({status: 401, message: 'Please sign in with GitHub to perform this action.'});

        vi.restoreAllMocks();
        respond(500);
        await expect(api.getProjects()).rejects.toThrow('Unable to complete the request');

        vi.restoreAllMocks();
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
        await expect(api.getProjects()).rejects.toMatchObject({status: 0, code: 'NETWORK_ERROR'});
    });
});
