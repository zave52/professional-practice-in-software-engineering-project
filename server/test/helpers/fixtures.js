import pg from 'pg';
import {vi} from 'vitest';
import {AppConfig} from '../../src/config/AppConfig.js';
import {Database} from '../../src/db/Database.js';
import {MigrationRunner} from '../../src/db/MigrationRunner.js';
import {CiProvider} from '../../src/patterns/adapter/CiProvider.js';

export const ENCRYPTION_KEY = 'a'.repeat(64);

export const makeConfig = (env = {}) => new AppConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-only-jwt-secret-with-enough-length',
    GITHUB_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    GITHUB_CLIENT_ID: 'public-client-id',
    GITHUB_CLIENT_SECRET: 'server-only-secret',
    CLIENT_ORIGIN: 'http://localhost:5173',
    API_ORIGIN: 'http://localhost:3000',
    ADMIN_GITHUB_LOGINS: 'root-admin',
    RATE_LIMIT_MAX: '10000',
    RATE_LIMIT_AUTH_MAX: '10000',
    ...env,
});

export const developer = (overrides = {}) => ({
    id: 7,
    username: 'dev',
    role: 'Developer',
    githubAccessToken: 'gho_dev',
    ...overrides,
});

export const admin = (overrides = {}) => developer({id: 1, username: 'root-admin', role: 'Admin', ...overrides});

export const project = (overrides = {}) => ({
    id: 3,
    user_id: 7,
    name: 'dashboard',
    repo_url: 'https://github.com/acme/dashboard',
    workflow_id: 42,
    workflow_name: 'Deploy',
    ...overrides,
});

export const pipelineRun = (overrides = {}) => ({
    runId: 1001,
    runNumber: 5,
    runAttempt: 1,
    workflowId: 42,
    workflowName: 'Deploy',
    status: 'RUNNING',
    ref: 'main',
    commitSha: 'a'.repeat(40),
    commitAt: '2026-11-01T10:00:00.000Z',
    actorLogin: 'dev',
    event: 'push',
    url: 'https://github.com/acme/dashboard/actions/runs/1001',
    startedAt: '2026-11-01T10:05:00.000Z',
    finishedAt: null,
    ...overrides,
});

/** In-memory CI provider whose methods are spies. */
export class FakeCiProvider extends CiProvider {
    constructor({runs = [], workflows = [{id: 42, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active'}]} = {}) {
        super();
        this.runs = runs;
        this.workflows = workflows;
        this.listPipelineRuns = vi.fn(async () => this.runs);
        this.getPipelineRun = vi.fn(async ({runId}) => this.runs.find((run) => run.runId === Number(runId)));
        this.listPipelines = vi.fn(async () => this.workflows);
        this.listRefs = vi.fn(async () => ({branches: ['main', 'develop'], tags: ['v1.0.0']}));
        this.triggerPipeline = vi.fn(async ({ref, createTag, tagName}) => ({
            ref: createTag ? tagName : ref,
            tagCreated: Boolean(createTag),
            dispatchedAt: new Date('2026-11-01T10:04:30.000Z'),
        }));
        this.cancelPipelineRun = vi.fn(async ({runId}) => ({runId, cancelRequested: true}));
        this.rerunPipelineRun = vi.fn(async ({runId}) => ({runId, rerunRequested: true}));
    }
}

export const jsonResponse = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    data: body,
    headers: new Headers(),
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
export const hasTestDatabase = Boolean(testDatabaseUrl);

/** Fresh schema with all migrations applied. Requires TEST_DATABASE_URL. */
export const createTestDatabase = async () => {
    const database = new Database(new pg.Pool({connectionString: testDatabaseUrl, max: 4}));
    await database.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await new MigrationRunner({database}).run();
    return database;
};

export const seedUser = async (database, {username = 'dev', githubId = '100', role = 'Developer', token = null} = {}) => {
    const {rows} = await database.query(`
        INSERT INTO users (role_id, username, email, password_hash, github_id, github_access_token)
        SELECT id, $1::text, $1::text || '@example.com', 'github-oauth', $2, $4
        FROM roles
        WHERE name = $3
        RETURNING id
    `, [username, githubId, role, token]);
    return rows[0].id;
};

export const seedProject = async (database, {userId, name = 'dashboard', workflowId = 42} = {}) => {
    const {rows} = await database.query(`
        INSERT INTO projects (user_id, name, repo_url, workflow_id, workflow_name)
        VALUES ($1, $2::text, 'https://github.com/acme/' || $2::text, $3, 'Deploy')
        RETURNING *
    `, [userId, name, workflowId]);
    return rows[0];
};
