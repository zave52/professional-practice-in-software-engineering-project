import {describe, expect, it, vi} from 'vitest';
import {AppConfig} from '../../src/config/AppConfig.js';
import {Database} from '../../src/db/Database.js';
import {toDeploymentDto} from '../../src/domain/deploymentPresenter.js';
import {parseRepositoryUrl, toRepositoryUrl} from '../../src/domain/repositoryUrl.js';
import {
    AppError,
    AuthenticationError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    UpstreamError,
    ValidationError,
} from '../../src/errors/AppError.js';
import {createLogger, Logger} from '../../src/logger.js';
import {parseCookies} from '../../src/middleware/authenticate.js';
import {createErrorHandler} from '../../src/middleware/errorHandler.js';
import {TokenCipher} from '../../src/services/TokenCipher.js';
import {ENCRYPTION_KEY} from '../helpers/fixtures.js';

describe('Singleton pattern: AppConfig', () => {
    it('returns the same frozen instance until reset', () => {
        AppConfig.resetInstance();
        const first = AppConfig.getInstance({PORT: '4000'});
        expect(AppConfig.getInstance({PORT: '5000'})).toBe(first);
        expect(first.port).toBe(4000);
        expect(Object.isFrozen(first)).toBe(true);
        AppConfig.resetInstance();
        expect(AppConfig.getInstance({PORT: '5000'}).port).toBe(5000);
        AppConfig.resetInstance();
    });

    it('parses environment variables with safe defaults', () => {
        const config = new AppConfig({
            NODE_ENV: 'production',
            ADMIN_GITHUB_LOGINS: ' Alice, bob ,,',
            COOKIE_SECURE: 'true',
            GITHUB_CACHE_TTL_MS: 'not-a-number',
        });
        expect(config.isProduction).toBe(true);
        expect(config.adminLogins).toEqual(['alice', 'bob']);
        expect(config.cookieSecure).toBe(true);
        expect(config.trustProxy).toBe(1);
        expect(config.github.cacheTtlMs).toBe(15_000);
        expect(config.github.callbackUrl).toBe('http://localhost:3000/api/auth/github/callback');
        expect(new AppConfig({TRUST_PROXY: 'true'}).trustProxy).toBe(true);
        expect(new AppConfig({TRUST_PROXY: 'loopback'}).trustProxy).toBe('loopback');
        expect(new AppConfig({NODE_ENV: 'test'}).isTest).toBe(true);
    });

    it('validates required secrets', () => {
        expect(new AppConfig({NODE_ENV: 'production'}).validate()).toHaveLength(4);
        expect(new AppConfig({
            JWT_SECRET: 'x'.repeat(32),
            GITHUB_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
            GITHUB_CLIENT_ID: 'id',
            GITHUB_CLIENT_SECRET: 'secret',
        }).validate()).toEqual([]);
    });
});

describe('Singleton pattern: Database', () => {
    it('creates one pool and runs transactions on a dedicated client', async () => {
        Database.resetInstance();
        expect(() => Database.getInstance()).toThrow('configuration is required');
        const instance = Database.getInstance({host: 'localhost', port: 1, database: 'x', user: 'x', password: 'x', max: 1});
        expect(Database.getInstance()).toBe(instance);
        await instance.close();
        Database.resetInstance();

        const client = {query: vi.fn().mockResolvedValue({rows: []}), release: vi.fn()};
        const pool = {query: vi.fn().mockResolvedValue({rows: [1]}), connect: vi.fn().mockResolvedValue(client), on: vi.fn(), end: vi.fn()};
        const database = new Database(pool);
        await expect(database.ping()).resolves.toBe(true);
        await database.transaction((tx) => tx.query('UPDATE x'));
        expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'UPDATE x', 'COMMIT']);

        await expect(database.transaction(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
        expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalledTimes(2);
    });
});

