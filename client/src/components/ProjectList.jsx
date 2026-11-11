import {ExternalLink, GitBranch, Rocket, Trash2, UserRound} from 'lucide-react';

function ProjectList({projects, onTriggerDeploy, onDeleteProject, isLoading, showOwner = false}) {
    return (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-slate-400">Repository overview</p>
                    <h2 className="text-xl font-semibold text-white">Projects</h2>
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">{projects.length} total</span>
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2].map((item) => (
                        <div key={item} className="animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                            <div className="h-4 w-28 rounded bg-slate-700"/>
                            <div className="mt-3 h-3 w-52 rounded bg-slate-700"/>
                        </div>
                    ))}
                </div>
            ) : projects.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-400">
                    No projects yet. Add a GitHub repository to start tracking its pipeline.
                </p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {projects.map((project) => (
                        <article key={project.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="truncate text-lg font-semibold text-white">{project.name}</h3>
                                    {showOwner && project.owner_username && (
                                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                                            <UserRound className="h-3 w-3"/>
                                            {project.owner_username}
                                        </p>
                                    )}
                                </div>
                                <button type="button" onClick={() => onDeleteProject(project)}
                                        className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/15">
                                    <Trash2 className="h-4 w-4"/>
                                    Delete
                                </button>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
                                <span className="truncate">{project.repo_url}</span>
                                <a href={project.repo_url} target="_blank" rel="noreferrer" aria-label={`Open ${project.name} on GitHub`}
                                   className="text-sky-300 hover:text-sky-200">
                                    <ExternalLink className="h-4 w-4"/>
                                </a>
                            </div>

                            <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-sm text-sky-100"
                                 title={project.workflow_name || 'Workflow not configured'}>
                                <GitBranch className="h-4 w-4 shrink-0 text-sky-300"/>
                                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-sky-300">Workflow</span>
                                <span className="truncate">{Number(project.workflow_id) > 0 ? project.workflow_name : 'Not configured'}</span>
                            </div>

                            <div className="mt-4 flex justify-end">
                                <button type="button" onClick={() => onTriggerDeploy(project)}
                                        disabled={!(Number(project.workflow_id) > 0)}
                                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
                                    <Rocket className="h-4 w-4"/>
                                    Trigger Deploy
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

export default ProjectList;
