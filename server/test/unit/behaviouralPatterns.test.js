import {describe, expect, it, vi} from 'vitest';
import {buildChain, createContext, ValidationHandler} from '../../src/patterns/chain/ValidationHandler.js';
import {
    DeploymentExistsHandler,
    GitRefHandler,
    PositiveIntegerHandler,
    ProjectAccessHandler,
    ProjectExistsHandler,
    ProjectNameHandler,
    RepositoryUrlHandler,
    RunStartedHandler,
    TagNameHandler,
    WorkflowConfiguredHandler,
    WorkflowExistsHandler,
    WorkflowSelectionHandler,
} from '../../src/patterns/chain/handlers.js';
import {AuditLogObserver} from '../../src/patterns/observer/AuditLogObserver.js';
import {DOMAIN_EVENTS, EventObserver, EventPublisher} from '../../src/patterns/observer/EventPublisher.js';
import {MetricsObserver} from '../../src/patterns/observer/MetricsObserver.js';
import {
    AccessPolicy,
    AdminAccessPolicy,
    OwnerAccessPolicy,
    resolveAccessPolicy,
} from '../../src/patterns/strategy/access/AccessPolicy.js';
import {admin, developer, FakeCiProvider, project} from '../helpers/fixtures.js';

const run = (handler, input, extra = {}) => handler.handle({...createContext({actor: developer(), input}), ...extra});

describe('Chain of Responsibility pattern: request validation', () => {
    it('passes the context through every handler in order', async () => {
        const order = [];
        class Recorder extends ValidationHandler {
            constructor(name) {
                super();
                this.name = name;
            }

            async process(context) {
                order.push(this.name);
                context.values[this.name] = true;
            }
        }
        const context = await buildChain(new Recorder('a'), new Recorder('b'), new Recorder('c'))
            .handle(createContext({actor: null}));
        expect(order).toEqual(['a', 'b', 'c']);
        expect(context.values).toEqual({a: true, b: true, c: true});
        await expect(new ValidationHandler().handle({})).rejects.toThrow('must be implemented');
    });

    it('stops at the first failing handler', async () => {
        const repository = {findById: vi.fn()};
        const chain = buildChain(new PositiveIntegerHandler('projectId', 'Project id'), new ProjectExistsHandler(repository));
        await expect(run(chain, {projectId: 'abc'})).rejects.toMatchObject({status: 400, message: 'Project id must be a positive integer.'});
        expect(repository.findById).not.toHaveBeenCalled();
    });

    it('loads deployments and projects and reports missing ones as 404', async () => {
        const deployments = {findById: vi.fn().mockResolvedValueOnce({id: 5, project_id: 3}).mockResolvedValueOnce(null)};
        const projects = {findById: vi.fn().mockResolvedValueOnce(project()).mockResolvedValueOnce(null)};
        const chain = () => buildChain(
            new PositiveIntegerHandler('deploymentId', 'Deployment id'),
            new DeploymentExistsHandler(deployments),
            new ProjectExistsHandler(projects),
        );
        const context = await run(chain(), {deploymentId: '5'});
        expect(context.project.id).toBe(3);
        expect(context.values).toEqual({deploymentId: 5, projectId: 3});
        await expect(run(chain(), {deploymentId: 6})).rejects.toMatchObject({status: 404, message: 'Deployment not found.'});
        await expect(run(new ProjectExistsHandler(projects), {}, {values: {projectId: 1}}))
            .rejects.toMatchObject({status: 404});
    });

    it('authorises access through the selected policy', async () => {
        const handler = (mode) => new ProjectAccessHandler(resolveAccessPolicy, mode);
        const foreign = project({user_id: 99});
        await expect(handler('view').handle({actor: developer(), project: foreign}))
            .rejects.toMatchObject({status: 404});
        await expect(handler('manage').handle({actor: admin(), project: foreign})).resolves.toBeTruthy();
        await expect(handler('manage').handle({actor: developer(), project: project()})).resolves.toBeTruthy();

        const viewOnly = {canView: () => true, canManage: () => false};
        await expect(new ProjectAccessHandler(() => viewOnly).handle({actor: developer(), project: foreign}))
            .rejects.toMatchObject({status: 403});
    });

    it('validates refs, tags and workflow configuration', async () => {
        expect((await run(new GitRefHandler(), {})).values.ref).toBe('main');
        expect((await run(new GitRefHandler(), {ref: ' release/1.2 '})).values.ref).toBe('release/1.2');
        for (const ref of ['../etc', 'a..b', '/abs', 'trail/', 'bad ref', 'x'.repeat(256)]) {
            await expect(run(new GitRefHandler(), {ref})).rejects.toMatchObject({status: 400});
        }

        expect((await run(new TagNameHandler(), {createTag: false})).values).toEqual({createTag: false});
        expect((await run(new TagNameHandler(), {createTag: true, tagName: ' v1.2.3 '})).values.tagName).toBe('v1.2.3');
        await expect(run(new TagNameHandler(), {createTag: true, tagName: 'bad tag'})).rejects.toMatchObject({status: 400});
        await expect(run(new TagNameHandler(), {createTag: true})).rejects.toMatchObject({status: 400});

        await expect(new WorkflowConfiguredHandler().handle({project: project({workflow_id: 0})}))
            .rejects.toMatchObject({status: 400});
        await expect(new RunStartedHandler().handle({deployment: {run_id: null}}))
            .rejects.toMatchObject({status: 409, code: 'RUN_NOT_STARTED'});
    });

    it('validates and normalises new projects', async () => {
        const ciProvider = new FakeCiProvider();
        const chain = () => buildChain(new ProjectNameHandler(), new RepositoryUrlHandler(),
            new WorkflowSelectionHandler(), new WorkflowExistsHandler(ciProvider));

        const {values} = await run(chain(), {name: ' Dashboard ', repoUrl: 'https://github.com/acme/app.git', workflowId: '42'});
        expect(values).toEqual({
            name: 'Dashboard',
            repository: 'acme/app',
            repoUrl: 'https://github.com/acme/app',
            workflowId: 42,
            workflowName: 'Deploy',
        });

        await expect(run(chain(), {name: 'ab'})).rejects.toMatchObject({message: expect.stringContaining('between 3 and 100')});
        await expect(run(chain(), {name: 'App', repoUrl: 'https://gitlab.com/a/b'})).rejects.toMatchObject({status: 400});
        await expect(run(chain(), {name: 'App', repoUrl: 'https://github.com/a/b', workflowId: 0}))
            .rejects.toMatchObject({message: 'A GitHub Actions workflow must be selected.'});
        await expect(run(chain(), {name: 'App', repoUrl: 'https://github.com/a/b', workflowId: 7}))
            .rejects.toMatchObject({message: 'The selected workflow does not exist in this repository.'});
    });
});

