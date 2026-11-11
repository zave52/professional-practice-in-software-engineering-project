const PROJECT_COLUMNS = `
    p.id, p.user_id, u.username AS owner_username, p.name, p.repo_url,
    p.workflow_id, p.workflow_name, p.created_at
`;

/** Repository pattern: all SQL for the `projects` table. */
export class ProjectRepository {
    constructor(database) {
        this.db = database;
    }

    async findAll({ownerId} = {}) {
        const values = [];
        let where = '';
        if (ownerId !== undefined) {
            values.push(ownerId);
            where = 'WHERE p.user_id = $1';
        }
        const {rows} = await this.db.query(`
            SELECT ${PROJECT_COLUMNS}
            FROM projects p
                     JOIN users u ON u.id = p.user_id
            ${where}
            ORDER BY p.created_at DESC, p.id DESC
        `, values);
        return rows;
    }

    async findById(id) {
        const {rows} = await this.db.query(`
            SELECT ${PROJECT_COLUMNS}
            FROM projects p
                     JOIN users u ON u.id = p.user_id
            WHERE p.id = $1
        `, [id]);
        return rows[0] || null;
    }

    async create({userId, name, repoUrl, workflowId, workflowName}) {
        const {rows} = await this.db.query(`
            INSERT INTO projects (user_id, name, repo_url, workflow_id, workflow_name)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [userId, name, repoUrl, workflowId, workflowName]);
        return this.findById(rows[0].id);
    }

    async remove(id) {
        const {rows} = await this.db.query('DELETE FROM projects WHERE id = $1 RETURNING id, name', [id]);
        return rows[0] || null;
    }
}

export default ProjectRepository;
