import {Gauge, GitCommitHorizontal, HeartPulse, Rocket, Timer} from 'lucide-react';
import {levelStyles} from '../models/metrics';
import {formatMetric} from '../utils/format';


const CARDS = [
    {key: 'deploymentFrequency', icon: Rocket, hint: 'Successful deployments per day.'},
    {key: 'leadTimeForChanges', icon: GitCommitHorizontal, hint: 'Median time from commit to successful deployment.'},
    {key: 'changeFailureRate', icon: Gauge, hint: 'Share of completed deployments that failed.'},
    {key: 'timeToRestore', icon: HeartPulse, hint: 'Median time from a failed deployment to the next success.'},
    {key: 'pipelineDuration', icon: Timer, hint: 'Median pipeline run time; NFR-04 target is 3 minutes.'},
];

const PERIODS = [7, 30, 90];

function MetricsPanel({metrics, days, onDaysChange, error}) {
    const isLoading = !metrics && !error;

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">DORA metrics</p>
                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Delivery performance</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">
                        Calculated from synchronised GitHub Actions runs of your projects. Pull-request validation runs are excluded.
                    </p>
                </div>
                <div className="flex gap-2" role="group" aria-label="Period">
                    {PERIODS.map((period) => (
                        <button key={period} type="button" onClick={() => onDaysChange(period)} aria-pressed={days === period}
                                className={`rounded-lg px-3 py-2 text-sm font-medium ${days === period
                                    ? 'bg-slate-800 text-white ring-1 ring-slate-600'
                                    : 'text-slate-300 hover:bg-slate-800/70'}`}>
                            {period} days
                        </button>
                    ))}
                </div>
            </div>

            {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p>}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {CARDS.map(({key, icon: Icon, hint}) => {
                    const metric = metrics?.metrics?.[key];
                    return (
                        <article key={key} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5" aria-label={metric?.label || key}>
                            <div className="flex items-center justify-between">
                                <Icon className="h-5 w-5 text-slate-300"/>
                                {metric && (
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ring-1 ${levelStyles[metric.level] || levelStyles['n/a']}`}>
                                        {metric.level}
                                    </span>
                                )}
                            </div>
                            {isLoading ? (
                                <div className="mt-6 h-8 w-24 animate-pulse rounded bg-slate-700"/>
                            ) : (
                                <>
                                    <p className="mt-5 text-sm text-slate-400">{metric?.label}</p>
                                    <p className="mt-1 text-2xl font-bold text-white">{formatMetric(metric)}</p>
                                    <p className="mt-2 text-xs text-slate-500">{hint}</p>
                                    <p className="mt-1 text-xs text-slate-500">Sample: {metric?.sampleSize ?? 0}</p>
                                </>
                            )}
                        </article>
                    );
                })}
            </div>

            {metrics && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-300">
                    <p>
                        {metrics.totals.total} deployment runs in the last {metrics.period.days} days:{' '}
                        {metrics.totals.success || 0} successful, {metrics.totals.failed || 0} failed,{' '}
                        {metrics.totals.canceled || 0} canceled, {(metrics.totals.running || 0) + (metrics.totals.canceling || 0)} in progress.
                    </p>
                </div>
            )}
        </section>
    );
}

export default MetricsPanel;
