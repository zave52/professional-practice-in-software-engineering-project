import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Command} from '../../src/patterns/command/Command.js';
import {CommandInvoker} from '../../src/patterns/command/CommandInvoker.js';
import {
    CancelDeploymentCommand,
    DeploymentCommandFactory,
    RerunDeploymentCommand,
    TriggerDeploymentCommand,
} from '../../src/patterns/command/deploymentCommands.js';
import {resolveAccessPolicy} from '../../src/patterns/strategy/access/AccessPolicy.js';
import {developer, FakeCiProvider, pipelineRun, project} from '../helpers/fixtures.js';

const setup = ({runs = [pipelineRun()], storedProject = project(), deployment} = {}) => {
    const ciProvider = new FakeCiProvider({runs});
    const stored = deployment ?? {id: 20, project_id: storedProject.id, run_id: 1001, deploy_status: 'RUNNING'};
    const dependencies = {
        ciProvider,
        projectRepository: {findById: vi.fn(async (id) => (id === storedProject.id ? storedProject : null))},
        deploymentRepository: {
            findById: vi.fn(async (id) => (id === stored.id ? stored : null)),
            createPending: vi.fn(async (data) => ({id: 21, ...data, deploy_status: 'RUNNING'})),
            updateStatus: vi.fn(async (id, status) => ({...stored, deploy_status: status})),
        },
        publisher: {notify: vi.fn()},
        resolvePolicy: resolveAccessPolicy,
    };
    return {ciProvider, dependencies, factory: new DeploymentCommandFactory(dependencies)};
};

describe('Command pattern: deployment operations', () => {
    let context;
    beforeEach(() => {
        context = setup();
    });

    it('trigger dispatches the workflow, stores a pending deployment and publishes an event', async () => {
        const command = context.factory.create('trigger', {
            actor: developer(),
            input: {projectId: '3', ref: 'main', createTag: true, tagName: 'v1.0.0'},
        });
        expect(command).toBeInstanceOf(TriggerDeploymentCommand);

        const result = await command.execute();

        expect(context.ciProvider.triggerPipeline).toHaveBeenCalledWith({
            repository: 'acme/dashboard',
            workflowId: 42,
            ref: 'main',
            createTag: true,
            tagName: 'v1.0.0',
            accessToken: 'gho_dev',
        });
        expect(context.dependencies.deploymentRepository.createPending).toHaveBeenCalledWith(
            expect.objectContaining({projectId: 3, triggeredBy: 7, ref: 'v1.0.0', workflowId: 42}),
        );
        expect(result.tagCreated).toBe(true);
        expect(context.dependencies.publisher.notify).toHaveBeenCalledWith('DEPLOYMENT_TRIGGERED', expect.objectContaining({
            userId: 7, projectId: 3, deploymentId: 21, ref: 'main',
        }));
        expect(command.describe()).toEqual({command: 'TriggerDeployment', userId: 7, input: expect.any(Object)});
    });

    it('trigger refuses projects of other users and unconfigured workflows before calling GitHub', async () => {
        const foreign = setup({storedProject: project({user_id: 99})});
        await expect(foreign.factory.create('trigger', {actor: developer(), input: {projectId: 3}}).execute())
            .rejects.toMatchObject({status: 404});

        const unconfigured = setup({storedProject: project({workflow_id: 0})});
        await expect(unconfigured.factory.create('trigger', {actor: developer(), input: {projectId: 3}}).execute())
            .rejects.toMatchObject({status: 400});

        expect(foreign.ciProvider.triggerPipeline).not.toHaveBeenCalled();
        expect(unconfigured.ciProvider.triggerPipeline).not.toHaveBeenCalled();
    });

    it('cancel asks the state machine first and moves the deployment to CANCELING', async () => {
        const command = context.factory.create('cancel', {actor: developer(), input: {deploymentId: 20}});
        expect(command).toBeInstanceOf(CancelDeploymentCommand);

        const result = await command.execute();

        expect(context.ciProvider.getPipelineRun).toHaveBeenCalledWith(expect.objectContaining({runId: 1001}));
        expect(context.ciProvider.cancelPipelineRun).toHaveBeenCalled();
        expect(context.dependencies.deploymentRepository.updateStatus).toHaveBeenCalledWith(20, 'CANCELING');
        expect(result).toMatchObject({from: 'RUNNING', to: 'CANCELING'});
        expect(context.dependencies.publisher.notify)
            .toHaveBeenCalledWith('DEPLOYMENT_CANCEL_REQUESTED', expect.objectContaining({runId: 1001}));
    });

    it('cancel of a finished run is rejected without calling GitHub', async () => {
        const finished = setup({runs: [pipelineRun({status: 'SUCCESS'})]});
        await expect(finished.factory.create('cancel', {actor: developer(), input: {deploymentId: 20}}).execute())
            .rejects.toMatchObject({status: 409, code: 'INVALID_STATE_TRANSITION'});
        expect(finished.ciProvider.cancelPipelineRun).not.toHaveBeenCalled();
    });

    it('rerun is allowed for finished runs and rejected for runs that have not started', async () => {
        const failed = setup({runs: [pipelineRun({status: 'FAILED'})]});
        const command = failed.factory.create('rerun', {actor: developer(), input: {deploymentId: 20}});
        expect(command).toBeInstanceOf(RerunDeploymentCommand);
        await expect(command.execute()).resolves.toMatchObject({from: 'FAILED', to: 'RUNNING'});
        expect(failed.ciProvider.rerunPipelineRun).toHaveBeenCalled();

        const pending = setup({deployment: {id: 20, project_id: 3, run_id: null, deploy_status: 'RUNNING'}});
        await expect(pending.factory.create('rerun', {actor: developer(), input: {deploymentId: 20}}).execute())
            .rejects.toMatchObject({status: 409, code: 'RUN_NOT_STARTED'});
    });

    it('rejects unknown command types and enforces the template steps', async () => {
        expect(() => context.factory.create('delete-everything', {})).toThrow('Unknown deployment command');
        const abstract = new Command({actor: null}, {});
        expect(() => abstract.name).toThrow('must be implemented');
        expect(() => abstract.createValidationChain()).toThrow('must be implemented');
        await expect(abstract.perform()).rejects.toThrow('must be implemented');
        expect(abstract.eventFor()).toBeNull();
    });
});

