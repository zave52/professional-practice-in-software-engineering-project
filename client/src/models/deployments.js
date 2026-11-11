/** Model layer: pure deployment logic shared by ViewModel and Views. */

export const statusStyles = {
    SUCCESS: 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/30',
    FAILED: 'bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30',
    CANCELED: 'bg-slate-500/10 text-slate-200 ring-1 ring-slate-500/30',
    CANCELING: 'bg-orange-500/10 text-orange-200 ring-1 ring-orange-500/30',
    RUNNING: 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/30',
};

export const filterDeployments = (deployments, {searchTerm, projectFilter}) => {
    const search = searchTerm.trim().toLowerCase();
    return deployments.filter((deployment) => {
        const matchesSearch = !search || [deployment.version_tag, deployment.commit_sha, deployment.triggered_by]
            .some((value) => String(value || '').toLowerCase().includes(search));
        const matchesProject = projectFilter === 'all' || String(deployment.project_id) === String(projectFilter);
        return matchesSearch && matchesProject;
    });
};

const COMPLETED = ['SUCCESS', 'FAILED'];

export const summarize = (projects, deployments) => {
    const completed = deployments.filter((item) => COMPLETED.includes(item.deploy_status));
    const successful = completed.filter((item) => item.deploy_status === 'SUCCESS');
    const durations = completed.map((item) => item.duration_seconds).filter((value) => value !== null && value !== undefined);
    return {
        projects: projects.length,
        active: deployments.filter((item) => ['RUNNING', 'CANCELING'].includes(item.deploy_status)).length,
        total: deployments.length,
        successRate: completed.length ? (successful.length / completed.length) * 100 : null,
        completed: completed.length,
        averageDuration: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    };
};
