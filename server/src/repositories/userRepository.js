import {query} from '../db.js';

export const upsertGitHubUser = async ({githubId, username, email, avatarUrl}) => {
    const role = await query(`
        INSERT INTO roles (name, description) VALUES ('Developer', 'GitHub OAuth user')
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
    `);
    const result = await query(`
        INSERT INTO users (role_id, username, email, password_hash, github_id, avatar_url)
        VALUES ($1, $2, $3, 'github-oauth', $4, $5)
        ON CONFLICT (github_id) DO UPDATE SET username   = EXCLUDED.username,
                                              email      = EXCLUDED.email,
                                              avatar_url = EXCLUDED.avatar_url,
                                              is_active  = true
        RETURNING id, username, email, github_id, avatar_url, role_id
    `, [role.rows[0].id, username, email, String(githubId), avatarUrl || null]);
    return result.rows[0];
};
