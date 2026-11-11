import {projectRepository as repositoryOf} from '../../domain/repositoryUrl.js';
import {buildChain} from '../chain/ValidationHandler.js';
import {
    DeploymentExistsHandler,
    GitRefHandler,
    PositiveIntegerHandler,
    ProjectAccessHandler,
    ProjectExistsHandler,
    RunStartedHandler,
    TagNameHandler,
    WorkflowConfiguredHandler,
} from '../chain/handlers.js';
import {DOMAIN_EVENTS} from '../observer/EventPublisher.js';
import {DeploymentContext} from '../state/DeploymentContext.js';
import {Command} from './Command.js';

export class TriggerDeploymentCommand extends Command {
    get name() {
        return 'TriggerDeployment';
    }

    createValidationChain() {
        const {projectRepository, resolvePolicy} = this.dependencies;
        return buildChain(
            new PositiveIntegerHandler('projectId', 'Project id'),
            new ProjectExistsHandler(projectRepository),
            new ProjectAccessHandler(resolvePolicy, 'manage'),
            new WorkflowConfiguredHandler(),
            new GitRefHandler('main'),
            new TagNameHandler(),
        );
    }

    async perform({project, values}) {
        const {ciProvider, deploymentRepository} = this.dependencies;
        const dispatch = await ciProvider.triggerPipeline({
            repository: repositoryOf(project),
            workflowId: project.workflow_id,
            ref: values.ref,
            createTag: values.createTag,
            tagName: values.tagName,
            accessToken: this.actor.githubAccessToken,
        });
        const deployment = await deploymentRepository.createPending({
            projectId: project.id,
            triggeredBy: this.actor.id,
            ref: dispatch.ref,
            workflowId: project.workflow_id,
            workflowName: project.workflow_name,
            dispatchedAt: dispatch.dispatchedAt,
        });
        return {deployment, tagCreated: dispatch.tagCreated};
    }

    eventFor({project, values}, {deployment, tagCreated}) {
        return {
            event: DOMAIN_EVENTS.DEPLOYMENT_TRIGGERED,
            payload: {projectId: project.id, deploymentId: deployment.id, ref: values.ref, tagCreated},
        };
    }
}

/**
 * Shared skeleton of operations on an existing run. The current status is read from the CI
 * provider (the source of truth) and the State pattern decides whether the operation is legal.
 */
class RunOperationCommand extends Command {
    createValidationChain() {
        const {deploymentRepository, projectRepository, resolvePolicy} = this.dependencies;
        return buildChain(
            new PositiveIntegerHandler('deploymentId', 'Deployment id'),
            new DeploymentExistsHandler(deploymentRepository),
            new ProjectExistsHandler(projectRepository),
            new ProjectAccessHandler(resolvePolicy, 'manage'),
            new RunStartedHandler(),
        );
    }

    async perform({project, deployment}) {
        const {ciProvider, deploymentRepository} = this.dependencies;
        const request = {
            repository: repositoryOf(project),
            runId: deployment.run_id,
            accessToken: this.actor.githubAccessToken,
        };
        const remote = await ciProvider.getPipelineRun(request);
        const context = new DeploymentContext(remote.status);
        this.transition(context);
        await this.callProvider(ciProvider, request);
        const updated = await deploymentRepository.updateStatus(deployment.id, context.getStatus());
        return {deployment: updated, from: remote.status, to: context.getStatus()};
    }

    // eslint-disable-next-line no-unused-vars
    transition(context) {
        throw new Error('RunOperationCommand.transition must be implemented.');
    }

    // eslint-disable-next-line no-unused-vars
    callProvider(ciProvider, request) {
        throw new Error('RunOperationCommand.callProvider must be implemented.');
    }
}

export class CancelDeploymentCommand extends RunOperationCommand {
    get name() {
        return 'CancelDeployment';
    }

    transition(context) {
        context.cancel();
    }

    callProvider(ciProvider, request) {
        return ciProvider.cancelPipelineRun(request);
    }

    eventFor({project, deployment}, {from, to}) {
        return {
            event: DOMAIN_EVENTS.DEPLOYMENT_CANCEL_REQUESTED,
            payload: {projectId: project.id, deploymentId: deployment.id, runId: deployment.run_id, from, to},
        };
    }
}

export class RerunDeploymentCommand extends RunOperationCommand {
    get name() {
        return 'RerunDeployment';
    }

    transition(context) {
        context.rerun();
    }

    callProvider(ciProvider, request) {
        return ciProvider.rerunPipelineRun(request);
    }

    eventFor({project, deployment}, {from, to}) {
        return {
            event: DOMAIN_EVENTS.DEPLOYMENT_RERUN_REQUESTED,
            payload: {projectId: project.id, deploymentId: deployment.id, runId: deployment.run_id, from, to},
        };
    }
}

const commands = {
    trigger: TriggerDeploymentCommand,
    cancel: CancelDeploymentCommand,
    rerun: RerunDeploymentCommand,
};

/** Creates commands by name and injects their shared dependencies. */
export class DeploymentCommandFactory {
    constructor(dependencies) {
        this.dependencies = dependencies;
    }

    create(type, request) {
        const CommandClass = commands[type];
        if (!CommandClass) {
            throw new Error(`Unknown deployment command: ${type}`);
        }
        return new CommandClass(request, this.dependencies);
    }
}
