import {DEPLOYMENT_STATUSES} from '../state/DeploymentState.js';

export const DEPLOYMENT_COLUMNS = `
    d.id, d.project_id, p.name AS project_name, d.run_id, d.run_number, d.run_attempt,
    d.workflow_id, d.workflow_name, d.workflow_url, d.event, d.ref, d.version_tag,
    d.commit_sha, d.commit_at, d.deploy_status, d.triggered_by, u.username AS triggered_by_username,
    d.actor_login, d.started_at, d.finished_at, d.deployed_at, d.updated_at
`;

const ACTIVITY_TIME = 'COALESCE(d.started_at, d.deployed_at)';
const MAX_LIMIT = 500;

const escapeLike = (value) => value.replace(/[\\%_]/g, (character) => `\\${character}`);

/**
 * Builder pattern.
 *
 * Deployment listings are filtered by different combinations of criteria (visible projects,
 * statuses, time window, excluded events, search text, pending dispatches). Instead of a
 * repository method per combination or hand-concatenated SQL, the builder accumulates
 * conditions step by step and produces one parameterised statement ($1, $2, ...), which
 * keeps every value out of the SQL text and rules out SQL injection.
 */
export class DeploymentQueryBuilder {
    #conditions = [];
    #values = [];
    #order = `${ACTIVITY_TIME} DESC, d.id DESC`;
    #limit = 100;

    #parameter(value) {
        this.#values.push(value);
        return `$${this.#values.length}`;
    }

    /** `null` means "no restriction"; an empty array means "nothing is visible". */
    forProjects(projectIds) {
        if (projectIds === null || projectIds === undefined) {
            return this;
        }
        if (projectIds.length === 0) {
            this.#conditions.push('FALSE');
            return this;
        }
        this.#conditions.push(`d.project_id = ANY(${this.#parameter(projectIds.map(Number))}::int[])`);
        return this;
    }

    withStatuses(statuses) {
        const allowed = statuses.filter((status) => DEPLOYMENT_STATUSES.includes(status));
        this.#conditions.push(`d.deploy_status = ANY(${this.#parameter(allowed)}::text[])`);
        return this;
    }

    since(date) {
        this.#conditions.push(`${ACTIVITY_TIME} >= ${this.#parameter(new Date(date))}`);
        return this;
    }

    until(date) {
        this.#conditions.push(`${ACTIVITY_TIME} <= ${this.#parameter(new Date(date))}`);
        return this;
    }

    excludeEvents(events) {
        this.#conditions.push(`(d.event IS NULL OR d.event <> ALL(${this.#parameter(events)}::text[]))`);
        return this;
    }

    search(term) {
        const normalized = typeof term === 'string' ? term.trim() : '';
        if (!normalized) {
            return this;
        }
        const pattern = this.#parameter(`%${escapeLike(normalized)}%`);
        this.#conditions.push(
            `(d.version_tag ILIKE ${pattern} OR d.commit_sha ILIKE ${pattern} OR d.actor_login ILIKE ${pattern})`,
        );
        return this;
    }

    /** Started runs, plus dispatches still waiting for their run if they are recent enough. */
    startedOrPendingSince(date) {
        this.#conditions.push(`(d.run_id IS NOT NULL OR d.started_at >= ${this.#parameter(new Date(date))})`);
        return this;
    }

    onlyStartedRuns() {
        this.#conditions.push('d.run_id IS NOT NULL');
        return this;
    }

    oldestFirst() {
        this.#order = `${ACTIVITY_TIME} ASC, d.id ASC`;
        return this;
    }

    limit(value) {
        const parsed = Number(value);
        this.#limit = Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), MAX_LIMIT) : this.#limit;
        return this;
    }

    unlimited() {
        this.#limit = null;
        return this;
    }

    build() {
        const where = this.#conditions.length ? `WHERE ${this.#conditions.join(' AND ')}` : '';
        const values = [...this.#values];
        let limit = '';
        if (this.#limit !== null) {
            values.push(this.#limit);
            limit = `LIMIT $${values.length}`;
        }
        return {
            text: `SELECT ${DEPLOYMENT_COLUMNS}
                   FROM deployments d
                            JOIN projects p ON p.id = d.project_id
                            LEFT JOIN users u ON u.id = d.triggered_by
                   ${where}
                   ORDER BY ${this.#order}
                   ${limit}`,
            values,
        };
    }
}

export default DeploymentQueryBuilder;
