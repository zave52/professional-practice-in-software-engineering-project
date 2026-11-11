import {DeploymentContext} from '../patterns/state/DeploymentContext.js';

const toIso = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Converts a database row into the API representation. The actions the UI may offer are
 * taken from the State pattern, so the frontend never re-implements lifecycle rules.
 */
export const toDeploymentDto = (row) => {
    const startedAt = toIso(row.started_at) || toIso(row.deployed_at);
    const finishedAt = toIso(row.finished_at);
    return {
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        run_id: row.run_id === null || row.run_id === undefined ? null : Number(row.run_id),
        run_number: row.run_number ?? null,
        run_attempt: row.run_attempt ?? 1,
        workflow_name: row.workflow_name,
        workflow_url: row.workflow_url,
        event: row.event,
        ref: row.ref,
        version_tag: row.version_tag,
        commit_sha: row.commit_sha ? row.commit_sha.trim() : null,
        commit_at: toIso(row.commit_at),
        deploy_status: row.deploy_status,
        triggered_by: row.triggered_by_username || row.actor_login || 'GitHub Actions',
        started_at: startedAt,
        finished_at: finishedAt,
        deployed_at: startedAt,
        duration_seconds: startedAt && finishedAt
            ? Math.max(0, Math.round((new Date(finishedAt) - new Date(startedAt)) / 1000))
            : null,
        pending: !row.run_id,
        actions: row.run_id ? new DeploymentContext(row.deploy_status).allowedActions() : [],
    };
};
