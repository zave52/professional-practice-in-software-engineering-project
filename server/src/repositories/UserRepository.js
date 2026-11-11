const USER_COLUMNS = `
    u.id, u.username, u.email, u.github_id, u.avatar_url, u.is_active,
    u.github_access_token, r.name AS role
`;

/** Repository pattern: all SQL for `users` and `roles`. */
export class UserRepository {
    constructor(database) {
        this.db = database;
    }

    /**
     * Creates or updates a GitHub user. `promote` forces `roleName` for existing users
     * (administrators listed in ADMIN_GITHUB_LOGINS); other users keep their current role.
     */
    async upsertGitHubUser({githubId, username, email, avatarUrl, encryptedToken, roleName, promote}) {
        const {rows} = await this.db.query(`
            INSERT INTO users (role_id, username, email, password_hash, github_id, avatar_url, github_access_token)
            SELECT r.id, $1, $2, 'github-oauth', $3, $4, $5
            FROM roles r
            WHERE r.name = $6
            ON CONFLICT (github_id) DO UPDATE
                SET username            = EXCLUDED.username,
                    email               = EXCLUDED.email,
                    avatar_url          = EXCLUDED.avatar_url,
                    github_access_token = EXCLUDED.github_access_token,
                    role_id             = CASE WHEN $7 THEN EXCLUDED.role_id ELSE users.role_id END
            RETURNING id
        `, [username, email, String(githubId), avatarUrl || null, encryptedToken, roleName, Boolean(promote)]);
        if (!rows[0]) {
            throw new Error(`Role ${roleName} does not exist. Run database migrations.`);
        }
        return this.findById(rows[0].id);
    }

    async findById(id) {
        const {rows} = await this.db.query(`
            SELECT ${USER_COLUMNS}
            FROM users u
                     JOIN roles r ON r.id = u.role_id
            WHERE u.id = $1
        `, [id]);
        return rows[0] || null;
    }
}

export default UserRepository;
