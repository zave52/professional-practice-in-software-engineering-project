import {ExternalLink, Rocket, Trash2} from 'lucide-react';

const environmentStyles = {
    production: 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/30',
    staging: 'bg-sky-500/10 text-sky-200 ring-1 ring-sky-500/30',
    development: 'bg-violet-500/10 text-violet-200 ring-1 ring-violet-500/30',
};

function ProjectList({projects, onTriggerDeploy, onDeleteProject, isLoading}) {
    return (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-slate-400">Repository overview</p>
                    <h2 className="text-xl font-semibold text-white">Projects</h2>
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">
          {projects.length} total
        </span>
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map((item) => (
                        <div key={item}
                             className="animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                            <div className="h-4 w-28 rounded bg-slate-700"/>
                            <div className="mt-3 h-3 w-52 rounded bg-slate-700"/>
                            <div className="mt-4 flex gap-3">
                                <div className="h-8 w-24 rounded bg-slate-700"/>
                                <div className="h-8 w-20 rounded bg-slate-700"/>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    {projects.map((project) => (
                        <article key={project.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                                    <div
                                        className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">
                                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400"/>
                                        {project.environment}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onDeleteProject(project)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/15"
                                >
                                    <Trash2 className="h-4 w-4"/>
                                    Delete
                                </button>
                            </div>

                            <div
                                className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
                                <span className="truncate">{project.repo_url}</span>
                                <a href={project.repo_url} target="_blank" rel="noreferrer"
                                   className="text-sky-300 hover:text-sky-200">
                                    <ExternalLink className="h-4 w-4"/>
                                </a>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${environmentStyles[project.environment] || environmentStyles.production}`}>
                  {project.environment}
                </span>
                                <button
                                    type="button"
                                    onClick={() => onTriggerDeploy(project.id)}
                                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                                >
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
