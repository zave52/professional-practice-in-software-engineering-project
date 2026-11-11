/**
 * Singleton pattern.
 *
 * The application reads its configuration from environment variables exactly once
 * (Twelve-Factor App, factor III). Every component receives the same frozen instance,
 * so configuration cannot drift at runtime and is validated in one place at startup.
 */
const parseList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const parseTrustProxy = (value, isProduction) => {
    if (value === undefined || value === '') {
        return isProduction ? 1 : false;
    }
    if (value === 'true' || value === 'false') {
        return value === 'true';
    }
    return Number.isInteger(Number(value)) ? Number(value) : value;
};

const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export class AppConfig {
    static #instance = null;

    static getInstance(env = process.env) {
        if (!AppConfig.#instance) {
            AppConfig.#instance = new AppConfig(env);
        }
        return AppConfig.#instance;
    }

    static resetInstance() {
        AppConfig.#instance = null;
    }

    constructor(env = {}) {
        const nodeEnv = env.NODE_ENV || 'development';
        const port = toNumber(env.PORT, 3000);
        const apiOrigin = env.API_ORIGIN || `http://localhost:${port}`;

        this.nodeEnv = nodeEnv;
        this.port = port;
        this.appVersion = env.APP_VERSION || 'dev';
        this.logLevel = env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info');
        this.clientOrigin = env.CLIENT_ORIGIN || 'http://localhost:5173';
        this.apiOrigin = apiOrigin;
        this.cookieSecure = env.COOKIE_SECURE === 'true';
        this.trustProxy = parseTrustProxy(env.TRUST_PROXY, nodeEnv === 'production');
        this.jwtSecret = env.JWT_SECRET || '';
        this.sessionTtl = env.SESSION_TTL || '7d';
        this.adminLogins = Object.freeze(parseList(env.ADMIN_GITHUB_LOGINS));
        this.rateLimit = Object.freeze({
            windowMs: toNumber(env.RATE_LIMIT_WINDOW_MS, 60_000),
            max: toNumber(env.RATE_LIMIT_MAX, 300),
            authMax: toNumber(env.RATE_LIMIT_AUTH_MAX, 20),
        });
        this.github = Object.freeze({
            clientId: env.GITHUB_CLIENT_ID || '',
            clientSecret: env.GITHUB_CLIENT_SECRET || '',
            callbackUrl: env.GITHUB_CALLBACK_URL || `${apiOrigin}/api/auth/github/callback`,
            tokenEncryptionKey: env.GITHUB_TOKEN_ENCRYPTION_KEY || '',
            apiBaseUrl: env.GITHUB_API_URL || 'https://api.github.com',
            oauthBaseUrl: env.GITHUB_OAUTH_URL || 'https://github.com',
            cacheTtlMs: toNumber(env.GITHUB_CACHE_TTL_MS, 15_000),
            requestTimeoutMs: toNumber(env.GITHUB_TIMEOUT_MS, 10_000),
            maxRetries: toNumber(env.GITHUB_MAX_RETRIES, 2),
        });
        this.db = Object.freeze({
            host: env.PGHOST || 'localhost',
            port: toNumber(env.PGPORT, 5432),
            database: env.PGDATABASE || env.POSTGRES_DB || 'cicd_hub_db',
            user: env.PGUSER || env.POSTGRES_USER || 'app_admin',
            password: env.PGPASSWORD || env.POSTGRES_PASSWORD || '',
            max: toNumber(env.DB_POOL_MAX, 10),
        });
        Object.freeze(this);
    }

    get isProduction() {
        return this.nodeEnv === 'production';
    }

    get isTest() {
        return this.nodeEnv === 'test';
    }

    /**
     * Returns a list of configuration problems. In production the server refuses to start
     * when the list is not empty (fail fast instead of failing on the first request).
     */
    validate() {
        const problems = [];
        if (this.jwtSecret.length < 32) {
            problems.push('JWT_SECRET must contain at least 32 characters.');
        }
        if (!/^[a-f0-9]{64}$/i.test(this.github.tokenEncryptionKey)) {
            problems.push('GITHUB_TOKEN_ENCRYPTION_KEY must be a 64-character hexadecimal string.');
        }
        if (!this.github.clientId || !this.github.clientSecret) {
            problems.push('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required for GitHub OAuth.');
        }
        if (this.isProduction && !this.db.password) {
            problems.push('PGPASSWORD is required in production.');
        }
        return problems;
    }
}

export default AppConfig;
