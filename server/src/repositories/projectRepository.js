import { query } from '../db.js';

const projectColumns = `
  p.id,
  p.user_id,
  p.name,
  p.repo_url,
  p.environment,
  p.created_at
`;

export const findAll = async () => {
  const result = await query(`
    SELECT ${projectColumns}
    FROM projects p
    ORDER BY p.created_at DESC
  `);
  return result.rows;
};

export const ensureConfiguredProject = async ({
  repository,
  environment = 'production',
}) => {
  const repositoryName = repository.split('/')[1];
  const repoUrl = `https://github.com/${repository}`;

  const roleResult = await query(`
    INSERT INTO roles (name, description)
    VALUES ('Admin', 'Application administrator')
    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id
  `);

  const userResult = await query(`
    INSERT INTO users (role_id, username, email, password_hash)
    VALUES ($1, 'dashboard-admin', 'dashboard-admin@local.invalid', 'managed-by-deployment')
    ON CONFLICT (username) DO UPDATE SET role_id = EXCLUDED.role_id
    RETURNING id
  `, [roleResult.rows[0].id]);

  const projectResult = await query(`
    INSERT INTO projects (user_id, name, repo_url, environment)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (name) DO UPDATE
      SET repo_url = EXCLUDED.repo_url,
          environment = EXCLUDED.environment
    RETURNING id, user_id, name, repo_url, environment, created_at
  `, [userResult.rows[0].id, repositoryName, repoUrl, environment]);

  return projectResult.rows[0];
};

export const findById = async (id) => {
  const result = await query(`
    SELECT ${projectColumns}
    FROM projects p
    WHERE p.id = $1
  `, [id]);
  return result.rows[0] || null;
};

export const create = async ({ userId, name, repoUrl, environment }) => {
  const result = await query(`
    INSERT INTO projects (user_id, name, repo_url, environment)
    VALUES ($1, $2, $3, $4)
    RETURNING id, user_id, name, repo_url, environment, created_at
  `, [userId, name, repoUrl, environment]);
  return result.rows[0];
};

export const remove = async (id) => {
  const result = await query(
    'DELETE FROM projects WHERE id = $1 RETURNING id, name',
    [id],
  );
  return result.rows[0] || null;
};
