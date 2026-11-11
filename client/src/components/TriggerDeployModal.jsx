import {useEffect, useState} from 'react';
import {getDeploymentRefs} from '../services/api';

const TAG_NAME = /^v?[0-9A-Za-z][0-9A-Za-z._-]{0,62}$/;

/** Mounted only while open (keyed by project), so refs are always fetched for the right project. */
function TriggerDeployModal({project, error, onClose, onSubmit}) {
    const [refs, setRefs] = useState(null);
    const [refsError, setRefsError] = useState('');
    const [refType, setRefType] = useState('branch');
    const [selectedRef, setSelectedRef] = useState('');
    const [createTag, setCreateTag] = useState(false);
    const [tagName, setTagName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        let active = true;
        getDeploymentRefs(project.id)
            .then((data) => active && setRefs({branches: data.branches || [], tags: data.tags || []}))
            .catch((loadError) => active && setRefsError(loadError.message || 'Unable to load branches and tags.'));
        return () => {
            active = false;
        };
    }, [project.id]);

    const isLoadingRefs = refs === null && !refsError;
    const options = refType === 'branch' ? refs?.branches || [] : refs?.tags || [];
    const ref = options.includes(selectedRef) ? selectedRef : options[0] || '';
    const tagInvalid = createTag && !TAG_NAME.test(tagName.trim());
    const canSubmit = !isLoadingRefs && !refsError && Boolean(ref) && !tagInvalid && !isSubmitting;

    const submit = async (event) => {
        event.preventDefault();
        if (!canSubmit) {
            return;
        }
        setIsSubmitting(true);
        try {
            await onSubmit({ref, createTag, tagName: createTag ? tagName.trim() : undefined});
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
             role="dialog" aria-modal="true" aria-labelledby="trigger-title">
            <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
                <h2 id="trigger-title" className="text-xl font-semibold text-white">Trigger deployment</h2>
                <p className="mt-2 text-sm text-slate-400">{project.name} · {project.workflow_name}</p>
                {error && (
                    <div className="mt-4 rounded-lg border border-rose-400/70 bg-rose-500/20 px-3 py-3 text-sm font-medium text-rose-100" role="alert">
                        <p className="font-semibold">Deployment failed</p>
                        <p className="mt-1 break-words">{error}</p>
                    </div>
                )}

                {isLoadingRefs && <p className="mt-5 text-sm text-slate-400">Loading repository references...</p>}
                {refsError && <p className="mt-5 text-sm text-rose-300">{refsError}</p>}

                {refs && (
                    <>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="text-sm text-slate-300">
                                Source type
                                <select value={refType}
                                        onChange={(event) => {
                                            setRefType(event.target.value);
                                            setSelectedRef('');
                                            setCreateTag(false);
                                        }}
                                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                                    <option value="branch">Branch</option>
                                    <option value="tag">Existing tag</option>
                                </select>
                            </label>
                            <label className="text-sm text-slate-300">
                                {refType === 'branch' ? 'Branch' : 'Existing tag'}
                                <select value={ref} onChange={(event) => setSelectedRef(event.target.value)} disabled={options.length === 0}
                                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-50">
                                    {options.map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </label>
                        </div>

                        {options.length === 0 && (
                            <p className="mt-3 text-sm text-amber-300">No {refType === 'branch' ? 'branches' : 'tags'} are available in this repository.</p>
                        )}

                        {refType === 'branch' && (
                            <label className="mt-5 flex items-center gap-3 text-sm text-slate-300">
                                <input type="checkbox" checked={createTag} onChange={(event) => setCreateTag(event.target.checked)}
                                       className="h-4 w-4 accent-emerald-500"/>
                                Create a new tag from this branch before deploying
                            </label>
                        )}

                        {createTag && (
                            <label className="mt-4 block text-sm text-slate-300">
                                New tag name
                                <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="v1.0.0"
                                       className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"/>
                                {tagName && tagInvalid && (
                                    <span className="mt-2 block text-xs text-rose-300">Use letters, numbers, dots, underscores or hyphens.</span>
                                )}
                            </label>
                        )}
                    </>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
                        Cancel
                    </button>
                    <button type="submit" disabled={!canSubmit}
                            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                        {isSubmitting ? 'Starting...' : 'Start deployment'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default TriggerDeployModal;
