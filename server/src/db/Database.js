import pg from 'pg';

/**
 * Singleton pattern.
 *
 * A PostgreSQL connection pool is an expensive shared resource: creating a second pool
 * would double the number of open connections and break transaction isolation between
 * modules. `Database.getInstance()` guarantees one pool per process; tests can inject a
 * fake pool through the constructor or reset the instance.
 */
export class Database {
    static #instance = null;

    static getInstance(dbConfig, {logger} = {}) {
        if (!Database.#instance) {
            if (!dbConfig) {
                throw new Error('Database configuration is required for the first getInstance() call.');
            }
            const pool = new pg.Pool({
                host: dbConfig.host,
                port: dbConfig.port,
                database: dbConfig.database,
                user: dbConfig.user,
                password: dbConfig.password,
                max: dbConfig.max,
                idleTimeoutMillis: 30_000,
            });
            Database.#instance = new Database(pool, {logger});
        }
        return Database.#instance;
    }

    static resetInstance() {
        Database.#instance = null;
    }

    constructor(pool, {logger} = {}) {
        this.pool = pool;
        pool.on?.('error', (error) => logger?.error('Unexpected PostgreSQL pool error', {error}));
    }

    query(text, values) {
        return this.pool.query(text, values);
    }

    /** Runs `work` inside BEGIN/COMMIT on a dedicated connection; rolls back on any error. */
    async transaction(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work({query: (text, values) => client.query(text, values)});
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async ping() {
        await this.query('SELECT 1');
        return true;
    }

    close() {
        return this.pool.end();
    }
}

export default Database;
