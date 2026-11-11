import {ConflictError, PG_UNIQUE_VIOLATION, ValidationError} from '../errors/AppError.js';
import {parseRepositoryUrl, projectRepository as repositoryOf} from '../domain/repositoryUrl.js';
import {buildChain, createContext} from '../patterns/chain/ValidationHandler.js';
import {
    PositiveIntegerHandler,
    ProjectAccessHandler,
    ProjectExistsHandler,
    ProjectNameHandler,
    RepositoryUrlHandler,
    WorkflowExistsHandler,
    WorkflowSelectionHandler,
} from '../patterns/chain/handlers.js';
import {DOMAIN_EVENTS} from '../patterns/observer/EventPublisher.js';

export class ProjectService {
    constructor({projectRepository, ciProvider, publisher, resolvePolicy}) {
        this.projectRepository = projectRepository;
        this.ciProvider = ciProvider;
        this.publisher = publisher;
        this.resolvePolicy = resolvePolicy;
    }

    list(user) {
        return this.projectRepository.findAll(this.resolvePolicy(user).projectScope(user));
    }

    async #accessChain(user, id, mode) {
        const context = await buildChain(
            new PositiveIntegerHandler('projectId', 'Project id'),
            new ProjectExistsHandler(this.projectRepository),
            new ProjectAccessHandler(this.resolvePolicy, mode),
        ).handle(createContext({actor: user, input: {projectId: id}}));
        return context.project;
    }

    get(user, id) {
        return this.#accessChain(user, id, 'view');
    }

    async create(user, input) {
        const {values} = await buildChain(
            new ProjectNameHandler(),
            new RepositoryUrlHandler(),
            new WorkflowSelectionHandler(),
            new WorkflowExistsHandler(this.ciProvider),
        ).handle(createContext({actor: user, input}));

        let project;
        try {
            project = await this.projectRepository.create({
                userId: user.id,
                name: values.name,
                repoUrl: values.repoUrl,
                workflowId: values.workflowId,
                workflowName: values.workflowName,
            });
        } catch (error) {
            if (error.code === PG_UNIQUE_VIOLATION) {
                throw new ConflictError('A project with this name already exists.');
            }
            throw error;
        }
        await this.publisher.notify(DOMAIN_EVENTS.PROJECT_CREATED, {
            userId: user.id,
            projectId: project.id,
            name: project.name,
            repository: values.repository,
        });
        return project;
    }

    async remove(user, id) {
        const project = await this.#accessChain(user, id, 'manage');
        await this.projectRepository.remove(project.id);
        // project_id stays NULL: the row no longer exists, its name is kept in the payload.
        await this.publisher.notify(DOMAIN_EVENTS.PROJECT_DELETED, {
            userId: user.id,
            deletedProjectId: project.id,
            name: project.name,
        });
        return {id: project.id, name: project.name};
    }

    async listRefs(user, id) {
        const project = await this.get(user, id);
        return this.ciProvider.listRefs({repository: repositoryOf(project), accessToken: user.githubAccessToken});
    }

    listWorkflows(user, repoUrl) {
        const repository = parseRepositoryUrl(repoUrl);
        if (!repository) {
            throw new ValidationError('Repository URL must use the https://github.com/owner/repository format.');
        }
        return this.ciProvider.listPipelines({repository, accessToken: user.githubAccessToken});
    }
}

export default ProjectService;
