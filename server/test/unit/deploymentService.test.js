import {describe, expect, it, vi} from 'vitest';

const repositories = vi.hoisted(() => ({
    deployment: {findById: vi.fn()},
    project: {findById: vi.fn()},
}));
const actions = vi.hoisted(() => ({
    dispatchDeployment: vi.fn(),
    cancelWorkflowRun: vi.fn(),
    rerunWorkflowRun: vi.fn(),
}));
vi.mock('../../src/repositories/deploymentRepository.js', () => repositories.deployment);
vi.mock('../../src/repositories/projectRepository.js', () => repositories.project);
vi.mock('../../src/services/githubActionsService.js', () => actions);
const service = await import('../../src/services/deploymentService.js');

describe('deploymentService', () => {
    it('rejects invalid ids and missing deployments', async () => {
        await expect(service.getDeployment('bad')).rejects.toMatchObject({status: 400});
        repositories.deployment.findById.mockResolvedValue(null);
        await expect(service.getDeployment(10)).rejects.toMatchObject({status: 404});
    });

    it('validates project and version before dispatching', async () => {
        repositories.project.findById.mockResolvedValue(null);
        await expect(service.triggerDeployment({projectId: 1, versionTag: 'v1'})).rejects.toMatchObject({status: 404});
        repositories.project.findById.mockResolvedValue({
            id: 1,
            repo_url: 'https://github.com/a/b',
            workflow_id: 2,
            user_id: 8
        });
        await expect(service.triggerDeployment({projectId: 1, versionTag: ''})).rejects.toMatchObject({status: 400});
        expect(actions.dispatchDeployment).not.toHaveBeenCalled();
    });

    it('dispatches valid deployments and returns a running record', async () => {
        repositories.project.findById.mockResolvedValue({
            id: 1,
            repo_url: 'https://github.com/a/b',
            workflow_id: 2,
            user_id: 8
        });
        actions.dispatchDeployment.mockResolvedValue({ref: 'main', tag_created: false});
        const result = await service.triggerDeployment({projectId: '1', versionTag: ' v1 ', triggeredBy: 9});
        expect(result).toMatchObject({
            projectId: 1,
            triggered_by: 9,
            version_tag: 'v1',
            deploy_status: 'RUNNING',
            workflow_ref: 'main'
        });
        expect(result.commit_sha).toMatch(/^[a-f0-9]{40}$/);
        expect(actions.dispatchDeployment).toHaveBeenCalledWith(expect.objectContaining({
            repository: 'a/b',
            workflowId: 2
        }));
    });

    it('cancels and reruns deployments using the project repository', async () => {
        repositories.project.findById.mockResolvedValue({repo_url: 'https://github.com/a/b', user_id: 8});
        actions.cancelWorkflowRun.mockResolvedValue({id: 4, cancelled: true});
        actions.rerunWorkflowRun.mockResolvedValue({id: 4, rerun: true});
        await expect(service.deleteDeployment('4', '1')).resolves.toEqual({id: 4, cancelled: true});
        await expect(service.rerunDeployment(4, 1)).resolves.toEqual({id: 4, rerun: true});
        expect(actions.cancelWorkflowRun).toHaveBeenCalledWith(4, 'a/b');
    });
});
