import {AlertTriangle, CheckCircle2, Copy, LoaderCircle, RotateCcw, XCircle} from 'lucide-react';
import {useMemo, useState} from 'react';
import {filterDeployments, statusStyles} from '../models/deployments';
import {formatDate, formatDuration, shortSha} from '../utils/format';



function DeploymentTable({
    deployments,
    projects,
    warnings = [],
    onCancelDeployment,
    onRerunDeployment,
    isLoading,
    searchTerm,
    setSearchTerm,
    projectFilter,
    setProjectFilter,
}) {
    const [copiedSha, setCopiedSha] = useState('');
    const filtered = useMemo(
        () => filterDeployments(deployments, {searchTerm, projectFilter}),
        [deployments, searchTerm, projectFilter],
    );

    const handleCopy = async (sha) => {
        try {
            await navigator.clipboard.writeText(sha);
            setCopiedSha(sha);
            setTimeout(() => setCopiedSha(''), 1500);
        } catch {
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
                    <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)}
                           placeholder="Search by ref, commit or author" aria-label="Search deployments"
                           className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"/>
                    <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Filter by project"
                            className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none">
                        <option value="all">All projects</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                </div>
            </div>

            {warnings.map((warning) => (
                <div key={warning.project_id} role="alert"
                     className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
                    <span><strong>{warning.project_name}:</strong> {warning.message} Showing the last synchronised data.</span>
                </div>
            ))}

            <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm text-slate-200">
                    <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                        <th className="px-3 py-3 font-medium">Run</th>
                        <th className="px-3 py-3 font-medium">Commit</th>
                        <th className="px-3 py-3 font-medium">Triggered by</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 font-medium">Started</th>
                        <th className="px-3 py-3 font-medium">Duration</th>
                        <th className="px-3 py-3 font-medium">Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {isLoading ? (
                        <tr>
                            <td colSpan="7" className="px-3 py-8">
                                <div className="flex items-center justify-center gap-3 text-slate-300">
                                    <LoaderCircle className="h-5 w-5 animate-spin text-sky-300"/>
                                    Loading deployments...
                                </div>
                            </td>
                        </tr>
                    ) : filtered.length === 0 ? (
                        <tr>
                            <td colSpan="7" className="px-3 py-8 text-center text-slate-400">No deployments match the current filters.</td>
                        </tr>
                    ) : filtered.map((deployment) => (
                        <tr key={deployment.id} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                            <td className="max-w-56 px-3 py-4 font-medium text-white">
                                {deployment.workflow_url ? (
                                    <a href={deployment.workflow_url} target="_blank" rel="noreferrer"
                                       className="block truncate hover:text-sky-300 hover:underline">
                                        {deployment.workflow_name || 'Workflow'} {deployment.run_number ? `#${deployment.run_number}` : ''}
                                    </a>
                                ) : (
                                    <span className="block truncate">{deployment.workflow_name || 'Workflow'}</span>
                                )}
                                <span className="mt-1 block truncate text-xs font-normal text-slate-400" title={deployment.version_tag}>
                                    {deployment.version_tag}{deployment.project_name ? ` · ${deployment.project_name}` : ''}
                                </span>
                            </td>
                            <td className="px-3 py-4">
                                {deployment.commit_sha ? (
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-slate-300">{shortSha(deployment.commit_sha)}</span>
                                        <button type="button" onClick={() => handleCopy(deployment.commit_sha)} aria-label="Copy commit SHA"
                                                className="inline-flex items-center justify-center rounded-md border border-slate-700 p-1 text-slate-300 hover:border-sky-500 hover:text-sky-200">
                                            {copiedSha === deployment.commit_sha
                                                ? <CheckCircle2 className="h-4 w-4 text-emerald-300"/>
                                                : <Copy className="h-4 w-4"/>}
                                        </button>
                                    </div>
                                ) : <span className="text-slate-500">—</span>}
                            </td>
                            <td className="px-3 py-4 text-slate-300">{deployment.triggered_by}</td>
                            <td className="px-3 py-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[deployment.deploy_status] || statusStyles.RUNNING}`}>
                                    {deployment.pending ? 'QUEUED' : deployment.deploy_status}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-slate-300">{formatDate(deployment.started_at)}</td>
                            <td className="px-3 py-4 text-slate-300">{formatDuration(deployment.duration_seconds)}</td>
                            <td className="px-3 py-4">
                                {deployment.actions?.includes('cancel') && (
                                    <button type="button" onClick={() => onCancelDeployment(deployment)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/15">
                                        <XCircle className="h-4 w-4"/>
                                        Cancel
                                    </button>
                                )}
                                {deployment.actions?.includes('rerun') && (
                                    <button type="button" onClick={() => onRerunDeployment(deployment)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/15">
                                        <RotateCcw className="h-4 w-4"/>
                                        Rerun
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default DeploymentTable;
