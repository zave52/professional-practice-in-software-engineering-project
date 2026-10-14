import {useEffect, useState} from 'react';
import {BellRing, RefreshCw} from 'lucide-react';
import Navbar from './components/Navbar';
import StatsCards from './components/StatsCards';
import ProjectList from './components/ProjectList';
import DeploymentTable from './components/DeploymentTable';
import AddProjectModal from './components/AddProjectModal';
import ConfirmModal from './components/ConfirmModal';
import TriggerDeployModal from './components/TriggerDeployModal';
import {
    createProject,
    deleteDeployment,
    deleteProject,
    getDeployments,
    getProjects,
    getSystemHealth,
    triggerDeployment,
} from './services/api';

const defaultHealth = {
    status: 'HEALTHY',
    uptime: '99.98%',
    version: '1.0.0',
};

function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [projects, setProjects] = useState([]);
    const [deployments, setDeployments] = useState([]);
    const [systemHealth, setSystemHealth] = useState(defaultHealth);
    const [isLoading, setIsLoading] = useState(true);
    const [isProjectModalOpen, setProjectModalOpen] = useState(false);
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
    const [triggerProject, setTriggerProject] = useState(null);
    const [pendingAction, setPendingAction] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [environmentFilter, setEnvironmentFilter] = useState('all');
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'info') => {
        setToast({message, type});
        window.clearTimeout(showToast.timeoutId);
        showToast.timeoutId = window.setTimeout(() => setToast(null), 3200);
    };

    const refreshDashboard = async () => {
        setIsLoading(true);

        try {
            const [projectData, deploymentData, healthData] = await Promise.all([
                getProjects(),
                getDeployments(),
                getSystemHealth(),
            ]);

            setProjects(projectData);
            setDeployments(deploymentData);
            setSystemHealth(healthData);
            if (deploymentData.some((deployment) => deployment.workflow_url)) {
                showToast('Live GitHub Actions pipeline runs loaded.', 'success');
            }
        } catch (error) {
            showToast(error.message || 'Unable to load dashboard data.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshDashboard();
        const refreshInterval = window.setInterval(refreshDashboard, 30000);
        return () => window.clearInterval(refreshInterval);
    }, []);

    const handleCreateProject = async (projectData) => {
        try {
            const newProject = await createProject(projectData);
            setProjects((currentProjects) => [newProject, ...currentProjects]);
            setProjectModalOpen(false);
            setActiveTab('projects');
            showToast(`Project "${newProject.name}" was created successfully.`, 'success');
        } catch (error) {
            showToast(error.message || 'Unable to save the project.', 'error');
        }
    };

    const handleDeleteProject = (project) => {
        setPendingAction({type: 'project', project});
        setConfirmModalOpen(true);
    };

    const handleCancelDeployment = (deployment) => {
        setPendingAction({type: 'deployment', deployment});
        setConfirmModalOpen(true);
    };

    const handleConfirmAction = async () => {
        if (!pendingAction) {
            return;
        }

        try {
            if (pendingAction.type === 'project') {
                await deleteProject(pendingAction.project.id);
                setProjects((currentProjects) =>
                    currentProjects.filter((project) => Number(project.id) !== Number(pendingAction.project.id)),
                );
                setDeployments((currentDeployments) =>
                    currentDeployments.filter(
                        (deployment) => Number(deployment.project_id) !== Number(pendingAction.project.id),
                    ),
                );
                showToast(`Project "${pendingAction.project.name}" was deleted successfully.`, 'success');
            }

            if (pendingAction.type === 'deployment') {
                await deleteDeployment(pendingAction.deployment.id);
                setDeployments((currentDeployments) =>
                    currentDeployments.filter((deployment) => Number(deployment.id) !== Number(pendingAction.deployment.id)),
                );
                showToast('Deployment was cancelled successfully.', 'success');
            }
        } catch (error) {
            showToast(error.message || 'The requested action could not be completed.', 'error');
        } finally {
            setConfirmModalOpen(false);
            setPendingAction(null);
        }
    };

    const handleTriggerDeploy = async (project, options) => {
        try {
            await triggerDeployment(project.id, {
                ...options,
                versionTag: options.createTag ? options.tagName : `deploy-${Date.now()}`,
            });
            setTriggerProject(null);
            setActiveTab('deployments');
            showToast(`GitHub Actions deployment started for ${project.name}.`, 'success');
            window.setTimeout(refreshDashboard, 1500);
        } catch (error) {
            showToast(error.message || 'Unable to trigger deployment.', 'error');
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <Navbar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onAddProject={() => setProjectModalOpen(true)}
                systemHealth={systemHealth}
            />

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {toast && (
                    <div
                        className={`fixed right-4 top-20 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg ${
                            toast.type === 'success'
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                                : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                        }`}
                        role="status"
                    >
                        <BellRing className="h-4 w-4"/>
                        <span>{toast.message}</span>
                    </div>
                )}

                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">Overview</p>
                                <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Pipeline health</h2>
                            </div>

                            <button
                                type="button"
                                onClick={refreshDashboard}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white"
                            >
                                <RefreshCw className="h-4 w-4"/>
                                Refresh
                            </button>
                        </div>

                        <StatsCards
                            projects={projects}
                            deployments={deployments}
                            systemHealth={systemHealth}
                            isLoading={isLoading}
                        />

                        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
                            <ProjectList
                                projects={projects}
                                onTriggerDeploy={setTriggerProject}
                                onDeleteProject={handleDeleteProject}
                                isLoading={isLoading}
                            />

                            <DeploymentTable
                                deployments={deployments}
                                projects={projects}
                                onCancelDeployment={handleCancelDeployment}
                                isLoading={isLoading}
                                searchTerm={searchTerm}
                                setSearchTerm={setSearchTerm}
                                environmentFilter={environmentFilter}
                                setEnvironmentFilter={setEnvironmentFilter}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'projects' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">Projects</p>
                                <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Project catalog</h2>
                            </div>

                            <button
                                type="button"
                                onClick={() => setProjectModalOpen(true)}
                                className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                            >
                                Add project
                            </button>
                        </div>

                        <ProjectList
                            projects={projects}
                            onTriggerDeploy={setTriggerProject}
                            onDeleteProject={handleDeleteProject}
                            isLoading={isLoading}
                        />
                    </div>
                )}

                {activeTab === 'deployments' && (
                    <DeploymentTable
                        deployments={deployments}
                        projects={projects}
                        onCancelDeployment={handleCancelDeployment}
                        isLoading={isLoading}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        environmentFilter={environmentFilter}
                        setEnvironmentFilter={setEnvironmentFilter}
                    />
                )}
            </main>

            <AddProjectModal isOpen={isProjectModalOpen} onClose={() => setProjectModalOpen(false)}
                             onSubmit={handleCreateProject}/>

            <ConfirmModal
                isOpen={isConfirmModalOpen}
                onClose={() => setConfirmModalOpen(false)}
                onConfirm={handleConfirmAction}
            />
            <TriggerDeployModal
                project={triggerProject}
                isOpen={Boolean(triggerProject)}
                onClose={() => setTriggerProject(null)}
                onSubmit={(options) => handleTriggerDeploy(triggerProject, options)}
            />
        </div>
    );
}

export default App;
