import {ConflictError, ForbiddenError, NotFoundError, ValidationError} from '../../errors/AppError.js';
import {parseRepositoryUrl, toRepositoryUrl} from '../../domain/repositoryUrl.js';
import {ValidationHandler} from './ValidationHandler.js';

const GIT_REF_PATTERN = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,255}$/;
const TAG_NAME_PATTERN = /^v?[0-9A-Za-z][0-9A-Za-z._-]{0,62}$/;

/** Parses `input[field]` as a positive integer and stores it in `values[target]`. */
export class PositiveIntegerHandler extends ValidationHandler {
    constructor(field, label, target = field) {
        super();
        this.field = field;
        this.label = label;
        this.target = target;
    }

    async process(context) {
        const parsed = Number(context.input[this.field]);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new ValidationError(`${this.label} must be a positive integer.`);
        }
        context.values[this.target] = parsed;
    }
}

export class DeploymentExistsHandler extends ValidationHandler {
    constructor(deploymentRepository) {
        super();
        this.deploymentRepository = deploymentRepository;
    }

    async process(context) {
        const deployment = await this.deploymentRepository.findById(context.values.deploymentId);
        if (!deployment) {
            throw new NotFoundError('Deployment not found.');
        }
        context.deployment = deployment;
        context.values.projectId = deployment.project_id;
    }
}

export class ProjectExistsHandler extends ValidationHandler {
    constructor(projectRepository) {
        super();
        this.projectRepository = projectRepository;
    }

    async process(context) {
        const project = await this.projectRepository.findById(context.values.projectId);
        if (!project) {
            throw new NotFoundError('Project not found.');
        }
        context.project = project;
    }
}

/**
 * Authorisation step. A project the actor may not even view is reported as 404, so the
 * API does not reveal which project ids exist.
 */
export class ProjectAccessHandler extends ValidationHandler {
    constructor(resolvePolicy, mode = 'manage') {
        super();
        this.resolvePolicy = resolvePolicy;
        this.mode = mode;
    }

    async process(context) {
        const policy = this.resolvePolicy(context.actor);
        if (!policy.canView(context.actor, context.project)) {
            throw new NotFoundError('Project not found.');
        }
        if (this.mode === 'manage' && !policy.canManage(context.actor, context.project)) {
            throw new ForbiddenError('Only the project owner or an administrator can do this.');
        }
    }
}

export class WorkflowConfiguredHandler extends ValidationHandler {
    async process(context) {
        if (!(Number(context.project.workflow_id) > 0)) {
            throw new ValidationError('Select a GitHub Actions workflow for this project before deploying.');
        }
    }
}

export class GitRefHandler extends ValidationHandler {
    constructor(defaultRef = 'main') {
        super();
        this.defaultRef = defaultRef;
    }

    async process(context) {
        const raw = context.input.ref;
        const ref = typeof raw === 'string' && raw.trim() ? raw.trim() : this.defaultRef;
        if (!GIT_REF_PATTERN.test(ref)) {
            throw new ValidationError('Git ref contains unsupported characters.');
        }
        context.values.ref = ref;
    }
}

export class TagNameHandler extends ValidationHandler {
    async process(context) {
        context.values.createTag = Boolean(context.input.createTag);
        if (!context.values.createTag) {
            return;
        }
        const tagName = typeof context.input.tagName === 'string' ? context.input.tagName.trim() : '';
        if (!TAG_NAME_PATTERN.test(tagName)) {
            throw new ValidationError('Tag name must contain 1-63 letters, numbers, dots, underscores, or hyphens.');
        }
        context.values.tagName = tagName;
    }
}

export class RunStartedHandler extends ValidationHandler {
    async process(context) {
        if (!context.deployment.run_id) {
            throw new ConflictError('The pipeline run has not started on GitHub yet. Try again in a few seconds.',
                'RUN_NOT_STARTED');
        }
    }
}

export class ProjectNameHandler extends ValidationHandler {
    async process(context) {
        const name = typeof context.input.name === 'string' ? context.input.name.trim() : '';
        if (name.length < 3 || name.length > 100) {
            throw new ValidationError('Project name must be between 3 and 100 characters long.');
        }
        context.values.name = name;
    }
}

export class RepositoryUrlHandler extends ValidationHandler {
    async process(context) {
        const repository = parseRepositoryUrl(context.input.repoUrl);
        if (!repository) {
            throw new ValidationError('Repository URL must use the https://github.com/owner/repository format.');
        }
        context.values.repository = repository;
        context.values.repoUrl = toRepositoryUrl(repository);
    }
}

export class WorkflowSelectionHandler extends ValidationHandler {
    async process(context) {
        const workflowId = Number(context.input.workflowId);
        if (!Number.isInteger(workflowId) || workflowId <= 0) {
            throw new ValidationError('A GitHub Actions workflow must be selected.');
        }
        context.values.workflowId = workflowId;
    }
}

/**
 * Confirms with the CI provider that the selected workflow belongs to the repository, so a
 * project cannot be bound to a foreign workflow id. Also takes the authoritative name.
 */
export class WorkflowExistsHandler extends ValidationHandler {
    constructor(ciProvider) {
        super();
        this.ciProvider = ciProvider;
    }

    async process(context) {
        const workflows = await this.ciProvider.listPipelines({
            repository: context.values.repository,
            accessToken: context.actor.githubAccessToken,
        });
        const workflow = workflows.find((item) => Number(item.id) === context.values.workflowId);
        if (!workflow) {
            throw new ValidationError('The selected workflow does not exist in this repository.');
        }
        context.values.workflowName = workflow.name;
    }
}
