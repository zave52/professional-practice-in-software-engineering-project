import {GitBranch, LockKeyhole, Server} from 'lucide-react';

function LoginPage({onLogin}) {
    return (
        <main className="flex min-h-screen items-center justify-center px-4 py-10">
            <section
                className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50 backdrop-blur">
                <div className="flex flex-col items-center text-center">
                    <div
                        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                        <Server className="h-7 w-7"/>
                    </div>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">DevOps</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">CI/CD Dashboard</h1>
                    <p className="mt-4 text-sm leading-6 text-slate-400">
                        Увійдіть через GitHub, щоб переглядати проєкти та керувати pipeline.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onLogin}
                    className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                    <GitBranch className="h-5 w-5"/>
                    Увійти через GitHub
                </button>

                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                    <LockKeyhole className="h-3.5 w-3.5"/>
                    Доступ до dashboard мають лише авторизовані користувачі
                </div>
            </section>
        </main>
    );
}

export default LoginPage;
