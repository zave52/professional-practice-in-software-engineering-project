import request from 'supertest';
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {createApp} from '../../src/app.js';
import {createContainer} from '../../src/container.js';
import {MigrationRunner} from '../../src/db/MigrationRunner.js';
import {silentLogger} from '../../src/logger.js';
import {TokenCipher} from '../../src/services/TokenCipher.js';
import {
    createTestDatabase,
    ENCRYPTION_KEY,
    FakeCiProvider,
    hasTestDatabase,
    makeConfig,
    pipelineRun,
    seedProject,
    seedUser,
} from '../helpers/fixtures.js';

/**
 * End-to-end API tests against a real PostgreSQL database (TEST_DATABASE_URL). Only the
 * CI provider and GitHub OAuth HTTP calls are replaced by fakes.
 */
describe.skipIf(!hasTestDatabase)('REST API with PostgreSQL', () => {
    const cipher = new TokenCipher(ENCRYPTION_KEY);
    let database;
    let ciProvider;
    let container;
    let app;
    let ids;
    const auth = (userId) => ({Authorization: `Bearer ${container.authService.createSessionToken({id: userId})}`});

    const githubFetch = vi.fn(async (url) => {
        const responses = {
            'https://github.com/login/oauth/access_token': {access_token: 'gho_new_admin'},
            'https://api.github.com/user': {id: 555, login: 'root-admin', email: null, avatar_url: 'https://avatar'},
            'https://api.github.com/user/emails': [{email: 'root@example.com', primary: true}],
        };
        return new Response(JSON.stringify(responses[url]), {status: 200});
    });

    beforeAll(async () => {
        database = await createTestDatabase();
    });

    afterAll(async () => {
        await database?.close();
    });

    beforeEach(async () => {
        await database.query('TRUNCATE audit_log, deployments, projects, users RESTART IDENTITY CASCADE');
        const token = cipher.encrypt('gho_dev');
        const developerId = await seedUser(database, {username: 'dev', githubId: '1', token});
        const otherId = await seedUser(database, {username: 'other', githubId: '2', token});
        const adminId = await seedUser(database, {username: 'boss', githubId: '3', role: 'Admin', token});
        const inactiveId = await seedUser(database, {username: 'gone', githubId: '4', token});
        await database.query('UPDATE users SET is_active = false WHERE id = $1', [inactiveId]);
        const own = await seedProject(database, {userId: developerId, name: 'dashboard'});
        const foreign = await seedProject(database, {userId: otherId, name: 'foreign'});
        ids = {developerId, otherId, adminId, inactiveId, own, foreign};

        ciProvider = new FakeCiProvider();
        container = createContainer({
            config: makeConfig(),
            logger: silentLogger,
            database,
            fetchImpl: githubFetch,
            overrides: {ciProvider},
        });
        app = createApp(container);
    });

    it('migrations are recorded and re-running them is a no-op', async () => {
        const {rows} = await database.query('SELECT name FROM schema_migrations ORDER BY version');
        expect(rows.map((row) => row.name)).toEqual([
            '001_baseline.sql', '002_deployment_tracking.sql', '003_audit_log.sql',
        ]);
        await expect(new MigrationRunner({database}).run()).resolves.toEqual([]);
    });

    it('completes the GitHub OAuth flow, promotes configured admins and creates a session', async () => {
        const start = await request(app).get('/api/auth/github');
        const stateCookie = start.headers['set-cookie'][0].split(';')[0];
        const state = new URL(start.headers.location).searchParams.get('state');

        const callback = await request(app)
            .get(`/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`)
            .set('Cookie', stateCookie);

        expect(callback.status).toBe(302);
        expect(callback.headers.location).toBe('http://localhost:5173');
        const sessionCookie = callback.headers['set-cookie'].find((item) => item.startsWith('cicd_session='));
        expect(sessionCookie).toMatch(/HttpOnly/);

        const session = await request(app).get('/api/auth/session').set('Cookie', sessionCookie.split(';')[0]);
        expect(session.body.user).toMatchObject({username: 'root-admin', email: 'root@example.com', role: 'Admin'});
        expect(JSON.stringify(session.body)).not.toContain('gho_');

        const {rows} = await database.query("SELECT github_access_token FROM users WHERE username = 'root-admin'");
        expect(cipher.decrypt(rows[0].github_access_token)).toBe('gho_new_admin');
    });

    it('rejects sessions of deactivated users', async () => {
        const response = await request(app).get('/api/projects').set(auth(ids.inactiveId));
        expect(response.status).toBe(401);
        expect((await request(app).get('/api/auth/session').set(auth(ids.inactiveId))).body).toEqual({user: null});
    });

    it('scopes projects by owner while administrators see everything', async () => {
        const mine = await request(app).get('/api/projects').set(auth(ids.developerId));
        expect(mine.body.map((project) => project.name)).toEqual(['dashboard']);

        const all = await request(app).get('/api/projects').set(auth(ids.adminId));
        expect(all.body.map((project) => project.name).sort()).toEqual(['dashboard', 'foreign']);

        expect((await request(app).get(`/api/projects/${ids.foreign.id}`).set(auth(ids.developerId))).status).toBe(404);
        expect((await request(app).delete(`/api/projects/${ids.foreign.id}`).set(auth(ids.developerId))).status).toBe(404);
        expect((await request(app).get('/api/projects/abc').set(auth(ids.developerId))).status).toBe(400);
        expect((await request(app).get(`/api/projects/${ids.own.id}`).set(auth(ids.developerId))).body.owner_username).toBe('dev');
    });

    it('creates projects after verifying the workflow and records the audit trail', async () => {
        const invalid = await request(app).post('/api/projects').set(auth(ids.developerId))
            .send({name: 'A', repo_url: 'not-a-url', workflow_id: 42});
        expect(invalid.status).toBe(400);

        const created = await request(app).post('/api/projects').set(auth(ids.developerId))
            .send({name: ' api-gateway ', repo_url: 'https://github.com/acme/api-gateway.git', workflow_id: 42});
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({name: 'api-gateway', repo_url: 'https://github.com/acme/api-gateway',
            workflow_name: 'Deploy', user_id: ids.developerId});

        const duplicate = await request(app).post('/api/projects').set(auth(ids.developerId))
            .send({name: 'api-gateway', repo_url: 'https://github.com/acme/x', workflow_id: 42});
        expect(duplicate.status).toBe(409);

        const removed = await request(app).delete(`/api/projects/${created.body.id}`).set(auth(ids.developerId));
        expect(removed.body).toEqual({id: created.body.id, name: 'api-gateway'});

        const audit = await request(app).get('/api/audit').set(auth(ids.developerId));
        expect(audit.body.map((entry) => entry.event)).toEqual(['PROJECT_DELETED', 'PROJECT_CREATED']);
        expect(audit.body[0]).toMatchObject({username: 'dev', payload: {name: 'api-gateway'}});
    });

    it('lists repository workflows and refs through the CI provider', async () => {
        const workflows = await request(app).get('/api/repositories/workflows')
            .query({repo_url: 'https://github.com/acme/dashboard'}).set(auth(ids.developerId));
        expect(workflows.body[0]).toMatchObject({id: 42, name: 'Deploy'});
        expect(ciProvider.listPipelines).toHaveBeenCalledWith({repository: 'acme/dashboard', accessToken: 'gho_dev'});

        const badUrl = await request(app).get('/api/repositories/workflows?repo_url=x').set(auth(ids.developerId));
        expect(badUrl.status).toBe(400);

        const refs = await request(app).get(`/api/projects/${ids.own.id}/refs`).set(auth(ids.developerId));
        expect(refs.body).toEqual({branches: ['main', 'develop'], tags: ['v1.0.0']});
    });

    it('synchronises runs, links dispatches and drives the state machine end to end', async () => {
        ciProvider.runs = [pipelineRun({runId: 900, status: 'SUCCESS', finishedAt: '2026-11-01T10:07:00.000Z', event: 'push'})];
        const first = await request(app).get('/api/deployments').set(auth(ids.developerId));
        expect(first.status).toBe(200);
        expect(first.body.warnings).toEqual([]);
        expect(first.body.deployments).toHaveLength(1);
        expect(first.body.deployments[0]).toMatchObject({run_id: 900, deploy_status: 'SUCCESS', actions: ['rerun'],
            project_name: 'dashboard', triggered_by: 'dev', commit_sha: 'a'.repeat(40)});

        const triggered = await request(app).post('/api/deployments').set(auth(ids.developerId))
            .send({project_id: ids.own.id, ref: 'main'});
        expect(triggered.status).toBe(201);
        expect(triggered.body.deployment).toMatchObject({pending: true, deploy_status: 'RUNNING', ref: 'main',
            triggered_by: 'dev', actions: []});
        const pendingId = triggered.body.deployment.id;

        const early = await request(app).post(`/api/deployments/${pendingId}/cancel`).set(auth(ids.developerId));
        expect(early.status).toBe(409);
        expect(early.body.code).toBe('RUN_NOT_STARTED');

        const dispatchedRun = pipelineRun({runId: 901, event: 'workflow_dispatch', startedAt: '2026-11-01T10:05:00.000Z'});
        ciProvider.runs = [dispatchedRun, ...ciProvider.runs];
        const linked = await request(app).get('/api/deployments').set(auth(ids.developerId));
        const linkedRow = linked.body.deployments.find((item) => item.id === pendingId);
        expect(linkedRow).toMatchObject({run_id: 901, pending: false, deploy_status: 'RUNNING', actions: ['cancel'],
            triggered_by: 'dev'});
        expect(linked.body.deployments).toHaveLength(2);

        const canceled = await request(app).post(`/api/deployments/${pendingId}/cancel`).set(auth(ids.developerId));
        expect(canceled.status).toBe(200);
        expect(canceled.body).toMatchObject({from: 'RUNNING', to: 'CANCELING', deployment: {deploy_status: 'CANCELING'}});

        ciProvider.runs[0] = {...dispatchedRun, status: 'CANCELED', finishedAt: '2026-11-01T10:06:00.000Z'};
        const confirmed = await request(app).get('/api/deployments').set(auth(ids.developerId));
        expect(confirmed.body.deployments.find((item) => item.id === pendingId).deploy_status).toBe('CANCELED');

        const rerun = await request(app).post(`/api/deployments/${pendingId}/rerun`).set(auth(ids.developerId));
        expect(rerun.body).toMatchObject({from: 'CANCELED', to: 'RUNNING'});

        const again = await request(app).post(`/api/deployments/${pendingId}/rerun`).set(auth(ids.developerId));
        expect(again.status).toBe(200);

        ciProvider.runs[0] = {...dispatchedRun, status: 'RUNNING', runAttempt: 2};
        ciProvider.runs[1] = {...ciProvider.runs[1], status: 'SUCCESS'};
        const conflict = await request(app).post(`/api/deployments/${first.body.deployments[0].id}/cancel`)
            .set(auth(ids.developerId));
        expect(conflict.status).toBe(409);
        expect(conflict.body.code).toBe('INVALID_STATE_TRANSITION');

        ciProvider.runs[0] = {...dispatchedRun, status: 'FAILED', runAttempt: 2, finishedAt: '2026-11-01T10:09:00.000Z'};
        await request(app).get('/api/deployments').set(auth(ids.developerId));
        const detail = await request(app).get(`/api/deployments/${pendingId}`).set(auth(ids.developerId));
        expect(detail.body).toMatchObject({deploy_status: 'FAILED', run_attempt: 2, duration_seconds: 240});

        const audit = await request(app).get('/api/audit').set(auth(ids.developerId));
        const events = audit.body.map((entry) => entry.event);
        expect(events).toEqual(expect.arrayContaining([
            'DEPLOYMENT_TRIGGERED', 'DEPLOYMENT_CANCEL_REQUESTED', 'DEPLOYMENT_STATUS_CHANGED',
            'DEPLOYMENT_RERUN_REQUESTED', 'ACTION_FAILED',
        ]));
        const statusChanges = audit.body.filter((entry) => entry.event === 'DEPLOYMENT_STATUS_CHANGED');
        expect(statusChanges.map((entry) => entry.payload.to)).toEqual(expect.arrayContaining(['CANCELED', 'FAILED']));

        const filtered = await request(app).get('/api/deployments').query({search: 'zzz'}).set(auth(ids.developerId));
        expect(filtered.body.deployments).toEqual([]);
    });

    it('hides deployments of foreign projects and reports sync warnings', async () => {
        ciProvider.runs = [pipelineRun({runId: 950})];
        await request(app).get('/api/deployments').set(auth(ids.adminId));
        const {rows} = await database.query('SELECT id FROM deployments WHERE project_id = $1', [ids.foreign.id]);

        expect((await request(app).get(`/api/deployments/${rows[0].id}`).set(auth(ids.developerId))).status).toBe(404);
        expect((await request(app).post(`/api/deployments/${rows[0].id}/cancel`).set(auth(ids.developerId))).status)
            .toBe(404);
        expect((await request(app).get('/api/deployments').query({project_id: ids.foreign.id}).set(auth(ids.developerId)))
            .status).toBe(404);

        ciProvider.listPipelineRuns.mockRejectedValueOnce(Object.assign(new Error('GitHub API returned 500.'), {status: 502}));
        const degraded = await request(app).get('/api/deployments').query({project_id: ids.own.id})
            .set(auth(ids.developerId));
        expect(degraded.status).toBe(200);
        expect(degraded.body.warnings).toEqual([{project_id: ids.own.id, project_name: 'dashboard',
            message: 'GitHub API returned 500.'}]);
    });

    it('removes dispatches that never produced a run', async () => {
        ciProvider.runs = [];
        await request(app).post('/api/deployments').set(auth(ids.developerId)).send({project_id: ids.own.id});
        await database.query("UPDATE deployments SET started_at = now() - INTERVAL '1 hour'");
        await request(app).get('/api/deployments').set(auth(ids.developerId));
        const {rows} = await database.query('SELECT count(*)::int AS count FROM deployments');
        expect(rows[0].count).toBe(0);
    });

    it('calculates DORA metrics from synchronised deployments', async () => {
        const now = Date.now();
        const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
        ciProvider.runs = [
            pipelineRun({runId: 1, status: 'FAILED', commitAt: iso(130), startedAt: iso(125), finishedAt: iso(120)}),
            pipelineRun({runId: 2, status: 'SUCCESS', commitAt: iso(70), startedAt: iso(65), finishedAt: iso(60)}),
            pipelineRun({runId: 3, status: 'SUCCESS', commitAt: iso(20), startedAt: iso(12), finishedAt: iso(10)}),
            pipelineRun({runId: 4, status: 'SUCCESS', event: 'pull_request', startedAt: iso(5), finishedAt: iso(4)}),
        ];
        await request(app).get('/api/deployments').set(auth(ids.developerId));

        const response = await request(app).get('/api/metrics?days=7').set(auth(ids.developerId));
        expect(response.status).toBe(200);
        expect(response.body.totals).toEqual({total: 3, success: 2, failed: 1});
        expect(response.body.metrics.changeFailureRate).toMatchObject({value: 33.3, level: 'low'});
        expect(response.body.metrics.leadTimeForChanges).toMatchObject({value: 10, level: 'elite'});
        expect(response.body.metrics.timeToRestore).toMatchObject({value: 60, sampleSize: 1});
        expect(response.body.metrics.pipelineDuration).toMatchObject({value: 5, sampleSize: 3, level: 'medium'});
        expect(response.body.period.days).toBe(7);
        expect(response.body.activity.events).toHaveProperty('DEPLOYMENT_TRIGGERED');

        expect((await request(app).get('/api/metrics?days=0').set(auth(ids.developerId))).status).toBe(400);
        const other = await request(app).get('/api/metrics').set(auth(ids.otherId));
        expect(other.body.totals).toEqual({total: 0});
    });
});
