import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEFAULT_MIGRATIONS_DIRECTORY = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../migrations',
);

const MIGRATION_LOCK_ID = 727274;

/**
 * Versioned schema migrations. Each `NNN_name.sql` file is applied once, in order, and
 * recorded in `schema_migrations`. All pending migrations run in one transaction under an
 * advisory lock, so two containers starting at the same time cannot apply them twice and a
 * failing migration leaves the schema untouched.
 */
export class MigrationRunner {
    constructor({database, directory = DEFAULT_MIGRATIONS_DIRECTORY, logger}) {
        this.database = database;
        this.directory = directory;
        this.logger = logger;
    }

    async loadMigrations() {
        const files = (await readdir(this.directory))
            .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
            .sort();
        return Promise.all(files.map(async (file) => ({
            version: file.split('_')[0],
            name: file,
            sql: await readFile(path.join(this.directory, file), 'utf8'),
        })));
    }

    async run() {
        const migrations = await this.loadMigrations();
        return this.database.transaction(async (tx) => {
            await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
            await tx.query(`
                CREATE TABLE IF NOT EXISTS schema_migrations
                (
                    version    VARCHAR(20) PRIMARY KEY,
                    name       VARCHAR(255) NOT NULL,
                    applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
                )
            `);
            const {rows} = await tx.query('SELECT version FROM schema_migrations');
            const applied = new Set(rows.map((row) => row.version));
            const pending = migrations.filter((migration) => !applied.has(migration.version));

            for (const migration of pending) {
                await tx.query(migration.sql);
                await tx.query(
                    'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
                    [migration.version, migration.name],
                );
                this.logger?.info('Applied database migration', {migration: migration.name});
            }
            return pending.map((migration) => migration.name);
        });
    }
}

export default MigrationRunner;
