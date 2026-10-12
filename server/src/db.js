import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

dotenv.config();
dotenv.config({ path: '../.env', override: false });

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
export default pool;