describe('error hierarchy and error handler', () => {
    it('assigns statuses and codes', () => {
        const cases = [
            [new ValidationError('v', {field: 'x'}), 400, 'VALIDATION_ERROR'],
            [new AuthenticationError(), 401, 'UNAUTHENTICATED'],
            [new ForbiddenError(), 403, 'FORBIDDEN'],
            [new NotFoundError(), 404, 'NOT_FOUND'],
            [new ConflictError('c'), 409, 'CONFLICT'],
            [new UpstreamError('u'), 502, 'UPSTREAM_ERROR'],
            [new ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE'],
        ];
        cases.forEach(([error, status, code]) => expect(error).toMatchObject({status, code}));
        expect(cases[0][0].details).toEqual({field: 'x'});
        expect(new UpstreamError('u').isExposed).toBe(false);
        expect(new ServiceUnavailableError().isExposed).toBe(true);
        expect(new AppError('x', {cause: new Error('root')}).cause.message).toBe('root');
    });

    it('hides unexpected error messages and keeps client error messages', () => {
        const logger = {error: vi.fn()};
        const handler = createErrorHandler(logger);
        const respond = (error) => {
            const res = {headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn()};
            handler(error, {method: 'GET', path: '/x'}, res, vi.fn());
            return {status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0]};
        };

        expect(respond(new NotFoundError('Nope'))).toEqual({status: 404, body: {status: 404, code: 'NOT_FOUND', message: 'Nope'}});
        expect(respond(Object.assign(new Error('relation "x" does not exist'), {code: '42P01'})).body)
            .toEqual({status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error.'});
        expect(respond(Object.assign(new Error('Unexpected token'), {statusCode: 400, expose: true})).body)
            .toEqual({status: 400, code: 'REQUEST_ERROR', message: 'Unexpected token'});
        expect(logger.error).toHaveBeenCalledTimes(1);

        const next = vi.fn();
        handler(new Error('late'), {}, {headersSent: true}, next);
        expect(next).toHaveBeenCalled();
    });
});

describe('TokenCipher (AES-256-GCM)', () => {
    it('encrypts with a random IV and decrypts back', () => {
        const cipher = new TokenCipher(ENCRYPTION_KEY);
        const first = cipher.encrypt('gho_secret');
        expect(first).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
        expect(first).not.toBe(cipher.encrypt('gho_secret'));
        expect(cipher.decrypt(first)).toBe('gho_secret');
        expect(cipher.decrypt(null)).toBeNull();
    });

    it('detects tampering, plaintext tokens and invalid keys', () => {
        const cipher = new TokenCipher(ENCRYPTION_KEY);
        const [iv, tag, data] = cipher.encrypt('gho_secret').split('.');
        expect(() => cipher.decrypt(`${iv}.${tag}.${Buffer.from('other').toString('base64')}${data}`)).toThrow();
        expect(() => cipher.decrypt('gho_plain')).toThrow('not encrypted');
        expect(() => new TokenCipher('short').encrypt('x')).toThrow('32-byte');
        expect(() => cipher.encrypt('')).toThrow('required');
    });
});

describe('small helpers', () => {
    it('parses repository URLs', () => {
        expect(parseRepositoryUrl('https://github.com/acme/app')).toBe('acme/app');
        expect(parseRepositoryUrl(' https://github.com/acme/app.git/ ')).toBe('acme/app');
        expect(parseRepositoryUrl('https://github.com/acme/app/tree/main')).toBeNull();
        expect(parseRepositoryUrl('http://github.com/acme/app')).toBeNull();
        expect(toRepositoryUrl('acme/app')).toBe('https://github.com/acme/app');
    });

    it('parses cookies defensively', () => {
        expect(parseCookies('a=1; b=hello%20world; broken; c=%E0%A4%A')).toEqual({a: '1', b: 'hello world', c: '%E0%A4%A'});
        expect(parseCookies()).toEqual({});
    });

    it('presents deployments with state-driven actions', () => {
        const dto = toDeploymentDto({
            id: 1, project_id: 2, run_id: '99', deploy_status: 'FAILED', commit_sha: 'abc ',
            started_at: '2026-11-01T10:00:00Z', finished_at: '2026-11-01T10:02:30Z', actor_login: 'bot',
        });
        expect(dto).toMatchObject({run_id: 99, commit_sha: 'abc', duration_seconds: 150, actions: ['rerun'],
            pending: false, triggered_by: 'bot'});
        expect(toDeploymentDto({id: 2, run_id: null, deploy_status: 'RUNNING', deployed_at: '2026-11-01T10:00:00Z'}))
            .toMatchObject({actions: [], pending: true, triggered_by: 'GitHub Actions', duration_seconds: null});
    });

    it('logger filters by level, writes JSON or text and serialises errors', () => {
        const sink = {log: vi.fn(), error: vi.fn()};
        const logger = new Logger({level: 'info', json: true, sink}).child({service: 'api'});
        logger.debug('hidden');
        logger.info('hello', {a: 1});
        logger.error('failed', {error: new Error('boom')});
        expect(sink.log).toHaveBeenCalledTimes(1);
        expect(JSON.parse(sink.log.mock.calls[0][0])).toMatchObject({level: 'info', message: 'hello', service: 'api', a: 1});
        expect(JSON.parse(sink.error.mock.calls[0][0]).error).toMatchObject({name: 'Error', message: 'boom'});

        const text = new Logger({level: 'debug', json: false, sink});
        text.warn('careful');
        text.debug('detail', {x: 1});
        expect(sink.error.mock.calls[1][0]).toMatch(/WARN careful$/);
        expect(sink.log.mock.calls[1][0]).toMatch(/DEBUG detail \{"x":1\}$/);
        expect(createLogger(new AppConfig({NODE_ENV: 'production'})).json).toBe(true);
    });
});
