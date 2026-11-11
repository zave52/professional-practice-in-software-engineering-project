import {ConflictError} from '../../errors/AppError.js';

export const DEPLOYMENT_STATUSES = Object.freeze(['RUNNING', 'CANCELING', 'SUCCESS', 'FAILED', 'CANCELED']);

/**
 * State pattern: abstract state.
 *
 * Two kinds of stimuli move a deployment through its lifecycle:
 *  - user commands: cancel(), rerun();
 *  - observations reported by the CI system during synchronisation: onRemoteStatus(),
 *    onNewAttempt().
 * Every concrete state decides which stimuli are legal and what the next state is, so
 * neither services nor the synchroniser contain `if (status === ...)` chains.
 */
export class DeploymentState {
    get status() {
        throw new Error('DeploymentState.status must be implemented.');
    }

    get isTerminal() {
        return false;
    }

    /** Actions the UI may offer for this state (rendered as buttons). */
    allowedActions() {
        return [];
    }

    // eslint-disable-next-line no-unused-vars
    cancel(context) {
        throw this.invalidTransition('cancel');
    }

    // eslint-disable-next-line no-unused-vars
    rerun(context) {
        throw this.invalidTransition('rerun');
    }

    /** CI reported that the current attempt finished (successfully or not). */
    // eslint-disable-next-line no-unused-vars
    complete(context, success) {
        throw this.invalidTransition('complete');
    }

    /** CI reported that the current attempt was cancelled. */
    // eslint-disable-next-line no-unused-vars
    markCanceled(context) {
        throw this.invalidTransition('mark as canceled');
    }

    /** A new run attempt was started outside the dashboard (for example "Re-run" on GitHub). */
    onNewAttempt(context) {
        context.transitionTo('RUNNING');
    }

    /** Reaction to the status reported by the CI provider for the current attempt. */
    // eslint-disable-next-line no-unused-vars
    onRemoteStatus(context, remoteStatus) {
    }

    invalidTransition(action) {
        return new ConflictError(
            `Cannot ${action} a deployment in ${this.status} state.`,
            'INVALID_STATE_TRANSITION',
        );
    }
}

export default DeploymentState;
