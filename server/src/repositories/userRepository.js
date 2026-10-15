import {query} from '../db.js';
import {decryptGitHubToken, encryptGitHubToken} from '../services/tokenCrypto.js';

export const upsertGitHubUser = async ({githubId, username, email, avatarUrl, accessToken}) => {
    const role = await query(`
        INSERT INTO roles (name, description)
        VALUES ('Developer', 'GitHub OAuth user')
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
    `);
    const result = await query(`
        INSERT INTO users (role_id, username, email, password_hash, github_id, avatar_url, github_access_token)
        VALUES ($1, $2, $3, 'github-oauth', $4, $5, $6)
        ON CONFLICT (github_id) DO UPDATE SET username            = EXCLUDED.username,
                                              email               = EXCLUDED.email,
                                              avatar_url          = EXCLUDED.avatar_url,
                                              github_access_token = EXCLUDED.github_access_token,
                                              is_active           = true
        RETURNING id, username, email, github_id, avatar_url, role_id
    `, [
        role.rows[0].id,
        username,
        email,
        String(githubId),
        avatarUrl || null,
        encryptGitHubToken(accessToken),
    ]);
    return result.rows[0];
};

export const findGitHubAccessToken = async (id) => {
    const result = await query(
        'SELECT github_access_token FROM users WHERE id = $1 AND is_active = true',
        [id],
    );
    return result.rows[0]?.github_access_token
        ? decryptGitHubToken(result.rows[0].github_access_token)
        : null;
};
