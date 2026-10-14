import {Activity, ArrowUpRight, CheckCircle2, FolderGit2,} from 'lucide-react';

function StatsCards({projects, deployments, isLoading}) {
    const successRate = deployments.length
        ? (deployments.filter((deployment) => deployment.deploy_status === 'SUCCESS').length / deployments.length) * 100
        : 0;

    const activeDeployments = deployments.filter((deployment) => deployment.deploy_status === 'RUNNING').length;
    const cards = [
        {
            label: 'Total Projects',
            value: projects.length,
            helper: '+2 from last month',
            icon: FolderGit2,
            accent: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
        },
        {
            label: 'Active Deployments',
            value: activeDeployments,
            helper: `${deployments.length} total deployments`,
            icon: Activity,
            accent: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
        },
        {
            label: 'Build Success Rate',
            value: `${successRate.toFixed(1)}%`,
            helper: 'Latest 30-day performance',
            icon: CheckCircle2,
            accent: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
        },
    ];

    return (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {cards.map(({label, value, helper, icon: Icon, accent}) => (
                <div
                    key={label}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20"
                >
                    <div className="flex items-center justify-between">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${accent}`}>
                            <Icon className="h-5 w-5"/>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-slate-400"/>
                    </div>

                    {isLoading ? (
                        <div className="mt-6 space-y-3 animate-pulse">
                            <div className="h-4 w-24 rounded bg-slate-700"/>
                            <div className="h-7 w-20 rounded bg-slate-700"/>
                            <div className="h-3 w-28 rounded bg-slate-700"/>
                        </div>
                    ) : (
                        <>
                            <p className="mt-6 text-sm text-slate-400">{label}</p>
                            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">{value}</h2>
                            <p className="mt-2 text-xs text-slate-400">{helper}</p>
                        </>
                    )}
                </div>
            ))}
        </section>
    );
}

export default StatsCards;
