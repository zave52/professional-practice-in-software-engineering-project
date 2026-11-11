import {Activity, CheckCircle2, FolderGit2, Timer} from 'lucide-react';
import {summarize} from '../models/deployments';
import {formatDuration} from '../utils/format';


function StatsCards({projects, deployments, isLoading}) {
    const summary = summarize(projects, deployments);
    const cards = [
        {
            label: 'Projects',
            value: summary.projects,
            helper: 'Repositories you can manage',
            icon: FolderGit2,
            accent: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
        },
        {
            label: 'Active runs',
            value: summary.active,
            helper: `${summary.total} recent runs`,
            icon: Activity,
            accent: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
        },
        {
            label: 'Success rate',
            value: summary.successRate === null ? '—' : `${summary.successRate.toFixed(1)}%`,
            helper: `Of ${summary.completed} completed runs`,
            icon: CheckCircle2,
            accent: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
        },
        {
            label: 'Average duration',
            value: formatDuration(summary.averageDuration),
            helper: 'Completed runs',
            icon: Timer,
            accent: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
        },
    ];

    return (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({label, value, helper, icon: Icon, accent}) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${accent}`}>
                        <Icon className="h-5 w-5"/>
                    </div>
                    {isLoading ? (
                        <div className="mt-6 animate-pulse space-y-3">
                            <div className="h-4 w-24 rounded bg-slate-700"/>
                            <div className="h-7 w-20 rounded bg-slate-700"/>
                        </div>
                    ) : (
                        <>
                            <p className="mt-6 text-sm text-slate-400">{label}</p>
                            <p className="mt-2 text-3xl font-bold tracking-tight text-white">{value}</p>
                            <p className="mt-2 text-xs text-slate-400">{helper}</p>
                        </>
                    )}
                </div>
            ))}
        </section>
    );
}

export default StatsCards;
