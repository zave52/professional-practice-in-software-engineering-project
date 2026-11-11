import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as api from '../src/services/api';
import {useDashboardViewModel} from '../src/viewmodels/useDashboardViewModel';

vi.mock('../src/services/api', () => ({
    getSession: vi.fn(),
    logout: vi.fn(),
    getLoginUrl: vi.fn(() => '/api/auth/github'),
    getProjects: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    getDeployments: vi.fn(),
    triggerDeployment: vi.fn(),
    cancelDeployment: vi.fn(),
    rerunDeployment: vi.fn(),
    getMetrics: vi.fn(),
    getAuditLog: vi.fn(),
}));

const user = {id: 1, username: 'dev', role: 'Developer'};
const project = {id: 3, name: 'dashboard'};
const deployment = {id: 9, project_id: 3, deploy_status: 'RUNNING', actions: ['cancel']};

const signedIn = async () => {
    const hook = renderHook(() => useDashboardViewModel());
    await waitFor(() => expect(hook.result.current.data.isLoading).toBe(false));
    return hook;
};

describe('MVVM pattern: dashboard ViewModel', () => {
    beforeEach(() => {
        api.getSession.mockResolvedValue({user});
        api.getProjects.mockResolvedValue([project]);
        api.getDeployments.mockResolvedValue({deployments: [deployment], warnings: [{project_id: 3, message: 'slow'}], synced_at: 'now'});
        api.getMetrics.mockResolvedValue({period: {days: 30}, metrics: {}, totals: {total: 0}});
        api.getAuditLog.mockResolvedValue([{id: 1, event: 'PROJECT_CREATED'}]);
    });

    afterEach(() => vi.clearAllMocks());

    it('loads the session and then the dashboard data', async () => {
        const {result} = await signedIn();
        expect(result.current.session.user).toEqual(user);
        expect(result.current.data.projects).toEqual([project]);
        expect(result.current.data.deployments).toEqual([deployment]);
        expect(result.current.data.warnings).toHaveLength(1);
        expect(result.current.data.lastSyncedAt).toBe('now');
    });

    it('shows the login page state for anonymous users without loading data', async () => {
        api.getSession.mockResolvedValue({user: null});
        const {result} = renderHook(() => useDashboardViewModel());
        await waitFor(() => expect(result.current.session.isSessionLoading).toBe(false));
        expect(result.current.session.user).toBeNull();
        expect(api.getProjects).not.toHaveBeenCalled();

        api.getSession.mockRejectedValue(new Error('down'));
        const second = renderHook(() => useDashboardViewModel());
        await waitFor(() => expect(second.result.current.session.isSessionLoading).toBe(false));
        expect(second.result.current.session.user).toBeNull();
    });

    it('creates a project, closes the dialog and switches to the catalog', async () => {
        api.createProject.mockResolvedValue({id: 4, name: 'api'});
        const {result} = await signedIn();
        act(() => result.current.dialogs.openProjectModal());
        expect(result.current.dialogs.isProjectModalOpen).toBe(true);

        await act(() => result.current.commands.createProject({name: 'api'}));

        expect(result.current.dialogs.isProjectModalOpen).toBe(false);
        expect(result.current.navigation.activeTab).toBe('projects');
        expect(result.current.toast).toEqual({message: 'Project "api" was added.', type: 'success'});
    });

    it('asks for confirmation before deleting projects and cancelling runs', async () => {
        const {result} = await signedIn();
        act(() => result.current.commands.requestDeleteProject(project));
        expect(result.current.dialogs.pendingAction).toEqual({type: 'delete-project', project});
        await act(() => result.current.commands.confirmPendingAction());
        expect(api.deleteProject).toHaveBeenCalledWith(3);
        expect(result.current.dialogs.pendingAction).toBeNull();

        act(() => result.current.commands.requestCancelDeployment(deployment));
        await act(() => result.current.commands.confirmPendingAction());
        expect(api.cancelDeployment).toHaveBeenCalledWith(9);

        act(() => result.current.commands.requestDeleteProject(project));
        act(() => result.current.dialogs.closeConfirm());
        await act(() => result.current.commands.confirmPendingAction());
        expect(api.deleteProject).toHaveBeenCalledTimes(1);
    });

    it('reports server errors as toasts and signs out on 401', async () => {
        const {result} = await signedIn();
        api.rerunDeployment.mockRejectedValueOnce(Object.assign(new Error('Cannot rerun'), {status: 409}));
        await act(() => result.current.commands.rerunDeployment(deployment));
        expect(result.current.toast).toEqual({message: 'Cannot rerun', type: 'error'});

        api.rerunDeployment.mockResolvedValueOnce({});
        await act(() => result.current.commands.rerunDeployment(deployment));
        expect(result.current.toast.type).toBe('success');

        api.deleteProject.mockRejectedValueOnce(Object.assign(new Error('Session expired'), {status: 401}));
        act(() => result.current.commands.requestDeleteProject(project));
        await act(() => result.current.commands.confirmPendingAction());
        expect(result.current.session.user).toBeNull();
    });

    it('triggers deployments and keeps the dialog open with the error on failure', async () => {
        const {result} = await signedIn();
        act(() => result.current.dialogs.openTrigger(project));

        api.triggerDeployment.mockRejectedValueOnce(new Error('Workflow has no workflow_dispatch trigger'));
        await act(() => result.current.commands.triggerDeploy({ref: 'main'}));
        expect(result.current.dialogs.triggerProject).toEqual(project);
        expect(result.current.dialogs.triggerError).toBe('Workflow has no workflow_dispatch trigger');

        api.triggerDeployment.mockResolvedValueOnce({deployment: {id: 10}});
        await act(() => result.current.commands.triggerDeploy({ref: 'main'}));
        expect(api.triggerDeployment).toHaveBeenLastCalledWith(3, {ref: 'main'});
        expect(result.current.dialogs.triggerProject).toBeNull();
        expect(result.current.navigation.activeTab).toBe('deployments');

        act(() => result.current.dialogs.openTrigger(project));
        act(() => result.current.dialogs.closeTrigger());
        expect(result.current.dialogs.triggerProject).toBeNull();
    });

    it('loads metrics and the audit log when their tabs are opened', async () => {
        const {result} = await signedIn();
        act(() => result.current.navigation.setActiveTab('metrics'));
        await waitFor(() => expect(result.current.insights.metrics).not.toBeNull());
        expect(api.getMetrics).toHaveBeenCalledWith({days: 30, projectId: 'all'});

        act(() => result.current.insights.changeMetricsDays(7));
        await waitFor(() => expect(api.getMetrics).toHaveBeenLastCalledWith({days: 7, projectId: 'all'}));

        api.getMetrics.mockRejectedValueOnce(new Error('metrics down'));
        await act(() => result.current.insights.loadMetrics(90));
        expect(result.current.insights.metricsError).toBe('metrics down');

        act(() => result.current.navigation.setActiveTab('activity'));
        await waitFor(() => expect(result.current.insights.auditLog).toEqual([{id: 1, event: 'PROJECT_CREATED'}]));
    });

    it('signs out and clears data', async () => {
        const {result} = await signedIn();
        api.logout.mockRejectedValueOnce(new Error('offline'));
        await act(() => result.current.session.logout());
        expect(result.current.session.user).toEqual(user);

        api.logout.mockResolvedValueOnce(null);
        await act(() => result.current.session.logout());
        expect(result.current.session.user).toBeNull();
        expect(result.current.data.projects).toEqual([]);
    });

    it('reads and removes the login error from the URL', async () => {
        window.history.replaceState(null, '', '/?login_error=FORBIDDEN&tab=x');
        const {result} = renderHook(() => useDashboardViewModel());
        expect(result.current.session.loginError).toBe('FORBIDDEN');
        expect(window.location.search).toBe('?tab=x');
        await waitFor(() => expect(result.current.session.isSessionLoading).toBe(false));
        window.history.replaceState(null, '', '/');
    });

    it('shows a toast when refreshing fails', async () => {
        api.getDeployments.mockRejectedValueOnce(new Error('GitHub is down'));
        const {result} = await signedIn();
        expect(result.current.toast).toEqual({message: 'GitHub is down', type: 'error'});
    });
});
