import request from 'supertest';
import {describe, expect, it, vi} from 'vitest';
import {createApp} from '../../src/app.js';
import {createContainer} from '../../src/container.js';
import {silentLogger} from '../../src/logger.js';
import {FakeCiProvider, makeConfig} from '../helpers/fixtures.js';

/** HTTP-level tests that do not need PostgreSQL. */
const buildApp = ({database = {ping: vi.fn().mockResolvedValue(true), query: vi.fn()}, env} = {}) => createApp(
    createContainer({
        config: makeConfig({APP_VERSION: 'abc123', ...env}),
        logger: silentLogger,
        database,
        overrides: {ciProvider: new FakeCiProvider()},
    }),
);

describe('Express application without a database', () => {
    it('reports health with the deployed version (used by the deploy smoke test)', async () => {
        const response = await request(buildApp()).get('/api/health');
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({status: 'ok', version: 'abc123', db: 'connected'});
    });

    it('returns 503 when the database is unavailable', async () => {
        const app = buildApp({database: {ping: vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))}});
        const response = await request(app).get('/api/health');
        expect(response.status).toBe(503);
        expect(response.body).toEqual({status: 'error', version: 'abc123', db: 'unavailable'});
    });

    it('sets security headers and does not advertise Express', async () => {
        const response = await request(buildApp()).get('/api/health');
        expect(response.headers['x-powered-by']).toBeUndefined();
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('returns JSON 404 for unknown routes and rejects malformed JSON', async () => {
        const app = buildApp();
        expect((await request(app).get('/api/nope')).body).toEqual({status: 404, code: 'NOT_FOUND', message: 'Route not found.'});
        const malformed = await request(app).post('/api/projects').set('Content-Type', 'application/json').send('{bad');
        expect(malformed.status).toBe(400);
    });

    it('requires authentication for every resource route', async () => {
        const app = buildApp();
        const calls = [
            request(app).get('/api/projects'),
            request(app).post('/api/projects').send({name: 'x'}),
            request(app).delete('/api/projects/1'),
            request(app).get('/api/repositories/workflows?repo_url=x'),
            request(app).get('/api/deployments'),
            request(app).post('/api/deployments/1/cancel'),
            request(app).get('/api/metrics'),
            request(app).get('/api/audit'),
            request(app).get('/api/projects').set('Authorization', 'Bearer not-a-jwt'),
        ];
        for (const response of await Promise.all(calls)) {
            expect(response.status).toBe(401);
            expect(response.body.code).toBe('UNAUTHENTICATED');
        }
    });

    it('starts GitHub OAuth with an httpOnly state cookie and without exposing the client secret', async () => {
        const app = buildApp();
        expect((await request(app).get('/api/auth/session')).body).toEqual({user: null});

        const login = await request(app).get('/api/auth/github');
        expect(login.status).toBe(302);
        expect(login.headers.location).toContain('https://github.com/login/oauth/authorize?client_id=public-client-id');
        expect(login.headers.location).not.toContain('server-only-secret');
        expect(login.headers['set-cookie'][0]).toMatch(/^github_oauth_state=.*HttpOnly.*SameSite=Lax/);
    });

    it('redirects back to the client with an error when the OAuth state is wrong', async () => {
        const response = await request(buildApp())
            .get('/api/auth/github/callback?code=x&state=forged')
            .set('Cookie', 'github_oauth_state=other');
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('http://localhost:5173/?login_error=VALIDATION_ERROR');
    });

    it('answers 503 when OAuth is not configured and 429 when the rate limit is exceeded', async () => {
        const unconfigured = buildApp({env: {GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: ''}});
        expect((await request(unconfigured).get('/api/auth/github')).status).toBe(503);

        const limited = buildApp({env: {RATE_LIMIT_MAX: '2'}});
        await request(limited).get('/api/projects');
        await request(limited).get('/api/projects');
        const third = await request(limited).get('/api/projects');
        expect(third.status).toBe(429);
        expect(third.body.code).toBe('RATE_LIMITED');
    });

    it('clears the session cookie on logout', async () => {
        const response = await request(buildApp()).post('/api/auth/logout');
        expect(response.status).toBe(204);
        expect(response.headers['set-cookie'][0]).toMatch(/^cicd_session=;/);
    });
});
