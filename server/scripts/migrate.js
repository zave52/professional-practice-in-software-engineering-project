import dotenv from 'dotenv';
import {AppConfig} from '../src/config/AppConfig.js';
import {Database} from '../src/db/Database.js';
import {MigrationRunner} from '../src/db/MigrationRunner.js';
import {createLogger} from '../src/logger.js';

dotenv.config({quiet: true});
dotenv.config({path: '../.env', override: false, quiet: true});

const config = AppConfig.getInstance();
const logger = createLogger(config);
const database = Database.getInstance(config.db, {logger});

try {
    const applied = await new MigrationRunner({database, logger}).run();
    logger.info('Migrations finished', {applied});
} finally {
    await database.close();
}
