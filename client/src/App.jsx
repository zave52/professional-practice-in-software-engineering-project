import {BellRing, RefreshCw} from 'lucide-react';
import AddProjectModal from './components/AddProjectModal';
import AuditLog from './components/AuditLog';
import ConfirmModal from './components/ConfirmModal';
import DeploymentTable from './components/DeploymentTable';
import LoginPage from './components/LoginPage';
import MetricsPanel from './components/MetricsPanel';
import Navbar from './components/Navbar';
import ProjectList from './components/ProjectList';
import StatsCards from './components/StatsCards';
import TriggerDeployModal from './components/TriggerDeployModal';
import {formatDate} from './utils/format';
import {useDashboardViewModel} from './viewmodels/useDashboardViewModel';

/** MVVM pattern: View. Renders the ViewModel state and binds UI events to its commands. */
function App() {
    const vm = useDashboardViewModel();
    const {session, navigation, data, filters, insights, dialogs, commands, toast} = vm;

    if (session.isSessionLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
                <div className="flex items-center gap-3 text-sm">
                    <RefreshCw className="h-5 w-5 animate-spin text-emerald-400"/>
                    Checking authorization...
                </div>
            </div>
        );
    }

    if (!session.user) {
        return <LoginPage onLogin={session.login} error={session.loginError}/>;
    }

    const deploymentTable = (
        <DeploymentTable
            deployments={data.deployments}
            projects={data.projects}
            warnings={data.warnings}
            onCancelDeployment={commands.requestCancelDeployment}
            onRerunDeployment={commands.rerunDeployment}
            isLoading={data.isLoading}
            searchTerm={filters.searchTerm}
            setSearchTerm={filters.setSearchTerm}
            projectFilter={filters.projectFilter}
            setProjectFilter={filters.setProjectFilter}
        />
    );
    const projectList = (
        <ProjectList
            projects={data.projects}
            onTriggerDeploy={dialogs.openTrigger}
            onDeleteProject={commands.requestDeleteProject}
            isLoading={data.isLoading}
            showOwner={session.user.role === 'Admin'}
        />
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <Navbar
                activeTab={navigation.activeTab}
                onTabChange={navigation.setActiveTab}
                onAddProject={dialogs.openProjectModal}
                user={session.user}
                onLogout={session.logout}
            />

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {toast && (
                    <div role="status"
                         className={`fixed right-4 top-20 z-[100] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-lg border px-4 py-3 shadow-2xl ${
                             toast.type === 'success'
                                 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                                 : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                         }`}>
                        <BellRing className="h-4 w-4"/>
                        <span>{toast.message}</span>
                    </div>
                )}

                {navigation.activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">Overview</p>
                                <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Pipeline health</h2>
                                {data.lastSyncedAt && (
                                    <p className="mt-1 text-xs text-slate-500">Synchronised with GitHub {formatDate(data.lastSyncedAt)}</p>
                                )}
                            </div>
                            <button type="button" onClick={data.refresh}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white">
                                <RefreshCw className="h-4 w-4"/>
                                Refresh
                            </button>
                        </div>
                        <StatsCards projects={data.projects} deployments={data.deployments} isLoading={data.isLoading}/>
                        <div className="space-y-6">
                            {projectList}
                            {deploymentTable}
                        </div>
                    </div>
                )}

                {navigation.activeTab === 'projects' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">Projects</p>
                                <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Project catalog</h2>
                            </div>
                            <button type="button" onClick={dialogs.openProjectModal}
                                    className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400">
                                Add project
                            </button>
                        </div>
                        {projectList}
                    </div>
                )}

                {navigation.activeTab === 'deployments' && deploymentTable}

                {navigation.activeTab === 'metrics' && (
                    <MetricsPanel metrics={insights.metrics} days={insights.metricsDays}
                                  onDaysChange={insights.changeMetricsDays} error={insights.metricsError}/>
                )}

                {navigation.activeTab === 'activity' && (
                    <AuditLog entries={insights.auditLog} onRefresh={insights.loadAuditLog}/>
                )}
            </main>

            {dialogs.isProjectModalOpen && (
                <AddProjectModal onClose={dialogs.closeProjectModal} onSubmit={commands.createProject}/>
            )}
            <ConfirmModal action={dialogs.pendingAction} onClose={dialogs.closeConfirm} onConfirm={commands.confirmPendingAction}/>
            {dialogs.triggerProject && (
                <TriggerDeployModal
                    key={dialogs.triggerProject.id}
                    project={dialogs.triggerProject}
                    error={dialogs.triggerError}
                    onClose={dialogs.closeTrigger}
                    onSubmit={commands.triggerDeploy}
                />
            )}
        </div>
    );
}

export default App;
