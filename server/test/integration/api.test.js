import request from 'supertest';
import {afterEach, expect, it} from 'vitest';
import app from '../../src/app.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';

afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
});

it('returns a JSON 404 for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({status: 404, message: 'Route not found.'});
});

it('exposes an anonymous session and starts GitHub OAuth without exposing secrets', async () => {
    const session = await request(app).get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body).toEqual({user: null});

    process.env.GITHUB_CLIENT_ID = 'public-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'server-only-secret';
    const login = await request(app).get('/api/auth/github');
    expect(login.status).toBe(302);
    expect(login.headers.location).toContain('github.com/login/oauth/authorize');
    expect(login.headers.location).toContain('client_id=public-client-id');
    expect(login.headers.location).not.toContain('client_secret');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
});

it('rejects unauthenticated mutations', async () => {
    const response = await request(app)
        .post('/api/projects')
        .send({name: 'ab', repo_url: 'not-a-github-url'});

    expect(response.status).toBe(401);
});

it('validates CRUD route parameters and deployment payloads', async () => {
    const project = await request(app).get('/api/projects/not-an-id');
    expect(project.status).toBe(400);
    expect(project.body.message).toContain('positive integer');

    const deleted = await request(app).delete('/api/projects/not-an-id');
    expect(deleted.status).toBe(401);

    const deployment = await request(app).post('/api/deployments').send({project_id: 'bad', version_tag: 'v1'});
    expect(deployment.status).toBe(401);

    const deploymentById = await request(app).get('/api/deployments/not-an-id');
    expect(deploymentById.status).toBe(400);
});
