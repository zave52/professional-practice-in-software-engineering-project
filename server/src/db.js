import dotenv from 'dotenv';
import pg from 'pg';

const {Pool} = pg;

dotenv.config();
dotenv.config({path: '../.env', override: false});

const pool = new Pool({
    host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
    database: process.env.PGDATABASE || process.env.DB_NAME || process.env.POSTGRES_DB || 'cicd_hub_db',
    user: process.env.PGUSER || process.env.DB_USER || process.env.POSTGRES_USER || 'app_admin',
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
});

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
});

export const query = (text, params) => pool.query(text, params);
export const checkDatabaseConnection = async () => {
    await pool.query('SELECT 1');
    return true;
};
export const migrateObsoleteColumns = async () => {
    await pool.query(`
        ALTER TABLE projects
            DROP COLUMN IF EXISTS environment;
        ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS workflow_id BIGINT;
        ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS workflow_name VARCHAR(255);
        ALTER TABLE deployments
            DROP COLUMN IF EXISTS health_status;
        ALTER TABLE deployments
            DROP CONSTRAINT IF EXISTS chk_health_status;
        ALTER TABLE deployments
            DROP CONSTRAINT IF EXISTS chk_deploy_status;
        ALTER TABLE deployments
            ADD CONSTRAINT chk_deploy_status
                CHECK (deploy_status IN ('SUCCESS', 'FAILED', 'RUNNING', 'CANCELED'));
    `);
};
export default pool;
