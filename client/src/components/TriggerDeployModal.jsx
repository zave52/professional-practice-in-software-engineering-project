import {useEffect, useState} from 'react';
import {getDeploymentRefs} from '../services/api';

function TriggerDeployModal({project, isOpen, error, onClose, onSubmit}) {
    const [refType, setRefType] = useState('branch');
    const [ref, setRef] = useState('');
    const [branches, setBranches] = useState([]);
    const [tags, setTags] = useState([]);
    const [createTag, setCreateTag] = useState(false);
    const [tagName, setTagName] = useState('');
    const [isLoadingRefs, setIsLoadingRefs] = useState(false);
    const [refsError, setRefsError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setRefType('branch');
        setCreateTag(false);
        setTagName('');
        setRef('');
        setRefsError('');
        setIsLoadingRefs(true);
        getDeploymentRefs(project.id)
            .then((data) => {
                setBranches(data.branches || []);
                setTags(data.tags || []);
                setRef((data.branches || [])[0] || '');
            })
            .catch((error) => setRefsError(error.message || 'Unable to load repository branches and tags.'))
            .finally(() => setIsLoadingRefs(false));
    }, [isOpen]);

    if (!isOpen || !project) {
        return null;
    }

    const handleRefTypeChange = (event) => {
        const nextType = event.target.value;
        setRefType(nextType);
        setCreateTag(false);
        setTagName('');
        setRef(nextType === 'branch' ? branches[0] || '' : tags[0] || '');
    };

    const submit = (event) => {
        event.preventDefault();
        if (isLoadingRefs || refsError || !ref || (refType === 'tag' && !tags.includes(ref))) {
            return;
        }
        onSubmit({
            ref: ref.trim(),
            createTag,
            tagName: createTag ? tagName.trim() : undefined,
        });
    };

    const noTags = refType === 'tag' && tags.length === 0;
    const canSubmit = !isLoadingRefs && !refsError && Boolean(ref) && !noTags;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <form onSubmit={submit}
                  className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
                <h2 className="text-xl font-semibold text-white">Trigger deployment</h2>
                <p className="mt-2 text-sm text-slate-400">{project.name}</p>
                {error && (
                    <div
                        className="mt-4 rounded-lg border border-rose-400/70 bg-rose-500/20 px-3 py-3 text-sm font-medium text-rose-100"
                        role="alert"
                    >
                        <p className="font-semibold">Deployment failed</p>
                        <p className="mt-1 break-words">{error}</p>
                    </div>
                )}

                {isLoadingRefs && <p className="mt-5 text-sm text-slate-400">Loading repository references...</p>}
                {refsError && <p className="mt-5 text-sm text-rose-300">{refsError}</p>}

                {!isLoadingRefs && !refsError && (
                    <>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="text-sm text-slate-300">
                                Source type
                                <select value={refType} onChange={handleRefTypeChange}
                                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                                    <option value="branch">Branch</option>
                                    <option value="tag">Existing tag</option>
                                </select>
                            </label>
                            <label className="text-sm text-slate-300">
                                {refType === 'branch' ? 'Branch' : 'Existing tag'}
                                <select value={ref} onChange={(event) => setRef(event.target.value)}
                                        disabled={noTags}
                                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-50">
                                    {(refType === 'branch' ? branches : tags).map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {noTags && <p className="mt-3 text-sm text-amber-300">No existing tags are available in this
                            repository.</p>}

                        {refType === 'branch' && (
                            <label className="mt-5 flex items-center gap-3 text-sm text-slate-300">
                                <input type="checkbox" checked={createTag}
                                       onChange={(event) => setCreateTag(event.target.checked)}
                                       className="h-4 w-4 accent-emerald-500"/>
                                Create a new tag from this branch before deploying
                            </label>
                        )}

                        {createTag && (
                            <label className="mt-4 block text-sm text-slate-300">
                                New tag name
                                <input value={tagName} onChange={(event) => setTagName(event.target.value)}
                                       required placeholder="v1.0.0"
                                       className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"/>
                            </label>
                        )}
                    </>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose}
                            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200">Cancel
                    </button>
                    <button type="submit" disabled={!canSubmit}
                            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">Start
                        deployment
                    </button>
                </div>
            </form>
        </div>
    );
}

export default TriggerDeployModal;
