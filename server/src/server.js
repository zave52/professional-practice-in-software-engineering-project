import dotenv from 'dotenv';
import {createApp} from './app.js';
import {AppConfig} from './config/AppConfig.js';
import {createContainer} from './container.js';
import {Database} from './db/Database.js';
import {MigrationRunner} from './db/MigrationRunner.js';
import {createLogger} from './logger.js';

dotenv.config({quiet: true});
dotenv.config({path: '../.env', override: false, quiet: true});

const config = AppConfig.getInstance();
const logger = createLogger(config);

const problems = config.validate();
if (problems.length > 0) {
    problems.forEach((problem) => logger[config.isProduction ? 'error' : 'warn']('Configuration problem', {problem}));
    if (config.isProduction) {
        process.exit(1);
    }
}

const database = Database.getInstance(config.db, {logger});

try {
    await new MigrationRunner({database, logger}).run();
} catch (error) {
    logger.error('Database migration failed', {error});
    await database.close();
    process.exit(1);
}

const app = createApp(createContainer({config, logger, database}));
const server = app.listen(config.port, () => {
    logger.info('API server listening', {port: config.port, version: config.appVersion});
});

/** Graceful shutdown (Twelve-Factor "disposability"): finish in-flight requests, then close the pool. */
const shutdown = (signal) => {
    logger.info('Shutting down', {signal});
    server.close(async () => {
        await database.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
