import {DeploymentState} from './DeploymentState.js';

/**
 * Cancellation was requested but GitHub has not confirmed it yet. The run can still finish
 * normally if the cancel request arrived too late, so both outcomes are accepted.
 */
export class CancelingState extends DeploymentState {
    get status() {
        return 'CANCELING';
    }

    complete(context, success) {
        context.transitionTo(success ? 'SUCCESS' : 'FAILED');
    }

    markCanceled(context) {
        context.transitionTo('CANCELED');
    }

    onRemoteStatus(context, remoteStatus) {
        if (remoteStatus === 'CANCELED') {
            this.markCanceled(context);
        } else if (remoteStatus === 'SUCCESS' || remoteStatus === 'FAILED') {
            this.complete(context, remoteStatus === 'SUCCESS');
        }
    }
}

export default CancelingState;
