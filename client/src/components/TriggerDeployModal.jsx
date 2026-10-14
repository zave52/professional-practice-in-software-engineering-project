import {useState} from 'react';

function TriggerDeployModal({project, isOpen, onClose, onSubmit}) {
    const [refType, setRefType] = useState('branch');
    const [ref, setRef] = useState('main');
    const [createTag, setCreateTag] = useState(false);
    const [tagName, setTagName] = useState('');

    if (!isOpen || !project) {
        return null;
    }

    const submit = (event) => {
        event.preventDefault();
        onSubmit({
            ref: ref.trim(),
            createTag,
            tagName: createTag ? tagName.trim() : undefined,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <form onSubmit={submit}
                  className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
                <h2 className="text-xl font-semibold text-white">Trigger deployment</h2>
                <p className="mt-2 text-sm text-slate-400">{project.name}</p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm text-slate-300">
                        Source type
                        <select value={refType} onChange={(event) => setRefType(event.target.value)}
                                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                            <option value="branch">Branch</option>
                            <option value="tag">Existing tag</option>
                        </select>
                    </label>
                    <label className="text-sm text-slate-300">
                        {refType === 'branch' ? 'Branch name' : 'Tag name'}
                        <input value={ref} onChange={(event) => setRef(event.target.value)}
                               required placeholder={refType === 'branch' ? 'main' : 'v1.0.0'}
                               className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"/>
                    </label>
                </div>

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

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose}
                            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200">Cancel
                    </button>
                    <button type="submit"
                            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950">Start
                        deployment
                    </button>
                </div>
            </form>
        </div>
    );
}

export default TriggerDeployModal;
