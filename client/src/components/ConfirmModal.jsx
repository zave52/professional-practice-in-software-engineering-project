const contentByAction = {
    'delete-project': {
        title: 'Delete project',
        message: (action) => `Delete "${action.project.name}" and its deployment history? This cannot be undone.`,
        confirm: 'Delete',
    },
    'cancel-deployment': {
        title: 'Cancel deployment',
        message: (action) => `Request cancellation of run #${action.deployment.run_number ?? action.deployment.run_id}`
            + ` (${action.deployment.version_tag})? GitHub stops the workflow at the next safe point.`,
        confirm: 'Cancel run',
    },
};

function ConfirmModal({action, onClose, onConfirm}) {
    if (!action) {
        return null;
    }
    const content = contentByAction[action.type];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
             role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/50">
                <p id="confirm-title" className="text-xl font-semibold text-white">{content.title}</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{content.message(action)}</p>
                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose}
                            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white">
                        Keep
                    </button>
                    <button type="button" onClick={onConfirm}
                            className="rounded-lg bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-400">
                        {content.confirm}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmModal;
