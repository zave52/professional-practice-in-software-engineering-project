import {LogOut, Menu, Plus, Server, ShieldCheck, X} from 'lucide-react';
import {useState} from 'react';

const NAV_ITEMS = [
    {id: 'dashboard', label: 'Dashboard'},
    {id: 'projects', label: 'Projects'},
    {id: 'deployments', label: 'Deployments'},
    {id: 'metrics', label: 'Metrics'},
    {id: 'activity', label: 'Activity'},
];

function Navbar({activeTab, onTabChange, onAddProject, user, onLogout}) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const tabClass = (id) => `rounded-lg px-3 py-2 text-sm font-medium transition ${
        activeTab === id ? 'bg-slate-800 text-white ring-1 ring-slate-700' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
    }`;

    return (
        <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                        <Server className="h-5 w-5"/>
                    </div>
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">DevOps</p>
                        <h1 className="text-base font-semibold text-white">CI/CD Dashboard</h1>
                    </div>
                </div>

                <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
                    {NAV_ITEMS.map((item) => (
                        <button key={item.id} type="button" onClick={() => onTabChange(item.id)} className={tabClass(item.id)}
                                aria-current={activeTab === item.id ? 'page' : undefined}>
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-3">
                    <button type="button" onClick={onAddProject}
                            className="hidden items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 lg:inline-flex">
                        <Plus className="h-4 w-4"/>
                        New Project
                    </button>
                    <div className="hidden items-center gap-2 sm:flex">
                        {user.avatar_url && <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full ring-1 ring-slate-700"/>}
                        <div className="text-right leading-tight">
                            <p className="text-sm font-medium text-white">{user.username}</p>
                            <p className="flex items-center justify-end gap-1 text-xs text-slate-400">
                                {user.role === 'Admin' && <ShieldCheck className="h-3 w-3 text-emerald-300"/>}
                                {user.role}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onLogout} aria-label="Sign out"
                            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white">
                        <LogOut className="h-4 w-4"/>
                    </button>
                    <button type="button" onClick={() => setMobileMenuOpen((value) => !value)}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200 lg:hidden"
                            aria-label="Toggle navigation">
                        {mobileMenuOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}
                    </button>
                </div>
            </div>

            {mobileMenuOpen && (
                <div className="border-t border-slate-800 bg-slate-950 lg:hidden">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:px-6">
                        {NAV_ITEMS.map((item) => (
                            <button key={item.id} type="button" className={`${tabClass(item.id)} text-left`}
                                    onClick={() => {
                                        onTabChange(item.id);
                                        setMobileMenuOpen(false);
                                    }}>
                                {item.label}
                            </button>
                        ))}
                        <button type="button"
                                onClick={() => {
                                    onAddProject();
                                    setMobileMenuOpen(false);
                                }}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950">
                            <Plus className="h-4 w-4"/>
                            New Project
                        </button>
                    </div>
                </div>
            )}
        </header>
    );
}

export default Navbar;
