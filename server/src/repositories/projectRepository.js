import {query} from '../db.js';

const projectColumns = `
  p.id,
  p.user_id,
  p.name,
  p.repo_url,
  p.workflow_id,
  p.workflow_name,
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
        INSERT INTO projects (user_id, name, repo_url, workflow_id, workflow_name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (name) DO UPDATE
            SET repo_url = EXCLUDED.repo_url
        RETURNING id, user_id, name, repo_url, workflow_id, workflow_name, created_at
    `, [userResult.rows[0].id, repositoryName, repoUrl, 0, 'Unconfigured workflow']);

    return projectResult.rows[0];
};

export const ensureDefaultUser = async () => {
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

    return userResult.rows[0].id;
};

export const findById = async (id) => {
    const result = await query(`
        SELECT ${projectColumns}
        FROM projects p
        WHERE p.id = $1
    `, [id]);
    return result.rows[0] || null;
};

export const create = async ({userId, name, repoUrl, workflowId, workflowName}) => {
    const result = await query(`
        INSERT INTO projects (user_id, name, repo_url, workflow_id, workflow_name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, name, repo_url, workflow_id, workflow_name, created_at
    `, [userId, name, repoUrl, workflowId, workflowName]);
    return result.rows[0];
};

export const remove = async (id) => {
    const result = await query(
        'DELETE FROM projects WHERE id = $1 RETURNING id, name',
        [id],
    );
    return result.rows[0] || null;
};
