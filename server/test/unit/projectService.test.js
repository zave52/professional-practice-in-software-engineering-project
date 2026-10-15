import assert from 'node:assert/strict';
import {afterEach, describe, expect, it, vi} from 'vitest';

const repository = vi.hoisted(() => ({create: vi.fn(), findById: vi.fn()}));
vi.mock('../../src/repositories/projectRepository.js', () => repository);
const projectService = await import('../../src/services/projectService.js');

afterEach(() => vi.clearAllMocks());

describe('projectService', () => {
    it('validates required project fields before accessing the repository', async () => {
        await assert.rejects(
            projectService.createProject({
                name: 'ab',
                repoUrl: 'https://github.com/example/project',
                workflowId: 12,
                workflowName: 'Deploy',
            }),
            (error) => error.status === 400 && error.message.includes('at least 3'),
        );

        expect(repository.create).not.toHaveBeenCalled();
    });

    it('normalizes values and passes a selected workflow to the repository', async () => {
        repository.create.mockImplementation(async (project) => ({id: 7, ...project}));

        const result = await projectService.createProject({
            userId: 4,
            name: '  Dashboard ',
            repoUrl: ' https://github.com/example/project ',
            workflowId: '12',
            workflowName: '  Deploy ',
        });

        expect(result).toEqual({
            id: 7,
            userId: 4,
            name: 'Dashboard',
            repoUrl: 'https://github.com/example/project',
            workflowId: 12,
            workflowName: 'Deploy',
        });
    });

    it('rejects invalid ids and reports missing projects', async () => {
        repository.findById.mockImplementation(async () => null);

        await assert.rejects(
            projectService.getProject('not-a-number'),
            (error) => error.status === 400,
        );
        await assert.rejects(
            projectService.getProject(99),
            (error) => error.status === 404 && error.message === 'Project not found.',
        );
        expect(repository.findById).toHaveBeenCalledTimes(1);
    });

    it('returns an empty project list without creating records', async () => {
        repository.findAll = vi.fn().mockResolvedValue([]);
        repository.ensureConfiguredProject = vi.fn();

        await expect(projectService.listProjects()).resolves.toEqual([]);

        expect(repository.ensureConfiguredProject).not.toHaveBeenCalled();
    });

    it('creates with the default user and deletes projects by validated id', async () => {
        repository.ensureDefaultUser = vi.fn().mockResolvedValue(4);
        repository.create.mockResolvedValue({id: 3});
        await expect(projectService.createProject({
            name: 'App', repoUrl: 'https://github.com/a/b', workflowId: 2, workflowName: 'Deploy',
        })).resolves.toEqual({id: 3});
        repository.remove = vi.fn().mockResolvedValue({id: 3});
        await expect(projectService.deleteProject(3)).resolves.toEqual({id: 3});
        repository.remove.mockResolvedValue(null);
        await expect(projectService.deleteProject(3)).rejects.toMatchObject({status: 404});
    });

    it('maps duplicate project names to a conflict error', async () => {
        repository.create.mockRejectedValue({code: '23505'});

        await expect(projectService.createProject({
            userId: 4,
            name: 'Dashboard',
            repoUrl: 'https://github.com/a/b',
            workflowId: 2,
            workflowName: 'Deploy',
        })).rejects.toMatchObject({
            status: 409,
            message: 'A project with this name already exists.',
        });
    });
});
