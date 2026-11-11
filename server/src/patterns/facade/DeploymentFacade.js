import {NotFoundError, ValidationError} from '../../errors/AppError.js';
import {toDeploymentDto} from '../../domain/deploymentPresenter.js';
import {DeploymentQueryBuilder} from '../builder/DeploymentQueryBuilder.js';
import {buildChain, createContext} from '../chain/ValidationHandler.js';
import {
    DeploymentExistsHandler,
    PositiveIntegerHandler,
    ProjectAccessHandler,
    ProjectExistsHandler,
} from '../chain/handlers.js';

/**
 * Facade pattern.
 *
 * The deployment subsystem consists of the CI provider (adapter + proxy + decorators), the
 * synchroniser, the state machine, commands with their invoker, the metrics calculator,
 * repositories and observers. Controllers need none of these details: they call one method
 * of this facade per HTTP endpoint.
 */
export class DeploymentFacade {
    constructor({
        projectService,
        deploymentRepository,
        projectRepository,
        auditLogRepository,
        syncService,
        commandFactory,
        invoker,
        metricsService,
        resolvePolicy,
        pendingVisibilityMs = 15 * 60_000,
        now = () => new Date(),
    }) {
        Object.assign(this, {
            projectService,
            deploymentRepository,
            projectRepository,
            auditLogRepository,
            syncService,
            commandFactory,
            invoker,
            metricsService,
            resolvePolicy,
            pendingVisibilityMs,
            now,
        });
    }

    async #visibleProjects(user, projectId) {
        const projects = await this.projectService.list(user);
        if (projectId === undefined || projectId === null || projectId === '' || projectId === 'all') {
            return projects;
        }
        const selected = projects.filter((project) => String(project.id) === String(projectId));
        if (selected.length === 0) {
            throw new NotFoundError('Project not found.');
        }
        return selected;
    }

    async listDeployments(user, {projectId, search, limit} = {}) {
        const projects = await this.#visibleProjects(user, projectId);
        const sync = await this.syncService.syncProjects(projects, user.githubAccessToken);
        const rows = await this.deploymentRepository.findMany(
            new DeploymentQueryBuilder()
                .forProjects(projects.map((project) => project.id))
                .startedOrPendingSince(new Date(this.now().getTime() - this.pendingVisibilityMs))
                .search(search)
                .limit(limit ?? 100),
        );
        return {deployments: rows.map(toDeploymentDto), ...sync};
    }

    async getDeployment(user, id) {
        const {deployment} = await buildChain(
            new PositiveIntegerHandler('deploymentId', 'Deployment id'),
            new DeploymentExistsHandler(this.deploymentRepository),
            new ProjectExistsHandler(this.projectRepository),
            new ProjectAccessHandler(this.resolvePolicy, 'view'),
        ).handle(createContext({actor: user, input: {deploymentId: id}}));
        return toDeploymentDto(deployment);
    }

    async #run(type, user, input) {
        const command = this.commandFactory.create(type, {actor: user, input});
        const result = await this.invoker.execute(command);
        return {...result, deployment: toDeploymentDto(result.deployment)};
    }

    trigger(user, body = {}) {
        return this.#run('trigger', user, {
            projectId: body.project_id,
            ref: body.ref,
            createTag: body.create_tag,
            tagName: body.tag_name,
        });
    }

    cancel(user, id) {
        return this.#run('cancel', user, {deploymentId: id});
    }

    rerun(user, id) {
        return this.#run('rerun', user, {deploymentId: id});
    }

    async getMetrics(user, {days = 30, projectId} = {}) {
        const parsedDays = Number(days);
        if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
            throw new ValidationError('days must be an integer between 1 and 365.');
        }
        const projects = await this.#visibleProjects(user, projectId);
        return this.metricsService.getMetrics(projects.map((project) => project.id), {days: parsedDays});
    }

    getAuditLog(user, {limit} = {}) {
        return this.auditLogRepository.list({...this.resolvePolicy(user).auditScope(user), limit});
    }
}

export default DeploymentFacade;
