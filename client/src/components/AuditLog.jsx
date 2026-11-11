import {RefreshCw} from 'lucide-react';
import {formatDate, humanizeEvent} from '../utils/format';

const describe = (entry) => {
    const payload = entry.payload || {};
    if (payload.from && payload.to) {
        return `${payload.from} → ${payload.to}`;
    }
    if (payload.command) {
        return `${payload.command}: ${payload.reason}`;
    }
    if (payload.ref) {
        return `ref ${payload.ref}${payload.tagCreated ? ' (tag created)' : ''}`;
    }
    return payload.name || payload.repository || '';
};

function AuditLog({entries, onRefresh}) {
    return (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-slate-400">Audit trail</p>
                    <h2 className="text-xl font-semibold text-white">Activity</h2>
                </div>
                <button type="button" onClick={onRefresh}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
                    <RefreshCw className="h-4 w-4"/>
                    Refresh
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm text-slate-200">
                    <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                        <th className="px-3 py-3 font-medium">Time</th>
                        <th className="px-3 py-3 font-medium">Event</th>
                        <th className="px-3 py-3 font-medium">User</th>
                        <th className="px-3 py-3 font-medium">Project</th>
                        <th className="px-3 py-3 font-medium">Details</th>
                    </tr>
                    </thead>
                    <tbody>
                    {entries === null ? (
                        <tr><td colSpan="5" className="px-3 py-8 text-center text-slate-400">Loading activity...</td></tr>
                    ) : entries.length === 0 ? (
                        <tr><td colSpan="5" className="px-3 py-8 text-center text-slate-400">No activity recorded yet.</td></tr>
                    ) : entries.map((entry) => (
                        <tr key={entry.id} className="border-b border-slate-800/80">
                            <td className="whitespace-nowrap px-3 py-3 text-slate-400">{formatDate(entry.created_at)}</td>
                            <td className="px-3 py-3 font-medium text-white">{humanizeEvent(entry.event)}</td>
                            <td className="px-3 py-3">{entry.username || 'system'}</td>
                            <td className="px-3 py-3">{entry.project_name || '—'}</td>
                            <td className="px-3 py-3 text-slate-400">{describe(entry)}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default AuditLog;
