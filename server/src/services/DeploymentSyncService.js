import {PG_UNIQUE_VIOLATION} from '../errors/AppError.js';
import {projectRepository as repositoryOf} from '../domain/repositoryUrl.js';
import {DOMAIN_EVENTS} from '../patterns/observer/EventPublisher.js';
import {DeploymentContext} from '../patterns/state/DeploymentContext.js';

const sameInstant = (left, right) => {
    if (!left && !right) {
        return true;
    }
    return Boolean(left && right) && new Date(left).getTime() === new Date(right).getTime();
};

/**
 * Keeps the `deployments` table in step with the CI provider.
 *
 * For every run reported by the provider the service either registers it (and links it to a
 * pending dispatch created by TriggerDeploymentCommand) or feeds the observed status into the
 * State machine of the stored deployment. Status changes are published to observers.
 */
export class DeploymentSyncService {
    constructor({ciProvider, deploymentRepository, publisher, logger, pendingTimeoutMs = 15 * 60_000,
        now = () => new Date()}) {
        this.ciProvider = ciProvider;
        this.deploymentRepository = deploymentRepository;
        this.publisher = publisher;
        this.logger = logger;
        this.pendingTimeoutMs = pendingTimeoutMs;
        this.now = now;
    }

    get pendingCutoff() {
        return new Date(this.now().getTime() - this.pendingTimeoutMs);
    }

    async syncProjects(projects, accessToken) {
        const results = await Promise.allSettled(projects.map((project) => this.syncProject(project, accessToken)));
        const warnings = [];
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const project = projects[index];
                const reason = result.reason;
                this.logger?.warn('Deployment sync failed', {projectId: project.id, reason: reason?.message});
                warnings.push({
                    project_id: project.id,
                    project_name: project.name,
                    message: (reason?.status && reason.status < 500) || reason?.status === 502
                        ? reason.message
                        : 'Synchronisation with GitHub failed.',
                });
            }
        });
        if (projects.length > 0) {
            await this.deploymentRepository.deleteStalePending(projects.map((project) => project.id), this.pendingCutoff);
        }
        return {warnings, synced_at: this.now().toISOString()};
    }

    async syncProject(project, accessToken) {
        const runs = await this.ciProvider.listPipelineRuns({
            repository: repositoryOf(project),
            workflowId: Number(project.workflow_id) > 0 ? project.workflow_id : undefined,
            accessToken,
        });
        const known = await this.deploymentRepository.findByRunIds(runs.map((run) => run.runId));

        // Oldest first, so several pending dispatches of the same ref are matched in order.
        for (const run of [...runs].reverse()) {
            const local = known.get(Number(run.runId));
            if (local) {
                await this.#reconcile(project, local, run);
            } else {
                await this.#register(project, run);
            }
        }
        return runs.length;
    }

    async #register(project, run) {
        if (run.event === 'workflow_dispatch') {
            const pending = await this.deploymentRepository.findPendingDispatch({
                projectId: project.id,
                ref: run.ref,
                startedAt: run.startedAt,
            });
            if (pending) {
                const context = new DeploymentContext(pending.deploy_status);
                const changed = context.applyRemote(run.status);
                try {
                    await this.deploymentRepository.updateFromRun(pending.id, run, context.getStatus());
                } catch (error) {
                    if (error.code === PG_UNIQUE_VIOLATION) {
                        return;
                    }
                    throw error;
                }
                if (changed) {
                    await this.#statusChanged(project, pending.id, run, context);
                }
                return;
            }
        }
        await this.deploymentRepository.insertRun(project.id, run, run.status);
    }

    async #reconcile(project, local, run) {
        const context = new DeploymentContext(local.deploy_status);
        const newAttempt = Number(run.runAttempt) > Number(local.run_attempt);
        const changed = context.applyRemote(run.status, {newAttempt});
        if (changed || newAttempt || !sameInstant(local.finished_at, run.finishedAt)) {
            await this.deploymentRepository.updateFromRun(local.id, run, context.getStatus());
        }
        if (changed) {
            await this.#statusChanged(project, local.id, run, context);
        }
    }

    #statusChanged(project, deploymentId, run, context) {
        const first = context.transitions[0];
        return this.publisher.notify(DOMAIN_EVENTS.DEPLOYMENT_STATUS_CHANGED, {
            projectId: project.id,
            deploymentId,
            runId: run.runId,
            from: first.from,
            to: context.getStatus(),
            transitions: context.transitions,
        });
    }
}

export default DeploymentSyncService;