describe('Strategy pattern: access policies', () => {
    it('lets administrators see and manage everything', () => {
        const policy = new AdminAccessPolicy();
        expect(policy.canView(admin(), project({user_id: 5}))).toBe(true);
        expect(policy.canManage(admin(), project({user_id: 5}))).toBe(true);
        expect(policy.projectScope(admin())).toEqual({});
        expect(policy.auditScope(admin())).toEqual({});
    });

    it('limits developers to their own projects and audit entries', () => {
        const policy = new OwnerAccessPolicy();
        expect(policy.canView(developer(), project())).toBe(true);
        expect(policy.canManage(developer(), project({user_id: 8}))).toBe(false);
        expect(policy.projectScope(developer())).toEqual({ownerId: 7});
        expect(policy.auditScope(developer())).toEqual({visibleTo: 7});
    });

    it('selects the policy from the role and falls back to the restrictive one', () => {
        expect(resolveAccessPolicy(admin())).toBeInstanceOf(AdminAccessPolicy);
        expect(resolveAccessPolicy(developer())).toBeInstanceOf(OwnerAccessPolicy);
        expect(resolveAccessPolicy({role: 'Hacker'})).toBeInstanceOf(OwnerAccessPolicy);
        const abstract = new AccessPolicy();
        ['canView', 'canManage', 'projectScope', 'auditScope']
            .forEach((method) => expect(() => abstract[method]()).toThrow('must be implemented'));
    });
});

describe('Observer pattern: domain events', () => {
    it('notifies every subscriber and supports unsubscribing', async () => {
        const publisher = new EventPublisher();
        const first = {update: vi.fn()};
        const second = {update: vi.fn()};
        publisher.subscribe(first);
        const unsubscribe = publisher.subscribe(second);
        await publisher.notify(DOMAIN_EVENTS.PROJECT_CREATED, {projectId: 1});
        unsubscribe();
        await publisher.notify(DOMAIN_EVENTS.PROJECT_DELETED);

        expect(first.update).toHaveBeenCalledTimes(2);
        expect(second.update).toHaveBeenCalledTimes(1);
        expect(second.update).toHaveBeenCalledWith('PROJECT_CREATED', {projectId: 1});
    });

    it('isolates failing observers', async () => {
        const logger = {error: vi.fn()};
        const publisher = new EventPublisher({logger});
        const healthy = {update: vi.fn()};
        publisher.subscribe({update: () => Promise.reject(new Error('db down'))});
        publisher.subscribe(healthy);

        await expect(publisher.notify('X')).resolves.toBeUndefined();
        expect(healthy.update).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith('Event observer failed', expect.objectContaining({event: 'X'}));
        expect(() => new EventObserver().update()).toThrow('must be implemented');
    });

    it('AuditLogObserver persists events with their identifiers', async () => {
        const repository = {record: vi.fn()};
        await new AuditLogObserver(repository).update('DEPLOYMENT_TRIGGERED', {
            userId: 1, projectId: 2, deploymentId: 3, runId: 4, ref: 'main',
        });
        expect(repository.record).toHaveBeenCalledWith({
            event: 'DEPLOYMENT_TRIGGERED', userId: 1, projectId: 2, deploymentId: 3, runId: 4, payload: {ref: 'main'},
        });
        await new AuditLogObserver(repository).update('PROJECT_DELETED', {});
        expect(repository.record).toHaveBeenLastCalledWith(expect.objectContaining({userId: null, runId: null}));
    });

    it('MetricsObserver counts events and status transitions', () => {
        const observer = new MetricsObserver({now: () => new Date('2026-01-01T00:00:00Z')});
        observer.update(DOMAIN_EVENTS.DEPLOYMENT_TRIGGERED);
        observer.update(DOMAIN_EVENTS.DEPLOYMENT_STATUS_CHANGED, {from: 'RUNNING', to: 'SUCCESS'});
        observer.update(DOMAIN_EVENTS.DEPLOYMENT_STATUS_CHANGED, {from: 'RUNNING', to: 'SUCCESS'});
        observer.update('CUSTOM');
        const snapshot = observer.snapshot();
        expect(snapshot.since).toBe('2026-01-01T00:00:00.000Z');
        expect(snapshot.events.DEPLOYMENT_TRIGGERED).toBe(1);
        expect(snapshot.events.CUSTOM).toBe(1);
        expect(snapshot.transitions).toEqual({'RUNNING->SUCCESS': 2});
    });
});
