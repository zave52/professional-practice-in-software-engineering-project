import {useCallback, useEffect, useRef, useState} from 'react';
import * as api from '../services/api';

const POLL_INTERVAL_MS = 30_000;
const TOAST_MS = 3200;

const readLoginError = () => {
    if (typeof window === 'undefined') {
        return null;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get('login_error');
    if (code) {
        params.delete('login_error');
        const rest = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }
    return code;
};

/**
 * MVVM pattern: ViewModel of the dashboard.
 *
 * Owns all state (session, projects, deployments, metrics, audit log, dialogs, toasts) and
 * exposes it together with commands (`createProject`, `triggerDeploy`, `confirmPendingAction`
 * ...). React components are passive Views: they render the ViewModel and call its commands,
 * and they never talk to the API directly. The ViewModel can be tested without rendering UI.
 */
export function useDashboardViewModel({pollIntervalMs = POLL_INTERVAL_MS} = {}) {
    const [user, setUser] = useState(null);
    const [isSessionLoading, setIsSessionLoading] = useState(true);
    const [loginError] = useState(readLoginError);
    const [activeTab, setActiveTab] = useState('dashboard');

    const [projects, setProjects] = useState([]);
    const [deployments, setDeployments] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [lastSyncedAt, setLastSyncedAt] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState('all');

    const [metricsDays, setMetricsDays] = useState(30);
    const [metrics, setMetrics] = useState(null);
    const [metricsError, setMetricsError] = useState('');
    const [auditLog, setAuditLog] = useState(null);

    const [isProjectModalOpen, setProjectModalOpen] = useState(false);
    const [triggerProject, setTriggerProject] = useState(null);
    const [triggerError, setTriggerError] = useState('');
    const [pendingAction, setPendingAction] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const showToast = useCallback((message, type = 'info') => {
        setToast({message, type});
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
    }, []);

    const handleError = useCallback((error, fallback) => {
        if (error?.status === 401) {
            setUser(null);
        }
        showToast(error?.message || fallback, 'error');
    }, [showToast]);

    const refresh = useCallback(async () => {
        try {
            const [projectData, deploymentData] = await Promise.all([api.getProjects(), api.getDeployments()]);
            setProjects(projectData);
            setDeployments(deploymentData.deployments);
            setWarnings(deploymentData.warnings || []);
            setLastSyncedAt(deploymentData.synced_at || null);
        } catch (error) {
            handleError(error, 'Unable to load dashboard data.');
        } finally {
            setIsLoading(false);
        }
    }, [handleError]);

    useEffect(() => {
        let active = true;
        api.getSession()
            .then(({user: sessionUser}) => active && setUser(sessionUser))
            .catch(() => active && setUser(null))
            .finally(() => active && setIsSessionLoading(false));
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!user) {
            return undefined;
        }
        const initial = window.setTimeout(refresh, 0);
        const interval = window.setInterval(refresh, pollIntervalMs);
        return () => {
            window.clearTimeout(initial);
            window.clearInterval(interval);
        };
    }, [user, refresh, pollIntervalMs]);

    const loadMetrics = useCallback(async (days = metricsDays) => {
        try {
            const data = await api.getMetrics({days, projectId: projectFilter});
            setMetrics(data);
            setMetricsError('');
        } catch (error) {
            setMetricsError(error.message || 'Unable to load metrics.');
        }
    }, [metricsDays, projectFilter]);

    const loadAuditLog = useCallback(async () => {
        try {
            setAuditLog(await api.getAuditLog({limit: 100}));
        } catch (error) {
            handleError(error, 'Unable to load the audit log.');
        }
    }, [handleError]);

    useEffect(() => {
        if (!user) {
            return undefined;
        }
        const timer = window.setTimeout(() => {
            if (activeTab === 'metrics') {
                loadMetrics();
            } else if (activeTab === 'activity') {
                loadAuditLog();
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [user, activeTab, loadMetrics, loadAuditLog]);

    const login = () => window.location.assign(api.getLoginUrl());

    const logout = async () => {
        try {
            await api.logout();
        } catch (error) {
            showToast(error.message || 'Unable to sign out.', 'error');
            return;
        }
        setUser(null);
        setProjects([]);
        setDeployments([]);
        setMetrics(null);
        setAuditLog(null);
    };

    const createProject = async (projectData) => {
        try {
            const project = await api.createProject(projectData);
            setProjectModalOpen(false);
            setActiveTab('projects');
            showToast(`Project "${project.name}" was added.`, 'success');
            await refresh();
        } catch (error) {
            handleError(error, 'Unable to save the project.');
        }
    };

    const requestDeleteProject = (project) => setPendingAction({type: 'delete-project', project});
    const requestCancelDeployment = (deployment) => setPendingAction({type: 'cancel-deployment', deployment});
    const closeConfirm = () => setPendingAction(null);

    const confirmPendingAction = async () => {
        const action = pendingAction;
        setPendingAction(null);
        if (!action) {
            return;
        }
        try {
            if (action.type === 'delete-project') {
                await api.deleteProject(action.project.id);
                showToast(`Project "${action.project.name}" was deleted.`, 'success');
            } else {
                await api.cancelDeployment(action.deployment.id);
                showToast('Cancellation was requested. GitHub will confirm it shortly.', 'success');
            }
            await refresh();
        } catch (error) {
            handleError(error, 'The requested action could not be completed.');
        }
    };

    const rerunDeployment = async (deployment) => {
        try {
            await api.rerunDeployment(deployment.id);
            showToast('A new run attempt was requested.', 'success');
            await refresh();
        } catch (error) {
            handleError(error, 'Unable to rerun the deployment.');
        }
    };

    const openTrigger = (project) => {
        setTriggerError('');
        setTriggerProject(project);
    };

    const closeTrigger = () => {
        setTriggerError('');
        setTriggerProject(null);
    };

    const triggerDeploy = async (options) => {
        setTriggerError('');
        try {
            await api.triggerDeployment(triggerProject.id, options);
            showToast(`Deployment of ${triggerProject.name} was started.`, 'success');
            setTriggerProject(null);
            setActiveTab('deployments');
            await refresh();
        } catch (error) {
            setTriggerError(error.message || 'Unable to trigger the deployment.');
            if (error.status === 401) {
                setUser(null);
            }
        }
    };

    const changeMetricsDays = (days) => {
        setMetricsDays(days);
    };

    return {
        session: {user, isSessionLoading, loginError, login, logout},
        navigation: {activeTab, setActiveTab},
        data: {projects, deployments, warnings, lastSyncedAt, isLoading, refresh},
        filters: {searchTerm, setSearchTerm, projectFilter, setProjectFilter},
        insights: {metrics, metricsDays, metricsError, changeMetricsDays, loadMetrics, auditLog, loadAuditLog},
        dialogs: {
            isProjectModalOpen,
            openProjectModal: () => setProjectModalOpen(true),
            closeProjectModal: () => setProjectModalOpen(false),
            triggerProject,
            triggerError,
            openTrigger,
            closeTrigger,
            pendingAction,
            closeConfirm,
        },
        commands: {
            createProject,
            requestDeleteProject,
            requestCancelDeployment,
            confirmPendingAction,
            rerunDeployment,
            triggerDeploy,
        },
        toast,
    };
}

export default useDashboardViewModel;
