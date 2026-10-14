import {CheckCircle2, Copy, LoaderCircle, XCircle} from 'lucide-react';
import {useMemo, useState} from 'react';

const statusStyles = {
    SUCCESS: 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/30',
    FAILED: 'bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30',
    CANCELED: 'bg-slate-500/10 text-slate-200 ring-1 ring-slate-500/30',
    RUNNING: 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/30',
};

const formatDate = (value) =>
    new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

function DeploymentTable({
                             deployments,
                             projects,
                             onCancelDeployment,
                             isLoading,
                             searchTerm,
                             setSearchTerm,
                             projectFilter,
                             setProjectFilter
                         }) {
    const [copiedSha, setCopiedSha] = useState('');

    const filteredDeployments = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const projectLookup = Object.fromEntries(projects.map((project) => [project.id, project]));

        return deployments.filter((deployment) => {
            const project = projectLookup[deployment.project_id];
            const matchesSearch =
                !normalizedSearch ||
                deployment.version_tag.toLowerCase().includes(normalizedSearch) ||
                deployment.commit_sha.toLowerCase().includes(normalizedSearch);
            const matchesProject =
                projectFilter === 'all' || String(deployment.project_id) === String(projectFilter);

            return matchesSearch && matchesProject;
        });
    }, [deployments, projectFilter, projects, searchTerm]);

    const handleCopy = async (commitSha) => {
        try {
            await navigator.clipboard.writeText(commitSha);
            setCopiedSha(commitSha);
            setTimeout(() => setCopiedSha(''), 1500);
        } catch (error) {
            setCopiedSha('');
        }
    };

    return (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm font-medium text-slate-400">Release activity</p>
                    <h2 className="text-xl font-semibold text-white">Deployments</h2>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search by version or commit"
                        className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                    <select
                        value={projectFilter}
                        onChange={(event) => setProjectFilter(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    >
                        <option value="all">All projects</option>
                        {projects.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full table-fixed text-left text-sm text-slate-200">
                    <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                        <th className="px-3 py-3 font-medium">Version Tag</th>
                        <th className="px-3 py-3 font-medium">Commit SHA</th>
                        <th className="px-3 py-3 font-medium">Triggered By</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 font-medium">Timestamp</th>
                        <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {isLoading ? (
                        <tr>
                            <td colSpan="6" className="px-3 py-8">
                                <div className="flex items-center justify-center gap-3 text-slate-300">
                                    <LoaderCircle className="h-5 w-5 animate-spin text-sky-300"/>
                                    Loading deployments...
                                </div>
                            </td>
                        </tr>
                    ) : filteredDeployments.length === 0 ? (
                        <tr>
                            <td colSpan="6" className="px-3 py-8 text-center text-slate-400">
                                No deployments match the current search.
                            </td>
                        </tr>
                    ) : (
                        filteredDeployments.map((deployment) => (
                            <tr key={deployment.id} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                                <td className="w-56 max-w-56 px-3 py-4 font-medium text-white">
                                    {deployment.workflow_url ? (
                                        <a
                                            href={deployment.workflow_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={deployment.workflow_name || deployment.version_tag}
                                            className="block max-w-full truncate hover:text-sky-300 hover:underline"
                                        >
                                            {deployment.workflow_name || deployment.version_tag}
                                        </a>
                                    ) : (
                                        <span className="block max-w-full truncate" title={deployment.version_tag}>
                                            {deployment.version_tag}
                                        </span>
                                    )}
                                    {deployment.workflow_name && (
                                        <span
                                            className="mt-1 block max-w-full truncate text-xs font-normal text-slate-400"
                                            title={deployment.version_tag}
                                        >
                                            {deployment.version_tag}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-4">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="font-mono text-slate-300">{deployment.commit_sha.slice(0, 8)}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(deployment.commit_sha)}
                                            className="inline-flex items-center justify-center rounded-md border border-slate-700 p-1 text-slate-300 hover:border-sky-500 hover:text-sky-200"
                                            aria-label="Copy commit SHA"
                                        >
                                            {copiedSha === deployment.commit_sha ?
                                                <CheckCircle2 className="h-4 w-4 text-emerald-300"/> :
                                                <Copy className="h-4 w-4"/>}
                                        </button>
                                    </div>
                                </td>
                                <td className="px-3 py-4 text-slate-300">{deployment.triggered_by}</td>
                                <td className="px-3 py-4">
                    <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[deployment.deploy_status] || statusStyles.RUNNING}`}>
                      {deployment.deploy_status}
                    </span>
                                </td>
                                <td className="px-3 py-4 text-slate-300">{formatDate(deployment.deployed_at)}</td>
                                <td className="px-3 py-4">
                                    {deployment.deploy_status === 'RUNNING' && (
                                        <button
                                            type="button"
                                            onClick={() => onCancelDeployment(deployment)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/15"
                                        >
                                            <XCircle className="h-4 w-4"/>
                                            Cancel
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default DeploymentTable;