describe('Command pattern: invoker', () => {
    it('records successful and failed executions and reports failures to observers', async () => {
        let now = 1000;
        const publisher = {notify: vi.fn()};
        const logger = {warn: vi.fn()};
        const invoker = new CommandInvoker({publisher, logger, historyLimit: 2, now: () => (now += 10)});
        const ok = {name: 'Ok', actor: {id: 1}, execute: vi.fn().mockResolvedValue('done'), describe: () => ({})};
        const conflict = Object.assign(new Error('Busy'), {status: 409});
        const bad = {name: 'Bad', actor: {id: 1}, execute: vi.fn().mockRejectedValue(conflict), describe: () => ({})};
        const crash = {name: 'Crash', actor: null, execute: vi.fn().mockRejectedValue(new Error('secret')), describe: () => ({})};

        await expect(invoker.execute(ok)).resolves.toBe('done');
        await expect(invoker.execute(bad)).rejects.toBe(conflict);
        await expect(invoker.execute(crash)).rejects.toThrow('secret');

        expect(invoker.history().map((entry) => [entry.command, entry.outcome])).toEqual([['Bad', 'failed'], ['Crash', 'failed']]);
        expect(invoker.history()[0]).toMatchObject({status: 409, durationMs: 10});
        expect(publisher.notify).toHaveBeenCalledWith('ACTION_FAILED', {userId: 1, command: 'Bad', status: 409, reason: 'Busy'});
        expect(publisher.notify).toHaveBeenLastCalledWith('ACTION_FAILED', {
            userId: null, command: 'Crash', status: 500, reason: 'Internal error',
        });
    });
});
