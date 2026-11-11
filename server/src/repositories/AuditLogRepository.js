/** Repository pattern: persistent audit trail. */
export class AuditLogRepository {
    constructor(database) {
        this.db = database;
    }

    async record({event, userId, projectId, deploymentId, runId, payload = {}}) {
        await this.db.query(`
            INSERT INTO audit_log (event, user_id, project_id, deployment_id, run_id, payload)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `, [event, userId, projectId, deploymentId, runId, JSON.stringify(payload)]);
    }

    /** `visibleTo`: entries created by the user or concerning projects the user owns. */
    async list({visibleTo, limit = 50} = {}) {
        const values = [];
        let where = '';
        if (visibleTo !== undefined) {
            values.push(visibleTo);
            where = 'WHERE a.user_id = $1 OR p.user_id = $1';
        }
        values.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
        const {rows} = await this.db.query(`
            SELECT a.id, a.event, a.user_id, u.username, a.project_id, p.name AS project_name,
                   a.deployment_id, a.run_id, a.payload, a.created_at
            FROM audit_log a
                     LEFT JOIN users u ON u.id = a.user_id
                     LEFT JOIN projects p ON p.id = a.project_id
            ${where}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT $${values.length}
        `, values);
        return rows;
    }
}

export default AuditLogRepository;
