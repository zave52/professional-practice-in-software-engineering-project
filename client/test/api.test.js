import {afterEach, describe, expect, it, vi} from 'vitest';
import {createProject, getProjects, getRepositoryWorkflows} from '../src/services/api';

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('API client', () => {
    it('sends JSON, auth, and encoded workflow requests', async () => {
        localStorage.setItem('accessToken', 'token');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify([{id: 1, name: 'Deploy'}]), {status: 200}),
        );

        await getRepositoryWorkflows('https://github.com/acme/my project');

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/pipelines/workflows?repo_url=https%3A%2F%2Fgithub.com%2Facme%2Fmy%20project',
            expect.objectContaining({
                headers: expect.objectContaining({Authorization: 'Bearer token', Accept: 'application/json'}),
            }),
        );
    });

    it('posts project fields and returns server error messages', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({id: 4}), {status: 201}),
        ).mockResolvedValueOnce(
            new Response(JSON.stringify({message: 'Project already exists.'}), {status: 409}),
        );

        await expect(createProject({
            name: 'App',
            repo_url: 'https://github.com/a/b',
            workflow_id: 2,
            workflow_name: 'Deploy'
        }))
            .resolves.toEqual({id: 4});
        expect(fetchMock.mock.calls[0][1].body).toContain('"workflow_id":2');
        await expect(getProjects()).rejects.toThrow('Project already exists.');
    });

    it('maps network failures to a user-friendly error', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

        await expect(getProjects()).rejects.toThrow('Unable to reach the backend API');
    });
});
