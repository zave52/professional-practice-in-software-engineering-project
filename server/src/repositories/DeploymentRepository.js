import {DEPLOYMENT_COLUMNS, DeploymentQueryBuilder} from '../patterns/builder/DeploymentQueryBuilder.js';

const runValues = (run, status) => [
    run.runId,
    run.runNumber,
    run.runAttempt,
    run.workflowId,
    run.workflowName,
    run.url,
    run.event,
    run.ref,
    run.ref || run.workflowName || 'workflow run',
    run.commitSha,
    run.commitAt,
    run.actorLogin,
    run.startedAt,
    run.finishedAt,
    status,
];

/** Repository pattern: all SQL for the `deployments` table. */
export class DeploymentRepository {
    constructor(database) {
        this.db = database;
    }

    async findMany(builder = new DeploymentQueryBuilder()) {
        const {text, values} = builder.build();
        return (await this.db.query(text, values)).rows;
    }

    async findById(id) {
        const {rows} = await this.db.query(`
            SELECT ${DEPLOYMENT_COLUMNS}
            FROM deployments d
                     JOIN projects p ON p.id = d.project_id
                     LEFT JOIN users u ON u.id = d.triggered_by
            WHERE d.id = $1
        `, [id]);
        return rows[0] || null;
    }

    async findByRunIds(runIds) {
        if (runIds.length === 0) {
            return new Map();
        }
        const {rows} = await this.db.query(
            'SELECT id, run_id, run_attempt, deploy_status, finished_at FROM deployments WHERE run_id = ANY($1::bigint[])',
            [runIds],
        );
        return new Map(rows.map((row) => [Number(row.run_id), row]));
    }

    /** A dispatch accepted by GitHub whose run has not been observed yet. */
    async createPending({projectId, triggeredBy, ref, workflowId, workflowName, dispatchedAt}) {
        const {rows} = await this.db.query(`
            INSERT INTO deployments (project_id, triggered_by, version_tag, ref, deploy_status,
                                     workflow_id, workflow_name, event, started_at)
            VALUES ($1, $2, $3, $3, 'RUNNING', $4, $5, 'workflow_dispatch', $6)
            RETURNING id
        `, [projectId, triggeredBy, ref, workflowId, workflowName, dispatchedAt]);
        return this.findById(rows[0].id);
    }

    async findPendingDispatch({projectId, ref, startedAt}) {
        const {rows} = await this.db.query(`
            SELECT id, deploy_status, run_attempt
            FROM deployments
            WHERE project_id = $1
              AND run_id IS NULL
              AND ref = $2
              AND started_at BETWEEN $3::timestamptz - INTERVAL '5 minutes' AND $3::timestamptz + INTERVAL '1 minute'
            ORDER BY started_at
            LIMIT 1
        `, [projectId, ref, startedAt]);
        return rows[0] || null;
    }

    /** Inserts a run seen for the first time; returns null if another sync inserted it first. */
    async insertRun(projectId, run, status) {
        const {rows} = await this.db.query(`
            INSERT INTO deployments (run_id, run_number, run_attempt, workflow_id, workflow_name, workflow_url,
                                     event, ref, version_tag, commit_sha, commit_at, actor_login,
                                     started_at, finished_at, deploy_status, project_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (run_id) DO NOTHING
            RETURNING id
        `, [...runValues(run, status), projectId]);
        return rows[0]?.id ?? null;
    }

    async updateFromRun(id, run, status) {
        await this.db.query(`
            UPDATE deployments
            SET run_id        = $1,
                run_number    = $2,
                run_attempt   = $3,
                workflow_id   = $4,
                workflow_name = $5,
                workflow_url  = $6,
                event         = $7,
                ref           = $8,
                version_tag   = $9,
                commit_sha    = $10,
                commit_at     = $11,
                actor_login   = $12,
                started_at    = $13,
                finished_at   = $14,
                deploy_status = $15,
                updated_at    = now()
            WHERE id = $16
        `, [...runValues(run, status), id]);
    }

    async updateStatus(id, status) {
        await this.db.query('UPDATE deployments SET deploy_status = $1, updated_at = now() WHERE id = $2', [status, id]);
        return this.findById(id);
    }

    /** Dispatches that never produced a run (for example the workflow rejected the ref). */
    async deleteStalePending(projectIds, olderThan) {
        const {rowCount} = await this.db.query(`
            DELETE
            FROM deployments
            WHERE run_id IS NULL
              AND project_id = ANY ($1::int[])
              AND started_at < $2
        `, [projectIds, olderThan]);
        return rowCount;
    }
}

export default DeploymentRepository;
