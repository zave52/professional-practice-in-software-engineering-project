import {X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {getRepositoryWorkflows} from '../services/api';

const initialFormState = {
    name: '',
    repo_url: '',
    workflow_id: '',
    workflow_name: '',
};

function AddProjectModal({isOpen, onClose, onSubmit}) {
    const [form, setForm] = useState(initialFormState);
    const [errors, setErrors] = useState({});
    const [workflows, setWorkflows] = useState([]);
    const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setForm(initialFormState);
            setErrors({});
            setWorkflows([]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(form.repo_url.trim())) {
            return;
        }
        setIsLoadingWorkflows(true);
        getRepositoryWorkflows(form.repo_url.trim())
            .then((data) => {
                setWorkflows(data);
                setForm((current) => ({
                    ...current,
                    workflow_id: data[0] ? String(data[0].id) : '',
                    workflow_name: data[0]?.name || '',
                }));
                setErrors((current) => ({...current, workflow: ''}));
            })
            .catch((error) => {
                setWorkflows([]);
                setErrors((current) => ({...current, workflow: error.message || 'Unable to load workflows.'}));
            })
            .finally(() => setIsLoadingWorkflows(false));
    }, [form.repo_url, isOpen]);

    if (!isOpen) {
        return null;
    }

    const validate = () => {
        const nextErrors = {};

        if (!form.name.trim() || form.name.trim().length < 3) {
            nextErrors.name = 'Project name must be at least 3 characters long.';
        }

        if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/.test(form.repo_url.trim())) {
            nextErrors.repo_url = 'Repository URL must follow the https://github.com/... format.';
        }
        if (!form.workflow_id) {
            nextErrors.workflow = 'Select a GitHub Actions workflow.';
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        if (!validate()) {
            return;
        }

        onSubmit({
            name: form.name.trim(),
            repo_url: form.repo_url.trim(),
            workflow_id: Number(form.workflow_id),
            workflow_name: form.workflow_name,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div
                className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-slate-950/50">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                    <div>
                        <p className="text-sm text-slate-400">New project</p>
                        <h3 className="text-xl font-semibold text-white">Add project</h3>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-200">GitHub Actions workflow</label>
                        <select value={form.workflow_id}
                                disabled={isLoadingWorkflows || workflows.length === 0}
                                onChange={(event) => {
                                    const workflow = workflows.find((item) => String(item.id) === event.target.value);
                                    setForm((current) => ({
                                        ...current,
                                        workflow_id: event.target.value,
                                        workflow_name: workflow?.name || ''
                                    }));
                                }}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-white disabled:opacity-50">
                            <option value="">{isLoadingWorkflows ? 'Loading workflows...' : 'Select workflow'}</option>
                            {workflows.map((workflow) => <option key={workflow.id}
                                                                 value={workflow.id}>{workflow.name} ({workflow.path})</option>)}
                        </select>
                        {errors.workflow && <p className="mt-2 text-xs text-rose-300">{errors.workflow}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white"
                        aria-label="Close modal"
                    >
                        <X className="h-4 w-4"/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 p-5">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-200">Project name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(event) => setForm((current) => ({...current, name: event.target.value}))}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                            placeholder="api-gateway"
                        />
                        {errors.name && <p className="mt-2 text-xs text-rose-300">{errors.name}</p>}
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-slate-200">Repository URL</label>
                        <input
                            type="url"
                            value={form.repo_url}
                            onChange={(event) => setForm((current) => ({...current, repo_url: event.target.value}))}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                            placeholder="https://github.com/acme/project-name"
                        />
                        {errors.repo_url && <p className="mt-2 text-xs text-rose-300">{errors.repo_url}</p>}
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
                        >
                            Save project
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddProjectModal;
