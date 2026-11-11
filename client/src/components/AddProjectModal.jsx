import {X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {getRepositoryWorkflows} from '../services/api';
import {REPOSITORY_URL, validateProjectForm} from '../models/projectForm';

const LOOKUP_DELAY_MS = 400;


/** Mounted only while open, so every opening starts with a fresh form. */
function AddProjectModal({onClose, onSubmit}) {
    const [name, setName] = useState('');
    const [repoUrl, setRepoUrl] = useState('');
    const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
    const [lookup, setLookup] = useState({url: '', workflows: [], error: ''});
    const [errors, setErrors] = useState({});

    const normalizedUrl = repoUrl.trim();
    const isValidUrl = REPOSITORY_URL.test(normalizedUrl);
    const isLoadingWorkflows = isValidUrl && lookup.url !== normalizedUrl;
    const workflows = lookup.url === normalizedUrl ? lookup.workflows : [];
    const workflowId = selectedWorkflowId || (workflows[0] ? String(workflows[0].id) : '');

    useEffect(() => {
        if (!isValidUrl) {
            return undefined;
        }
        let active = true;
        const timer = window.setTimeout(() => {
            getRepositoryWorkflows(normalizedUrl)
                .then((items) => active && setLookup({url: normalizedUrl, workflows: items, error: ''}))
                .catch((error) => active && setLookup({
                    url: normalizedUrl,
                    workflows: [],
                    error: error.message || 'Unable to load workflows.',
                }));
        }, LOOKUP_DELAY_MS);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [isValidUrl, normalizedUrl]);

    const handleSubmit = (event) => {
        event.preventDefault();
        const nextErrors = validateProjectForm({name, repoUrl, workflowId});
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length === 0) {
            onSubmit({name: name.trim(), repo_url: normalizedUrl, workflow_id: Number(workflowId)});
        }
    };

    const workflowError = errors.workflow || (lookup.url === normalizedUrl ? lookup.error : '');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
             role="dialog" aria-modal="true" aria-labelledby="add-project-title">
            <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-slate-950/50">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                    <div>
                        <p className="text-sm text-slate-400">New project</p>
                        <h3 id="add-project-title" className="text-xl font-semibold text-white">Add project</h3>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close modal"
                            className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white">
                        <X className="h-4 w-4"/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 p-5" noValidate>
                    <div>
                        <label htmlFor="project-name" className="mb-2 block text-sm font-medium text-slate-200">Project name</label>
                        <input id="project-name" type="text" value={name} onChange={(event) => setName(event.target.value)}
                               placeholder="api-gateway"
                               className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"/>
                        {errors.name && <p className="mt-2 text-xs text-rose-300">{errors.name}</p>}
                    </div>

                    <div>
                        <label htmlFor="project-repo" className="mb-2 block text-sm font-medium text-slate-200">Repository URL</label>
                        <input id="project-repo" type="url" value={repoUrl}
                               onChange={(event) => {
                                   setRepoUrl(event.target.value);
                                   setSelectedWorkflowId('');
                               }}
                               placeholder="https://github.com/acme/project-name"
                               className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"/>
                        {errors.repo_url && <p className="mt-2 text-xs text-rose-300">{errors.repo_url}</p>}
                    </div>

                    <div>
                        <label htmlFor="project-workflow" className="mb-2 block text-sm font-medium text-slate-200">GitHub Actions workflow</label>
                        <select id="project-workflow" value={workflowId} disabled={isLoadingWorkflows || workflows.length === 0}
                                onChange={(event) => setSelectedWorkflowId(event.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-white disabled:opacity-50">
                            <option value="">{isLoadingWorkflows ? 'Loading workflows...' : 'Select workflow'}</option>
                            {workflows.map((workflow) => (
                                <option key={workflow.id} value={workflow.id}>{workflow.name} ({workflow.path})</option>
                            ))}
                        </select>
                        {workflowError && <p className="mt-2 text-xs text-rose-300">{workflowError}</p>}
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose}
                                className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white">
                            Cancel
                        </button>
                        <button type="submit"
                                className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400">
                            Save project
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddProjectModal;
